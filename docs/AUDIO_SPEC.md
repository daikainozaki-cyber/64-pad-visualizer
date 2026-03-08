# Audio Engine Specification

**Source**: `audio.js`
**Last updated**: 2026-03-08

---

## 1. Signal Chain Topology

### Main Chain (series)

```
Voice Sources (WebAudioFont / Sampler)
  |
  v
[voiceSaturation] (per-voice WaveShaper, bypass when drive=0)
  |
  v
masterGain (GainNode, Vol slider)
  |
  v
tremoloNode (GainNode, base=1.0, LFO modulates +-depth)
  |
  v
autoFilter (BiquadFilter, LP/BP, stage 1 of 2)
  |
  v
autoFilter2 (BiquadFilter, LP/BP, stage 2 — transparent at 20kHz in 2P mode)
  |
  +---> phaserFilters[0..3] (4x allpass) ---> phaserWet ---> phaserMix
  |                                                            ^
  +------------------------------------------------------------+  (dry path)
  |
  v
phaserMix
  |
  +---> flangerDelay ---> flangerWet ---> flangerMix
  |         ^    |                          ^
  |         +----+ (flangerFeedback)        |
  +---------------------------------------------+  (dry path)
  |
  v
flangerMix
  |
  +---> [loCutFilter] (highpass, when enabled)
  |         |
  |         v
  |     [hiCutFilter] (lowpass, when enabled)
  |         |
  v         v
  +---------+
  |
  v
masterComp (DynamicsCompressor: threshold=-12, ratio=4, knee=12)
  |
  v
audioCtx.destination
```

### Parallel Reverb Send

```
flangerMix ----> masterReverb (ConvolverNode, 1.5s IR, power-decay 2.8)
                    |
                    v
                 masterReverbGain (GainNode, default=0.08)
                    |
                    v
                 masterComp  (shared with dry path)
```

**Note**: The reverb send taps from `flangerMix`, not from the end of the loCut/hiCut chain. The `rebuildFilterChain()` function reconnects `flangerMix` to both `masterComp` and `masterReverb` (with optional loCut/hiCut in between), so when filters are enabled the reverb also receives the filtered signal.

### LFO Connections

```
tremoloLFO (OscillatorNode, sine, default 4.5 Hz)
  |
  v
tremoloGain (GainNode, depth slider, default=0)
  |
  v
tremoloNode.gain (AudioParam) --- ADDITIVE modulation
```

```
phaserLFO (OscillatorNode, sine, default 0.4 Hz)
  |
  v
phaserDepth (GainNode, gain = phaserSlider * 1200)
  |
  v
phaserFilters[0..3].frequency (AudioParam, all 4) --- ADDITIVE modulation
```

```
flangerLFO (OscillatorNode, sine, default 0.25 Hz)
  |
  v
flangerLFODepth (GainNode, gain = flangerSlider * 0.002)
  |
  v
flangerDelay.delayTime (AudioParam) --- ADDITIVE modulation
```

All three LFOs are started at construction time (`lfo.start(0)`) and run continuously. Depth=0 means no modulation.

### Key Invariant: Vol=0 Produces Silence

When `masterGain.gain = 0`, no signal reaches `tremoloNode`. The tremolo LFO is connected to `tremoloNode.gain` (a separate GainNode in the chain), NOT to `masterGain.gain`. This prevents the additive LFO leak bug where `gain=0 + LFO = +-depth` would produce audible output.

### Full ASCII Diagram

```
                                    +---[phaserLFO]
                                    |       |
                                    |  [phaserDepth]
                                    |       |
                                    |       v
                                    |  phaserFilters[0..3].frequency
                                    |
[Voice] -> [saturation?] -> masterGain -> tremoloNode -> autoFilter -> autoFilter2
                                ^                                         |
                                |                              +----------+-----------+
                         [tremoloLFO]                          |                      |
                              |                         phaserFilters[0]         (dry bypass)
                         [tremoloGain]                        |                      |
                              |                         phaserFilters[1]             |
                              v                               |                      |
                        tremoloNode.gain               phaserFilters[2]              |
                                                              |                      |
                                                        phaserFilters[3]             |
                                                              |                      |
                                                          phaserWet                  |
                                                              |                      |
                                                              +-------> phaserMix <--+
                                                                            |
                                                              +-------------+-------------+
                                                              |                           |
                                                        flangerDelay                (dry bypass)
                                                         ^    |                           |
                                                         |    |                           |
                                                    [feedback]+                           |
                                                              |                           |
                                                          flangerWet                      |
                                                              |                           |
                                                              +-------> flangerMix <------+
                                                                          |     |
                                                                          |     +-> masterReverb
                                                                          |              |
                                                                    [loCut?]      masterReverbGain
                                                                          |              |
                                                                    [hiCut?]             |
                                                                          |              |
                                                                          +-> masterComp <+
                                                                                  |
                                                                           destination
                                      [flangerLFO]
                                            |
                                     [flangerLFODepth]
                                            |
                                            v
                                   flangerDelay.delayTime
```

