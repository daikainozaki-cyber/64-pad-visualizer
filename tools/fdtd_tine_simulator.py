#!/usr/bin/env python3
"""
fdtd_tine_simulator.py — FDTD Rhodes tine simulation (offline)

Euler-Bernoulli beam with losses + Hunt-Crossley hammer.
Generates attack waveforms (displacement + velocity at PU position)
for use as lookup tables in the AudioWorklet engine.

Based on: Sonderboe 2024 (eq. 3.2, 3.5), Chaigne & Askenfelt 1994.
Per-key parameters from epiano-worklet-processor.js.

Usage:
  python3 tools/fdtd_tine_simulator.py                  # Single key test (A2)
  python3 tools/fdtd_tine_simulator.py --midi 45 53     # Specific keys
  python3 tools/fdtd_tine_simulator.py --all             # All 88 keys × 4 vel
  python3 tools/fdtd_tine_simulator.py --validate        # Compare with FEM eigenfreqs

Output: numpy .npz files in tools/fdtd_output/
"""

import sys
import os
import time
import numpy as np
from scipy.signal import decimate


# =============================================================================
# Goertzel pitch measurement — sub-cent precision (replaces FFT)
# =============================================================================

def goertzel_magnitude(signal, fs, f_target):
    """Generalized Goertzel: DFT magnitude at exact (non-integer-bin) frequency. O(N)."""
    N = len(signal)
    w = 2.0 * np.pi * f_target / fs  # exact frequency, NOT quantized to bin
    coeff = 2.0 * np.cos(w)
    s1, s2 = 0.0, 0.0
    for x in signal:
        s0 = x + coeff * s1 - s2
        s2 = s1
        s1 = s0
    # Generalized: compute complex DFT at exact frequency
    real = s1 - s2 * np.cos(w)
    imag = s2 * np.sin(w)
    return np.sqrt(real**2 + imag**2) / N


def goertzel_frequency(signal, fs, f_target, f_range=20.0):
    """
    Measure frequency near f_target with sub-cent precision.
    Two-pass Goertzel scan + parabolic interpolation.

    Physics: this replaces FFT for FDTD pitch measurement.
    FFT bin spacing = fs/N limits resolution (±6.5 cents at 110Hz with 60ms window).
    Goertzel scans arbitrary frequencies → sub-cent precision.
    """
    # Pass 1: coarse scan (200 points over ±f_range)
    n_coarse = 200
    freqs_c = np.linspace(f_target - f_range, f_target + f_range, n_coarse)
    mags_c = np.array([goertzel_magnitude(signal, fs, f) for f in freqs_c])
    peak_idx = np.argmax(mags_c)
    f_peak_coarse = freqs_c[peak_idx]
    df_coarse = freqs_c[1] - freqs_c[0]

    # Pass 2: fine scan (50 points over ±1 coarse step)
    n_fine = 50
    freqs_f = np.linspace(f_peak_coarse - df_coarse, f_peak_coarse + df_coarse, n_fine)
    mags_f = np.array([goertzel_magnitude(signal, fs, f) for f in freqs_f])
    peak_idx_f = np.argmax(mags_f)

    # Parabolic interpolation for sub-step accuracy
    if 0 < peak_idx_f < len(mags_f) - 1:
        a = np.log(mags_f[peak_idx_f - 1] + 1e-30)
        b = np.log(mags_f[peak_idx_f] + 1e-30)
        c = np.log(mags_f[peak_idx_f + 1] + 1e-30)
        p = 0.5 * (a - c) / (a - 2*b + c)
        df_fine = freqs_f[1] - freqs_f[0]
        return freqs_f[peak_idx_f] + p * df_fine
    return freqs_f[peak_idx_f]


# =============================================================================
# Physical constants (matching epiano-worklet-processor.js)
# =============================================================================
E_STEEL = 200e9       # Young's modulus (Pa) — Sonderboe Table 3.1
RHO_STEEL = 7850      # Density (kg/m³) — Sonderboe Table 3.1
FS_AUDIO = 44100      # Output sample rate (Hz)

# Tine geometry: Third Stage taper
D_BASE = 2.540e-3     # Base diameter (m)
D_TIP = 1.524e-3      # Tip diameter (m)
TAPER_ZONE = 12.7e-3  # Taper zone length (m) — 0.5"
# For FDTD we use uniform cross-section (Sonderboe assumption).
# Effective radius: geometric mean of base/tip ≈ 0.95mm
R_TINE = 0.5 * (D_BASE + D_TIP) / 2  # ~1.0mm
A_TINE = np.pi * R_TINE**2
I_TINE = np.pi * R_TINE**4 / 4

# Stiffness coefficient (Sonderboe eq. 3.4)
KAPPA = np.sqrt(E_STEEL * I_TINE / (RHO_STEEL * A_TINE))

# =============================================================================
# Tuning spring data (Vintage Vibe / EP-Forum measurements)
# =============================================================================
# Wire: 0.031" (0.787mm), coil inner d ≈ 0.065" (1.651mm)
# 5 sizes by key range, varying number of turns → varying mass
# Mass calculated from wire length × cross-section × density

