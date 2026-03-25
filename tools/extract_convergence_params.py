#!/usr/bin/env python3
"""
extract_convergence_params.py — Extract per-key convergence parameters from FDTD.

Runs FDTD simulations with and without TB coupling, then analyzes the
time evolution of each mode's amplitude to extract:
  - Per-mode decay rates (α_i)
  - TB convergence time constant (τ_tb)
  - TB damping effect on beam modes (Δα due to TB)

Output: tools/fdtd_output/convergence_params.json

Physics:
  x(t) = Σ A_i × e^(-α_i × t) × cos(ω_i × t + φ_i)
  TB acts as a frequency-selective damper: modes near TB eigenfreq have
  larger α_i when coupled.  (Permanent note: トーンバーは周波数選択的ダンパー)

  The "convergence" is the time evolution from complex (all modes) to simple
  (fundamental only). The shape of this convergence IS the Rhodes tone.

Usage:
  python3 tools/extract_convergence_params.py                # 12 representative keys
  python3 tools/extract_convergence_params.py --midi 36 60   # Specific keys
  python3 tools/extract_convergence_params.py --all           # All 88 keys (slow)
"""

import sys
import os
import time
import json
import argparse
import numpy as np
from scipy.signal import decimate

sys.path.insert(0, os.path.dirname(__file__))
from fdtd_tine_simulator import (
    fdtd_simulate, choose_oversample, load_tuning_masses,
    goertzel_magnitude, goertzel_frequency,
    tonebar_eigen_freq, has_tonebar,
    FS_AUDIO, TINE_LENGTH_MM, get_q_value,
)


# =============================================================================
# Windowed mode tracking
# =============================================================================

def track_mode_amplitude(signal_44k, fs, f_target, window_ms=40, hop_ms=10):
    """
    Track amplitude of a single mode over time using windowed Goertzel.

    Returns:
      times: array of time points (seconds, center of each window)
      amps: array of Goertzel magnitudes at each time point
    """
    window_samples = int(window_ms * fs / 1000)
    hop_samples = int(hop_ms * fs / 1000)
    n_total = len(signal_44k)

    times = []
    amps = []

    pos = 0
    while pos + window_samples <= n_total:
        segment = signal_44k[pos:pos + window_samples]
        # Apply Hann window to reduce leakage
        segment = segment * np.hanning(window_samples)
        mag = goertzel_magnitude(segment, fs, f_target)
        t_center = (pos + window_samples / 2) / fs
        times.append(t_center)
        amps.append(mag)
        pos += hop_samples

    return np.array(times), np.array(amps)


def fit_exponential_decay(times, amps, skip_onset_ms=30):
    """
    Fit A × e^(-α×t) to amplitude envelope.
    Skip onset transient (hammer contact + initial settling).

    Returns:
      alpha: decay rate (1/s). Higher = faster decay.
      A0: initial amplitude (extrapolated to t=0).
      r_squared: goodness of fit.
    """
    # Skip onset
    mask = times >= skip_onset_ms / 1000
    t = times[mask]
    a = amps[mask]

    if len(t) < 3:
        return 0.0, 0.0, 0.0

    # Filter out near-zero amplitudes (log domain needs positive values)
    valid = a > np.max(a) * 0.001  # -60dB threshold
    t = t[valid]
    a = a[valid]

    if len(t) < 3:
        return 0.0, 0.0, 0.0

    # Linear fit in log domain: log(A) = log(A0) - α×t
    log_a = np.log(a)
    coeffs = np.polyfit(t, log_a, 1)
    alpha = -coeffs[0]  # decay rate (positive = decaying)
    A0 = np.exp(coeffs[1])

    # R² goodness of fit
    log_a_pred = coeffs[0] * t + coeffs[1]
    ss_res = np.sum((log_a - log_a_pred) ** 2)
    ss_tot = np.sum((log_a - np.mean(log_a)) ** 2)
    r_squared = 1.0 - ss_res / max(ss_tot, 1e-30)

    return alpha, A0, r_squared


# =============================================================================
# Per-key convergence extraction
# =============================================================================

