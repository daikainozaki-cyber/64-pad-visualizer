"""
Compare our model's DI output spectrum with Gabrielli 2020 companion recordings.
Replicates the worklet's DI signal chain in Python for A2 (110Hz) and F3 (174.6Hz).

Key question: Does our model's PU nonlinearity produce the same sideband structure
as Gabrielli's PU model applied to laser-measured mode data?

If not, the difference reveals what's missing.

Usage: python3 tools/compare_spectra.py
"""

import numpy as np
import os
import json

try:
    import scipy.io.wavfile as wav
except ImportError:
    print("scipy required: pip3 install scipy")
    raise

# ================================================================
# Constants (from epiano-worklet-processor.js)
# ================================================================
LUT_SIZE = 1024
TWO_PI = 2 * np.pi
CYL_A = 0.14
CYL_H = 0.508
# Recalibrated: tineAmp target reduced from 0.3 to 0.04 (physical displacement).
# Output level maintained by scaling up EMF: 0.00044 × (0.3/0.04) = 0.0033.
# Recalibrated: tineAmp target 0.06. EMF scale = 0.00044 × (0.3/0.06) = 0.0022.
PU_EMF_SCALE = 0.0022
HARP_PARALLEL_DIV = 3.0

# Beam mode frequency ratios (spring-corrected, Gabrielli 2020)
BEAM_FREQ_RATIOS = [7.11, 20.25, 37.4, 60.9, 90.1, 125.0, 165.6]
N_BEAM_MODES = 7

# Per-key tine lengths (mm) — from TINE_LENGTH_TABLE[midi - 21]
TINE_LENGTHS = {
    45: 99.6,    # A2 (midi=45, keyIdx=24) — TINE_LENGTH_TABLE[24]
    53: 74.1,    # F3 (midi=53, keyIdx=32) — TINE_LENGTH_TABLE[32]
}

# FEM spatial ratios (from BEAM_SPATIAL_RATIO, 7 ratios per key)
BEAM_SPATIAL = {
    45: [-2.538578, 1.631736, 1.104979, -1.897430, 0.198008, 1.470007, -1.146258],  # key 25 (midi 45)
    53: [-1.550816, -0.167347, 1.166307, 0.100903, -0.980791, 0.020542, 0.942619],   # key 33 (midi 53)
}

# Q-values
Q_TABLE_MIDI = [39, 51, 59, 60, 61, 62, 64, 75, 87]
Q_TABLE_VAL = [949, 731, 1101, 1238, 1040, 1156, 1520, 2175, 1761]

# Tine physical data
TINE_EI = 180e9 * np.pi * (1e-3)**4 / 4
TINE_RHO = 7850
TINE_D = 0.001905
TINE_A = np.pi * (TINE_D / 2)**2

# Hammer data
HAMMER_KH = [112000, 337000, 785000, 1680000, 1.12e9]
HAMMER_RELMASS = [0.67, 0.83, 1.00, 1.17, 0.67]
HAMMER_COR = [0.35, 0.50, 0.65, 0.80, 0.92]


def interpolate_Q(midi):
    if midi <= Q_TABLE_MIDI[0]:
        return Q_TABLE_VAL[0]
    if midi >= Q_TABLE_MIDI[-1]:
        return Q_TABLE_VAL[-1]
    for i in range(len(Q_TABLE_MIDI) - 1):
        if Q_TABLE_MIDI[i] <= midi <= Q_TABLE_MIDI[i + 1]:
            frac = (midi - Q_TABLE_MIDI[i]) / (Q_TABLE_MIDI[i + 1] - Q_TABLE_MIDI[i])
            return Q_TABLE_VAL[i] + frac * (Q_TABLE_VAL[i + 1] - Q_TABLE_VAL[i])
    return 1200


def get_hammer_zone(midi):
    key = midi - 20
    if key <= 30:
        return 0
    elif key <= 40:
        return 1
    elif key <= 50:
        return 2
    elif key <= 64:
        return 3
    return 4