---

## 2. Sound Engines

### Engine Registry

Two engine categories defined in the `ENGINES` object:

| Engine Key | Display Name | Presets |
|-----------|-------------|---------|
| `organ` | ORGAN | Drawbar, Percussive, Rock, Church (all WebAudioFont GM) |
| `ep` | E.PIANO | Rhodes 1/2/3, FM EP 1/2, Clav 1/2 (WebAudioFont GM), jRhodes3c (Sampler) |

### Engine Selection Logic

```
if (AudioState.instrument.sampler) {
    // Sampler engine
    _samplerNoteOn(instrument.sampler, midi, velocity, dest)
} else {
    // WebAudioFont engine
    wafPlayer.queueWaveTable(audioCtx, dest, instrument.data, 0, midi, 99999, velocity)
}
```

The selector is `AudioState.instrument.sampler` -- if truthy, use sampler; otherwise use WebAudioFont.

### WebAudioFont Engine

- **Player**: `WebAudioFontPlayer` instance (`wafPlayer`)
- **Call**: `wafPlayer.queueWaveTable(audioCtx, dest, preset, 0, midi, 99999, velocity)`
  - `dest`: the saturation node's input (or `masterGain` when drive=0)
  - `time`: 0 (play immediately)
  - `pitch`: MIDI note number
  - **`duration`: 99999** -- effectively infinite. The voice will play until `cancel()` is called.
  - `velocity`: 0.0--1.0 float
- **Return value**: envelope object with `.cancel()` method
- **Preset decoding**: `wafPlayer.loader.decodeAfterLoading(audioCtx, preset.data)` called eagerly on engine switch and AudioContext resume
- **Cleanup**: `wafPlayer.cancelQueue(audioCtx)` kills all queued voices globally

### Sampler Engine

Used exclusively for `jRhodes3c` (1977 Rhodes Mark I, velocity-layered).

#### Sample Loading (`_decodeSamplerZones`)

- Reads base64-encoded audio from `instrument.zones[].file`
- Deduplicates using DJB2 hash of the base64 payload (because some zones share identical sample data)
- Decoded `AudioBuffer` stored in `_samplerBuffers` Map, keyed as `"instrumentName:zoneIdx"`
- `_samplerDecoded` object prevents re-decoding the same instrument

#### Zone Matching (`_findSamplerZone`)

1. Primary: exact match on `keyLow <= midi <= keyHigh` AND `velLow <= velocity127 <= velHigh`
2. Fallback: key match only, nearest velocity center `(velLow + velHigh) / 2`

#### Note Synthesis (`_samplerNoteOn`)

```
BufferSource ---> damperLpf (lowpass, 20kHz open) ---> voiceGain ---> dest (saturation or masterGain)
```

- **Pitch**: `source.playbackRate = 2^((midi - zone.pitchCenter) / 12)` (avoids `detune`, which is buggy in WKWebView)
- **Volume**: `0.15 + 0.35 * velocity` (4-voice polyphony at full velocity sums to ~2.0)
- **Decay model**: 2-stage Weinreich KTH:
  - `T60 = 45 * 2^(-(midi - 21) / 18)` seconds (pitch-dependent, lower = longer)
  - `tauSlow = T60 / 6.91` (6.91 = ln(10^3) for 60 dB)
  - `tauFast = tauSlow * 0.25` (prompt sound)
  - `sustainLevel = vol * max(0.10, 0.80 - (midi - 21) * 0.002)` (aftersound)
  - Envelope: `setTargetAtTime(sustainLevel, now + 0.005, tauFast)`
