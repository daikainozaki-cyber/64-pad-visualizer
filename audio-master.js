// ========================================
// AUDIO MASTER GRAPH
// ========================================
// Split from audio.js (Phase 0.1 / 2026-04-13): the master bus and the
// top-level AudioContext wiring. Everything here must be loaded before
// audio.js so that audioCtx / masterGain / tremoloNode / masterComp are
// available for the effect nodes declared there.
// ========================================
let _soundMuted = false; // Sound ON by default — first pad tap plays immediately
// AudioWorklet e-piano is default. ?node=1 falls back to Web Audio node version.
const _useEpianoWorklet = new URLSearchParams(window.location.search).get('node') !== '1';
// Twin amp preset / AMP CHAIN dev sliders removed 2026-04-13 (Phase 0.3a):
// Twin was frozen and caused repeated routing bugs. Preset definition and
// worklet DSP remain for now but are unreachable from the UI.
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// --- Master audio graph ---
// Master compressor bypassed: was squashing e-piano attack transients.
// threshold=-12dB + ratio=4:1 → attack peak compressed → sustain louder → "slow attack" illusion.
// TODO: re-evaluate if needed for other instruments (sampler, organ).
const masterComp = audioCtx.createGain();
masterComp.gain.setValueAtTime(1.0, 0);
masterComp.connect(audioCtx.destination);

const _sr = audioCtx.sampleRate;
// Spring reverb runs inside the epiano AudioWorklet (Suitcase preset).
// Web-Audio side no longer hosts a master reverb — the tank + Ge preamp
// merging happens entirely within epiano-worklet-processor.js so wet and
// dry share the same power amp and cabinet. See warm-stirring-cake plan.

const masterGain = audioCtx.createGain();
masterGain.gain.setValueAtTime(0.6, 0);

// Tremolo = separate GainNode in signal chain (NOT modulating masterGain).
// masterGain(volume) → tremoloNode(tremolo) → autoFilter → ...
// This prevents Vol=0 + tremolo from leaking sound (additive LFO on gain=0 → ±depth).
const tremoloNode = audioCtx.createGain();
tremoloNode.gain.setValueAtTime(1.0, 0); // base=1, LFO adds ±depth
