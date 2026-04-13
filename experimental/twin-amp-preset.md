# Frozen: `Rhodes Stage + Twin` preset

**Frozen on 2026-04-13 as part of Phase 0.3 of the Pad Sensei platform roadmap.**

This is a backup of the Twin amp preset definition that was removed from the main
line (`epiano-engine.js` / `epiano-worklet-engine.js`) so that the user-facing
product never exposes Twin, and so that routing bugs caused by Twin/Suitcase
switching stop recurring (urinami-san 2026-04-13: "何度もルーティングで間違えた").

The DSP code that implements the Twin amp chain itself is still inside
`epiano-worklet-processor.js` — it is unreachable now that no preset selects
`ampType='twin'`, so it becomes dead code. Phase 0.3c will physically delete
that block; until then the DSP is kept in place for reversibility.

## Preset definition (was: `EP_AMP_PRESETS['Rhodes Stage + Twin']`)

```javascript
'Rhodes Stage + Twin': {
  pickupType: 'rhodes',
  preampType: '12AX7',
  powerampType: '6L6',
  useTonestack: true,
  useCabinet: true,
  useSpringReverb: false,  // OFF: Nyquist aliasing in spring reverb (chirp artifacts). Fix before re-enabling.
  springPlacement: 'post_tremolo',
  springInputTrim: 1.0,
  springReturnGain: 1.0,
  springSendHPFHz: 318,
  springTiltDb: -6,
  springSendLPFHz: 5000,
  springOutHPFHz: 530,
  springResonatorMix: 1.0,
  springModDepth: 8.0,
  springHfMix: 0.0010,
  springFeedbackScale: 1.0,
},
```

## What shipped alongside this preset (context)

- `ampType` branch in `epiano-worklet-processor.js` (L3163-3211 in the original
  pre-Phase-0.3c source): V4B unity-norm LUT × 2 real gain, 6L6 linear
  poweramp × 1.14, Jensen/Eminence cabinet parametric EQ (HPF 60 Hz, resonance
  peak, presence peak, LPF).
- UI sliders (V1A / V2B / V4B / PWR / CAB / C.HPF / C.PEAK / C.LPF + Tonestack
  Bass / Mid / Treble) that lived in `AMP CHAIN (dev)` — removed in Phase 0.3a.
- `?amp=twin` dev URL override — removed in Phase 0.3a.

## Restore procedure (if the preset is ever brought back)

1. Re-add the preset entry above to `EP_AMP_PRESETS` in `epiano-engine.js`.
2. Add a matching entry to the `presets` map in
   `audio-engines.js` under `ENGINES.epiano.presets`, e.g.
   ```javascript
   'Rhodes Stage + Twin': { epiano: 'Rhodes Stage + Twin', label: 'Pad Sensei MK1 Twin' },
   ```
3. Verify the `ampType==='twin'` branch in `epiano-worklet-processor.js` is
   still present (or restore from git history if Phase 0.3c has already run).
4. Run `npm test` and do an audible A/B against a current main commit.

## References

- Phase 0.3a commit `162b5e7` — removed AMP CHAIN (dev) UI and `?amp=...` URL
- Phase 0.3b commit (this commit) — moved preset definition here
- Phase 0.3c (future) — physical removal of the DSP block
- Roadmap: `/Users/nozakidaikai/.claude/plans/humming-wibbling-tarjan.md`
