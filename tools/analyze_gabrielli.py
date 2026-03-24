"""
Gabrielli 2020 companion files spectral analysis.
Compare real Rhodes DI recordings (with/without FM sidebands)
to identify modulation index β and sideband structure.

Physics: Rhodes PU nonlinearity acts on multi-mode tine vibration.
g'(q) × dq/dt where q = Σ A_n sin(ω_n t) produces intermodulation:
  sin(ω_a t) × sin(ω_b t) = cos((ω_a - ω_b)t) - cos((ω_a + ω_b)t)
These sum/difference frequencies = FM sidebands = metallic bell character.

Usage: python3 tools/analyze_gabrielli.py
"""

import numpy as np
import os
import json

try:
    import scipy.io.wavfile as wav
    from scipy.signal import stft
except ImportError:
    print("scipy required: pip3 install scipy")
    raise

AUDIO_DIR = os.path.join(os.path.dirname(__file__),
                         "rhodes-companion-files", "audio", "audio")

# Gabrielli notes
NOTES = {
    "A2": {"midi": 45, "f0": 110.0},
    "F3": {"midi": 53, "f0": 174.61},
}

# Gabrielli 2020 beam mode ratios (F1 = 43.65 Hz)
BEAM_RATIOS = [7.11, 20.25]


def load_wav(filepath):
    """Load WAV file, return (samples, sample_rate)."""
    sr, data = wav.read(filepath)
    if data.ndim > 1:
        data = data[:, 0]  # mono
    # Normalize to float [-1, 1]
    if data.dtype == np.int16:
        data = data.astype(np.float64) / 32768.0
    elif data.dtype == np.int32:
        data = data.astype(np.float64) / 2147483648.0
    elif data.dtype == np.float32:
        data = data.astype(np.float64)
    return data, sr


def find_peaks_in_spectrum(freqs, mag_db, f0, threshold_db=-60, min_db_above_noise=-20):
    """Find spectral peaks and classify as harmonic, beam mode, or sideband."""
    # Noise floor estimate (median of spectrum)
    noise_floor = np.median(mag_db)

    peaks = []
    # Search for peaks: local maxima above threshold
    for i in range(2, len(mag_db) - 2):
        if mag_db[i] > threshold_db and mag_db[i] > noise_floor + 10:
            if mag_db[i] > mag_db[i-1] and mag_db[i] > mag_db[i+1]:
                if mag_db[i] > mag_db[i-2] and mag_db[i] > mag_db[i+2]:
                    freq = freqs[i]
                    level = mag_db[i]

                    # Classify
                    ratio = freq / f0
                    nearest_int = round(ratio)

                    # Is it a harmonic? (within 1%)
                    if abs(ratio - nearest_int) < 0.02 * nearest_int and nearest_int > 0:
                        ptype = f"H{nearest_int}"
                    # Is it a beam mode? (within 2%)
                    elif any(abs(ratio - br) < 0.1 for br in BEAM_RATIOS):
                        idx = min(range(len(BEAM_RATIOS)), key=lambda j: abs(ratio - BEAM_RATIOS[j]))
                        ptype = f"Beam{idx+1}({BEAM_RATIOS[idx]:.2f})"
                    else:
                        # Sideband candidate: check if freq = n*f0 ± beam_freq
                        sideband_id = classify_sideband(freq, f0, BEAM_RATIOS)
                        ptype = sideband_id if sideband_id else f"?({ratio:.2f})"

                    peaks.append({
                        "freq": float(freq),
                        "level_dB": float(level),
                        "ratio": float(ratio),
                        "type": ptype,
                        "rel_dB": float(level - mag_db[np.argmin(np.abs(freqs - f0))])
                    })

    # Sort by frequency
    peaks.sort(key=lambda p: p["freq"])
    return peaks, float(noise_floor)