def get_hammer_params(midi, velocity):
    zone = get_hammer_zone(midi)
    rel_mass = HAMMER_RELMASS[zone]
    K_H = HAMMER_KH[zone]
    cor = HAMMER_COR[zone]

    vel_norm = max(velocity, 0.1)
    cor_v = cor + (1 - cor) * 0.12 * max(vel_norm - 0.3, 0)
    cor_v = min(cor_v, 0.98)

    L_m = TINE_LENGTHS.get(midi, 80) * 1e-3
    m_eff = 0.24 * TINE_RHO * TINE_A * L_m

    v0 = max(vel_norm, 0.1)
    alpha_max = (5 * m_eff * v0**2 / (4 * K_H))**0.4
    Tc_hertz = 2.94 * alpha_max / v0
    Tc = Tc_hertz * (1 + 0.5 * (1 - cor_v))
    Tc = np.clip(Tc, 0.00002, 0.005)

    spectral_beta = 0.6 * (1 - cor_v)
    return {
        'Tc': Tc,
        'relMass': rel_mass,
        'cor': cor_v,
        'spectralBeta': spectral_beta
    }


def half_sine_envelope(f, Tc, beta):
    u = 2 * f * Tc
    if u <= 1:
        return 1.0
    if beta <= 0.001:
        return 1.0 / (u * u)
    return 1.0 / (u ** (2 + beta))


def striking_line(midi):
    key = midi - 20
    key = np.clip(key, 1, 88)
    t = (key - 1) / 87.0
    return 57.15 * (1 - t) + 3.175 * t


def cylinder_bz(rho, z, a, h):
    a2rho2 = a * a + rho * rho
    rt = np.sqrt(z * z + a2rho2)
    zb = z + h
    rb = np.sqrt(zb * zb + a2rho2)
    return z / rt - zb / rb


def compute_pu_lut(symmetry=0.5, distance=0.5, gap_mm=0.794, q_range=1.0, lver_offset=0.0):
    """Compute g'(q) LUT (cylinder model)."""
    sym = np.clip(symmetry, 0, 1)
    Lver = sym * 0.25 + lver_offset
    gap_offset = (gap_mm - 0.794) * 0.04
    Lhor = distance * 0.35 + 0.05 + gap_offset
    qr = max(q_range, 0.01)

    dq = 2 * qr / (LUT_SIZE - 1)

    # Compute Bz
    q_arr = np.linspace(-qr, qr, LUT_SIZE)
    Bz = np.array([cylinder_bz(Lhor, Lver + q, CYL_A, CYL_H) for q in q_arr])

    # Numerical derivative g'(q) = dBz/dq
    lut = np.zeros(LUT_SIZE)
    lut[1:-1] = (Bz[2:] - Bz[:-2]) / (2 * dq)
    lut[0] = (Bz[1] - Bz[0]) / dq
    lut[-1] = (Bz[-1] - Bz[-2]) / dq

    # Reference normalization
    ref_bzp = cylinder_bz(0.25, 0.15 + dq * 0.5, CYL_A, CYL_H)
    ref_bzm = cylinder_bz(0.25, 0.15 - dq * 0.5, CYL_A, CYL_H)
    ref_peak = abs((ref_bzp - ref_bzm) / dq)
    if ref_peak > 0:
        lut *= 0.7 / ref_peak

    return lut, qr


def lut_lookup(lut, x):
    """LUT lookup with linear interpolation. x in [-1, 1]."""
    pos = (x * 0.5 + 0.5) * (LUT_SIZE - 1)
    pos = np.clip(pos, 0, LUT_SIZE - 1)
    idx = int(pos)
    frac = pos - idx
    if idx >= LUT_SIZE - 1:
        return lut[-1]
    return lut[idx] + frac * (lut[idx + 1] - lut[idx])


def compute_tine_amplitude(midi, velocity):
    """Per-key tine amplitude from beam physics."""
    L_m = TINE_LENGTHS.get(midi, 80) * 1e-3
    hammer = get_hammer_params(midi, velocity)
    k_eff = 3 * TINE_EI / (L_m ** 3)
    m_hammer = hammer['relMass'] * 0.030

    xs_m = striking_line(midi) * 1e-3
    xi = min(xs_m / L_m, 0.95)

    # Use a simple excitation factor (simplified from the full model)
    phi = 0.3  # approximate

    A_raw = np.sqrt(m_hammer / k_eff) * np.sqrt(velocity) * phi

    # A4 reference for normalization
    Lr = 43.2e-3  # A4 tine length approx
    k_ref = 3 * TINE_EI / (Lr ** 3)
    m_ref = 1.0 * 0.030
    A4_raw = np.sqrt(m_ref / k_ref) * 1.0 * 0.3

    # Target: A4 forte tip displacement in normalized PU coordinates (25mm = 1.0).
    # Falaize 2017 Fig 10a: A4 forte ≈ 1mm displacement at PU. 1mm / 25mm = 0.04.
    # Old value 0.3 meant 7.5mm — 7.5× too large, causing excessive PU nonlinearity.
    TINE_AMP_TARGET = 0.06  # A4 forte ≈ 1.5mm at PU. 1.5mm / 25mm = 0.06
    return (A_raw / A4_raw) * TINE_AMP_TARGET


