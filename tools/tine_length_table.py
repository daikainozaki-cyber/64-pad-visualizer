#!/usr/bin/env python3
"""
tine_length_table.py — Piecewise tine length model from SM Figure 6-2

Zone 1: keys 1-7   → constant 157mm (SM label "0-(1-7)")
Zone 2: keys 8-35  → linear/quasi-linear (Gemini pixel measurement)
Zone 3: keys 36-88 → exponential (validated by Gemini + Shear endpoints)

Sources:
  - SM Figure 6-2: bar chart (Gemini pixel analysis)
  - Shear 2011: endpoints (key 1 = 157mm, key 88 = 18mm)
  - EP Forum: exponential fit y = 7.573 × e^(-0.027x) inches

Output: Per-key tine length table for epiano-worklet-processor.js
"""

import numpy as np

# Gemini-extracted values for keys 1-53 (left column, reliable)
GEMINI_LEFT = {
    1: 157.0, 2: 157.0, 3: 157.0, 4: 157.0, 5: 157.0, 6: 157.0, 7: 157.0,
    8: 153.8, 9: 150.6, 10: 147.4, 11: 144.2, 12: 141.0, 13: 137.9, 14: 134.7,
    15: 131.5, 16: 128.3, 17: 125.1, 18: 121.9, 19: 118.7, 20: 115.5, 21: 112.4,
    22: 109.2, 23: 106.0, 24: 102.8, 25: 99.6, 26: 96.4, 27: 93.2, 28: 90.1,
    29: 86.9, 30: 83.7, 31: 80.5, 32: 77.3, 33: 74.1, 34: 71.0, 35: 67.8,
}

# Keys 36-40: Gemini values (transition zone, less reliable but usable)
GEMINI_TRANSITION = {
    36: 65.4, 37: 63.0, 38: 60.6, 39: 58.3, 40: 56.0,
}

# Shear endpoint
L_KEY88 = 18.0  # mm


def build_table():
    """Build piecewise tine length table for all 88 keys."""
    table = {}

    # Zone 1: keys 1-7 — constant (SM confirmed)
    for k in range(1, 8):
        table[k] = 157.0

    # Zone 2: keys 8-35 — use Gemini pixel measurements
    # These are from the left column which is reliable
    for k in range(8, 36):
        table[k] = GEMINI_LEFT[k]

    # Zone 2→3 transition: keys 36-40 from Gemini
    for k in range(36, 41):
        table[k] = GEMINI_TRANSITION[k]

    # Zone 3: keys 41-88 — fit exponential to match:
    #   key 40 = 56.0mm (Gemini)
    #   key 88 = 18.0mm (Shear)
    #
    # L(key) = A × exp(-b × (key - 40))
    # At key 40: A = 56.0
    # At key 88: 56.0 × exp(-b × 48) = 18.0
    #   → exp(-48b) = 18/56 = 0.3214
    #   → -48b = ln(0.3214) = -1.1346
    #   → b = 0.02364
    A = 56.0
    b = -np.log(L_KEY88 / A) / (88 - 40)

    for k in range(41, 89):
        table[k] = A * np.exp(-b * (k - 40))

    # Enforce monotonicity (strictly decreasing after Zone 1)
    for k in range(8, 89):
        if table[k] >= table[k-1]:
            table[k] = table[k-1] - 0.1  # force slight decrease

    return table


def main():
    table = build_table()

    # Comparison with exponential fit
    print("// =================================================================")
    print("// Per-key tine lengths (mm) — SM Figure 6-2 piecewise model")
    print("// Zone 1: keys 1-7 = 157mm constant (SM label '0-(1-7)')")
    print("// Zone 2: keys 8-35 = Gemini pixel measurement from SM bar chart")
    print("// Zone 3: keys 41-88 = exponential fit (56mm@key40 → 18mm@key88)")
    print("// Transition: keys 36-40 = Gemini + smooth")
    print("// =================================================================")

    # JS function
    print()
    print("// Index: midi - 21 (MIDI 21 = key 1)")
    print("var TINE_LENGTH_TABLE = new Float32Array([")
    for k in range(1, 89):
        midi = k + 20
        L = table[k]
        exp_L = 157.0 * np.exp(-0.0249 * (k - 1))
        diff = L - exp_L
        print("  %6.1f, // key %2d MIDI %3d  (exp: %5.1f  Δ=%+.1f)" % (
            L, k, midi, exp_L, diff))
    print("]);")

    # Also output the tineLength replacement function
    print()
    print("// Replace tineLength() with table lookup:")
    print("// function tineLength(midi) {")
    print("//   var idx = midi - 21;")
    print("//   if (idx >= 0 && idx < 88) return TINE_LENGTH_TABLE[idx];")
    print("//   return 157 * Math.exp(-0.0249 * (Math.max(1,Math.min(88,midi-20)) - 1));")
    print("// }")

    # Verification
    print("\n// Verification (stderr):", file=__import__('sys').stderr)
    print("// Key  1 = %.1f mm (should be 157.0)" % table[1], file=__import__('sys').stderr)
    print("// Key  7 = %.1f mm (should be 157.0)" % table[7], file=__import__('sys').stderr)
    print("// Key  8 = %.1f mm" % table[8], file=__import__('sys').stderr)
    print("// Key 40 = %.1f mm (should be ~56.0)" % table[40], file=__import__('sys').stderr)
    print("// Key 88 = %.1f mm (should be 18.0)" % table[88], file=__import__('sys').stderr)

    # Check monotonicity
    for k in range(2, 89):
        if table[k] >= table[k-1]:
            print("// WARNING: non-monotonic at key %d (%.1f >= %.1f)" % (
                k, table[k], table[k-1]), file=__import__('sys').stderr)


if __name__ == '__main__':
    main()
