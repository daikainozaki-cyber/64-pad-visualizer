#!/usr/bin/env python3
"""
compute_tapered_modes.py — Tapered beam mode shape computation (FEM)

Computes per-key mode shapes for Rhodes electric piano tines using
Hermite cubic finite elements for Euler-Bernoulli beams with variable
cross-section.

KEY INSIGHT: The spring affects frequency ratios but barely changes
mode shapes (1st-order perturbation theory). So we compute mode shapes
from the BARE beam (no spring) and keep empirical frequency ratios
(Gabrielli 2020: 7.11, 20.25).

Physical data sources:
  - Service Manual Ch.7: Taper geometry
  - Sonderboe 2024: Material properties
  - Gabrielli 2020: Measured beam mode ratios
  - rhodes_88key_physical_data.md: Consolidated reference

Output: JavaScript const arrays for epiano-worklet-processor.js

Usage:
  python3 tools/compute_tapered_modes.py [original|third] [--verify]
"""

import sys
import numpy as np
from scipy.linalg import eigh

# =============================================================================
# Physical constants
# =============================================================================
E_STEEL = 200e9       # Young's modulus (Pa)
RHO_STEEL = 7850      # Density (kg/m³)

# Tine geometry options
TINE_MODEL = "third"  # "original" = uniform 1.905mm, "third" = Third Stage taper
D_ORIGINAL = 1.905e-3
D_BASE_TAPER = 2.540e-3
D_TIP_TAPER  = 1.524e-3
TAPER_ZONE_3RD = 12.7e-3  # 0.5" Third Stage swaged

N_ELEM = 200
N_MODES = 8


# =============================================================================
# Tine geometry
# =============================================================================

_TINE_LEN_TABLE = None  # Lazy-initialized piecewise table

def _build_tine_table():
    """Piecewise tine length model from SM Figure 6-2 + Gemini pixel analysis."""
    t = {}
    # Zone 1: keys 1-7, constant (SM label "0-(1-7)")
    for k in range(1, 8):
        t[k] = 157.0
    # Zone 2: keys 8-35, Gemini pixel measurement from left column
    gemini = {
        8: 153.8, 9: 150.6, 10: 147.4, 11: 144.2, 12: 141.0,
        13: 137.9, 14: 134.7, 15: 131.5, 16: 128.3, 17: 125.1,
        18: 121.9, 19: 118.7, 20: 115.5, 21: 112.4, 22: 109.2,
        23: 106.0, 24: 102.8, 25: 99.6, 26: 96.4, 27: 93.2,
        28: 90.1, 29: 86.9, 30: 83.7, 31: 80.5, 32: 77.3,
        33: 74.1, 34: 71.0, 35: 67.8,
    }
    t.update(gemini)
    # Transition: keys 36-40
    trans = {36: 65.4, 37: 63.0, 38: 60.6, 39: 58.3, 40: 56.0}
    t.update(trans)
    # Zone 3: keys 41-88, exponential (56mm@40 → 18mm@88)
    b = -np.log(18.0 / 56.0) / (88 - 40)
    for k in range(41, 89):
        t[k] = 56.0 * np.exp(-b * (k - 40))
    # Enforce monotonicity after Zone 1
    for k in range(8, 89):
        if t[k] >= t[k-1]:
            t[k] = t[k-1] - 0.1
    return t

def tine_length_mm(midi):
    """Piecewise tine length (mm) from SM Figure 6-2."""
    global _TINE_LEN_TABLE
    if _TINE_LEN_TABLE is None:
        _TINE_LEN_TABLE = _build_tine_table()
    key = midi - 20
    key = max(1, min(88, key))
    return _TINE_LEN_TABLE[key]

def striking_line_mm(midi):
    """Linear striking line (mm). SM Ch.9."""
    key = midi - 20
    key = max(1, min(88, key))
    t = (key - 1) / 87.0
    return 57.15 * (1 - t) + 3.175 * t

def hammer_tip_width_mm(midi):
    """Hammer tip width (mm). SM."""
    key = midi - 20
    if key <= 30:   return 6.35
    elif key <= 40: return 7.94
    elif key <= 50: return 9.53
    else:           return 11.11

def tine_diameter(x, L):
    """Diameter at position x along tine of length L."""
    if TINE_MODEL == "original":
        return D_ORIGINAL
    else:
        taper_start = max(0.0, L - TAPER_ZONE_3RD)
        if x <= taper_start:
            return D_BASE_TAPER
        else:
            taper_len = L - taper_start
            t = (x - taper_start) / taper_len
            return D_BASE_TAPER + (D_TIP_TAPER - D_BASE_TAPER) * t


# =============================================================================
# Hermite cubic FEM
# =============================================================================

