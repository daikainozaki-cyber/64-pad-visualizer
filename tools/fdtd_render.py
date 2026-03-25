#!/usr/bin/env python3
"""
fdtd_render.py — Render FDTD tine simulation to WAV via PU EMF model.

Applies the cylinder PU pickup model (identical to epiano-worklet-processor.js)
to FDTD displacement/velocity data, producing a DI-level WAV file for
physical verification by ear.

Usage:
  python3 tools/fdtd_render.py                     # Single A2 (MIDI 45), mf
  python3 tools/fdtd_render.py --midi 45 60 81     # Multiple keys
  python3 tools/fdtd_render.py --all                # All 88 keys, mf
  python3 tools/fdtd_render.py --chromatic          # Chromatic scale C2-C7, mf
  python3 tools/fdtd_render.py --vel 0.2 0.5 0.8 1.0  # All velocity layers

Output: tools/fdtd_output/render/*.wav

Physics:
  EMF = g'(q) × dq/dt  (Falaize 2017, eq 21-27)
  g'(q) = dBz/dq from cylinder PU model (uniformly magnetized AlNiCo 5)
  DI output only — no amp chain. Verifies vibrating body + PU physics.

Based on: epiano-worklet-processor.js (computePickupLUT, cylinderBz, puLutParams)
"""

import sys
import os
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

# Add parent tools dir for imports
sys.path.insert(0, os.path.dirname(__file__))
from fdtd_tine_simulator import (
    fdtd_simulate, choose_oversample, load_tuning_masses,
    TINE_LENGTH_MM, FS_AUDIO, get_spring_position_frac,
    find_table_endpoint, extract_modal_state,
    tonebar_eigen_freq, has_tonebar
)


# =============================================================================
# PU Cylinder Model (matching epiano-worklet-processor.js exactly)
# =============================================================================

# Physical constants (same as worklet)
LUT_SIZE = 1024
CYL_A = 0.14      # effective pole radius (3.5mm / 25mm normalized)
CYL_H = 0.508     # magnet height (12.7mm / 25mm normalized)
PU_EMF_SCALE = 0.0011  # calibrated for Rhodes 74mV RMS output


def cylinder_bz(rho, z, a, h):
    """
    Axial B-field of uniformly magnetized cylinder at (rho, z).
    Matches worklet cylinderBz() exactly.

    Physics: AlNiCo 5 magnet, a = pole radius, h = magnet height.
    On-axis (rho=0): Bz = z/|z| - (z+h)/|(z+h)|.
    Off-axis: uses exact formula for finite solenoid.
    """
    a2rho2 = a * a + rho * rho
    rt = np.sqrt(z * z + a2rho2)
    zb = z + h
    rb = np.sqrt(zb * zb + a2rho2)
    return z / rt - zb / rb


def compute_pu_lut(symmetry=0.0, distance=0.0, gap_mm=0.794, q_range=1.0, lver_offset=0.0):
    """
    Compute PU g'(q) LUT — identical to worklet computePickupLUT().

    Args:
      symmetry: voicing screw (0=on-axis, 1=max offset ~2mm)
      distance: tine-PU radial distance slider (0-1)
      gap_mm: PU gap in mm (SM: 0.794 mid, 1.588 bass/treble)
      q_range: LUT coordinate range (default 1.0)
      lver_offset: per-key Lver offset

    Returns:
      lut: Float64 array of g'(q) values, shape (LUT_SIZE,)
      params: dict with Lver, Lhor, qr
    """
    sym = max(0.0, min(1.0, symmetry))
    Lver = sym * 0.086 + lver_offset
    gap_norm = gap_mm / 25.0
    tine_radius = 0.04  # ~1mm / 25mm
    Lhor = gap_norm + tine_radius + distance * 0.04
    qr = q_range if q_range > 0 else 1.0

    dq = 2 * qr / (LUT_SIZE - 1)

    # Compute Bz at each sample point
    Bz = np.zeros(LUT_SIZE)
    for i in range(LUT_SIZE):
        q = ((i / (LUT_SIZE - 1)) * 2 - 1) * qr
        Bz[i] = cylinder_bz(Lhor, Lver + q, CYL_A, CYL_H)

    # Numerical derivative: g'(q) = dBz/dq (central difference)
    lut = np.zeros(LUT_SIZE)
    for i in range(1, LUT_SIZE - 1):
        lut[i] = (Bz[i + 1] - Bz[i - 1]) / (2 * dq)
    lut[0] = (Bz[1] - Bz[0]) / dq
    lut[LUT_SIZE - 1] = (Bz[LUT_SIZE - 1] - Bz[LUT_SIZE - 2]) / dq

    # Reference normalization: g'(0) at ref params = 0.7
    ref_dq = dq
    ref_BzP = cylinder_bz(0.25, 0.15 + ref_dq * 0.5, CYL_A, CYL_H)
    ref_BzM = cylinder_bz(0.25, 0.15 - ref_dq * 0.5, CYL_A, CYL_H)
    ref_peak = abs((ref_BzP - ref_BzM) / ref_dq)
    if ref_peak > 0:
        scale = 0.7 / ref_peak
        lut *= scale

    return lut, {'Lver': Lver, 'Lhor': Lhor, 'qr': qr}