def tip_displacement_factor(midi):
    """Simplified tip displacement factor."""
    L = TINE_LENGTHS.get(midi, 80)
    hammer = get_hammer_params(midi, 0.5)
    mass_scale = np.sqrt(hammer['relMass'])

    # Reference: B3 (MIDI 59)
    Lr = 80.5  # approx
    hr = get_hammer_params(59, 0.5)
    ref = np.sqrt(hr['relMass']) * Lr**1.5 * 0.3

    return mass_scale * L**1.5 * 0.3 / ref


def synthesize_di(midi, velocity, duration_s, fs):
    """
    Synthesize DI output replicating the worklet's signal chain.
    Returns mono float64 array.
    """
    f0 = 440 * 2**((midi - 69) / 12)
    Q = interpolate_Q(midi)
    tau = Q / (np.pi * f0)
    hammer = get_hammer_params(midi, velocity)
    mass_scale = np.sqrt(hammer['relMass'])
    inv_fs = 1.0 / fs

    # Energy-normalized modal amplitudes
    H_fund = half_sine_envelope(f0, hammer['Tc'], hammer['spectralBeta'])
    vW_fund = 1.0
    total_E = vW_fund ** 2

    # Beam mode weights
    beam_weights = []
    for b in range(N_BEAM_MODES):
        beam_freq = f0 * BEAM_FREQ_RATIOS[b]
        if beam_freq >= fs * 0.5:
            beam_weights.append(0)
            continue

        sr = BEAM_SPATIAL.get(midi, [0]*7)[b] if b < len(BEAM_SPATIAL.get(midi, [])) else 0

        H_beam = half_sine_envelope(beam_freq, hammer['Tc'], hammer['spectralBeta'])
        vW = sr * (H_beam / max(H_fund, 0.001)) * 3.0
        beam_weights.append(vW)
        total_E += vW * vW

    # Energy normalization
    e_norm = 1.0 / np.sqrt(max(total_E, 0.01))

    # Mode parameters: [omega, amplitude, decay_alpha]
    modes = []

    # Fundamental
    omega0 = TWO_PI * f0 * inv_fs
    decay_scale = 1.0
    alpha_fund = np.exp(-inv_fs / max(tau * decay_scale, 0.001))
    modes.append({
        'omega': omega0,
        'amp': vW_fund * e_norm * mass_scale,
        'decay': alpha_fund
    })

    # Tonebar (simplified: skip for now, focus on beam modes)

    # Beam modes
    for b in range(N_BEAM_MODES):
        beam_freq = f0 * BEAM_FREQ_RATIOS[b]
        if beam_freq >= fs * 0.5 or beam_weights[b] == 0:
            continue
        omega_b = TWO_PI * beam_freq * inv_fs
        beam_tau = tau / BEAM_FREQ_RATIOS[b]
        alpha_b = np.exp(-inv_fs / max(beam_tau * decay_scale, 0.001))
        modes.append({
            'omega': omega_b,
            'amp': beam_weights[b] * e_norm * mass_scale,
            'decay': alpha_b
        })

    # PU LUT
    tip_factor = tip_displacement_factor(midi)
    gap = 0.794 if 30 < (midi - 20) <= 65 else 1.588

    # qRange: derived from PU field geometry, NOT tine length.
    # L_field = √(a² + Lhor²) = characteristic width of g'(q).
    # Coverage ×3.0: LUT spans ±3 field-lengths (full nonlinear→linear transition).
    # Physics: qRange is a property of the magnet, not the tine.
    symmetry = 0.5
    distance = 0.5
    gap_offset = (gap - 0.794) * 0.04
    p_Lhor = distance * 0.35 + 0.05 + gap_offset
    L_field = np.sqrt(CYL_A**2 + p_Lhor**2)
    K_COVERAGE = 2.0  # Tunable: 2.0-4.0. Physical basis: LUT spans ±K field-lengths
    q_range = L_field * K_COVERAGE
    if q_range < 0.12:
        q_range = 0.12

    lut, qr = compute_pu_lut(symmetry=symmetry, distance=distance, gap_mm=gap,
                               q_range=q_range, lver_offset=0.0)

    omega0_val = modes[0]['omega']
    vA_fund = modes[0]['amp']
    vel_scale = omega0_val / max(vA_fund, 0.01)
    pos_scale = omega0_val / max(vA_fund, 0.01)

    tine_amp = compute_tine_amplitude(midi, velocity)
    pu_emf_scale = PU_EMF_SCALE

    # Onset
    onset_samples = max(int(np.ceil(hammer['Tc'] * fs)), 2)
    onset_phase = np.pi / onset_samples

    # Synthesis
    n_samples = int(duration_s * fs)
    output = np.zeros(n_samples)

    # Per-mode state
    phases = [0.0] * len(modes)
    amps = [m['amp'] for m in modes]

    # EM damping
    mass_ratio = TINE_LENGTHS.get(midi, 80) / 43.0
    pu_coupling = 0.6  # 1.1 - distance (0.5)
    pu_damp_strength = velocity * pu_coupling / max(mass_ratio, 0.3)
    pu_damp_strength = min(pu_damp_strength, 1.0)
    em_damp_target = 1.0 - pu_damp_strength * 0.4
    em_damp_gain = 1.0
    em_tau = 0.025 * np.sqrt(mass_ratio)
    em_damp_coeff = np.exp(-inv_fs / em_tau)

    for i in range(n_samples):
        # Modal synthesis
        tine_pos = 0.0
        tine_vel = 0.0

        for m_idx, mode in enumerate(modes):
            a = amps[m_idx]
            if abs(a) < 1e-7:
                continue
            omega = mode['omega']
            phase = phases[m_idx]

            # Velocity-based: position = (V/ω)sin, velocity = V×cos
            tine_pos += (a / omega) * np.sin(phase)
            tine_vel += a * np.cos(phase)

            # Decay
            amps[m_idx] *= mode['decay']

            # Phase advance
            phases[m_idx] = phase + omega
            if phases[m_idx] > TWO_PI:
                phases[m_idx] -= TWO_PI

        # EM damping
        em_damp_gain = em_damp_gain * em_damp_coeff + em_damp_target * (1.0 - em_damp_coeff)

        # Onset envelope
        onset_gain = 1.0
        if i < onset_samples:
            onset_gain = (1.0 - np.cos(i * onset_phase)) * 0.5

        env_scale = tine_amp * em_damp_gain * onset_gain
        tine_pos *= env_scale
        tine_vel *= env_scale

        # PU EMF
        pu_pos = tine_pos * pos_scale / q_range
        g_prime = lut_lookup(lut, pu_pos)
        pu_out = g_prime * tine_vel * vel_scale * tip_factor * pu_emf_scale

        # Coupling HPF (skip for simplicity — DC removal)
        # Harp divider
        output[i] = pu_out / HARP_PARALLEL_DIV

    return output