def hermite_KM(h, EI, rhoA):
    """Element stiffness and mass matrices."""
    h2, h3 = h*h, h*h*h
    K = (EI / h3) * np.array([
        [ 12,    6*h,   -12,    6*h  ],
        [ 6*h,   4*h2,  -6*h,   2*h2 ],
        [-12,   -6*h,    12,   -6*h  ],
        [ 6*h,   2*h2,  -6*h,   4*h2 ]
    ])
    M = (rhoA * h / 420.0) * np.array([
        [ 156,    22*h,    54,   -13*h  ],
        [ 22*h,   4*h2,    13*h,  -3*h2 ],
        [ 54,     13*h,    156,  -22*h  ],
        [-13*h,  -3*h2,   -22*h,   4*h2 ]
    ])
    return K, M

def solve_bare_beam(L):
    """Solve eigenvalue problem for bare beam (no spring).
    Returns: freqs (Hz), modes (N_MODES × N_nodes, tip-normalized)"""
    N = N_ELEM
    h = L / N
    ndof = 2 * (N + 1)

    K_g = np.zeros((ndof, ndof))
    M_g = np.zeros((ndof, ndof))

    for e in range(N):
        x_mid = (e + 0.5) * h
        d = tine_diameter(x_mid, L)
        r = d / 2.0
        EI = E_STEEL * np.pi * r**4 / 4.0
        rhoA = RHO_STEEL * np.pi * r**2
        Ke, Me = hermite_KM(h, EI, rhoA)
        dofs = [2*e, 2*e+1, 2*(e+1), 2*(e+1)+1]
        for i in range(4):
            for j in range(4):
                K_g[dofs[i], dofs[j]] += Ke[i, j]
                M_g[dofs[i], dofs[j]] += Me[i, j]

    # Cantilever BC: remove DOFs 0,1
    free = list(range(2, ndof))
    K_f = K_g[np.ix_(free, free)]
    M_f = M_g[np.ix_(free, free)]
    n_solve = min(N_MODES + 2, len(free))
    eigvals, eigvecs = eigh(K_f, M_f, subset_by_index=[0, n_solve - 1])

    freqs = np.sqrt(np.maximum(eigvals[:N_MODES], 0)) / (2 * np.pi)
    modes = np.zeros((N_MODES, N + 1))
    for m in range(N_MODES):
        full = np.zeros(ndof)
        full[2:] = eigvecs[:, m]
        modes[m, :] = full[0::2]  # displacement DOFs

    # Normalize: tip = +1.0 for all modes (sign: fundamental positive at tip)
    if modes[0, -1] < 0:
        modes[0, :] *= -1
    for m in range(N_MODES):
        tip = modes[m, -1]
        if abs(tip) > 1e-20:
            modes[m, :] /= tip

    return freqs, modes


def band_excitation(modes, L, strike_mm, tip_width_mm, mode_idx):
    """Integrate mode shape over hammer contact band (cosine weighting)."""
    N = modes.shape[1] - 1
    xi_center = min((strike_mm / 1000.0) / L, 0.95)
    band_norm = (tip_width_mm / 1000.0) / L

    if band_norm < 0.02:
        node = int(round(xi_center * N))
        return modes[mode_idx, max(0, min(N, node))]

    hw = band_norm / 2
    xi_lo = max(0.001, xi_center - hw)
    xi_hi = min(0.999, xi_center + hw)
    n_pts = 21
    sw, sf = 0.0, 0.0
    for i in range(n_pts):
        xi = xi_lo + (i / (n_pts - 1)) * (xi_hi - xi_lo)
        w = max(0.0, np.cos((xi - xi_center) / hw * np.pi / 2))
        node = int(round(xi * N))
        sw += w
        sf += w * modes[mode_idx, max(0, min(N, node))]
    return sf / sw if sw > 0 else modes[mode_idx, int(round(xi_center * N))]


# =============================================================================
# Main
# =============================================================================

def compute_all_keys():
    results = []
    for key in range(1, 89):
        midi = key + 20
        L_mm = tine_length_mm(midi)
        L = L_mm / 1000.0
        xs_mm = striking_line_mm(midi)
        tw_mm = hammer_tip_width_mm(midi)

        freqs, modes = solve_bare_beam(L)

        # Spatial excitation at striking position
        exc = [band_excitation(modes, L, xs_mm, tw_mm, m) for m in range(N_MODES)]
        spatial_ratios = [exc[m] / max(abs(exc[0]), 1e-6) for m in range(1, N_MODES)]

        # Bare beam frequency ratios for all modes
        bare_freq_ratios = [freqs[m] / freqs[0] if freqs[0] > 0 else 0 for m in range(1, N_MODES)]

        results.append({
            'key': key, 'midi': midi, 'L_mm': L_mm,
            'f1_bare': freqs[0],
            'bare_freq_ratios': bare_freq_ratios,
            'spatial_ratios': spatial_ratios,
            'phi_fund_strike': exc[0],
            'phi_fund_tip': modes[0, -1],  # Should be 1.0 (normalized)
        })
    return results