def lut_lookup(lut, x):
    """
    Linear interpolation in LUT. x in [-1, 1].
    Matches worklet lutLookup() exactly.
    """
    # Map x from [-1, 1] to [0, LUT_SIZE-1]
    idx_f = (x * 0.5 + 0.5) * (LUT_SIZE - 1)
    idx_f = max(0.0, min(LUT_SIZE - 1.0, idx_f))
    i = int(idx_f)
    frac = idx_f - i
    if i >= LUT_SIZE - 1:
        return lut[LUT_SIZE - 1]
    return lut[i] + frac * (lut[i + 1] - lut[i])


def lut_lookup_vec(lut, x_arr):
    """Vectorized LUT lookup for numpy arrays."""
    idx_f = (x_arr * 0.5 + 0.5) * (LUT_SIZE - 1)
    idx_f = np.clip(idx_f, 0.0, LUT_SIZE - 1.0)
    i = idx_f.astype(int)
    i = np.clip(i, 0, LUT_SIZE - 2)
    frac = idx_f - i
    return lut[i] + frac * (lut[i + 1] - lut[i])


# =============================================================================
# Per-key PU parameters (matching worklet)
# =============================================================================

def per_key_gap_mm(midi):
    """
    PU gap per register (SM dimensions).
    Bass/treble: wider gap (1.588mm). Mid: standard (0.794mm).
    """
    key = midi - 20
    if key <= 15 or key >= 75:
        return 1.588  # bass/treble: wider gap
    return 0.794      # standard mid-range


def per_key_lver_offset(midi):
    """
    Per-key Lver offset (matching worklet perKeyLverOffset).
    Small random-like variation per key for natural character.
    Returns offset in normalized PU coordinates.
    """
    # Simplified: no random variation for render (deterministic).
    # The worklet uses a hash function — we skip it for clean physics verification.
    return 0.0


# =============================================================================
# Coupling HPF (DC removal, matching worklet)
# =============================================================================

def coupling_hpf(signal, fs=44100, fc=3.4):
    """
    High-pass filter at fc Hz (worklet uses 3.4Hz).
    Removes DC from EMF signal. Uses 2nd-order Butterworth.
    """
    sos = butter(2, fc, btype='high', fs=fs, output='sos')
    return sosfilt(sos, signal)


# =============================================================================
# Render pipeline
# =============================================================================