- **Start offset**: `source.start(now, 0.01)` -- skip 10 ms MP3 encoder padding
- **Damper LPF**: Fully open (20 kHz) while held. On release, frequency ramps to 200 Hz (absorbs high-freq noise)

#### Release Envelope

- `releaseTime = zone.ampRelease || 0.3` seconds
- `releaseTau = releaseTime / 5.0`
- Volume: `setTargetAtTime(0, now, releaseTau)`
- Damper LPF: `setTargetAtTime(200, now, releaseTau * 0.4)` (closes faster than volume)
- Source stops at `now + releaseTau * 6`

### Per-Voice Saturation (`_createVoiceSaturation`)

- **When `saturationDrive = 0`**: bypass -- returns `{ input: masterGain, cleanup: null }`
- **When `saturationDrive > 0`**: creates a `WaveShaperNode` per voice
  - Drive formula: `velDrive = 1 + velocity^2 * saturationDrive * 20`
  - Transfer curve: `tanh(x * velDrive) / tanh(velDrive)` (normalized soft clipping)
  - 256-sample curve, `oversample: '2x'`
  - Connected: `voice -> WaveShaper -> masterGain`
  - Cleanup: `ws.disconnect()` called after 2 s delay on noteOff

---

## 3. Voice Lifecycle

### `noteOn(midi, velocity, poly, _retries)`

1. **Mute check**: if `_soundMuted`, return immediately (no sound)
2. **AudioContext resume**: `ensureAudioResumed()`
3. **Kill existing**: if `activeVoices.has(midi)`, call `existing.envelope.cancel()` and delete
4. **Trigger auto-filter**: `triggerAutoFilter()` (envelope sweep on every note-on)
5. **Create saturation**: `_createVoiceSaturation(velocity)` returns `{ input, cleanup }`
6. **Dispatch to engine**:
   - Sampler: `_samplerNoteOn(instrument.sampler, midi, velocity, sat.input)`
   - WebAudioFont: `wafPlayer.queueWaveTable(audioCtx, sat.input, data, 0, midi, 99999, velocity)`
7. **Null check**: if engine returns null (decode not ready):
   - Clean up saturation
   - Retry up to 3 times at 100 ms intervals
8. **Store**: `activeVoices.set(midi, { envelope, satCleanup: sat.cleanup })`

### `noteOff(midi)`

1. Look up `activeVoices.get(midi)`
2. Call `v.envelope.cancel()` (triggers release envelope for sampler; stops WebAudioFont voice)
3. Schedule saturation cleanup: `setTimeout(v.satCleanup, 2000)` (2 s delay for release tail)
4. `activeVoices.delete(midi)`

### `noteOffAll()`

1. Iterate `activeVoices` entries, call `.envelope.cancel()` on each
2. `activeVoices.clear()`
3. `wafPlayer.cancelQueue(audioCtx)` -- kills any WebAudioFont voices not tracked (safety net)

### Preset Switch Flow

1. `noteOffAll()` -- silence all current voices
2. Update `AudioState` (engineKey, engine, presetKey, instrument)
3. Decode all presets in new engine: `_decodeSamplerZones()` or `wafPlayer.loader.decodeAfterLoading()`

### Global Note Release Safety

- `mouseup` event: releases `_heldMidi`
- `touchend` / `touchcancel` events: releases all `_heldTouches`
- `window.blur` event: releases ALL held notes (prevents stuck notes when switching tabs)

---

## 4. State Machine

### Mute State

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `_soundMuted` | boolean | `true` | When true, `noteOn()` returns immediately. Toggled by mute button or first preset selection |

Sound is **OFF by default**. First interaction (selecting engine/preset, dismissing audio overlay) sets `_soundMuted = false`.

### AudioState Object

```javascript
AudioState = {
    engineKey: string,      // 'organ' | 'ep'
    engine: object,         // reference to ENGINES[engineKey]
    presetKey: string,      // e.g. 'Drawbar', 'jRhodes3c'
    instrument: object,     // reference to engine.presets[presetKey]
                            //   .data (WebAudioFont) or .sampler (Sampler)
}
```

### Effect Parameter States