def output_js(results):
    n_beam = N_MODES - 1  # Number of beam modes (excluding fundamental)
    model_desc = {
        "original": "Original uniform %.3fmm" % (D_ORIGINAL*1000),
        "third": "Third Stage taper: %.2fmm → %.2fmm, zone %.1fmm" % (
            D_BASE_TAPER*1000, D_TIP_TAPER*1000, TAPER_ZONE_3RD*1000),
    }[TINE_MODEL]

    print("// =================================================================")
    print("// Beam mode shape data — generated by compute_tapered_modes.py")
    print("// Model: %s" % model_desc)
    print("// %d modes: fundamental + %d beam modes" % (N_MODES, n_beam))
    print("// Bare beam (no spring). Spring affects freq ratios, not mode shapes.")
    print("// =================================================================")
    print()

    # Spatial ratios at striking position — all beam modes
    print("// Per-key spatial ratios at striking position [beam1/fund .. beam%d/fund]" % n_beam)
    print("// Index: (midi - 21) * %d" % n_beam)
    print("var BEAM_SPATIAL_RATIO = new Float32Array([")
    for r in results:
        vals = ", ".join("%10.6f" % sr for sr in r['spatial_ratios'])
        print("  %s, // key %2d MIDI %3d L=%.1fmm" % (
            vals, r['key'], r['midi'], r['L_mm']))
    print("]);")
    print("var BEAM_N_RATIOS = %d;" % n_beam)
    print()

    # Fundamental mode shape at striking position (for tipDisplacementFactor)
    print("// Fundamental excitation at striking position (tip-normalized)")
    print("// Index: midi - 21")
    print("var BEAM_PHI_STRIKE = new Float32Array([")
    for r in results:
        print("  %10.6f, // key %2d MIDI %3d" % (
            r['phi_fund_strike'], r['key'], r['midi']))
    print("]);")
    print()

    # Bare beam frequency ratios for all modes
    print("// Bare beam frequency ratios [f2/f1 .. f%d/f1] (NO spring)" % N_MODES)
    print("// Spring correction: measured/bare for modes 2-3 → extrapolate for 4+")
    mean_bare = [np.mean([r['bare_freq_ratios'][m] for r in results]) for m in range(n_beam)]
    print("// Mean bare ratios: %s" % ", ".join("f%d/f1=%.3f" % (m+2, mean_bare[m]) for m in range(n_beam)))
    print("var BEAM_BARE_FREQ_RATIO = new Float32Array([")
    for r in results:
        vals = ", ".join("%8.4f" % fr for fr in r['bare_freq_ratios'])
        print("  %s, // key %2d MIDI %3d" % (vals, r['key'], r['midi']))
    print("]);")


def output_verify(results):
    n_beam = N_MODES - 1
    print("=" * 120)
    print("Bare Beam Mode Shape Results — %s (%d modes)" % (TINE_MODEL, N_MODES))
    print("E=%.0f GPa, ρ=%.0f, N=%d" % (E_STEEL/1e9, RHO_STEEL, N_ELEM))
    print("=" * 120)

    # Header: show first 4 beam modes' spatial ratios (sr_b1..sr_b4) for readability
    show_n = min(4, n_beam)
    hdr = "%4s %4s %7s %7s" % ("Key", "MIDI", "L(mm)", "f1bare")
    for m in range(show_n):
        hdr += " %8s" % ("fr%d" % (m+2))
    for m in range(show_n):
        hdr += " %8s" % ("sr_b%d" % (m+1))
    hdr += " %8s" % "phi_s"
    print(hdr)
    print("-" * len(hdr))

    for r in results:
        line = "%4d %4d %7.1f %7.1f" % (r['key'], r['midi'], r['L_mm'], r['f1_bare'])
        for m in range(show_n):
            line += " %8.3f" % r['bare_freq_ratios'][m]
        for m in range(show_n):
            line += " %8.4f" % r['spatial_ratios'][m]
        line += " %8.4f" % r['phi_fund_strike']
        print(line)

    print()
    # Summary stats for all beam modes
    for m in range(n_beam):
        frs = [r['bare_freq_ratios'][m] for r in results]
        srs = [r['spatial_ratios'][m] for r in results]
        print("Beam mode %d: bare_freq_ratio min=%.3f max=%.3f mean=%.3f  |  spatial_ratio min=%.4f max=%.4f" % (
            m+1, min(frs), max(frs), np.mean(frs), min(srs), max(srs)))


if __name__ == '__main__':
    for arg in sys.argv[1:]:
        if arg in ('original', 'third'):
            TINE_MODEL = arg

    print("Computing %s bare beam modes for 88 keys..." % TINE_MODEL, file=sys.stderr)
    results = compute_all_keys()
    print("Done.", file=sys.stderr)

    if '--verify' in sys.argv:
        output_verify(results)
    else:
        output_js(results)
