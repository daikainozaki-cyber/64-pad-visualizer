#!/usr/bin/env python3
"""
gemini_tine_chart.py — Use Gemini to extract tine lengths from SM Figure 6-2

Sends the bar chart image to Gemini and asks it to estimate per-key tine lengths
by measuring relative bar widths.
"""

import json
from google import genai

IMG_PATH = "/Users/nozakidaikai/Obsidian/デジタル百姓総本部/プロジェクト/PAD DAW/reference_code/rhodes_service_manual/ch6_fig6-2_tine_cutting_measurement_chart.gif"

client = genai.Client()

prompt = """This is Figure 6-2 "Tine Cutting Measurement Chart" from the Rhodes Electric Piano Service Manual.

It shows horizontal bars representing the cutting length of each tine for an 88-key Rhodes piano. The bars are proportional to the actual tine length.

**Left column** (top to bottom): Keys 1-53 (bass, longest at top)
- Label "0-(1-7)" at top means keys 1-7 share the same (longest) length
- Labels "1-8", "2-9", ... "46-53" for individual keys 8-53

**Right column** (top to bottom): Keys 88-54 (treble, shortest at top)
- Label "81-88" at top = key 88 (shortest)
- Labels descend to "47-54" at bottom = key 54

**Known calibration points:**
- Key 1 (A0) = 157mm (longest bar, top of left column)
- Key 88 (C8) = 18mm (shortest bar, top of right column)
- Key 40 (B3) ≈ 56mm
- Key 50 (A4) ≈ 43mm

**Your task:** By measuring the RELATIVE pixel widths of each bar, estimate the tine length in mm for ALL 88 keys.

Output as a JSON object: {"key_1": 157.0, "key_2": ..., ..., "key_88": 18.0}

Be as precise as possible based on the visual bar proportions. Keys 1-7 should all have the same length (the longest bar).
"""

with open(IMG_PATH, "rb") as f:
    img_data = f.read()

response = client.models.generate_content(
    model="gemini-3-flash-preview",
    contents=[
        {
            "role": "user",
            "parts": [
                {"inline_data": {"mime_type": "image/gif", "data": img_data}},
                {"text": prompt}
            ]
        }
    ],
    config={"temperature": 0.1}
)

text = response.text
print(text)