def analyze_spectrum(data, fs, f0, label, beam_ratios):
    """FFT analysis of a signal."""
    # Use segment after attack
    start = int(0.05 * fs)
    end = min(start + int(1.0 * fs), len(data))
    segment = data[start:end]

    N = len(segment)
    window = np.hanning(N)
    fft_data = np.fft.rfft(segment * window)
    freqs = np.fft.rfftfreq(N, 1.0 / fs)
    mag = np.abs(fft_data)
    mag_db = 20 * np.log10(mag + 1e-12)

    # Find fundamental peak
    fund_idx = np.argmin(np.abs(freqs - f0))
    search = int(5 * N / fs)
    fund_peak = np.max(mag_db[max(0, fund_idx - search):fund_idx + search])
    mag_db_rel = mag_db - fund_peak

    print(f"\n  {label}:")
    print(f"  Peak={np.max(np.abs(segment)):.4f}, Fund peak={fund_peak:.1f} dB")

    # Print harmonics and beam modes
    print(f"  {'Freq':>8s}  {'Ratio':>7s}  {'Rel dB':>7s}  Type")

    targets = []
    # Harmonics 1-10
    for n in range(1, 11):
        targets.append((n * f0, f"H{n}"))
    # Beam modes
    for bi, br in enumerate(beam_ratios):
        bf = f0 * br
        if bf < fs * 0.5:
            targets.append((bf, f"Beam{bi+1}({br:.2f})"))
    # Key sideband frequencies: beam ± f0
    for bi, br in enumerate(beam_ratios[:2]):
        bf = f0 * br
        for k in [-2, -1, 1, 2]:
            sf = bf + k * f0
            if 0 < sf < fs * 0.5:
                sign = "+" if k > 0 else ""
                targets.append((sf, f"B{bi+1}{sign}{k}f0"))

    targets.sort(key=lambda t: t[0])

    results = {}
    for freq, name in targets:
        if freq > 6000:
            continue
        idx = np.argmin(np.abs(freqs - freq))
        search = max(int(3 * N / fs), 1)
        region = mag_db_rel[max(0, idx - search):idx + search + 1]
        if len(region) > 0:
            level = np.max(region)
            actual_freq = freqs[max(0, idx - search) + np.argmax(region)]
        else:
            level = -100
            actual_freq = freq

        marker = ""
        if "Beam" in name:
            marker = " **BEAM"
        elif "B" in name and "f0" in name:
            marker = " ***SB"

        if level > -65:
            print(f"  {actual_freq:8.1f}  {actual_freq/f0:7.2f}  {level:+7.1f}  {name}{marker}")

        results[name] = float(level)

    return results