def extract_one_key(midi, tuning_masses, duration_s=2.0, velocity=0.8):
    """
    Extract convergence parameters for one key.

    Runs FDTD twice: with TB and without TB.
    Compares per-mode decay rates to quantify TB's damping effect.

    Returns dict with all convergence parameters for this key.
    """
    f0 = 440.0 * 2 ** ((midi - 69) / 12.0)
    key_idx = midi - 21
    oversample = choose_oversample(midi)

    # Load tuning mass
    tm_key = str(midi)
    tuning_mass = tuning_masses.get(tm_key, None)

    # Beam mode frequencies (from beam_mode_ratios or E-B theory)
    beam_ratios_path = os.path.join(os.path.dirname(__file__), 'fdtd_output', 'beam_mode_ratios_88.json')
    beam_freqs = [f0]  # fundamental always tracked
    beam_labels = ['f0']
    if os.path.exists(beam_ratios_path):
        with open(beam_ratios_path) as f:
            bm_data = json.load(f)
        if tm_key in bm_data:
            modes = bm_data[tm_key].get('modes', [])
            for m in modes[:4]:  # Track up to 4 beam modes
                if m['freq_Hz'] < FS_AUDIO * 0.45:  # Below Nyquist
                    beam_freqs.append(m['freq_Hz'])
                    beam_labels.append(f"beam_{m['ratio']:.1f}x")

    # TB eigenfrequency
    has_tb = has_tonebar(midi)
    f_tb_eigen = tonebar_eigen_freq(midi) if has_tb else 0

    # --- Simulation duration: bass needs longer ---
    if midi < 48:
        dur = max(duration_s, 3.0)
    elif midi < 72:
        dur = max(duration_s, 2.0)
    else:
        dur = max(duration_s, 1.5)

    result = {
        'midi': midi,
        'f0': round(f0, 2),
        'tine_length_mm': round(TINE_LENGTH_MM[key_idx], 1),
        'Q': round(get_q_value(midi), 0),
        'has_tonebar': has_tb,
        'f_tb_eigen': round(f_tb_eigen, 1) if has_tb else None,
        'duration_s': dur,
    }

    # === Run 1: WITHOUT tonebar ===
    print(f"  [noTB] Simulating {dur:.1f}s...")
    t0 = time.time()
    r_noTB = fdtd_simulate(midi, velocity=velocity, duration_s=dur,
                            oversample=oversample, tuning_mass_kg=tuning_mass,
                            enable_tonebar=False)
    print(f"  [noTB] Done in {time.time()-t0:.0f}s. f0={r_noTB['f0_measured']:.1f}Hz")

    disp_noTB = r_noTB['disp_44k']

    # Track each mode's amplitude over time (noTB)
    decays_noTB = {}
    for freq, label in zip(beam_freqs, beam_labels):
        times, amps = track_mode_amplitude(disp_noTB, FS_AUDIO, freq)
        alpha, A0, r2 = fit_exponential_decay(times, amps)
        decays_noTB[label] = {
            'freq_Hz': round(freq, 1),
            'alpha': round(alpha, 4),
            'A0': float(f'{A0:.6e}'),
            'tau_s': round(1.0 / max(alpha, 0.01), 4),
            'r_squared': round(r2, 4),
        }

    result['noTB'] = {
        'f0_measured': round(r_noTB['f0_measured'], 2),
        'decays': decays_noTB,
    }

    # === Run 2: WITH tonebar (if applicable) ===
    if has_tb:
        print(f"  [TB] Simulating {dur:.1f}s...")
        t0 = time.time()
        r_TB = fdtd_simulate(midi, velocity=velocity, duration_s=dur,
                              oversample=oversample, tuning_mass_kg=tuning_mass,
                              enable_tonebar=True)
        print(f"  [TB] Done in {time.time()-t0:.0f}s. f0={r_TB['f0_measured']:.1f}Hz")

        disp_TB = r_TB['disp_44k']
        tb_disp = r_TB['tb_disp_44k']

        # Track modes with TB coupling
        decays_TB = {}
        for freq, label in zip(beam_freqs, beam_labels):
            times, amps = track_mode_amplitude(disp_TB, FS_AUDIO, freq)
            alpha, A0, r2 = fit_exponential_decay(times, amps)
            decays_TB[label] = {
                'freq_Hz': round(freq, 1),
                'alpha': round(alpha, 4),
                'A0': float(f'{A0:.6e}'),
                'tau_s': round(1.0 / max(alpha, 0.01), 4),
                'r_squared': round(r2, 4),
            }

        # TB convergence: track TB displacement at TB eigenfreq and at f0
        tb_times_eigen, tb_amps_eigen = track_mode_amplitude(tb_disp, FS_AUDIO, f_tb_eigen)
        tb_alpha_eigen, tb_A0_eigen, tb_r2_eigen = fit_exponential_decay(
            tb_times_eigen, tb_amps_eigen, skip_onset_ms=5)

        tb_times_f0, tb_amps_f0 = track_mode_amplitude(tb_disp, FS_AUDIO, f0)
        # TB enslaved at f0: ramps UP, so we track the complement
        # For now, just record the raw data

        # TB damping effect: Δα = α_TB - α_noTB for each mode
        tb_damping_effect = {}
        for label in decays_noTB:
            if label in decays_TB:
                delta_alpha = decays_TB[label]['alpha'] - decays_noTB[label]['alpha']
                # Positive = TB makes it decay faster (expected for modes near TB eigenfreq)
                tb_damping_effect[label] = {
                    'delta_alpha': round(delta_alpha, 4),
                    'decay_ratio': round(
                        decays_TB[label]['alpha'] / max(decays_noTB[label]['alpha'], 0.01), 3),
                }

        result['TB'] = {
            'f0_measured': round(r_TB['f0_measured'], 2),
            'decays': decays_TB,
            'tb_convergence': {
                'tb_eigen_alpha': round(tb_alpha_eigen, 4),
                'tb_eigen_tau_s': round(1.0 / max(tb_alpha_eigen, 0.01), 4),
                'tb_eigen_A0': float(f'{tb_A0_eigen:.6e}'),
                'tb_eigen_r2': round(tb_r2_eigen, 4),
            },
            'tb_damping_effect': tb_damping_effect,
        }

        # === Derived convergence parameters (for modal synthesis) ===
        # Per-mode decay rates to use in the worklet
        convergence = {
            'f0_decay_alpha': decays_TB['f0']['alpha'],
            'f0_tau_s': decays_TB['f0']['tau_s'],
            'tb_tau_convergence_s': round(1.0 / max(tb_alpha_eigen, 0.01), 4),
            'tb_amp_ratio': round(tb_A0_eigen / max(decays_TB['f0']['A0'], 1e-30), 4),
        }
        # Per-beam-mode decay rates
        for label in beam_labels[1:]:  # skip f0
            if label in decays_TB:
                convergence[f'{label}_alpha'] = decays_TB[label]['alpha']
                convergence[f'{label}_tau_s'] = decays_TB[label]['tau_s']
                if label in tb_damping_effect:
                    convergence[f'{label}_tb_boost'] = tb_damping_effect[label]['decay_ratio']
        result['convergence'] = convergence
    else:
        # No TB: convergence = just the natural decay rates
        convergence = {
            'f0_decay_alpha': decays_noTB['f0']['alpha'],
            'f0_tau_s': decays_noTB['f0']['tau_s'],
            'tb_tau_convergence_s': None,
            'tb_amp_ratio': None,
        }
        for label in beam_labels[1:]:
            if label in decays_noTB:
                convergence[f'{label}_alpha'] = decays_noTB[label]['alpha']
                convergence[f'{label}_tau_s'] = decays_noTB[label]['tau_s']
        result['convergence'] = convergence

    return result