| Variable | Type | Default | Controls |
|----------|------|---------|----------|
| `autoFilterEnabled` | boolean | `false` | Whether auto-filter envelope triggers on noteOn |
| `autoFilterDepth` | float | 0.7 | Sweep range (0--1) |
| `autoFilterSpeed` | float | 0.15 | Decay time in seconds |
| `autoFilterType` | string | `'lowpass'` | `'lowpass'` or `'bandpass'` |
| `autoFilterPoles` | int | 2 | 2 or 4 (2P = stage 2 transparent at 20 kHz) |
| `autoFilterQ` | float | 2 | Resonance (1=fat, 10=narrow/vocal) |
| `loCutEnabled` | boolean | `false` | Highpass filter in chain |
| `hiCutEnabled` | boolean | `false` | Lowpass filter in chain |
| `saturationDrive` | float | 0 | 0=off, 0.1--1.0=mild to heavy |

### Voice Tracking

```javascript
activeVoices: Map<midi: number, {
    envelope: { cancel: function },  // WebAudioFont envelope OR sampler release object
    satCleanup: function | null      // delayed disconnect of WaveShaper node
}>
```

### AudioContext State

- Created at module load (may be `'suspended'` until user gesture)
- `ensureAudioResumed()`: resumes if suspended, triggers one-time preset decode
- Registered on first `mousedown` and `touchstart` (both with `{ once: true }`)

### Persistence

All sound settings saved to `localStorage` key `'64pad-sound'`:
- Engine, preset, mute state
- All slider values (volume, reverb, tremolo, tremolo speed, phaser, flanger, lo cut, hi cut, AF depth/speed/Q, drive)
- Toggle states (loCutEnabled, hiCutEnabled, autoFilterEnabled)
- Filter config (autoFilterType, autoFilterPoles)

Restored by `loadSoundSettings()` on DOM ready.

---

## 5. Known Bug Patterns (from 2026-03-08 session)

### 5.1 Additive LFO Leak

**Symptom**: Sound audible even when Vol slider is at 0 and tremolo is active.

**Root cause**: Web Audio LFO modulation is additive. An `OscillatorNode` connected to a `GainNode.gain` AudioParam adds its output to the param's current value. If `gain = 0` and LFO depth = `d`, the effective gain oscillates between `-d` and `+d`, producing audible output.

**Fix applied**: Tremolo uses a **separate `tremoloNode` GainNode** in the signal chain, placed after `masterGain`. The LFO modulates `tremoloNode.gain` (base = 1.0), not `masterGain.gain`. When `masterGain.gain = 0`, no signal reaches `tremoloNode` regardless of LFO state.

**General rule**: Never connect an LFO to a gain parameter that also serves as a volume control. Use a dedicated gain node for LFO modulation.

### 5.2 Zombie Voices (WebAudioFont)

**Symptom**: Old notes keep playing after preset switch or noteOffAll.

**Root cause**: `wafPlayer.queueWaveTable()` is called with `duration = 99999` (effectively infinite). If `cancel()` is never called on the returned envelope (e.g., voice not tracked in `activeVoices`, or `cancelQueue` not invoked), the voice plays for ~27 hours.

**Fix applied**: `noteOffAll()` calls `wafPlayer.cancelQueue(audioCtx)` as a safety net to kill any WebAudioFont voices not tracked in `activeVoices`.

**Remaining risk**: If a voice is created but fails to be stored in `activeVoices` (e.g., due to race condition with retry logic), it becomes a zombie until `cancelQueue` is called.

### 5.3 Zombie Service Workers

**Symptom**: Multiple service worker registrations accumulate. Old cached assets persist.

**Root cause**: Registering with `navigator.serviceWorker.register('sw.js?v=X')` creates a **separate registration per query string**. Old registrations with `?v=OLD` are never unregistered. Each runs its own cache independently.

**Fix**: Register without query string: `register('sw.js')`. Add cleanup code to unregister stale registrations. Service worker versioning should use the `CACHE_NAME` constant inside `sw.js` itself.

### 5.4 Cloudflare HTML Cache

**Symptom**: Users receive stale `index.html` that references old `sw.js?v=` version, even after deploying updates.

**Root cause**: Xserver sits behind Cloudflare CDN. Without explicit `Cache-Control: no-cache` headers on `index.html`, Cloudflare caches the HTML file for its default TTL (up to 7 days for static assets).

**Fix**: Add `Cache-Control: no-cache` to `.htaccess` for `index.html`. Ensure SW register URL does not include query params.

---

## 6. Testable Invariants

### Audio Silence Guarantee

```
INVARIANT: masterGain.gain.value === 0 ==> AnalyserNode RMS === 0
```

