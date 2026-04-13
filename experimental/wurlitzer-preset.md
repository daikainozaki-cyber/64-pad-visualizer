# Frozen: `Wurlitzer 200A` preset

**Frozen on 2026-04-13 as part of Phase 0.3c of the Pad Sensei platform roadmap.**

The Wurlitzer 200A preset was defined in `EP_AMP_PRESETS` (epiano-engine.js) but
was **not exposed in the user-facing ENGINES registry** (audio-engines.js) — it
could only be reached through the removed `?amp=wurl` dev URL override. When
Phase 0.3c removed the Twin amp chain DSP, the Wurlitzer preset was the only
remaining user of the now-deleted `ampType==='twin'` fallback, so the preset
itself is frozen together with the Twin DSP.

The reed-pickup physics implied by `pickupType: 'wurlitzer'` and the BJT preamp
/ solid-state poweramp characteristics have never been fully implemented in
the worklet — removing the preset does not remove any audible feature.

## Preset definition (was: `EP_AMP_PRESETS['Wurlitzer 200A']`)

```javascript
'Wurlitzer 200A': {
  pickupType: 'wurlitzer',
  preampType: 'BJT',
  powerampType: 'SS',
  useTonestack: true,
  useCabinet: true,
  useSpringReverb: false,  // Built-in speaker, no spring reverb
  springPlacement: 'pre_tremolo',
  springInputTrim: 0.18,
  springReturnGain: 0.18,
  springSendHPFHz: 200,
  springTiltDb: -4,
  springSendLPFHz: 5600,
  springOutHPFHz: 300,
  springResonatorMix: 0.40,
  springModDepth: 3.5,
  springHfMix: 0.0004,
  springFeedbackScale: 0.72,
},
```

## Restore procedure

A proper Wurlitzer implementation needs:

1. Reed-tone physical model (different from the Rhodes tine). Wurlitzer 200A
   uses vibrating steel reeds with a capacitive (electrostatic) pickup — much
   more direct harmonic content than the Rhodes electromagnetic pickup.
2. BJT preamp LUT (NPN/PNP push-pull) — warmer than op-amp, less than tube.
3. Solid-state poweramp (push-pull transistor, 16W into 8" internal speaker).
4. Internal-speaker cabinet EQ (8"×1 near-sealed, narrower than Suitcase).

When all four are in place, restore this preset definition and add a matching
entry to `audio-engines.js` `ENGINES.epiano.presets`.

## References

- Phase 0.3c commit (this commit) — froze the preset alongside the Twin DSP
- Roadmap: `/Users/nozakidaikai/.claude/plans/humming-wibbling-tarjan.md`