SPRING_WIRE_D = 0.031 * 25.4e-3  # m (0.787mm)
SPRING_COIL_MEAN_D = (0.065 * 25.4e-3 + SPRING_WIRE_D)  # m (2.44mm)
SPRING_WIRE_A = np.pi * (SPRING_WIRE_D / 2)**2  # m²
SPRING_L_PER_TURN = np.pi * SPRING_COIL_MEAN_D  # m per turn

def _spring_mass(turns_per_side):
    """Mass of a crimped coil spring (kg)."""
    total_turns = 2 * turns_per_side + 0.5  # both sides + central kink
    wire_length = total_turns * SPRING_L_PER_TURN
    return RHO_STEEL * SPRING_WIRE_A * wire_length

# Per-key spring mass (kg). Vintage Vibe 5-size system, Mk1 standard.
# #6: keys 1-7 (5 turns/side), #4: keys 6-18 (4), #3: 19-55 (3.5), #2: 56-88 (3)
def get_spring_mass(key_idx):
    """Spring mass in kg for key index 0-87."""
    key = key_idx + 1  # 1-indexed
    if key <= 7:    return _spring_mass(5.0)    # #6: 308mg
    elif key <= 18: return _spring_mass(4.0)    # #4: 249mg
    elif key <= 55: return _spring_mass(3.5)    # #3: 220mg
    else:           return _spring_mass(3.0)    # #2: 190mg

def get_spring_position_frac(key_idx):
    """
    Estimated spring position as fraction of tine length from clamped end.
    SM Ch.5-2: spring slides along tine for tuning (±1.5 semitones).
    Convention: 0.0 = clamped end, 1.0 = free end (tip).

    Bass: spring further out → lower pitch → ~60-70% from base
    Treble: spring closer to base → ~40-50% from base
    These are initial estimates — refinable from repair data.
    """
    key = key_idx + 1
    # Linear interpolation: bass 65% → treble 45%
    t = (key - 1) / 87.0
    return 0.65 * (1 - t) + 0.45 * t