# =============================================================================
# Main
# =============================================================================

# Representative keys: 12 keys spanning all registers + TMD zone edges
REPRESENTATIVE_KEYS = [
    # Bass (C2-C3): beam mode persistence issues
    33, 36, 41, 45, 48,
    # Mid (C4-C5): C4 = reference "beautiful" key
    53, 57, 60, 65,
    # Treble (C6-C7): sustain too short
    72, 84, 96,
]


def main():
    parser = argparse.ArgumentParser(description='Extract convergence parameters from FDTD')
    parser.add_argument('--midi', type=int, nargs='+', help='Specific MIDI notes')
    parser.add_argument('--all', action='store_true', help='All 88 keys (very slow)')
    parser.add_argument('--velocity', type=float, default=0.8, help='Velocity (0-1)')
    parser.add_argument('--duration', type=float, default=2.0, help='Min simulation duration (s)')
    args = parser.parse_args()

    if args.midi:
        keys = args.midi
    elif args.all:
        keys = list(range(21, 109))
    else:
        keys = REPRESENTATIVE_KEYS

    # Load tuning masses
    tm_path = os.path.join(os.path.dirname(__file__), 'fdtd_output', 'tuning_mass_88.json')
    tuning_masses = load_tuning_masses(tm_path)
    print(f"Loaded {len(tuning_masses)} tuning masses from {tm_path}")

    output_dir = os.path.join(os.path.dirname(__file__), 'fdtd_output')
    os.makedirs(output_dir, exist_ok=True)

    results = {}
    t_total_start = time.time()

    for i, midi in enumerate(keys):
        f0 = 440.0 * 2 ** ((midi - 69) / 12.0)
        key_idx = midi - 21
        note_name = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][midi % 12]
        octave = midi // 12 - 1
        print(f"\n{'='*60}")
        print(f"[{i+1}/{len(keys)}] MIDI {midi} ({note_name}{octave}, {f0:.1f}Hz)")
        print(f"{'='*60}")

        try:
            r = extract_one_key(midi, tuning_masses, duration_s=args.duration,
                                velocity=args.velocity)
            results[str(midi)] = r

            # Print summary
            conv = r.get('convergence', {})
            f0_tau = conv.get('f0_tau_s', 0)
            tb_tau = conv.get('tb_tau_convergence_s', None)
            print(f"  f0 τ = {f0_tau:.3f}s")
            if tb_tau is not None:
                print(f"  TB τ_conv = {tb_tau:.4f}s")
            for k, v in conv.items():
                if 'beam' in k and 'tau_s' in k:
                    print(f"  {k} = {v:.4f}s")
                if 'tb_boost' in k:
                    print(f"  {k} = {v:.2f}×")

        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()

    # Save results
    out_path = os.path.join(output_dir, 'convergence_params.json')
    with open(out_path, 'w') as f:
        json.dump(results, f, indent=2)

    elapsed = time.time() - t_total_start
    print(f"\n{'='*60}")
    print(f"Saved {len(results)} keys to {out_path}")
    print(f"Total time: {elapsed:.0f}s ({elapsed/60:.1f}min)")


if __name__ == '__main__':
    main()