def classify_sideband(freq, f0, beam_ratios):
    """Check if freq = n*f0 ± beam_mode_freq (FM sideband)."""
    for bi, br in enumerate(beam_ratios):
        beam_freq = f0 * br
        # Sum and difference with harmonics
        for n in range(1, 30):
            harmonic = n * f0
            # Sum: harmonic + beam_freq
            if abs(freq - (harmonic + beam_freq)) < f0 * 0.03:
                return f"SB:H{n}+B{bi+1}"
            # Difference: |harmonic - beam_freq|
            diff = abs(harmonic - beam_freq)
            if diff > 0 and abs(freq - diff) < f0 * 0.03:
                return f"SB:|H{n}-B{bi+1}|"

        # Intermodulation between beam modes
        for bj, br2 in enumerate(beam_ratios):
            if bj <= bi:
                continue
            beam2_freq = f0 * br2
            sum_f = beam_freq + beam2_freq
            diff_f = abs(beam2_freq - beam_freq)
            if abs(freq - sum_f) < f0 * 0.03:
                return f"SB:B{bi+1}+B{bj+1}"
            if abs(freq - diff_f) < f0 * 0.03:
                return f"SB:|B{bj+1}-B{bi+1}|"

    # Also check: n*f0 ± m*f0 where n,m include beam ratio fractions
    # This catches f_beam ± f0 type sidebands
    for bi, br in enumerate(beam_ratios):
        beam_freq = f0 * br
        for k in range(-5, 6):
            candidate = beam_freq + k * f0
            if candidate > 0 and abs(freq - candidate) < f0 * 0.03:
                if k > 0:
                    return f"SB:B{bi+1}+{k}f0"
                elif k < 0:
                    return f"SB:B{bi+1}{k}f0"

    return None