def find_tuning_mass(midi, spring_frac=None, oversample=16, tol_cents=5.0, max_iter=20):
    """
    Iteratively find the point mass (at spring_frac position) that tunes
    the FDTD beam to the target f0. Returns mass in kg.

    This accounts for all numerical effects (dispersion, boundary conditions)
    and produces the physically correct f0 directly from the FDTD.
    The "mass" represents: spring + fixing block + solder + any other mass effect.
    """
    key_idx = midi - 21
    f0_target = 440.0 * 2**((midi - 69) / 12.0)
    if spring_frac is None:
        spring_frac = get_spring_position_frac(key_idx)

    # Start with bare beam f0 to estimate required mass
    # Try a range of masses using bisection
    m_lo = 0.0       # bare beam (too high f0)
    m_hi = 0.020     # 20g (definitely too much mass → f0 too low)

    for iteration in range(max_iter):
        m_try = (m_lo + m_hi) / 2.0

        # Override spring mass for this trial
        _orig_get_spring = get_spring_mass.__code__
        result = fdtd_simulate(midi, velocity=0.5, duration_s=0.08, oversample=oversample)
        # We can't easily override get_spring_mass, so let's use a direct approach

        # Actually, run a short simulation with custom mass
        L = TINE_LENGTH_MM[key_idx] * 1e-3
        f0 = f0_target
        sigma0, sigma1 = compute_damping_coeffs(midi, f0)
        fs_sim = FS_AUDIO * max(oversample, 16)
        k_t = 1.0 / fs_sim
        try:
            N, h = compute_grid_params(L, KAPPA, sigma1, k_t)
        except ValueError:
            # Grid too small — try higher oversampling
            fs_sim = FS_AUDIO * 32
            k_t = 1.0 / fs_sim
            N, h = compute_grid_params(L, KAPPA, sigma1, k_t)

        l_spring = max(2, min(N - 2, int(round(spring_frac * N))))

        # Quick simulation (40ms, no hammer — pluck the tip, numpy vectorized)
        rhoA_base = RHO_STEEL * A_TINE
        rhoA_arr = np.full(N + 3, rhoA_base)
        rhoA_arr[l_spring] += m_try / h
        EI = E_STEEL * I_TINE

        # Precompute coefficient ARRAYS (vectorized, same as fdtd_simulate)
        kappa_arr = np.sqrt(EI / rhoA_arr)
        mu_arr = kappa_arr * k_t / h**2
        D_val = 1.0 / (1.0 + sigma0 * k_t)  # scalar (damping uniform)
        s1kh2 = sigma1 * k_t / h**2
        C0 = (2.0 - 6.0 * mu_arr**2 - 4.0 * s1kh2) * D_val
        C1 = (4.0 * mu_arr**2 + 2.0 * s1kh2) * D_val
        M0 = mu_arr**2 * D_val
        B0 = (-1.0 + sigma0 * k_t + 4.0 * s1kh2) * D_val
        S0 = (2.0 * s1kh2) * D_val

        u_prev = np.zeros(N + 3)
        u_curr = np.zeros(N + 3)
        u_next = np.zeros(N + 3)

        # Initial condition: parabolic pluck at tip
        u_curr[:N+1] = (np.arange(N + 1) / N)**2
        u_prev[:] = u_curr[:]

        n_sim = int(0.04 * fs_sim)  # 40ms sufficient for Goertzel
        tip_signal = np.zeros(n_sim)

        # Vectorized interior slice: l = 2..N-2
        sl = slice(2, N - 1)
        sl_p1 = slice(3, N)
        sl_m1 = slice(1, N - 2)
        sl_p2 = slice(4, N + 1)
        sl_m2 = slice(0, N - 3)

        mu_b = mu_arr[N]
        # Free boundary coefficients (precomputed)
        C0_Nm1 = (2.0 - 5.0*mu_arr[N-1]**2 - 4.0*s1kh2) * D_val
        C_Nm1_N = (2.0*s1kh2 + 2.0*mu_arr[N-1]**2) * D_val
        C_Nm1_Nm2 = (4.0*mu_arr[N-1]**2 + 2.0*s1kh2) * D_val
        M_Nm1 = mu_arr[N-1]**2 * D_val

        C0_N = (2.0 - 2.0*mu_b**2 - 4.0*s1kh2) * D_val
        C_N_Nm1 = (4.0*mu_b**2 + 4.0*s1kh2) * D_val
        M_N = 2.0*mu_b**2 * D_val

        for n in range(n_sim):
            # Interior: numpy vectorized
            u_next[sl] = (C0[sl] * u_curr[sl]
                          + C1[sl] * (u_curr[sl_p1] + u_curr[sl_m1])
                          - M0[sl] * (u_curr[sl_p2] + u_curr[sl_m2])
                          + B0 * u_prev[sl]
                          - S0 * (u_prev[sl_p1] + u_prev[sl_m1]))
            # Clamped
            u_next[0] = 0.0
            u_next[1] = 0.0
            # Free boundary
            u_next[N-1] = (C0_Nm1*u_curr[N-1] + C_Nm1_N*u_curr[N]
                           + C_Nm1_Nm2*u_curr[N-2] - M_Nm1*u_curr[N-3]
                           + B0*u_prev[N-1] - S0*(u_prev[N-2]+u_prev[N]))
            u_next[N] = (C0_N*u_curr[N] + C_N_Nm1*u_curr[N-1]
                         - M_N*u_curr[N-2] + B0*u_prev[N]
                         - (4.0*s1kh2*D_val)*u_prev[N-1])
            tip_signal[n] = u_next[N]
            u_prev, u_curr, u_next = u_curr, u_next, u_prev

        # NaN check: if simulation blew up, retry at 2× oversampling (recursive)
        if np.any(np.isnan(tip_signal)):
            if oversample < 128:
                return find_tuning_mass(midi, spring_frac, oversample * 2, tol_cents, max_iter)
            else:
                print(f"  [tune] FATAL: NaN at 128x for MIDI {midi}")
                return m_try

        # Measure f0 (Goertzel — sub-cent precision)
        dec = decimate(tip_signal, max(oversample, 16), ftype='iir', zero_phase=True)
        dec_win = dec * np.hanning(len(dec))
        f0_meas = goertzel_frequency(dec_win, FS_AUDIO, f0_target, f_range=f0_target * 0.3)

        cents = 1200 * np.log2(f0_meas / f0_target) if f0_meas > 0 and np.isfinite(f0_meas) else 999

        if abs(cents) < tol_cents:
            print(f"  [tune] iter={iteration} m={m_try*1000:.2f}g f0={f0_meas:.1f}Hz ({cents:+.1f}c) ✓")
            return m_try

        if f0_meas > f0_target:
            m_lo = m_try  # need more mass
        else:
            m_hi = m_try  # too much mass

        if iteration % 4 == 0 or abs(cents) < 20:
            print(f"  [tune] iter={iteration} m={m_try*1000:.2f}g f0={f0_meas:.1f}Hz ({cents:+.1f}c)")

    print(f"  [tune] WARNING: did not converge. Best m={m_try*1000:.2f}g f0={f0_meas:.1f}Hz ({cents:+.1f}c)")
    return m_try

# =============================================================================
# Per-key data (from epiano-worklet-processor.js)
# =============================================================================

# Tine lengths (mm) — SM Figure 6-2, piecewise model
# Index 0 = key 1 = MIDI 21 (A0)
TINE_LENGTH_MM = np.array([
    157.0, 157.0, 157.0, 157.0, 157.0, 157.0, 157.0, 153.8,
    150.6, 147.4, 144.2, 141.0, 137.9, 134.7, 131.5, 128.3,
    125.1, 121.9, 118.7, 115.5, 112.4, 109.2, 106.0, 102.8,
    99.6,  96.4,  93.2,  90.1,  86.9,  83.7,  80.5,  77.3,
    74.1,  71.0,  67.8,  65.4,  63.0,  60.6,  58.3,  56.0,
    54.7,  53.4,  52.2,  50.9,  49.8,  48.6,  47.5,  46.3,
    45.2,  44.1,  43.1,  42.1,  41.1,  40.1,  39.2,  38.2,
    37.3,  36.4,  35.6,  34.7,  33.9,  33.1,  32.3,  31.6,
    30.8,  30.1,  29.4,  28.7,  28.0,  27.3,  26.7,  26.1,
    25.4,  24.8,  24.3,  23.7,  23.1,  22.6,  22.0,  21.5,
    21.0,  20.5,  20.0,  19.6,  19.1,  18.7,  18.3,  18.0,
], dtype=np.float64)

