#!/usr/bin/env python3
"""
extract_tine_lengths.py — Extract tine lengths from SM Figure 6-2 bar chart

The Tine Cutting Measurement Chart is a horizontal bar chart showing
relative tine lengths for all 88 keys. No numerical scale is provided.

Strategy:
1. Load the GIF image
2. For each horizontal bar, find the left edge (where black starts)
   and right edge (where the arrow/measurement area begins)
3. Bar pixel length ∝ tine length
4. Map to known endpoints: key 1 = 157mm, key 88 = 18mm (Shear 2011)
5. Output per-key tine lengths

The chart layout:
- Left column: keys 1-53 (top=longest=key1, bottom=shortest)
- Right column: keys 54-88 (bottom=longest=key54, top=shortest=key88)
- Labels format: "index-key_number"
"""

from PIL import Image
import numpy as np

IMG_PATH = "プロジェクト/PAD DAW/reference_code/rhodes_service_manual/ch6_fig6-2_tine_cutting_measurement_chart.gif"
OBSIDIAN = "/Users/nozakidaikai/Obsidian/デジタル百姓総本部"

# Known endpoints (Shear 2011 measurements)
L_KEY1 = 157.0   # mm, lowest key (A0)
L_KEY88 = 18.0   # mm, highest key (C8)


def analyze_chart():
    img = Image.open(f"{OBSIDIAN}/{IMG_PATH}").convert('L')  # grayscale
    pixels = np.array(img)
    h, w = pixels.shape
    print(f"Image: {w}×{h} pixels")

    # The chart has horizontal black bars on a white background.
    # Find the measurement area boundaries (the arrows at top span the area).
    # Threshold: pixels < 128 = black
    threshold = 128

    # Scan each row to find bar regions
    # A "bar row" has a significant run of black pixels
    bar_rows = []
    for y in range(h):
        row = pixels[y, :]
        black = row < threshold
        if np.sum(black) > 20:  # at least 20 black pixels
            # Find leftmost and rightmost black pixel
            blacks = np.where(black)[0]
            left = blacks[0]
            right = blacks[-1]
            bar_rows.append((y, left, right, right - left))

    # Group consecutive rows into bars
    # Each tine bar is several pixels tall
    bars = []
    if not bar_rows:
        print("No bars found!")
        return

    current_bar = [bar_rows[0]]
    for i in range(1, len(bar_rows)):
        y_prev = bar_rows[i-1][0]
        y_curr = bar_rows[i][0]
        if y_curr - y_prev <= 2:  # consecutive or near-consecutive
            current_bar.append(bar_rows[i])
        else:
            bars.append(current_bar)
            current_bar = [bar_rows[i]]
    bars.append(current_bar)

    print(f"Found {len(bars)} horizontal bar groups")

    # For each bar group, compute the median bar length
    bar_data = []
    for bar in bars:
        if len(bar) < 2:  # skip single-pixel noise
            continue
        lengths = [r[3] for r in bar]
        y_center = bar[len(bar)//2][0]
        median_len = np.median(lengths)
        max_right = max(r[2] for r in bar)
        min_left = min(r[1] for r in bar)
        bar_data.append({
            'y': y_center,
            'left': min_left,
            'right': max_right,
            'pixel_len': max_right - min_left,
            'height': len(bar),
        })

    # Filter: real tine bars should be >3 pixels tall and >10 pixels wide
    real_bars = [b for b in bar_data if b['height'] >= 3 and b['pixel_len'] > 10]
    print(f"After filtering: {len(real_bars)} bars (expect ~88)")

    # Sort by pixel length (longest first)
    real_bars.sort(key=lambda b: -b['pixel_len'])

    # Print top bars for inspection
    print("\nTop 10 longest bars:")
    for i, b in enumerate(real_bars[:10]):
        print(f"  #{i+1}: y={b['y']}, len={b['pixel_len']}px, h={b['height']}px, left={b['left']}")

    print("\nBottom 10 shortest bars:")
    for i, b in enumerate(real_bars[-10:]):
        print(f"  #{len(real_bars)-9+i}: y={b['y']}, len={b['pixel_len']}px, h={b['height']}px")

    # The chart has TWO columns (left: keys 1-53, right: keys 54-88)
    # Bars from the left column start from the LEFT edge
    # Bars from the right column start from the RIGHT edge
    # We need to identify which column each bar belongs to

    # The left column bars start from a common left edge
    # The right column bars end at a common right edge
    # Split by checking if the bar is in the left or right half

    mid_x = w // 2
    left_bars = [b for b in real_bars if b['left'] < mid_x - 50]
    right_bars = [b for b in real_bars if b['left'] >= mid_x - 50]

    # Sort each column by y position (top to bottom)
    left_bars.sort(key=lambda b: b['y'])
    right_bars.sort(key=lambda b: b['y'])

    print(f"\nLeft column: {len(left_bars)} bars (expect ~53)")
    print(f"Right column: {len(right_bars)} bars (expect ~35)")

    # For left column: bar length = pixel_len (measuring from left edge)
    # Key assignment: top = key 1 (longest), bottom = key 53
    # For right column: bar length = pixel_len (measuring from right edge)
    # Key assignment: top = key 88 (shortest), bottom = key 54

    # Find the reference pixel length for key 1 and key 88
    if left_bars and right_bars:
        # Key 1 = first (top) bar in left column
        px_key1 = left_bars[0]['pixel_len']
        # Key 88 = first (top) bar in right column
        px_key88 = right_bars[0]['pixel_len']

        print(f"\nKey 1 (longest): {px_key1}px")
        print(f"Key 88 (shortest): {px_key88}px")

        # Linear mapping: L(px) = a × px + b
        # L_KEY1 = a × px_key1 + b
        # L_KEY88 = a × px_key88 + b
        a = (L_KEY1 - L_KEY88) / (px_key1 - px_key88)
        b = L_KEY1 - a * px_key1

        print(f"Scale: {a:.4f} mm/px, offset: {b:.2f} mm")

        # Assign lengths
        results = {}

        # Left column: keys 1 to len(left_bars)
        for i, bar in enumerate(left_bars):
            key = i + 1
            length_mm = a * bar['pixel_len'] + b
            results[key] = length_mm

        # Right column: keys are reversed (top=88, bottom=54)
        n_right = len(right_bars)
        for i, bar in enumerate(right_bars):
            key = 88 - i
            length_mm = a * bar['pixel_len'] + b
            results[key] = length_mm

        # Print results
        print("\n--- Per-key tine lengths (from chart) ---")
        print(f"{'Key':>4s} {'MIDI':>4s} {'Chart(mm)':>10s} {'ExpFit(mm)':>10s} {'Diff(mm)':>10s}")
        for key in sorted(results.keys()):
            midi = key + 20
            chart_mm = results[key]
            exp_mm = 157.0 * np.exp(-0.0249 * (key - 1))
            diff = chart_mm - exp_mm
            print(f"{key:4d} {midi:4d} {chart_mm:10.1f} {exp_mm:10.1f} {diff:10.1f}")

        # Output as JS array
        print("\n// Per-key tine lengths from SM Figure 6-2 (mm)")
        print("// Extracted by pixel measurement, mapped to Shear endpoints")
        print("var TINE_LENGTH_SM = [")
        for key in range(1, 89):
            if key in results:
                print(f"  {results[key]:.1f}, // key {key} MIDI {key+20}")
            else:
                exp_mm = 157.0 * np.exp(-0.0249 * (key - 1))
                print(f"  {exp_mm:.1f}, // key {key} MIDI {key+20} (exp fit, no chart data)")
        print("];")


if __name__ == '__main__':
    analyze_chart()