def analyze_note(note_name, note_info):
    """Analyze all three versions of a note and compare."""
    f0 = note_info["f0"]

    print(f"\n{'='*70}")
    print(f"  {note_name} (f0={f0:.1f} Hz, MIDI {note_info['midi']})")
    print(f"  Beam modes: {f0*BEAM_RATIOS[0]:.1f} Hz ({BEAM_RATIOS[0]}×), "
          f"{f0*BEAM_RATIOS[1]:.1f} Hz ({BEAM_RATIOS[1]}×)")
    print(f"{'='*70}")

    results = {}

    for suffix in ["fund-only", "sidebands", "nosidebands"]:
        filepath = os.path.join(AUDIO_DIR, f"{note_name}-{suffix}.wav")
        if not os.path.exists(filepath):
            print(f"  [SKIP] {filepath} not found")
            continue

        data, sr = load_wav(filepath)
        print(f"\n  --- {suffix} (sr={sr}, len={len(data)/sr:.2f}s, peak={np.max(np.abs(data)):.4f}) ---")

        # Use a segment after attack (skip first 0.1s, use 0.5s)
        start = int(0.05 * sr)
        end = min(start + int(1.0 * sr), len(data))
        segment = data[start:end]

        # FFT
        N = len(segment)
        window = np.hanning(N)
        fft_data = np.fft.rfft(segment * window)
        freqs = np.fft.rfftfreq(N, 1.0 / sr)
        magnitude = np.abs(fft_data)
        mag_db = 20 * np.log10(magnitude + 1e-12)

        # Normalize to fundamental peak
        fund_idx = np.argmin(np.abs(freqs - f0))
        search_range = int(5 * N / sr)  # ±5 Hz
        fund_region = mag_db[max(0, fund_idx-search_range):fund_idx+search_range]
        fund_peak_db = np.max(fund_region)
        mag_db_rel = mag_db - fund_peak_db

        # Find peaks
        peaks, noise_floor = find_peaks_in_spectrum(freqs, mag_db, f0,
                                                     threshold_db=fund_peak_db - 70)

        # Print significant peaks (within 50 dB of fundamental)
        sig_peaks = [p for p in peaks if p["rel_dB"] > -55 and p["freq"] < 8000]

        print(f"  Fund peak: {fund_peak_db:.1f} dB, Noise floor: {noise_floor:.1f} dB")
        print(f"  Significant peaks ({len(sig_peaks)}):")
        print(f"  {'Freq':>8s}  {'Ratio':>7s}  {'Level':>7s}  {'Rel':>7s}  Type")
        print(f"  {'----':>8s}  {'-----':>7s}  {'-----':>7s}  {'---':>7s}  ----")

        for p in sig_peaks:
            marker = ""
            if "SB:" in p["type"]:
                marker = " *** SIDEBAND"
            elif "Beam" in p["type"]:
                marker = " ** BEAM MODE"
            print(f"  {p['freq']:8.1f}  {p['ratio']:7.2f}  {p['level_dB']:7.1f}  {p['rel_dB']:+7.1f}  {p['type']}{marker}")

        results[suffix] = {
            "peaks": sig_peaks,
            "fund_peak_db": float(fund_peak_db),
            "noise_floor": float(noise_floor),
        }

    # Compare sidebands vs nosidebands
    if "sidebands" in results and "nosidebands" in results:
        print(f"\n  --- SIDEBAND ANALYSIS (sidebands vs nosidebands) ---")
        sb_peaks = {round(p["freq"]): p for p in results["sidebands"]["peaks"]}
        nosb_peaks = {round(p["freq"]): p for p in results["nosidebands"]["peaks"]}

        # Find peaks that are in sidebands but not (or much weaker) in nosidebands
        print(f"\n  Peaks STRONGER in 'sidebands' vs 'nosidebands' (>3 dB difference):")
        print(f"  {'Freq':>8s}  {'Ratio':>7s}  {'w/SB':>7s}  {'no SB':>7s}  {'Diff':>7s}  Type")

        sideband_candidates = []
        for freq_key, p in sorted(sb_peaks.items()):
            if p["freq"] > 8000:
                continue
            # Find closest peak in nosidebands
            closest = None
            for nf, np_ in nosb_peaks.items():
                if abs(nf - freq_key) < 5:
                    closest = np_
                    break

            if closest is None:
                diff = p["rel_dB"] - (-60)  # assume -60 dB if not present
                if diff > 3:
                    print(f"  {p['freq']:8.1f}  {p['ratio']:7.2f}  {p['rel_dB']:+7.1f}  {'absent':>7s}  {diff:+7.1f}  {p['type']} *** PURE SIDEBAND")
                    sideband_candidates.append(p)
            else:
                diff = p["rel_dB"] - closest["rel_dB"]
                if diff > 3:
                    print(f"  {p['freq']:8.1f}  {p['ratio']:7.2f}  {p['rel_dB']:+7.1f}  {closest['rel_dB']:+7.1f}  {diff:+7.1f}  {p['type']}")
                    sideband_candidates.append(p)

        if sideband_candidates:
            print(f"\n  Total sideband candidates: {len(sideband_candidates)}")
            # Estimate FM modulation index from sideband levels
            # For simple FM: carrier A sin(ωt + β sin(Ωt))
            # J0(β) = carrier, J1(β) = first sideband pair
            # ratio J1/J0 ≈ β/2 for small β
            sb_levels = [p["rel_dB"] for p in sideband_candidates if "SB:" in p["type"]]
            if sb_levels:
                avg_sb_db = np.mean(sb_levels)
                # J1/J0 in linear ≈ 10^(avg_sb_db/20)
                j1_j0 = 10 ** (avg_sb_db / 20)
                beta_est = 2 * j1_j0  # small-β approximation
                print(f"\n  Average sideband level: {avg_sb_db:.1f} dB rel to fundamental")
                print(f"  J1/J0 ratio: {j1_j0:.4f}")
                print(f"  Estimated FM β (small-β approx): {beta_est:.3f}")
                print(f"  Note: This is a rough estimate. Real PU nonlinearity is not pure FM.")

    return results


def main():
    print("Gabrielli 2020 Rhodes Companion Files — Spectral Analysis")
    print("=" * 70)
    print(f"Audio directory: {AUDIO_DIR}")

    all_results = {}
    for note_name, note_info in NOTES.items():
        all_results[note_name] = analyze_note(note_name, note_info)

    # Save results as JSON for later comparison with our model
    out_path = os.path.join(os.path.dirname(__file__), "gabrielli_analysis.json")
    # Convert to serializable
    serializable = {}
    for note, variants in all_results.items():
        serializable[note] = {}
        for variant, data in variants.items():
            serializable[note][variant] = data

    with open(out_path, "w") as f:
        json.dump(serializable, f, indent=2)
    print(f"\nResults saved to {out_path}")


if __name__ == "__main__":
    main()