# Q-value table (Shear 2011) — interpolated per MIDI
Q_TABLE_MIDI = np.array([39, 51, 59, 60, 61, 62, 64, 75, 87])
Q_TABLE_VAL  = np.array([949, 731, 1101, 1238, 1040, 1156, 1520, 2175, 1761])

# =============================================================================
# Hammer contact model — Hunt & Crossley (Sonderboe 2024 Table 3.2)
# =============================================================================
# Sonderboe's FDTD-validated parameters (single set for all keys):
#   k_h = 1.5e11 N/m^α, α = 2.8, m_h = 11g, λ = 9e10 N·s/m^(5/2)
#
# Our per-zone extension: COR varies by neoprene Shore A hardness,
# mass varies by zone (SM measurements). K_H and ALPHA_H are Sonderboe's
# values — they represent the FDTD contact stiffness, NOT the worklet's
# onset envelope parameters (which are different quantities).
# =============================================================================
HAMMER_KH_FDTD = 1.5e11        # Sonderboe Table 3.2: stiffness (N/m^α)
HAMMER_ALPHA_H = 2.8            # Sonderboe Table 3.2: contact exponent
HAMMER_LAMBDA = 9e10            # Sonderboe Table 3.2: force damping weight

# Per-zone COR and mass (from worklet/SM data, physically measured)
HAMMER_COR = [0.35, 0.50, 0.65, 0.80, 0.92]
HAMMER_RELMASS = [0.67, 0.83, 1.00, 1.17, 0.67]
HAMMER_MASS_REF = 0.030  # 30g reference (SM data)
# Sonderboe uses 11g — our 30g × zone factor may be more accurate for Mk1

# Striking line positions (mm) — linear interpolation
def striking_line_mm(midi):
    key = midi - 20
    key = max(1, min(88, key))
    t = (key - 1) / 87.0
    return 57.15 * (1.0 - t) + 3.175 * t


def get_q_value(midi):
    """Interpolate Q from Shear table."""
    if midi <= Q_TABLE_MIDI[0]:
        return Q_TABLE_VAL[0]
    if midi >= Q_TABLE_MIDI[-1]:
        return Q_TABLE_VAL[-1]
    return float(np.interp(midi, Q_TABLE_MIDI, Q_TABLE_VAL))


def get_hammer_params(midi, velocity=0.8):
    """Get hammer zone parameters for a given MIDI note.

    Returns (K_H, alpha_h, cor, mu_hc_coeff, m_hammer).
    K_H and alpha_h are Sonderboe's FDTD contact parameters.
    mu_hc_coeff = λ/k_h (Sonderboe convention: µ_h = lambda/k).
    """
    key = midi - 20
    if key <= 30:   zone = 0
    elif key <= 40: zone = 1
    elif key <= 50: zone = 2
    elif key <= 64: zone = 3
    else:           zone = 4

    K_H = HAMMER_KH_FDTD
    alpha_h = HAMMER_ALPHA_H
    cor = HAMMER_COR[zone]
    rel_mass = HAMMER_RELMASS[zone]

    # Velocity-dependent COR (strain-rate stiffening)
    vel_norm = max(velocity, 0.1)
    cor_v = cor + (1 - cor) * 0.12 * max(vel_norm - 0.3, 0)
    cor_v = min(cor_v, 0.98)

    m_hammer = HAMMER_MASS_REF * rel_mass

    # Hunt-Crossley damping: µ_h = λ/k (Sonderboe eq after 3.20)
    mu_hc_coeff = HAMMER_LAMBDA / HAMMER_KH_FDTD

    return K_H, alpha_h, cor_v, mu_hc_coeff, m_hammer


# =============================================================================
# FDTD Stability
# =============================================================================

def compute_grid_params(L, kappa, sigma1, k):
    """
    Compute stable grid spacing and number of grid points.
    Sonderboe eq. 3.3: h >= sqrt((-4σ₁k + sqrt(16σ₁²k² + 16κ²k²)) / 2)
    """
    disc = (4 * sigma1 * k)**2 + 16 * kappa**2 * k**2
    h_min = np.sqrt((-4 * sigma1 * k + np.sqrt(disc)) / 2)

    N = int(np.floor(L / h_min))
    if N < 8:
        raise ValueError(f"Grid too small: N={N} (L={L*1000:.1f}mm, h_min={h_min*1000:.3f}mm). "
                         f"Increase oversampling.")
    # Recalculate h to fit exactly N intervals
    h = L / N
    return N, h


def compute_damping_coeffs(midi, f0):
    """
    Convert Q-value to FDTD damping coefficients σ₀ and σ₁.
    σ₀ = frequency-independent damping (1/s)
    σ₁ = frequency-dependent damping (m²/s)

    From Q: τ = Q/(π×f₀), decay rate = 1/τ.
    σ₀ controls low-frequency damping, σ₁ controls high-frequency damping.
    We split: σ₀ from Q at f₀, σ₁ empirical (Sonderboe: 0.005).
    """
    Q = get_q_value(midi)
    tau = Q / (np.pi * f0)
    sigma0 = 1.0 / tau

    # Frequency-dependent damping (Sonderboe Table 3.1)
    # Controls how fast beam modes decay relative to fundamental
    sigma1 = 0.005  # m²/s — Sonderboe value

    return sigma0, sigma1


# =============================================================================
# FDTD Simulator Core
# =============================================================================