def render_key(midi, velocity=0.8, duration_s=2.0, symmetry=0.0, distance=0.0):
    """
    Render one key: FDTD → PU EMF → HPF → normalized WAV signal.

    Returns:
      signal: numpy array (44.1kHz, float64, normalized to [-1, 1])
      metadata: dict with f0, endpoint, etc.
    """
    # --- FDTD simulation ---
    ov = choose_oversample(midi)
    mass_table = load_tuning_masses()
    tm = mass_table.get(str(midi))

    f0 = 440.0 * 2**((midi - 69) / 12.0)
    key_idx = midi - 21

    print(f"  FDTD: MIDI {midi} ({f0:.1f}Hz) vel={velocity:.1f} ov={ov}x"
          f"{f' tm={tm*1000:.1f}g' if tm else ' (wire-only)'} dur={duration_s}s ...",
          end='', flush=True)

    result = fdtd_simulate(midi, velocity=velocity, duration_s=duration_s,
                           oversample=ov, tuning_mass_kg=tm, enable_tonebar=True)

    disp = result['disp_44k']
    vel = result['vel_44k']

    f0_cents = 1200 * np.log2(result['f0_measured'] / f0) if result['f0_measured'] > 0 else float('inf')
    print(f" f0={result['f0_measured']:.1f}Hz ({f0_cents:+.0f}c)"
          f" Tc={result['Tc_measured']*1000:.2f}ms"
          f" samples={len(disp)}")

    # --- PU model ---
    gap = per_key_gap_mm(midi)
    lver_off = per_key_lver_offset(midi)
    lut, params = compute_pu_lut(symmetry=symmetry, distance=distance,
                                  gap_mm=gap, lver_offset=lver_off)

    # --- tineAmp scaling ---
    # FDTD outputs physical displacement in meters.
    # Need to normalize to PU coordinates (÷25mm).
    # The worklet uses tineAmp ≈ 0.12 for A4 forte (≈ 3mm tip displacement).
    # FDTD max displacement tells us the physical scale.
    disp_norm = disp / 0.025  # meters → PU normalized coords (÷25mm)
    vel_norm = vel / 0.025    # same normalization for velocity

    # --- EMF calculation ---
    # EMF = g'(q) × dq/dt × PU_EMF_SCALE
    # q = displacement in PU coords, dq/dt = velocity in PU coords
    # posScale and velScale in worklet normalize modal amplitudes.
    # For FDTD raw output, we apply PU directly.
    g_prime = lut_lookup_vec(lut, disp_norm)
    emf = g_prime * vel_norm * PU_EMF_SCALE

    # --- Coupling HPF (3.4Hz DC removal) ---
    signal = coupling_hpf(emf, fs=FS_AUDIO)

    # --- Find table endpoint (for diagnostics) ---
    endpoint = find_table_endpoint(disp, f0)
    endpoint_ms = endpoint / FS_AUDIO * 1000

    # --- Beam mode and TB info ---
    tb_info = ""
    if has_tonebar(midi):
        tb_eigen = tonebar_eigen_freq(midi)
        tb_info = f" TB_eigen={tb_eigen:.0f}Hz"

    print(f"  PU: Lhor={params['Lhor']:.3f} Lver={params['Lver']:.3f} gap={gap:.3f}mm"
          f" max_disp={np.max(np.abs(disp))*1000:.3f}mm"
          f" endpoint={endpoint_ms:.0f}ms{tb_info}")

    metadata = {
        'midi': midi,
        'velocity': velocity,
        'f0_target': f0,
        'f0_measured': result['f0_measured'],
        'Tc_ms': result['Tc_measured'] * 1000,
        'endpoint_ms': endpoint_ms,
        'max_disp_mm': np.max(np.abs(disp)) * 1000,
        'max_emf': np.max(np.abs(emf)),
        'pu_params': params,
    }

    return signal, metadata


