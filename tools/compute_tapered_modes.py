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
N_MODES = 3


# =============================================================================
# Tine geometry
# =============================================================================

def tine_length_mm(midi):
    """Exponential tine length (mm). EP Forum fit, Shear endpoints."""
    key = midi - 20
    key = max(1, min(88, key))
    return 157.0 * np.exp(-0.0249 * (key - 1))

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

        # Bare beam frequency ratios (for reference)
        fr1_bare = freqs[1] / freqs[0] if freqs[0] > 0 else 6.27
        fr2_bare = freqs[2] / freqs[0] if freqs[0] > 0 else 17.55

        # Spatial excitation at striking position
        exc = [band_excitation(modes, L, xs_mm, tw_mm, m) for m in range(N_MODES)]
        sr1 = exc[1] / max(abs(exc[0]), 1e-6)
        sr2 = exc[2] / max(abs(exc[0]), 1e-6)

        results.append({
            'key': key, 'midi': midi, 'L_mm': L_mm,
            'f1_bare': freqs[0],
            'fr1_bare': fr1_bare, 'fr2_bare': fr2_bare,
            'spatial_ratio1': sr1, 'spatial_ratio2': sr2,
            'phi_fund_strike': exc[0],
            'phi_fund_tip': modes[0, -1],  # Should be 1.0 (normalized)
        })
    return results


def output_js(results):
    model_desc = {
        "original": "Original uniform %.3fmm" % (D_ORIGINAL*1000),
        "third": "Third Stage taper: %.2fmm → %.2fmm, zone %.1fmm" % (
            D_BASE_TAPER*1000, D_TIP_TAPER*1000, TAPER_ZONE_3RD*1000),
    }[TINE_MODEL]

    print("// =================================================================")
    print("// Beam mode shape data — generated by compute_tapered_modes.py")
    print("// Model: %s" % model_desc)
    print("// Bare beam (no spring). Spring affects freq ratios, not mode shapes.")
    print("// Frequency ratios use empirical values (Gabrielli 2020: 7.11, 20.25)")
    print("// =================================================================")
    print()

    # Spatial ratios at striking position
    print("// Per-key spatial ratios at striking position [beam1/fund, beam2/fund]")
    print("// These replace the uniform E-B cantileverPhi() results")
    print("// Index: (midi - 21) * 2")
    print("var BEAM_SPATIAL_RATIO = new Float32Array([")
    for r in results:
        print("  %10.6f, %10.6f, // key %2d MIDI %3d L=%.1fmm bare_fr=%.3f/%.2f" % (
            r['spatial_ratio1'], r['spatial_ratio2'],
            r['key'], r['midi'], r['L_mm'],
            r['fr1_bare'], r['fr2_bare']))
    print("]);")
    print()

    # Fundamental mode shape at striking position (for tipDisplacementFactor)
    print("// Fundamental excitation at striking position (tip-normalized)")
    print("// Replaces cantileverPhi(xi,0)/PHI_TIP[0] in tipDisplacementFactor")
    print("// Index: midi - 21")
    print("var BEAM_PHI_STRIKE = new Float32Array([")
    for r in results:
        print("  %10.6f, // key %2d MIDI %3d" % (
            r['phi_fund_strike'], r['key'], r['midi']))
    print("]);")
    print()

    # Bare beam frequency ratios (for reference / optional use)
    print("// Bare beam frequency ratios [f2/f1, f3/f1] (NO spring)")
    print("// These differ from measured (7.11/20.25) because spring isn't modeled")
    print("// Use for per-key variation: scale empirical ratio by (bare/mean_bare)")
    mean_fr1 = np.mean([r['fr1_bare'] for r in results])
    mean_fr2 = np.mean([r['fr2_bare'] for r in results])
    print("// Mean bare: f2/f1=%.4f  f3/f1=%.4f" % (mean_fr1, mean_fr2))
    print("var BEAM_BARE_FREQ_RATIO = new Float32Array([")
    for r in results:
        print("  %8.4f, %8.4f, // key %2d MIDI %3d" % (
            r['fr1_bare'], r['fr2_bare'], r['key'], r['midi']))
    print("]);")


def output_verify(results):
    print("=" * 100)
    print("Bare Beam Mode Shape Results — %s" % TINE_MODEL)
    print("E=%.0f GPa, ρ=%.0f, N=%d" % (E_STEEL/1e9, RHO_STEEL, N_ELEM))
    print("=" * 100)
    print("%4s %4s %7s %7s %7s %7s %10s %10s %10s" % (
        "Key", "MIDI", "L(mm)", "f1bare", "fr1", "fr2",
        "sr_b1", "sr_b2", "phi_s"))
    print("-" * 90)

    for r in results:
        print("%4d %4d %7.1f %7.1f %7.3f %7.2f %10.4f %10.4f %10.4f" % (
            r['key'], r['midi'], r['L_mm'],
            r['f1_bare'], r['fr1_bare'], r['fr2_bare'],
            r['spatial_ratio1'], r['spatial_ratio2'],
            r['phi_fund_strike']))

    fr1 = [r['fr1_bare'] for r in results]
    fr2 = [r['fr2_bare'] for r in results]
    sr1 = [r['spatial_ratio1'] for r in results]
    sr2 = [r['spatial_ratio2'] for r in results]
    print()
    print("Bare f2/f1: min=%.3f max=%.3f mean=%.3f (E-B uniform=6.267)" % (
        min(fr1), max(fr1), np.mean(fr1)))
    print("Bare f3/f1: min=%.2f max=%.2f mean=%.2f (E-B uniform=17.55)" % (
        min(fr2), max(fr2), np.mean(fr2)))
    print("sr_beam1: min=%.4f max=%.4f" % (min(sr1), max(sr1)))
    print("sr_beam2: min=%.4f max=%.4f" % (min(sr2), max(sr2)))

    # Compare with current uniform E-B values at specific keys
    print()
    print("Comparison with uniform E-B cantileverPhi:")
    BETAL = [1.8751, 4.6941, 7.8548]
    SIGMA = [0.7341, 1.0185, 0.9992]
    def phi_eb(xi, m):
        bx = BETAL[m] * xi
        return np.cosh(bx) - np.cos(bx) - SIGMA[m] * (np.sinh(bx) - np.sin(bx))
    phi_tip = [phi_eb(1.0, m) for m in range(3)]

    for r in results:
        if r['key'] in [1, 10, 20, 30, 40, 50, 60, 70, 80, 88]:
            midi = r['midi']
            L_mm = r['L_mm']
            xs_mm = striking_line_mm(midi)
            xi = min(xs_mm / L_mm, 0.95)
            # Uniform E-B spatial ratios
            eb_exc = [phi_eb(xi, m) / phi_tip[m] for m in range(3)]
            eb_sr1 = eb_exc[1] / max(abs(eb_exc[0]), 1e-6)
            eb_sr2 = eb_exc[2] / max(abs(eb_exc[0]), 1e-6)
            print("  Key %2d: FEM sr1=%.4f sr2=%.4f  |  EB sr1=%.4f sr2=%.4f  |  Δsr1=%+.4f Δsr2=%+.4f" % (
                r['key'],
                r['spatial_ratio1'], r['spatial_ratio2'],
                eb_sr1, eb_sr2,
                r['spatial_ratio1'] - eb_sr1,
                r['spatial_ratio2'] - eb_sr2))


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