def fdtd_simulate(midi, velocity=0.8, duration_s=0.1, oversample=16):
    """
    Run FDTD simulation for one key at one velocity.

    Returns dict with:
      'disp_44k': displacement at PU position, 44.1kHz (np.float64)
      'vel_44k':  velocity at PU position, 44.1kHz (np.float64)
      'disp_full': displacement at full sim rate (for validation)
      'f0_target': target fundamental frequency (Hz)
      'f0_measured': measured fundamental from FDTD output (Hz)
      'N_grid': number of grid points
      'oversample': oversampling factor used
      'Tc_measured': measured hammer contact time (s)
    """
    # --- Tine parameters ---
    key_idx = midi - 21
    if key_idx < 0 or key_idx >= 88:
        raise ValueError(f"MIDI {midi} out of range (21-108)")

    L = TINE_LENGTH_MM[key_idx] * 1e-3  # PHYSICAL tine length (meters)
    f0 = 440.0 * 2**((midi - 69) / 12.0)

    # Tuning spring: point mass on the beam (replaces effective_length approach)
    m_spring = get_spring_mass(key_idx)
    spring_frac = get_spring_position_frac(key_idx)

    sigma0, sigma1 = compute_damping_coeffs(midi, f0)

    # --- Simulation sample rate ---
    oversample = max(oversample, 16)
    fs_sim = FS_AUDIO * oversample
    k = 1.0 / fs_sim  # time step

    # --- Grid ---
    N, h = compute_grid_params(L, KAPPA, sigma1, k)

    # --- Spring location (grid index) ---
    l_spring = max(2, min(N - 2, int(round(spring_frac * N))))

    # --- Per-grid-point linear mass density ---
    # Uniform beam: ρA everywhere. Spring adds point mass at l_spring.
    # rhoA_arr[l] in kg/m (linear density for the FDTD scheme)
    rhoA_uniform = RHO_STEEL * A_TINE
    rhoA_arr = np.full(N + 3, rhoA_uniform)
    rhoA_arr[l_spring] += m_spring / h  # spring mass spread over one grid spacing

    # --- Hammer parameters ---
    K_H, alpha_h, cor, mu_hc_coeff, m_hammer = get_hammer_params(midi, velocity)

    # Contact position (grid index)
    strike_mm = striking_line_mm(midi)
    strike_frac = strike_mm / (L * 1000)
    l_contact = max(2, min(N - 2, int(round(strike_frac * N))))

    # Contact distribution: cosine-weighted band over hammer width
    # Falaize: wh = 15mm (neoprene tip width). Distributes force physically.
    HAMMER_WIDTH_M = 0.015  # 15mm (Falaize 2017, line 269)
    n_contact_half = max(1, int(round(0.5 * HAMMER_WIDTH_M / h)))
    contact_dist = np.zeros(N + 3)
    for cl in range(-n_contact_half, n_contact_half + 1):
        idx = l_contact + cl
        if 2 <= idx <= N:
            # Cosine weighting: peak at center, zero at edges
            weight = 0.5 * (1.0 + np.cos(np.pi * cl / (n_contact_half + 1)))
            contact_dist[idx] = weight
    # Normalize so total = 1/h (discrete delta function integral = 1)
    cd_sum = np.sum(contact_dist)
    if cd_sum > 0:
        contact_dist *= 1.0 / (cd_sum * h)

    # PU observation point: free end (tip) of tine
    l_pu = N

    # --- Precompute per-grid-point update coefficients ---
    # With variable ρA, the local κ² = EI/ρA changes at the spring point.
    # This correctly models the spring's inertial effect on all modes.
    EI = E_STEEL * I_TINE  # beam stiffness (uniform — geometry doesn't change)

    # Coefficient arrays
    D_arr = np.zeros(N + 3)
    C0_arr = np.zeros(N + 3)
    C1_arr = np.zeros(N + 3)
    B0_arr = np.zeros(N + 3)
    S_arr = np.zeros(N + 3)
    M0_arr = np.zeros(N + 3)
    # Force injection coefficient: F_actual / (ρA × h) per Sonderboe eq 3.21
    # (Previously used m_hammer/(ρA×L) which was 1667× too weak — missing ε_h factor)
    force_coeff_arr = np.zeros(N + 3)

    for l in range(N + 3):
        kappa_l = np.sqrt(EI / rhoA_arr[l])
        mu_l = kappa_l * k / h**2
        D_l = 1.0 / (1.0 + sigma0 * k)
        D_arr[l] = D_l
        C0_arr[l] = (2.0 - 6.0 * mu_l**2 - 4.0 * sigma1 * k / h**2) * D_l
        C1_arr[l] = (4.0 * mu_l**2 + 2.0 * sigma1 * k / h**2) * D_l
        M0_arr[l] = mu_l**2 * D_l
        B0_arr[l] = (-1.0 + sigma0 * k + 4.0 * sigma1 * k / h**2) * D_l
        S_arr[l] = (2.0 * sigma1 * k / h**2) * D_l
        force_coeff_arr[l] = 1.0 / (rhoA_arr[l] * h)

    # --- State arrays (3 time levels: n-1, n, n+1) ---
    # Grid points: 0 (clamped) to N (free end)
    # Clamped BC: u[0] = u[1] = 0 (cantilever: displacement and slope = 0)
    # Actually for 4th order: u[0] = 0, u[1] = 0 (virtual: u[-1] = -u[1])
    # Free BC: δxx[N] = 0, δx·δxx[N] = 0
    # We use Sonderboe's matrix-derived boundary equations (eq. 3.9, 3.10)

    u_prev = np.zeros(N + 3)  # +3 for virtual grid points
    u_curr = np.zeros(N + 3)
    u_next = np.zeros(N + 3)

    # Hammer state
    x_hammer = 0.0  # hammer displacement (positive = toward tine)
    v_hammer = velocity * 4.0  # initial velocity (m/s). velocity=1.0 → 4 m/s (Sonderboe Table 3.2)
    hammer_active = True

    # --- Output arrays ---
    n_samples = int(duration_s * fs_sim)
    disp_out = np.zeros(n_samples)
    vel_out = np.zeros(n_samples)
    force_out = np.zeros(n_samples)

    # --- Precompute semi-implicit coupling coefficient (Bilbao 2009 Ch.7) ---
    # g = k² × (1/m_h + Σ(force_coeff × contact_dist² × h² × D))
    # This measures how much α changes per unit force in one time step.
    cl_lo = max(2, l_contact - n_contact_half)
    cl_hi = min(N + 1, l_contact + n_contact_half + 1)
    beam_coupling_sum = 0.0
    for cl in range(cl_lo, cl_hi):
        beam_coupling_sum += force_coeff_arr[cl] * (contact_dist[cl] * h)**2 * D_arr[cl]
    g_implicit = k**2 * (1.0 / m_hammer + beam_coupling_sum)

    # --- Time stepping ---
    for n in range(n_samples):
        # === Beam update (interior points) — WITHOUT force first (u_star) ===
        for l in range(2, N - 1):
            u_next[l] = (C0_arr[l] * u_curr[l]
                         + C1_arr[l] * (u_curr[l+1] + u_curr[l-1])
                         - M0_arr[l] * (u_curr[l+2] + u_curr[l-2])
                         + B0_arr[l] * u_prev[l]
                         - S_arr[l] * (u_prev[l+1] + u_prev[l-1]))

        # === Clamped boundary (l=0, l=1) ===
        u_next[0] = 0.0
        u_next[1] = 0.0

        # === Free boundary (l=N-1 and l=N) — Sonderboe eq. 3.9, 3.10 ===
        # Use per-point coefficients for correct spring-mass effect at boundary
        mu_Nm1 = np.sqrt(EI / rhoA_arr[N-1]) * k / h**2
        mu_N = np.sqrt(EI / rhoA_arr[N]) * k / h**2
        D_Nm1 = D_arr[N-1]
        D_N = D_arr[N]

        # l = N-1
        u_next[N-1] = ((2.0 - 5.0*mu_Nm1**2 - 4.0*sigma1*k/h**2) * u_curr[N-1]
                       + (2.0*sigma1*k/h**2 + 2.0*mu_Nm1**2) * u_curr[N]
                       + (4.0*mu_Nm1**2 + 2.0*sigma1*k/h**2) * u_curr[N-2]
                       - mu_Nm1**2 * u_curr[N-3]
                       + (-1.0 + sigma0*k + 4.0*sigma1*k/h**2) * u_prev[N-1]
                       - 2.0*sigma1*k/h**2 * (u_prev[N-2] + u_prev[N])) * D_Nm1

        # l = N
        u_next[N] = ((2.0 - 2.0*mu_N**2 - 4.0*sigma1*k/h**2) * u_curr[N]
                     + (4.0*mu_N**2 + 4.0*sigma1*k/h**2) * u_curr[N-1]
                     - 2.0*mu_N**2 * u_curr[N-2]
                     + (-1.0 + sigma0*k + 4.0*sigma1*k/h**2) * u_prev[N]
                     - 4.0*sigma1*k/h**2 * u_prev[N-1]) * D_N

        # === Semi-implicit hammer-tine contact (Bilbao 2009 Ch.7) ===
        # u_next is now u_star (beam prediction without force).
        # Solve F = K_H × (α_star - g×F)^α_h with Newton-Raphson (Bilbao 2009)
        F_hammer = 0.0
        if hammer_active:
            # Predicted hammer position without force (Verlet with F=0)
            x_star = 2.0 * x_hammer - (x_hammer - v_hammer * k)

            # Predicted contact-zone beam displacement (weighted average of u_star)
            u_contact_star = 0.0
            for cl in range(cl_lo, cl_hi):
                u_contact_star += contact_dist[cl] * h * u_next[cl]

            alpha_star = x_star - u_contact_star

            if alpha_star > 0:
                # Newton-Raphson: F = K_H × (α_star - g×F)^α_h
                F_guess = min(K_H * alpha_star**alpha_h, 1e6)  # clamped initial guess
                for _nr in range(12):
                    alpha_nr = alpha_star - g_implicit * F_guess
                    if alpha_nr <= 0:
                        F_guess *= 0.5
                        continue
                    f_val = K_H * alpha_nr**alpha_h
                    R = F_guess - f_val
                    dR = 1.0 + K_H * alpha_h * alpha_nr**(alpha_h - 1.0) * g_implicit
                    step = R / dR
                    F_guess -= step
                    if F_guess < 0:
                        F_guess = 0.0
                    if abs(R) < max(1e-3, f_val * 1e-8):
                        break

                # Add viscous correction: µ_h = λ/k (Sonderboe convention)
                alpha_next = alpha_star - g_implicit * F_guess
                if alpha_next > 0 and F_guess > 0:
                    u_contact_curr = 0.0
                    u_contact_prev = 0.0
                    for cl in range(cl_lo, cl_hi):
                        w = contact_dist[cl] * h
                        u_contact_curr += w * u_curr[cl]
                        u_contact_prev += w * u_prev[cl]
                    alpha_curr = x_hammer - u_contact_curr
                    alpha_prev_val = (x_hammer - v_hammer * k) - u_contact_prev
                    dalpha_dt = (alpha_curr - max(alpha_prev_val, 0)) / k
                    viscous_factor = 1.0 + mu_hc_coeff * dalpha_dt
                    if viscous_factor > 0:
                        F_hammer = F_guess * viscous_factor
                    else:
                        F_hammer = 0.0
                else:
                    F_hammer = max(F_guess, 0.0)
            else:
                # No contact
                if n > 10 and alpha_star < -1e-8:
                    hammer_active = False

        # Apply force to beam (distributed)
        if F_hammer > 0:
            for cl in range(cl_lo, cl_hi):
                u_next[cl] += k**2 * force_coeff_arr[cl] * F_hammer * contact_dist[cl] * h * D_arr[cl]

        # Update hammer with force (Verlet)
        if hammer_active:
            a_hammer = -F_hammer / m_hammer
            x_hammer_new = 2.0 * x_hammer - (x_hammer - v_hammer * k) + a_hammer * k**2
            v_hammer = (x_hammer_new - x_hammer) / k
            x_hammer = x_hammer_new

        # === Store output (PU observation point = free end) ===
        disp_out[n] = u_next[l_pu]
        # Velocity via centered finite difference in time
        vel_out[n] = (u_next[l_pu] - u_prev[l_pu]) / (2.0 * k)
        force_out[n] = F_hammer

        # === Swap state ===
        u_prev, u_curr, u_next = u_curr, u_next, u_prev
        # Clear u_next for next iteration (it's now the oldest, will be overwritten)
        # Actually in the swap, u_next now points to what was u_prev, which we'll overwrite.
        # No need to clear since all points are written in the loop.

    # --- Decimate to 44.1kHz ---
    disp_44k = decimate(disp_out, oversample, ftype='iir', zero_phase=True)
    vel_44k = decimate(vel_out, oversample, ftype='iir', zero_phase=True)

    # --- Measure fundamental frequency (Goertzel, sub-cent precision) ---
    steady_start_44k = int(0.03 * FS_AUDIO)  # 30ms onwards (after hammer contact)
    steady_end_44k = len(disp_44k)
    if steady_end_44k > steady_start_44k + 256:
        segment = disp_44k[steady_start_44k:steady_end_44k]
        segment = segment * np.hanning(len(segment))  # window to reduce leakage
        f0_measured = goertzel_frequency(segment, FS_AUDIO, f0, f_range=f0 * 0.3)
    else:
        f0_measured = 0.0

    # --- Measure contact time ---
    force_nonzero = np.where(force_out > 0)[0]
    if len(force_nonzero) > 0:
        Tc_measured = (force_nonzero[-1] - force_nonzero[0]) / fs_sim
    else:
        Tc_measured = 0.0

    return {
        'disp_44k': disp_44k,
        'vel_44k': vel_44k,
        'disp_full': disp_out,
        'force_full': force_out,
        'f0_target': f0,
        'f0_measured': f0_measured,
        'N_grid': N,
        'h': h,
        'oversample': oversample,
        'Tc_measured': Tc_measured,
        'fs_sim': fs_sim,
        'midi': midi,
        'velocity': velocity,
    }