Regardless of tremolo, phaser, flanger, or any other effect state, setting `masterGain.gain = 0` must produce absolute silence at `audioCtx.destination`. Test by connecting an `AnalyserNode` before `destination`, triggering notes with effects active, and asserting RMS = 0.

### Voice Cleanup After noteOffAll

```
INVARIANT: after noteOffAll() completes:
  - activeVoices.size === 0
  - no AudioBufferSourceNode in 'playing' state (sampler)
  - wafPlayer internal queue is empty (cancelQueue called)
```

### Engine Isolation After Preset Switch

```
INVARIANT: after selectSound() or setEngine():
  - only the selected preset's engine produces sound on noteOn()
  - previous engine's voices are fully cancelled
  - AudioState.instrument matches the selected preset
```

### Service Worker Version Consistency

```
INVARIANT: sw.js CACHE_NAME version === index.html referenced SW version
  - all occurrences of version string in sw.js are identical
  - register() call does not include query parameters
```

### Server Cache Headers

```
INVARIANT: HTTP response for index.html includes:
  - Cache-Control: no-cache (or no-store, or max-age=0)
  - This ensures Cloudflare does not serve stale HTML
```

### Mute Blocks All Sound

```
INVARIANT: _soundMuted === true ==> noteOn() returns without creating any voice
  - activeVoices.size does not increase
  - no AudioNode is created or connected
```

### Auto-Filter Off Means Transparent

```
INVARIANT: autoFilterEnabled === false ==>
  - autoFilter.type === 'lowpass'
  - autoFilter.frequency.value === 20000
  - autoFilter2.frequency.value === 20000
  (both stages are transparent -- no spectral coloring)
```

### Saturation Bypass When Drive=0

```
INVARIANT: saturationDrive === 0 ==>
  - _createVoiceSaturation() returns { input: masterGain, cleanup: null }
  - no WaveShaperNode is created
  (zero overhead when distortion is off)
```

### Voice Re-trigger Kills Previous

```
INVARIANT: noteOn(midi) while activeVoices.has(midi):
  - existing voice's envelope.cancel() is called
  - activeVoices.get(midi) returns the NEW voice, not the old one
  - activeVoices.size does not increase (old entry replaced)
```

---

## Appendix: Node Parameter Defaults

| Node | Parameter | Default Value |
|------|-----------|---------------|
| masterComp | threshold | -12 dB |
| masterComp | ratio | 4:1 |
| masterComp | knee | 12 dB |
| masterReverbGain | gain | 0.08 |
| masterGain | gain | 0.6 (overridden by slider) |
| tremoloNode | gain | 1.0 (base for LFO) |
| tremoloLFO | frequency | 4.5 Hz |
| tremoloGain | gain | 0.0 (depth=0, no modulation) |
| autoFilter | type | lowpass |
| autoFilter | frequency | 20000 Hz (transparent) |
| autoFilter | Q | 4.0 |
| autoFilter2 | (same as autoFilter) | (same) |
| phaserFilters[0..3] | type | allpass |
| phaserFilters[0..3] | frequency | 1500 Hz |
| phaserFilters[0..3] | Q | 0.7 |
| phaserLFO | frequency | 0.4 Hz |
| phaserDepth | gain | 0 (no modulation) |
| phaserWet | gain | 0 (dry only) |
| flangerDelay | delayTime | 0.003 s (3 ms) |
| flangerDelay | maxDelay | 0.02 s (20 ms) |
| flangerFeedback | gain | 0.4 |
| flangerLFO | frequency | 0.25 Hz |
| flangerLFODepth | gain | 0 (no modulation) |
| flangerWet | gain | 0 (dry only) |
| loCutFilter | type | highpass |
| loCutFilter | frequency | 80 Hz |
| loCutFilter | Q | 0.707 (Butterworth) |
| hiCutFilter | type | lowpass |
| hiCutFilter | frequency | 10000 Hz |
| hiCutFilter | Q | 0.707 (Butterworth) |

## Appendix: Reverb Impulse Response Generation

Algorithmic IR, not loaded from file:

- Sample rate: `audioCtx.sampleRate`
- Length: 1.5 seconds (stereo, 2 channels)
- Per-sample: `(random * 2 - 1) * (1 - i/length)^2.8`
- Power decay exponent 2.8 produces a natural-sounding room tail
