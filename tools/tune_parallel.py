#!/usr/bin/env python3
"""Parallel tuning mass calibration. Splits 88 keys across N workers."""
import json, os, sys, time
from multiprocessing import Pool

os.environ['TB_K_LIN'] = os.environ.get('TB_K_LIN', '40')
os.environ['TB_K_NL'] = os.environ.get('TB_K_NL', '0')

from fdtd_tine_simulator import (
    find_tuning_mass_hammer, find_tuning_mass, has_tonebar,
    choose_oversample, get_nes_params
)

def calibrate_one(midi):
    """Calibrate one key. Returns (midi, result_dict)."""
    try:
        f0 = 440.0 * 2**((midi - 69) / 12.0)
        mass = find_tuning_mass_hammer(midi, tol_cents=5.0, max_iter=15,
                                        enable_tonebar=has_tonebar(midi))
        k_lin, k_NL, zeta = get_nes_params(midi)
        return (midi, {
            'mass_kg': mass,
            'mass_g': round(mass * 1000, 3),
            'f0_target': round(f0, 2),
            'enable_tonebar': has_tonebar(midi),
            'coupling_model': f'linear_k{k_lin:.0f}'
        })
    except Exception as e:
        print(f"ERROR MIDI {midi}: {e}")
        return (midi, None)

if __name__ == '__main__':
    n_workers = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    midis = list(range(21, 109))  # 88 keys
    
    print(f"Calibrating 88 keys with {n_workers} workers...")
    print(f"TB_K_LIN={os.environ.get('TB_K_LIN')}, TB_K_NL={os.environ.get('TB_K_NL')}")
    t0 = time.time()
    
    with Pool(n_workers) as pool:
        results = pool.map(calibrate_one, midis)
    
    # Merge
    out = {}
    failed = 0
    for midi, data in results:
        if data:
            out[str(midi)] = data
        else:
            failed += 1
    
    path = 'tools/fdtd_output/tuning_mass_88.json'
    with open(path, 'w') as f:
        json.dump(out, f, indent=2)
    
    elapsed = time.time() - t0
    print(f"\nDone: {len(out)}/88 keys in {elapsed:.0f}s ({elapsed/60:.1f}min). Failed: {failed}")
    print(f"Saved: {path}")