# =============================================================================
# Oversampling selection per key
# =============================================================================

def choose_oversample(midi):
    """
    Choose oversampling factor for numerical stability.
    N >= 20 grid points required for accurate dispersion (was 12, caused treble instability).
    128x tier added for shortest tines (MIDI 103-108, L=18-19mm).
    Offline simulation — computational cost is acceptable.
    """
    key_idx = midi - 21
    L = TINE_LENGTH_MM[max(0, min(87, key_idx))] * 1e-3

    for ov in [16, 32, 64, 128]:
        fs_sim = FS_AUDIO * ov
        k = 1.0 / fs_sim
        try:
            N, h = compute_grid_params(L, KAPPA, 0.005, k)
            if N >= 20:
                return ov
        except ValueError:
            continue
    return 128  # fallback: maximum oversampling


# =============================================================================
# Batch simulation
# =============================================================================

VEL_LAYERS = [0.2, 0.5, 0.8, 1.0]

def simulate_all(midi_list=None, output_dir='tools/fdtd_output'):
    """Run FDTD for all specified keys and velocity layers."""
    os.makedirs(output_dir, exist_ok=True)

    if midi_list is None:
        midi_list = list(range(21, 109))  # All 88 keys

    total = len(midi_list) * len(VEL_LAYERS)
    done = 0
    t_start = time.time()

    results = {}
    for midi in midi_list:
        ov = choose_oversample(midi)
        for vel in VEL_LAYERS:
            done += 1
            key_idx = midi - 21
            print(f"[{done}/{total}] MIDI {midi} (key {key_idx+1}/88) vel={vel:.1f} ov={ov}x ...",
                  end='', flush=True)
            t0 = time.time()

            result = fdtd_simulate(midi, velocity=vel, oversample=ov)

            # NaN retry: if simulation blew up, double oversampling
            if np.any(np.isnan(result['disp_44k'])):
                ov2 = min(ov * 2, 128)
                print(f" NaN! retry ov={ov2}x ...", end='', flush=True)
                result = fdtd_simulate(midi, velocity=vel, oversample=ov2)

            dt = time.time() - t0
            f0_err = abs(result['f0_measured'] - result['f0_target'])
            f0_cents = 1200 * np.log2(result['f0_measured'] / result['f0_target']) if result['f0_measured'] > 0 else float('inf')
            print(f" {dt:.1f}s  N={result['N_grid']}  "
                  f"f0={result['f0_measured']:.1f}Hz (target {result['f0_target']:.1f}, {f0_cents:+.0f}cents)  "
                  f"Tc={result['Tc_measured']*1000:.2f}ms")

            results[(midi, vel)] = result

    # Save all results
    npz_path = os.path.join(output_dir, 'fdtd_results.npz')
    save_dict = {}
    for (midi, vel), r in results.items():
        prefix = f'm{midi}_v{int(vel*100)}'
        save_dict[f'{prefix}_disp'] = r['disp_44k']
        save_dict[f'{prefix}_vel'] = r['vel_44k']
        save_dict[f'{prefix}_meta'] = np.array([
            r['f0_target'], r['f0_measured'], r['N_grid'],
            r['oversample'], r['Tc_measured'], r['midi'], r['velocity']
        ])
    np.savez_compressed(npz_path, **save_dict)
    print(f"\nSaved to {npz_path} ({os.path.getsize(npz_path) / 1024:.0f} KB)")

    elapsed = time.time() - t_start
    print(f"Total time: {elapsed:.0f}s ({elapsed/60:.1f}min)")

    return results