def render_and_save(midi_list, velocity_list=None, duration_s=2.0, output_dir=None,
                    symmetry=0.0, distance=0.0):
    """
    Render multiple keys/velocities to WAV files.
    Also creates a combined chromatic WAV with 0.5s silence between notes.
    """
    if velocity_list is None:
        velocity_list = [0.8]
    if output_dir is None:
        output_dir = os.path.join('tools', 'fdtd_output', 'render')
    os.makedirs(output_dir, exist_ok=True)

    all_signals = []
    silence = np.zeros(int(0.5 * FS_AUDIO))  # 0.5s silence between notes

    total = len(midi_list) * len(velocity_list)
    done = 0

    for midi in midi_list:
        for vel in velocity_list:
            done += 1
            f0 = 440 * 2**((midi - 69) / 12)
            note_name = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][midi % 12]
            octave = (midi // 12) - 1
            print(f"\n[{done}/{total}] {note_name}{octave} (MIDI {midi}, {f0:.1f}Hz) vel={vel:.1f}")

            signal, meta = render_key(midi, velocity=vel, duration_s=duration_s,
                                       symmetry=symmetry, distance=distance)

            # Save individual WAV (normalized to peak = 0.9)
            peak = np.max(np.abs(signal))
            if peak > 0:
                wav_signal = signal * (0.9 / peak)
            else:
                wav_signal = signal

            vel_str = f"v{int(vel*100):03d}"
            fname = f"fdtd_{note_name}{octave}_m{midi}_{vel_str}.wav"
            fpath = os.path.join(output_dir, fname)
            wavfile.write(fpath, FS_AUDIO, (wav_signal * 32767).astype(np.int16))
            print(f"  Saved: {fname} (peak={peak:.6f})")

            # Collect for combined WAV
            all_signals.append(wav_signal)
            all_signals.append(silence)

    # Save combined WAV
    if len(midi_list) > 1:
        combined = np.concatenate(all_signals)
        combined_path = os.path.join(output_dir, 'fdtd_combined.wav')
        wavfile.write(combined_path, FS_AUDIO, (combined * 32767).astype(np.int16))
        print(f"\nCombined WAV: {combined_path} ({len(combined)/FS_AUDIO:.1f}s)")


# =============================================================================
# Velocity comparison render
# =============================================================================

def render_velocity_comparison(midi=60, velocities=None, duration_s=2.0, output_dir=None):
    """
    Render one key at multiple velocities → combined WAV for A/B comparison.
    Shows how PU nonlinearity changes with velocity (louder = more harmonics).
    """
    if velocities is None:
        velocities = [0.2, 0.4, 0.6, 0.8, 1.0]
    if output_dir is None:
        output_dir = os.path.join('tools', 'fdtd_output', 'render')

    render_and_save([midi], velocity_list=velocities, duration_s=duration_s,
                    output_dir=output_dir)


# =============================================================================
# Main
# =============================================================================

if __name__ == '__main__':
    args = sys.argv[1:]

    # Parse velocity flag
    vel_list = [0.8]
    if '--vel' in args:
        idx = args.index('--vel')
        vel_args = []
        for a in args[idx+1:]:
            try:
                vel_args.append(float(a))
            except ValueError:
                break
        if vel_args:
            vel_list = vel_args
        args = args[:idx] + args[idx+1+len(vel_args):]

    # Parse duration
    dur = 2.0
    if '--dur' in args:
        idx = args.index('--dur')
        dur = float(args[idx + 1])
        args = args[:idx] + args[idx+2:]

    # Parse symmetry
    sym = 0.0
    if '--sym' in args:
        idx = args.index('--sym')
        sym = float(args[idx + 1])
        args = args[:idx] + args[idx+2:]

    if '--all' in args:
        # All 88 keys
        render_and_save(list(range(21, 109)), velocity_list=vel_list, duration_s=dur,
                        symmetry=sym)
    elif '--chromatic' in args:
        # Chromatic scale C2-C7 (every semitone)
        render_and_save(list(range(36, 97)), velocity_list=vel_list, duration_s=dur,
                        symmetry=sym)
    elif '--octaves' in args:
        # One note per octave (C2, C3, C4, C5, C6, C7)
        render_and_save([36, 48, 60, 72, 84, 96], velocity_list=vel_list, duration_s=dur,
                        symmetry=sym)
    elif '--vel-compare' in args:
        # Velocity comparison for one key
        midi = 60
        if '--midi' in args:
            idx = args.index('--midi')
            midi = int(args[idx + 1])
        render_velocity_comparison(midi, velocities=[0.2, 0.4, 0.6, 0.8, 1.0],
                                    duration_s=dur)
    elif '--midi' in args:
        idx = args.index('--midi')
        midis = [int(m) for m in args[idx+1:] if m.replace('.', '').isdigit() and '.' not in m]
        render_and_save(midis, velocity_list=vel_list, duration_s=dur, symmetry=sym)
    else:
        # Default: A2 (MIDI 45, Gabrielli reference key)
        render_and_save([45], velocity_list=vel_list, duration_s=dur, symmetry=sym)