def main():
    fs = 48000
    duration = 2.0
    velocity = 0.7

    audio_dir = os.path.join(os.path.dirname(__file__),
                             "rhodes-companion-files", "audio", "audio")

    notes = {
        "A2": {"midi": 45, "f0": 110.0},
        "F3": {"midi": 53, "f0": 174.61},
    }

    beam_ratios = BEAM_FREQ_RATIOS[:2]  # only first 2 have Gabrielli data

    for name, info in notes.items():
        midi = info["midi"]
        f0 = info["f0"]

        print(f"\n{'='*70}")
        print(f"  {name} (f0={f0:.1f} Hz, MIDI {midi})")
        print(f"  Beam modes: {f0*7.11:.1f} Hz (7.11×), {f0*20.25:.1f} Hz (20.25×)")
        print(f"{'='*70}")

        # Our model
        print("\n  --- OUR MODEL (DI output) ---")
        our_output = synthesize_di(midi, velocity, duration, fs)
        our_results = analyze_spectrum(our_output, fs, f0, "Our model", beam_ratios)

        # Gabrielli sidebands
        gab_path = os.path.join(audio_dir, f"{name}-sidebands.wav")
        if os.path.exists(gab_path):
            sr, gab_data = wav.read(gab_path)
            if gab_data.ndim > 1:
                gab_data = gab_data[:, 0]
            if gab_data.dtype == np.int16:
                gab_data = gab_data.astype(np.float64) / 32768.0
            print(f"\n  --- GABRIELLI (sidebands, sr={sr}) ---")
            gab_results = analyze_spectrum(gab_data, sr, f0, "Gabrielli sidebands", beam_ratios)

            # Direct comparison
            print(f"\n  --- COMPARISON (Our - Gabrielli) ---")
            print(f"  {'Component':>20s}  {'Ours':>7s}  {'Gab':>7s}  {'Diff':>7s}")
            for key in sorted(set(list(our_results.keys()) + list(gab_results.keys()))):
                ours = our_results.get(key, -100)
                gab = gab_results.get(key, -100)
                if ours > -65 or gab > -65:
                    diff = ours - gab
                    print(f"  {key:>20s}  {ours:+7.1f}  {gab:+7.1f}  {diff:+7.1f}")

        # Gabrielli fund-only
        gab_fund_path = os.path.join(audio_dir, f"{name}-fund-only.wav")
        if os.path.exists(gab_fund_path):
            sr2, gab_fund = wav.read(gab_fund_path)
            if gab_fund.ndim > 1:
                gab_fund = gab_fund[:, 0]
            if gab_fund.dtype == np.int16:
                gab_fund = gab_fund.astype(np.float64) / 32768.0
            print(f"\n  --- GABRIELLI (fund-only) ---")
            analyze_spectrum(gab_fund, sr2, f0, "Gabrielli fund-only", beam_ratios)

    # Also synthesize fund-only from our model for comparison
    print(f"\n{'='*70}")
    print("  FUND-ONLY SYNTHESIS (our model, fundamental only through PU)")
    print(f"{'='*70}")

    for name, info in notes.items():
        midi = info["midi"]
        f0 = info["f0"]

        # Synthesize with only fundamental (no beam modes)
        # Temporarily patch BEAM_SPATIAL to all zeros
        orig = BEAM_SPATIAL.get(midi, [0]*7)
        BEAM_SPATIAL[midi] = [0]*7

        our_fund = synthesize_di(midi, velocity, duration, fs)
        print(f"\n  {name} fund-only:")
        analyze_spectrum(our_fund, fs, f0, f"Our model (fund only)", beam_ratios[:2])

        BEAM_SPATIAL[midi] = orig


if __name__ == "__main__":
    main()