# =============================================================================
# Single-key validation
# =============================================================================

def validate_single(midi=45, velocity=0.8):
    """Run and validate a single key (default A2 = MIDI 45)."""
    print(f"=== FDTD Validation: MIDI {midi} ({440*2**((midi-69)/12):.1f} Hz) ===\n")

    ov = choose_oversample(midi)
    result = fdtd_simulate(midi, velocity=velocity, oversample=ov)

    f0 = result['f0_target']
    f0m = result['f0_measured']
    cents = 1200 * np.log2(f0m / f0) if f0m > 0 else float('inf')

    print(f"Grid: N={result['N_grid']}, h={result['h']*1000:.3f}mm, oversample={ov}x")
    print(f"Target f0: {f0:.2f} Hz")
    print(f"Measured f0: {f0m:.2f} Hz ({cents:+.1f} cents)")
    print(f"Contact time: {result['Tc_measured']*1000:.2f} ms")
    print(f"Max displacement: {np.max(np.abs(result['disp_44k'])):.6f} m")
    print(f"Output samples (44.1kHz): {len(result['disp_44k'])}")

    # Check stability (no NaN or explosion)
    if np.any(np.isnan(result['disp_44k'])):
        print("ERROR: NaN detected — UNSTABLE")
        return None
    max_disp = np.max(np.abs(result['disp_44k']))
    if max_disp > 0.01:  # 10mm — physically impossible
        print(f"WARNING: Max displacement {max_disp*1000:.1f}mm seems too large")

    # Save for inspection
    os.makedirs('tools/fdtd_output', exist_ok=True)
    out_path = f'tools/fdtd_output/validate_m{midi}_v{int(velocity*100)}.npz'
    np.savez_compressed(out_path,
                        disp=result['disp_44k'],
                        vel=result['vel_44k'],
                        force=result['force_full'],
                        disp_full=result['disp_full'])
    print(f"Saved to {out_path}")

    return result


# =============================================================================
# Main
# =============================================================================

if __name__ == '__main__':
    args = sys.argv[1:]

    if '--tune' in args:
        # Find tuning mass for selected keys
        idx = args.index('--tune')
        midis = [int(m) for m in args[idx+1:] if m.isdigit()]
        if not midis:
            midis = [33, 45, 53, 60, 69, 81]
        for midi in midis:
            f0 = 440 * 2**((midi-69)/12)
            key_idx = midi - 21
            L = TINE_LENGTH_MM[key_idx]
            print(f"\n=== Tuning MIDI {midi} ({f0:.1f}Hz, L={L:.1f}mm) ===")
            m = find_tuning_mass(midi)
            ratio = m / (RHO_STEEL * A_TINE * L * 1e-3) * 100
            print(f"  Result: spring mass = {m*1000:.2f}g ({ratio:.1f}% of tine)")
    elif '--all' in args:
        simulate_all()
    elif '--validate' in args:
        # Validate eigenfrequencies for several keys
        for midi in [33, 45, 53, 60, 69, 81, 93]:
            validate_single(midi)
            print()
    elif '--midi' in args:
        idx = args.index('--midi')
        midis = [int(m) for m in args[idx+1:] if m.isdigit()]
        for midi in midis:
            validate_single(midi)
            print()
    else:
        # Default: validate A2 (MIDI 45, Gabrielli reference)
        validate_single(45)
