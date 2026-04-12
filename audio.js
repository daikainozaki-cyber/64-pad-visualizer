// ========================================
// AUDIO ENGINE
// ========================================
let _soundMuted = false; // Sound ON by default — first pad tap plays immediately
// AudioWorklet e-piano is default. ?node=1 falls back to Web Audio node version.
const _useEpianoWorklet = new URLSearchParams(window.location.search).get('node') !== '1';
// ?amp=twin forces amp preset (dev: V4B/poweramp/cabinet testing)
const _ampPresetParam = new URLSearchParams(window.location.search).get('amp');
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

// --- Auto Filter (Envelope Filter / Auto-Wah) ---
const autoFilter = audioCtx.createBiquadFilter();
autoFilter.type = 'lowpass';
autoFilter.frequency.setValueAtTime(20000, 0); // fully open when off
autoFilter.Q.setValueAtTime(4, 0); // resonance for wah character
const autoFilter2 = audioCtx.createBiquadFilter(); // 2nd stage for 4-pole
autoFilter2.type = 'lowpass';
autoFilter2.frequency.setValueAtTime(20000, 0);
autoFilter2.Q.setValueAtTime(4, 0);
let autoFilterEnabled = false;
let autoFilterDepth = 0.7;  // 0-1: sweep range
let autoFilterSpeed = 0.15; // decay time in seconds
let autoFilterType = 'lowpass';  // 'lowpass' or 'bandpass'
let autoFilterPoles = 2;         // 2 or 4
let autoFilterQ = 2;             // resonance: 1=fat, 10=narrow/vocal

function triggerAutoFilter() {
  if (!autoFilterEnabled) return;
  const now = audioCtx.currentTime;
  var isBP = autoFilterType === 'bandpass';
  // LP: Mu-Tron LP style — sweep 800-8kHz, Q=4 (resonant peak)
  // BP: Cry Baby / Mu-Tron BP — sweep 450-2500Hz, Q=5 (focused wah)
  //     Depth slider = center freq bias (low=bassy, high=bright)
  var hiFreq, loFreq;
  if (isBP) {
    // Cry Baby / Mu-Tron BP: 800-3500Hz sweep
    hiFreq = 800 + autoFilterDepth * 2700;
    loFreq = 350 + autoFilterDepth * 250;
  } else {
    // Mu-Tron LP: 800-8000Hz sweep
    hiFreq = 800 + autoFilterDepth * 7200;
    loFreq = 200 + (1 - autoFilterDepth) * 600;
  }
  autoFilter.Q.setValueAtTime(autoFilterQ, now);
  autoFilter2.Q.setValueAtTime(autoFilterQ, now);
  autoFilter.frequency.cancelScheduledValues(now);
  autoFilter.frequency.setValueAtTime(hiFreq, now);
  autoFilter.frequency.exponentialRampToValueAtTime(loFreq, now + autoFilterSpeed);
  if (autoFilterPoles === 4) {
    autoFilter2.frequency.cancelScheduledValues(now);
    autoFilter2.frequency.setValueAtTime(hiFreq, now);
    autoFilter2.frequency.exponentialRampToValueAtTime(loFreq, now + autoFilterSpeed);
  }
}

// --- Phaser: 4-stage allpass ---
const phaserFilters = [];
for (let i = 0; i < 4; i++) {
  const f = audioCtx.createBiquadFilter();
  f.type = 'allpass';
  f.frequency.setValueAtTime(1500, 0);
  f.Q.setValueAtTime(0.7, 0);
  phaserFilters.push(f);
}
for (let i = 0; i < 3; i++) phaserFilters[i].connect(phaserFilters[i + 1]);
const phaserLFO = audioCtx.createOscillator();
phaserLFO.type = 'sine';
phaserLFO.frequency.setValueAtTime(0.4, 0);
const phaserDepth = audioCtx.createGain();
phaserDepth.gain.setValueAtTime(0, 0);
phaserLFO.connect(phaserDepth);
phaserFilters.forEach(f => phaserDepth.connect(f.frequency));
phaserLFO.start(0);
const phaserWet = audioCtx.createGain();
phaserWet.gain.setValueAtTime(0, 0);
const phaserMix = audioCtx.createGain();
masterGain.connect(tremoloNode);
tremoloNode.connect(autoFilter);
autoFilter.connect(autoFilter2);
autoFilter2.connect(phaserFilters[0]);
phaserFilters[3].connect(phaserWet);
phaserWet.connect(phaserMix);
autoFilter2.connect(phaserMix);

// --- Flanger: modulated short delay ---
const flangerDelay = audioCtx.createDelay(0.02);
flangerDelay.delayTime.setValueAtTime(0.003, 0);
const flangerFeedback = audioCtx.createGain();
flangerFeedback.gain.setValueAtTime(0.4, 0);
flangerDelay.connect(flangerFeedback);
flangerFeedback.connect(flangerDelay);
const flangerLFO = audioCtx.createOscillator();
flangerLFO.type = 'sine';
flangerLFO.frequency.setValueAtTime(0.25, 0);
const flangerLFODepth = audioCtx.createGain();
flangerLFODepth.gain.setValueAtTime(0, 0);
flangerLFO.connect(flangerLFODepth);
flangerLFODepth.connect(flangerDelay.delayTime);
flangerLFO.start(0);
const flangerWet = audioCtx.createGain();
flangerWet.gain.setValueAtTime(0, 0);
const flangerMix = audioCtx.createGain();
phaserMix.connect(flangerDelay);
flangerDelay.connect(flangerWet);
flangerWet.connect(flangerMix);
phaserMix.connect(flangerMix);

// --- Lo Cut (Highpass) & Hi Cut (Lowpass) filters ---
const loCutFilter = audioCtx.createBiquadFilter();
loCutFilter.type = 'highpass';
loCutFilter.frequency.value = 80;
loCutFilter.Q.value = 0.707;
let loCutEnabled = false;

const hiCutFilter = audioCtx.createBiquadFilter();
hiCutFilter.type = 'lowpass';
hiCutFilter.frequency.value = 10000;
hiCutFilter.Q.value = 0.707;
let hiCutEnabled = false;

// Chain: flangerMix → loCut → hiCut → masterComp
// When filters are disabled, bypass by connecting directly
function rebuildFilterChain() {
  flangerMix.disconnect();
  loCutFilter.disconnect();
  hiCutFilter.disconnect();

  let chain = flangerMix;

  if (loCutEnabled) {
    chain.connect(loCutFilter);
    chain = loCutFilter;
  }

  if (hiCutEnabled) {
    chain.connect(hiCutFilter);
    chain = hiCutFilter;
  }

  chain.connect(masterComp);
}

flangerMix.connect(masterComp);

// E-piano output buses. Suitcase spring reverb is handled inside
// epiano-worklet-processor.js now (tank wet merges with dry before the Ge
// preamp so wet/dry share the amp + cabinet). No Web-Audio reverb send here.
const epianoDirectOut = audioCtx.createGain();
epianoDirectOut.gain.setValueAtTime(0.49, 0); // urinami-san default VOL
// Amp output: worklet (with internal amp chain + spring reverb) bypasses
// DI effects chain → masterComp direct.
const epianoAmpOut = audioCtx.createGain();
epianoAmpOut.gain.setValueAtTime(0.49, 0);
epianoAmpOut.connect(masterComp);
// Master drive WaveShaper for e-piano (post-PU, pre-effects).
// Per-voice saturation doesn't work for worklet (single output node).
// This WaveShaper adds nonlinearity → shifts spectral centroid → bell character.
const epianoDriveWS = audioCtx.createWaveShaper();
epianoDriveWS.oversample = '2x';
epianoDriveWS.curve = (function() { var n=256, c=new Float32Array(n); for(var i=0;i<n;i++) c[i]=(i*2/n-1); return c; })(); // linear (no drive)
const epianoDriveMakeup = audioCtx.createGain();
epianoDriveMakeup.gain.setValueAtTime(1.0, 0);
epianoDirectOut.connect(epianoDriveWS);
epianoDriveWS.connect(epianoDriveMakeup);
function _updateEpianoDriveCurve(drive) {
  var n = 256, curve = new Float32Array(n);
  if (drive <= 0) {
    // Linear passthrough
    for (var i = 0; i < n; i++) curve[i] = (i * 2 / n - 1);
  } else {
    // Soft clipping: tanh(x * driveAmount) / tanh(driveAmount)
    // drive 0→1 maps to gain 1→20 (same scale as per-voice saturation)
    var d = 1 + drive * 19;
    var tanhD = Math.tanh(d);
    for (var i = 0; i < n; i++) {
      var x = (i * 2) / n - 1;
      curve[i] = Math.tanh(x * d) / tanhD;
    }
  }
  epianoDriveWS.curve = curve;
  // Makeup gain: soft clip reduces peak, compensate
  epianoDriveMakeup.gain.setValueAtTime(drive > 0 ? 1 + drive * 0.5 : 1.0, 0);
}
// Route through master effects chain (tremolo→autoFilter→phaser→flanger→filters→comp+reverb).
epianoDriveMakeup.connect(tremoloNode);
// Keep epianoReverbSend as no-op for API compatibility (noteOn still references it).
const epianoReverbSend = audioCtx.createGain();
epianoReverbSend.gain.setValueAtTime(0, 0); // reverb now handled by effects chain

// Rotary speaker / tremolo LFO (tremoloNode created above, near masterGain)
const tremoloLFO = audioCtx.createOscillator();
tremoloLFO.type = 'sine';
tremoloLFO.frequency.setValueAtTime(4.5, 0);
const tremoloGain = audioCtx.createGain();
tremoloGain.gain.setValueAtTime(0, 0);
tremoloLFO.connect(tremoloGain);
tremoloGain.connect(tremoloNode.gain); // modulate tremoloNode, not masterGain
tremoloLFO.start(0);

let _audioDecoded = false;
function ensureAudioResumed() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  // Decode SoundFont samples after AudioContext is running
  if (!_audioDecoded) {
    _audioDecoded = true;
    // Decode ALL engines' presets upfront to avoid delay on switch
    Object.values(ENGINES).forEach(eng => {
      Object.values(eng.presets).forEach(inst => {
        if (inst.sampler) {
          _decodeSamplerZones(inst.sampler);
        } else if (inst.data) {
          if (_ensureWafPlayer()) wafPlayer.loader.decodeAfterLoading(audioCtx, inst.data);
        }
      });
    });
    // Pre-initialize e-piano worklet so first noteOn plays immediately
    if (_useEpianoWorklet && typeof epianoWorkletInit === 'function') {
      epianoWorkletInit(audioCtx, epianoDirectOut || masterComp);
    }
  }
}
document.addEventListener('mousedown', ensureAudioResumed, { once: true });
document.addEventListener('touchstart', ensureAudioResumed, { once: true });

function getAudioCtx() { ensureAudioResumed(); return audioCtx; }

// --- WebAudioFont player (lazy — may not be loaded yet if CDN async) ---
var wafPlayer = (typeof WebAudioFontPlayer !== 'undefined') ? new WebAudioFontPlayer() : null;
function _ensureWafPlayer() {
  if (!wafPlayer && typeof WebAudioFontPlayer !== 'undefined') wafPlayer = new WebAudioFontPlayer();
  return wafPlayer;
}

// --- Sampler engine (velocity-layer-aware) ---
const _samplerBuffers = new Map(); // 'instrumentName:zoneIdx' → AudioBuffer
let _samplerDecoded = {};          // instrumentName → true

function _decodeSamplerZones(instrument) {
  if (!instrument || !instrument.zones) return;
  const name = instrument.name;
  if (_samplerDecoded[name]) return;
  _samplerDecoded[name] = true;
  // Deduplicate: some zones share the same base64 data
  const fileCache = new Map(); // base64 hash → Promise<AudioBuffer>
  instrument.zones.forEach((zone, idx) => {
    const key = name + ':' + idx;
    const b64 = zone.file.split(',')[1];
    // Cache key: DJB2 hash of full base64 (position-based sampling collides on baked loops)
    var h = 5381;
    for (var ci = 0; ci < b64.length; ci++) h = ((h << 5) + h + b64.charCodeAt(ci)) | 0;
    const cacheKey = b64.length + ':' + h;
    if (fileCache.has(cacheKey)) {
      fileCache.get(cacheKey).then(buf => { if (buf) _samplerBuffers.set(key, buf); });
      return;
    }
    const promise = new Promise(resolve => {
      try {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        audioCtx.decodeAudioData(bytes.buffer.slice(0)).then(buf => {
          _samplerBuffers.set(key, buf);
          resolve(buf);
        }).catch(() => resolve(null));
      } catch (_) { resolve(null); }
    });
    fileCache.set(cacheKey, promise);
  });
}

function _findSamplerZone(instrument, midi, velocity127) {
  const zones = instrument.zones;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (midi >= z.keyLow && midi <= z.keyHigh &&
        velocity127 >= z.velLow && velocity127 <= z.velHigh)
      return { zone: z, idx: i };
  }
  // Fallback: key match, nearest velocity
  let best = null, bestDist = Infinity;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (midi >= z.keyLow && midi <= z.keyHigh) {
      const d = Math.abs(velocity127 - (z.velLow + z.velHigh) / 2);
      if (d < bestDist) { bestDist = d; best = { zone: z, idx: i }; }
    }
  }
  return best;
}

function _dbgSampler(msg) {
  console.log('[sampler] ' + msg);
}

function _samplerNoteOn(instrument, midi, velocity, dest) {
  const vel127 = Math.round(velocity * 127);
  const match = _findSamplerZone(instrument, midi, vel127);
  if (!match) { _dbgSampler('NO ZONE m=' + midi + ' v=' + vel127); return null; }
  const { zone, idx } = match;
  const bufKey = instrument.name + ':' + idx;
  const buffer = _samplerBuffers.get(bufKey);
  if (!buffer) { _dbgSampler('NO BUF ' + bufKey + ' tot=' + _samplerBuffers.size); return null; }

  try {
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    // Use playbackRate for pitch (WebAudioFont style — detune is buggy in WKWebView)
    var semitones = midi - zone.pitchCenter;
    source.playbackRate.value = Math.pow(2, semitones / 12);

    const voiceGain = audioCtx.createGain();
    const vol = 0.15 + 0.35 * velocity; // polyphony-safe: 4 voices at full vel ≈ 2.0
    voiceGain.gain.setValueAtTime(vol, audioCtx.currentTime);

    // Held-note decay: 2-stage model (Weinreich KTH measurements)
    // "prompt sound" decays fast → "aftersound" sustains longer
    // T60 = time for 60dB decay, pitch-dependent (low=long, high=short)
    const T60 = 45 * Math.pow(2, -(midi - 21) / 18);
    const tauSlow = T60 / 6.91;  // 6.91 = ln(10^3) for 60dB
    const tauFast = tauSlow * 0.25;
    const sustainLevel = vol * Math.max(0.10, 0.80 - (midi - 21) * 0.002);
    voiceGain.gain.setTargetAtTime(sustainLevel, audioCtx.currentTime + 0.005, tauFast);

    // Damper LPF: wide open while held, closes on release (like real Rhodes damper)
    const damperLpf = audioCtx.createBiquadFilter();
    damperLpf.type = 'lowpass';
    damperLpf.frequency.value = 20000; // fully open
    damperLpf.Q.value = 0.707;

    source.connect(damperLpf);
    damperLpf.connect(voiceGain);
    voiceGain.connect(dest);
    source.start(audioCtx.currentTime, 0.01); // skip 10ms MP3 encoder padding

    _dbgSampler('OK m=' + midi + ' z=' + idx + ' st=' + semitones);

    // Release: SFZ ampeg_release (Rhodes damper feel, pitch-dependent fallback)
    const releaseTime = zone.ampRelease || 0.3;
    const releaseTau = releaseTime / 5.0; // ~5 time constants for full decay

    return {
      cancel: function() {
        const now = audioCtx.currentTime;
        voiceGain.gain.cancelScheduledValues(now);
        voiceGain.gain.setValueAtTime(voiceGain.gain.value, now);
        voiceGain.gain.setTargetAtTime(0, now, releaseTau);
        // Damper darkening: LPF closes faster than volume, absorbs high-freq noise
        damperLpf.frequency.setValueAtTime(damperLpf.frequency.value, now);
        damperLpf.frequency.setTargetAtTime(200, now, releaseTau * 0.4);
        source.stop(now + releaseTau * 6);
      }
    };
  } catch (e) {
    _dbgSampler('ERR: ' + e.message);
    return null;
  }
}

// ======== SOUND ENGINES ========
const ENGINES = {
  epiano: {
    name: 'E.PIANO',
    presets: {
      'Rhodes DI':             { epiano: 'Rhodes DI',             label: 'Pad Sensei MK1' },
      'Rhodes DI Spring EXP':  { epiano: 'Rhodes DI Spring EXP',  label: 'Pad Sensei MK1 Spring EXP', epMixerDefaults: { springReverbMix: 0.8, springDwell: 0.95, springFeedbackScale: 0.9, springStereoEnabled: true, attackNoise: 0.0 } },
      'Rhodes Suitcase':       { epiano: 'Rhodes Suitcase',       label: 'Pad Sensei MK1 Suitcase' },
    },
    defaultPreset: 'Rhodes DI',  // internal key unchanged (EP_AMP_PRESETS reference)
  },
};

// 2026-04-07: jRhodes3c sampler REMOVED.
// Physical model (Pad Sensei MK1) surpassed sampler — urinami-san confirmed.
// Saves 35MB lazy-load. Sampler engine code kept in audio.js for future instruments.

// --- Velocity-driven saturation (soft clipping) ---
let saturationDrive = 0; // 0=off, 0.1-1.0=mild-heavy

function _createVoiceSaturation(velocity) {
  if (saturationDrive === 0) return { input: masterGain, cleanup: null };
  var ws = audioCtx.createWaveShaper();
  // Drive scales with velocity squared: low vel → clean, high vel → gritty
  var velDrive = 1 + velocity * velocity * saturationDrive * 20;
  var n = 256, curve = new Float32Array(n);
  var tanhD = Math.tanh(velDrive);
  for (var i = 0; i < n; i++) {
    var x = (i * 2) / n - 1;
    curve[i] = Math.tanh(x * velDrive) / tanhD;
  }
  ws.curve = curve;
  ws.oversample = '2x';
  ws.connect(masterGain);
  return {
    input: ws,
    cleanup: function() { try { ws.disconnect(); } catch(_) {} }
  };
}

const AudioState = {
  engineKey: 'epiano',
  engine: ENGINES['epiano'],
  presetKey: 'Rhodes DI',
  instrument: ENGINES['epiano'].presets['Rhodes DI'],
};

function setEngine(key) {
  if (!ENGINES[key]) return;
  if (_soundMuted) { _soundMuted = false; _updateMuteBtn(); }
  _hideFirstTimeHint();
  noteOffAll();
  AudioState.engineKey = key;
  AudioState.engine = ENGINES[key];
  AudioState.presetKey = AudioState.engine.defaultPreset;
  AudioState.instrument = AudioState.engine.presets[AudioState.presetKey];
  Object.values(AudioState.engine.presets).forEach(p => {
    if (p.sampler) {
      _decodeSamplerZones(p.sampler);
    } else if (p.data) {
      if (_ensureWafPlayer()) wafPlayer.loader.decodeAfterLoading(audioCtx, p.data);
    }
  });
  renderSoundControls();
  saveSoundSettings();
  _updateEpMixerVisibility();
}

function selectSound(combinedValue) {
  var parts = combinedValue.split(':');
  var engKey = parts[0], presetKey = parts.slice(1).join(':');
  if (!ENGINES[engKey] || !ENGINES[engKey].presets[presetKey]) return;
  if (_soundMuted) { _soundMuted = false; _updateMuteBtn(); }
  _hideFirstTimeHint();
  noteOffAll();
  if (engKey !== AudioState.engineKey) {
    AudioState.engineKey = engKey;
    AudioState.engine = ENGINES[engKey];
    Object.values(AudioState.engine.presets).forEach(p => {
      if (p.sampler) _decodeSamplerZones(p.sampler);
      else if (p.data && _ensureWafPlayer()) wafPlayer.loader.decodeAfterLoading(audioCtx, p.data);
    });
  }
  AudioState.presetKey = presetKey;
  AudioState.instrument = AudioState.engine.presets[presetKey];
  _applyPresetEpMixerDefaults();
  saveSoundSettings();
  _updateEpMixerVisibility();
  // Sync TREM implementation (always Vactrol now, kept for consistency)
  var trmSlider = document.getElementById('snd-tremolo');
  if (trmSlider) trmSlider.dispatchEvent(new Event('input'));
  // AMP CHAIN sliders: Twin tonestack only (not shown for Suitcase/DI)
  var ampSec = document.getElementById('ep-amp-section');
  if (ampSec) {
    var preset = EP_AMP_PRESETS[AudioState.instrument.epiano];
    ampSec.style.display = (preset && preset.powerampType === '6L6') ? '' : 'none';
  }
}

function setPreset(name) {
  if (!AudioState.engine.presets[name]) return;
  AudioState.presetKey = name;
  AudioState.instrument = AudioState.engine.presets[name];
  const sel = document.getElementById('organ-preset');
  if (sel) sel.value = AudioState.engineKey + ':' + name;
  saveSoundSettings();
  _updateEpMixerVisibility();
}

function _updateEpMixerVisibility() {
  var sec = document.getElementById('ep-mixer-section');
  if (!sec) return;
  sec.style.display = (AudioState.instrument && AudioState.instrument.epiano) ? '' : 'none';
}

function _applyPresetEpMixerDefaults() {
  var inst = AudioState.instrument;
  if (!inst || !inst.epMixerDefaults) return;
  if (inst.epMixerDefaults.springReverbMix !== undefined) EpState.springReverbMix = inst.epMixerDefaults.springReverbMix;
  if (inst.epMixerDefaults.springDwell !== undefined) EpState.springDwell = inst.epMixerDefaults.springDwell;
  if (inst.epMixerDefaults.springFeedbackScale !== undefined) EpState.springFeedbackScale = inst.epMixerDefaults.springFeedbackScale;
  if (inst.epMixerDefaults.springStereoEnabled !== undefined) EpState.springStereoEnabled = inst.epMixerDefaults.springStereoEnabled;
  var rev = document.getElementById('ep-rev');
  var revVal = document.getElementById('ep-rev-val');
  if (rev) rev.value = EpState.springReverbMix;
  if (revVal) revVal.textContent = EpState.springReverbMix.toFixed(2);
  var dwell = document.getElementById('ep-dwell');
  var dwellVal = document.getElementById('ep-dwell-val');
  if (dwell) dwell.value = EpState.springDwell;
  if (dwellVal) dwellVal.textContent = EpState.springDwell.toFixed(1);
  var decay = document.getElementById('ep-decay');
  var decayVal = document.getElementById('ep-decay-val');
  if (decay) decay.value = EpState.springFeedbackScale;
  if (decayVal) decayVal.textContent = EpState.springFeedbackScale.toFixed(2);
  var stereo = document.getElementById('ep-stereo');
  var stereoVal = document.getElementById('ep-stereo-val');
  if (stereo) stereo.checked = !!EpState.springStereoEnabled;
  if (stereoVal) stereoVal.textContent = EpState.springStereoEnabled ? 'ON' : 'OFF';
  if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
    epianoWorkletUpdateParams({
      springReverbMix: EpState.springReverbMix,
      springDwell: EpState.springDwell,
      springFeedbackScale: EpState.springFeedbackScale,
      springStereoEnabled: EpState.springStereoEnabled,
    });
  }
}

function _saveEpMixer() {
  try {
    localStorage.setItem('64pad-ep-mixer-v2', JSON.stringify({
      pickupSymmetry: EpState.pickupSymmetry,
      springReverbMix: EpState.springReverbMix,
      springDwell: EpState.springDwell,
      springFeedbackScale: EpState.springFeedbackScale,
      springStereoEnabled: EpState.springStereoEnabled,
      attackNoise: EpState.attackNoise,
    }));
  } catch(_) {}
}

function _loadEpMixer() {
  // ?reset=ep in URL → clear ALL sound localStorage and use HTML defaults
  if (location.search.indexOf('reset=ep') >= 0) {
    localStorage.removeItem('64pad-ep-mixer-v2');
    localStorage.removeItem('64pad-sound');
    return;
  }
  try {
    var raw = localStorage.getItem('64pad-ep-mixer-v2');
    if (!raw) return;
    var s = JSON.parse(raw);
    // pickupSymmetry: always use HTML default (physics-calibrated).
    // Old localStorage may have stale values from before PU model changes.
    ['springReverbMix','springDwell','springFeedbackScale','springStereoEnabled','attackNoise'].forEach(function(key) {
      if (s[key] !== undefined) EpState[key] = s[key];
    });
    // MECHANICAL knob controls all 3 noise params equally
    if (s.attackNoise !== undefined) {
      EpState.releaseNoise = s.attackNoise;
      EpState.releaseRing = s.attackNoise;
    }
    // Clear stale pickupSymmetry from storage so it doesn't persist
    if (s.pickupSymmetry !== undefined) {
      delete s.pickupSymmetry;
      localStorage.setItem('64pad-ep-mixer-v2', JSON.stringify(s));
    }
    // Sync sliders
    var map = {pickupSymmetry:'ep-pu-sym', springReverbMix:'ep-rev', springDwell:'ep-dwell', attackNoise:'ep-mechanical'};
    var valMap = {pickupSymmetry:'ep-pu-sym-val', springReverbMix:'ep-rev-val', springDwell:'ep-dwell-val', attackNoise:'ep-mechanical-val'};
    Object.keys(map).forEach(function(key) {
      var sl = document.getElementById(map[key]);
      var vl = document.getElementById(valMap[key]);
      if (sl) sl.value = EpState[key];
      if (vl) vl.textContent = EpState[key].toFixed(2);
    });
  } catch(_) {}
}

function saveSoundSettings() {
  try {
    const s = {};
    s.engine = AudioState.engineKey;
    s.preset = AudioState.presetKey;
    ['snd-volume','snd-tremolo','snd-tremolo-spd','snd-phaser','snd-flanger','snd-locut','snd-hicut','snd-af-depth','snd-af-speed','snd-af-q','snd-drive'].forEach(id => {
      const el = document.getElementById(id);
      if (el) s[id] = el.value;
    });
    const lc = document.getElementById('snd-locut-toggle');
    const hc = document.getElementById('snd-hicut-toggle');
    if (lc) s.loCutEnabled = lc.checked;
    if (hc) s.hiCutEnabled = hc.checked;
    s.autoFilterEnabled = autoFilterEnabled;
    s.autoFilterType = autoFilterType;
    s.autoFilterPoles = autoFilterPoles;
    s.soundMuted = _soundMuted;
    localStorage.setItem('64pad-sound', JSON.stringify(s));
  } catch(_) {}
}

function _showFirstTimeHint() {
  var header = document.getElementById('sound-header');
  if (!header) return;
  var hint = document.createElement('div');
  hint.id = 'sound-first-hint';
  hint.textContent = typeof t === 'function' ? t('ui.sound_hint') : 'Select a preset to enable sound';
  hint.style.cssText = 'font-size:0.65rem;color:#a0a0a0;text-align:center;padding:2px 0;animation:hint-pulse 2s ease-in-out infinite';
  header.parentNode.insertBefore(hint, header);
}

function _hideFirstTimeHint() {
  var hint = document.getElementById('sound-first-hint');
  if (hint) hint.remove();
}

function _showAudioOverlay() {
  var overlay = document.getElementById('audio-start-overlay');
  if (overlay) overlay.classList.add('active');
}

function dismissAudioOverlay() {
  var overlay = document.getElementById('audio-start-overlay');
  if (overlay) overlay.classList.remove('active');
  ensureAudioResumed();
  // Pre-initialize e-piano worklet so first noteOn isn't silent
  if (_useEpianoWorklet && typeof epianoWorkletInit === 'function') {
    var epDest = epianoDirectOut || masterComp;
    epianoWorkletInit(audioCtx, epDest);
  }
  // Auto-select engine if muted (legacy path)
  if (_soundMuted) {
    setEngine('epiano');
    if (typeof soundExpanded !== 'undefined' && !soundExpanded && typeof toggleSoundExpand === 'function') {
      toggleSoundExpand();
    }
  }
  // Persist settings (ensures first-time users get localStorage entry)
  saveSoundSettings();
  // Pad hint only for first-time users (returning users already know)
  if (!localStorage.getItem('64pad-overlay-seen')) {
    localStorage.setItem('64pad-overlay-seen', '1');
    _showPadHint();
  }
}

function _showPadHint() {
  var grid = document.getElementById('pad-grid');
  if (!grid) return;
  // Add pulse animation to pads
  grid.classList.add('pad-hint-pulse');
  // Show floating hint text
  var hint = document.createElement('div');
  hint.id = 'pad-play-hint';
  hint.textContent = typeof t === 'function' ? t('ui.tap_pads') : 'Tap any pad to play!';
  grid.parentNode.insertBefore(hint, grid);
  // Auto-dismiss after 6 seconds if user hasn't tapped
  setTimeout(_hidePadHint, 6000);
}

function _hidePadHint() {
  var hint = document.getElementById('pad-play-hint');
  if (hint) hint.remove();
  var grid = document.getElementById('pad-grid');
  if (grid) grid.classList.remove('pad-hint-pulse');
}

function loadSoundSettings() {
  try {
    const raw = localStorage.getItem('64pad-sound');
    if (!raw) { return; }
    const s = JSON.parse(raw);
    if (s.engine && ENGINES[s.engine]) {
      var wasMuted = _soundMuted;
      setEngine(s.engine);
      if (s.preset && AudioState.engine.presets[s.preset]) setPreset(s.preset);
      // Sync dropdown to combined value
      var sel = document.getElementById('organ-preset');
      if (sel) sel.value = AudioState.engineKey + ':' + AudioState.presetKey;
      // Restore muted state from saved settings (default: unmuted)
      _soundMuted = s.soundMuted !== undefined ? s.soundMuted : false;
      _updateMuteBtn();
    }
    ['snd-volume','snd-tremolo','snd-tremolo-spd','snd-phaser','snd-flanger','snd-locut','snd-hicut','snd-af-depth','snd-af-speed','snd-af-q','snd-drive'].forEach(id => {
      if (s[id] === undefined) return;
      const el = document.getElementById(id);
      if (!el) return;
      el.value = s[id];
      el.dispatchEvent(new Event('input'));
    });
    const lc = document.getElementById('snd-locut-toggle');
    if (lc && s.loCutEnabled !== undefined && lc.checked !== s.loCutEnabled) {
      lc.checked = s.loCutEnabled;
      lc.dispatchEvent(new Event('change'));
    }
    const hc = document.getElementById('snd-hicut-toggle');
    if (hc && s.hiCutEnabled !== undefined && hc.checked !== s.hiCutEnabled) {
      hc.checked = s.hiCutEnabled;
      hc.dispatchEvent(new Event('change'));
    }
    // Restore type/poles BEFORE toggling, so change handler sees correct values
    if (s.autoFilterType) {
      autoFilterType = s.autoFilterType;
      var tb = document.getElementById('snd-af-type');
      if (tb) tb.textContent = autoFilterType === 'lowpass' ? 'LP' : 'BP';
    }
    const af = document.getElementById('snd-af-toggle');
    if (af && s.autoFilterEnabled !== undefined && af.checked !== s.autoFilterEnabled) {
      af.checked = s.autoFilterEnabled;
      af.dispatchEvent(new Event('change'));
    }
    if (s.autoFilterPoles) {
      autoFilterPoles = s.autoFilterPoles;
      var pb = document.getElementById('snd-af-poles');
      if (pb) pb.textContent = autoFilterPoles + 'P';
      if (autoFilterPoles === 2) autoFilter2.frequency.setValueAtTime(20000, audioCtx.currentTime);
    }
  } catch(_) {}
}

function renderSoundControls() {
  const sel = document.getElementById('organ-preset');
  if (!sel) return;
  // HPS gate: Suitcase amp presets are members-only
  var hpsUnlocked = new URLSearchParams(window.location.search).has('hps');
  sel.innerHTML = '';
  Object.entries(ENGINES).forEach(function(entry) {
    var engineKey = entry[0], engine = entry[1];
    Object.entries(engine.presets).forEach(function(pe) {
      var presetKey = pe[0], presetData = pe[1];
      // Skip amp presets (useCabinet=true) for non-HPS users
      var epPreset = EP_AMP_PRESETS[presetData.epiano];
      if (epPreset && epPreset.useCabinet && !hpsUnlocked) return;
      var opt = document.createElement('option');
      opt.value = engineKey + ':' + presetKey;
      opt.textContent = presetData.label;
      sel.appendChild(opt);
    });
  });
  // Fall back to a free preset if current selection was HPS-gated
  var currentValue = AudioState.engineKey + ':' + AudioState.presetKey;
  var hasCurrent = Array.from(sel.options).some(function(o) { return o.value === currentValue; });
  if (!hasCurrent && sel.options.length > 0) {
    var firstKey = sel.options[0].value.split(':').slice(1).join(':');
    AudioState.presetKey = firstKey;
    AudioState.instrument = AudioState.engine.presets[firstKey];
  }
  sel.value = AudioState.engineKey + ':' + AudioState.presetKey;
  // Hide dropdown when only one preset exists
  sel.style.display = sel.options.length <= 1 ? 'none' : '';
}

// --- Voice management ---
const activeVoices = new Map(); // midi → { envelope }

var _SVG_SOUND_OFF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
var _SVG_SOUND_ON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg>';
function _updateMuteBtn() {
  var btn = document.getElementById('sound-mute-btn');
  if (btn) {
    btn.innerHTML = _soundMuted ? _SVG_SOUND_OFF : _SVG_SOUND_ON;
    btn.style.opacity = _soundMuted ? '0.5' : '1';
  }
  // Dim preset selector when muted
  var sel = document.getElementById('organ-preset');
  if (sel) sel.style.opacity = _soundMuted ? '0.4' : '';
}

function toggleSoundMute() {
  _soundMuted = !_soundMuted;
  _updateMuteBtn();
  saveSoundSettings();
}

function noteOn(midi, velocity, poly, _retries) {
  velocity = velocity || 0.8;
  if (_soundMuted) return;
  ensureAudioResumed();
  _hidePadHint();
  // Kill same note if re-triggered
  const existing = activeVoices.get(midi);
  if (existing) {
    try { existing.envelope.cancel(); } catch(_){}
    activeVoices.delete(midi);
  }

  triggerAutoFilter();

  // Per-voice saturation chain (velocity-driven)
  var sat = _createVoiceSaturation(velocity);

  // Route to physics engine, sampler, or WebAudioFont
  let envelope;
  if (AudioState.instrument.epiano) {
    // Physics engine: bypass per-voice saturation (physics chain has 3 nonlinear stages)
    if (sat.cleanup) sat.cleanup();
    EpState.preset = _ampPresetParam === 'twin' ? 'Rhodes Stage + Twin'
                   : _ampPresetParam === 'suit' ? 'Rhodes Suitcase'
                   : _ampPresetParam === 'wurl' ? 'Wurlitzer 200A'
                   : AudioState.instrument.epiano;
    // Room reverb always available (REV knob controls level).
    // Spring reverb is separate (inside amp chain, controlled by E.Piano Mixer).
    var epPreset = EP_AMP_PRESETS[EpState.preset];
    epianoReverbSend.gain.setValueAtTime(1.0, audioCtx.currentTime);
    // DI mode → effects chain (epianoDirectOut). Amp mode → masterComp direct (epianoAmpOut).
    var epDest = (epPreset && epPreset.useCabinet) ? epianoAmpOut : epianoDirectOut;
    envelope = _useEpianoWorklet
      ? epianoWorkletNoteOn(audioCtx, midi, velocity, epDest)
      : epianoNoteOn(audioCtx, midi, velocity, epianoDirectOut);
  } else if (AudioState.instrument.sampler) {
    envelope = _samplerNoteOn(AudioState.instrument.sampler, midi, velocity, sat.input);
  } else {
    if (!_ensureWafPlayer()) return;
    envelope = wafPlayer.queueWaveTable(
      audioCtx, sat.input, AudioState.instrument.data,
      0, midi, 99999, velocity
    );
  }
  if (!envelope) {
    if (sat.cleanup) sat.cleanup();
    _retries = _retries || 0;
    if (_retries < 3) {
      setTimeout(() => noteOn(midi, velocity, poly, _retries + 1), 100);
    }
    return;
  }
  activeVoices.set(midi, { envelope, satCleanup: sat.cleanup });
}

function noteOff(midi) {
  const v = activeVoices.get(midi);
  if (!v) return;
  try { v.envelope.cancel(); } catch(_){}
  // Cleanup saturation nodes after fadeout
  if (v.satCleanup) setTimeout(v.satCleanup, 2000);
  activeVoices.delete(midi);
}

function noteOffAll() {
  for (const [midi, v] of [...activeVoices.entries()]) {
    v.envelope.cancel();
  }
  activeVoices.clear();
  // Kill any lingering WebAudioFont voices not tracked in activeVoices
  if (wafPlayer) wafPlayer.cancelQueue(audioCtx);
}

// Sustain pedal (MIDI CC64). Forwards to worklet for physical model mode.
var _sustainOn = false;
function setSustain(on) {
  _sustainOn = !!on;
  if (_useEpianoWorklet && typeof epianoWorkletSetSustain === 'function') {
    epianoWorkletSetSustain(_sustainOn);
  }
}

// --- Velocity curve (Push 3-style 4-parameter) ---
function applyVelocityCurve(velocity127) {
  const { velThreshold, velDrive, velCompand, velRange } = AppState;
  if (velocity127 <= velThreshold) return 0;
  let x = (velocity127 - velThreshold) / (127 - velThreshold);
  // Drive: power curve (+drive → concave/soft=loud, -drive → convex/need harder)
  const exp = Math.pow(2, -velDrive / 32);
  x = Math.pow(x, exp);
  // Compand: compress(+)/expand(-) dynamic range
  if (velCompand !== 0) {
    const c = velCompand / 64;
    if (c > 0) {
      x = x + c * (0.7 - x) * x * 2;
    } else {
      const a = -c;
      x = x < 0.5
        ? 0.5 * Math.pow(2 * x, 1 + a * 2)
        : 1 - 0.5 * Math.pow(2 * (1 - x), 1 + a * 2);
    }
  }
  return Math.min(1, Math.max(0, x)) * (velRange / 127);
}

function drawVelocityCurve() {
  const canvas = document.getElementById('vel-curve-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
  ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
  ctx.stroke();
  // Diagonal reference (linear)
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.moveTo(0, h); ctx.lineTo(w, 0);
  ctx.stroke();
  // Velocity curve
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= w; i++) {
    const vel127 = (i / w) * 127;
    const out = applyVelocityCurve(vel127);
    const y = h - out * h;
    i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y);
  }
  ctx.stroke();
}

// Global held-note tracking (mouse / touch)
let _heldMidi = null;
const _heldTouches = new Map(); // touch.identifier → midi
document.addEventListener('mouseup', () => {
  if (_heldMidi !== null) {
    noteOff(_heldMidi);
    if (linkMode) { midiActiveNotes.delete(_heldMidi); scheduleMidiUpdate(); }
    _heldMidi = null;
  }
});
document.addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) {
    const midi = _heldTouches.get(t.identifier);
    if (midi !== undefined) {
      noteOff(midi); _heldTouches.delete(t.identifier);
      if (linkMode) { midiActiveNotes.delete(midi); scheduleMidiUpdate(); }
    }
  }
});
document.addEventListener('touchcancel', (e) => {
  for (const t of e.changedTouches) {
    const midi = _heldTouches.get(t.identifier);
    if (midi !== undefined) {
      noteOff(midi); _heldTouches.delete(t.identifier);
      if (linkMode) { midiActiveNotes.delete(midi); scheduleMidiUpdate(); }
    }
  }
});
// Safety: if window loses focus while holding, release all notes
window.addEventListener('blur', () => {
  if (_heldMidi !== null) { noteOff(_heldMidi); _heldMidi = null; }
  _heldTouches.forEach((midi) => noteOff(midi));
  _heldTouches.clear();
  if (linkMode) { midiActiveNotes.clear(); scheduleMidiUpdate(); }
});

function playMidiNotes(midiNotes) {
  midiNotes.forEach(m => noteOn(m, undefined, true)); // poly=true for chords
  setTimeout(() => { midiNotes.forEach(m => noteOff(m)); }, 600);
}

// Build version — shown in version tag for diagnostics
// Slider labels + live parameter update
onReady(() => {
  // Set initial mute button state
  _updateMuteBtn();
  // Hide CHS export on production (reverse-engineered Chordcat format — dev only)
  if (!IS_DEV) {
    ['btn-chs-export-plain', 'btn-chs-export-mem', 'btn-chs-import'].forEach(function(id) { var b = document.getElementById(id); if (b) b.style.display = 'none'; });
  }
  [['snd-volume','snd-vol-val'],['snd-tremolo','snd-trm-val'],['snd-tremolo-spd','snd-trm-spd-val'],['snd-phaser','snd-phs-val'],['snd-flanger','snd-flg-val']].forEach(([sid, vid]) => {
    const s = document.getElementById(sid);
    const v = document.getElementById(vid);
    if (s && v) s.addEventListener('input', () => {
      v.textContent = sid === 'snd-tremolo-spd' ? parseFloat(s.value).toFixed(1) : parseFloat(s.value).toFixed(2);
      saveSoundSettings();
    });
  });
  // Real-time VOL → masterGain (WebAudioFont) + epianoDirectOut (worklet)
  const volSlider = document.getElementById('snd-volume');
  if (volSlider) volSlider.addEventListener('input', () => {
    const val = parseFloat(volSlider.value);
    masterGain.gain.setValueAtTime(val, audioCtx.currentTime);
    epianoDirectOut.gain.setValueAtTime(val, audioCtx.currentTime);
  });
  // Initialize masterGain + epianoDirectOut from slider
  if (volSlider) {
    masterGain.gain.setValueAtTime(parseFloat(volSlider.value), 0);
    epianoDirectOut.gain.setValueAtTime(parseFloat(volSlider.value), 0);
  }

  // 2026-04-12 Top-bar REV listener removed (HTML element deleted).
  // E.PIANO MIXER → AMOUNT (id=ep-rev) is the single source of truth.

  // Real-time TREM → tremoloGain depth (+ worklet Vactrol for Suitcase)
  const trmSlider = document.getElementById('snd-tremolo');
  if (trmSlider) trmSlider.addEventListener('input', () => {
    var val = parseFloat(trmSlider.value);  // 0-1 (real Rhodes Intensity knob range)
    // Unified tremolo: worklet Vactrol physics for BOTH modes. Kill legacy sine LFO.
    tremoloGain.gain.setValueAtTime(0, audioCtx.currentTime);
    if (AudioState.instrument && AudioState.instrument.epiano && _useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      // Worklet depth uses slider value directly (0-1 matches real Peterson Intensity)
      EpState.tremoloDepth = val;
      EpState.tremoloOn = val > 0;
      epianoWorkletUpdateParams({ tremoloDepth: val, tremoloOn: val > 0 });
    }
  });

  // Real-time SPEED → tremoloLFO frequency (+ worklet for Suitcase)
  const trmSpd = document.getElementById('snd-tremolo-spd');
  if (trmSpd) trmSpd.addEventListener('input', () => {
    var val = parseFloat(trmSpd.value);
    tremoloLFO.frequency.setValueAtTime(val, audioCtx.currentTime);
    if (AudioState.instrument && AudioState.instrument.epiano && _useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      EpState.tremoloFreq = val;
      epianoWorkletUpdateParams({ tremoloFreq: val });
    }
  });

  // Real-time PHASE → phaser depth + wet mix
  const phsSlider = document.getElementById('snd-phaser');
  if (phsSlider) phsSlider.addEventListener('input', () => {
    const v = parseFloat(phsSlider.value);
    phaserDepth.gain.setValueAtTime(v * 1200, audioCtx.currentTime);
    phaserWet.gain.setValueAtTime(v, audioCtx.currentTime);
  });

  // Real-time FLANG → flanger depth + wet mix
  const flgSlider = document.getElementById('snd-flanger');
  if (flgSlider) flgSlider.addEventListener('input', () => {
    const v = parseFloat(flgSlider.value);
    flangerLFODepth.gain.setValueAtTime(v * 0.002, audioCtx.currentTime);
    flangerWet.gain.setValueAtTime(v, audioCtx.currentTime);
  });

  // Lo Cut (Highpass) toggle + frequency
  const loCutToggle = document.getElementById('snd-locut-toggle');
  const loCutSlider = document.getElementById('snd-locut');
  const loCutVal = document.getElementById('snd-locut-val');
  if (loCutToggle) loCutToggle.addEventListener('change', () => {
    loCutEnabled = loCutToggle.checked;
    loCutToggle.closest('.ep-knob').classList.toggle('filter-active', loCutEnabled);
    rebuildFilterChain();
    saveSoundSettings();
  });
  if (loCutSlider && loCutVal) {
    loCutSlider.addEventListener('input', () => {
      loCutVal.textContent = parseInt(loCutSlider.value);
      loCutFilter.frequency.setValueAtTime(parseFloat(loCutSlider.value), audioCtx.currentTime);
      saveSoundSettings();
    });
  }

  // Hi Cut (Lowpass) toggle + frequency
  const hiCutToggle = document.getElementById('snd-hicut-toggle');
  const hiCutSlider = document.getElementById('snd-hicut');
  const hiCutVal = document.getElementById('snd-hicut-val');
  if (hiCutToggle) hiCutToggle.addEventListener('change', () => {
    hiCutEnabled = hiCutToggle.checked;
    hiCutToggle.closest('.ep-knob').classList.toggle('filter-active', hiCutEnabled);
    rebuildFilterChain();
    saveSoundSettings();
  });
  if (hiCutSlider && hiCutVal) {
    hiCutSlider.addEventListener('input', () => {
      hiCutVal.textContent = parseInt(hiCutSlider.value);
      hiCutFilter.frequency.setValueAtTime(parseFloat(hiCutSlider.value), audioCtx.currentTime);
      saveSoundSettings();
    });
  }

  // Auto Filter (Envelope Filter) toggle + depth + speed
  const afToggle = document.getElementById('snd-af-toggle');
  const afDepthSlider = document.getElementById('snd-af-depth');
  const afDepthVal = document.getElementById('snd-af-depth-val');
  const afSpeedSlider = document.getElementById('snd-af-speed');
  const afSpeedVal = document.getElementById('snd-af-speed-val');
  if (afToggle) afToggle.addEventListener('change', () => {
    autoFilterEnabled = afToggle.checked;
    afToggle.closest('.ep-knob').classList.toggle('filter-active', autoFilterEnabled);
    var now = audioCtx.currentTime;
    if (!autoFilterEnabled) {
      // Off: force lowpass@20kHz = transparent (BP@20kHz would mute audio)
      autoFilter.type = 'lowpass';
      autoFilter2.type = 'lowpass';
      autoFilter.frequency.cancelScheduledValues(now);
      autoFilter2.frequency.cancelScheduledValues(now);
      autoFilter.frequency.setValueAtTime(20000, now);
      autoFilter2.frequency.setValueAtTime(20000, now);
    } else {
      // On: apply current type and set to envelope start position
      autoFilter.type = autoFilterType;
      autoFilter2.type = autoFilterType;
      var isBP = autoFilterType === 'bandpass';
      var hiFreq = isBP ? 800 + autoFilterDepth * 2700 : 800 + autoFilterDepth * 7200;
      autoFilter.frequency.setValueAtTime(hiFreq, now);
      autoFilter2.frequency.setValueAtTime(hiFreq, now);
    }
    saveSoundSettings();
  });
  if (afDepthSlider && afDepthVal) {
    afDepthSlider.addEventListener('input', () => {
      autoFilterDepth = parseFloat(afDepthSlider.value);
      afDepthVal.textContent = parseFloat(afDepthSlider.value).toFixed(2);
      saveSoundSettings();
    });
  }
  if (afSpeedSlider && afSpeedVal) {
    afSpeedSlider.addEventListener('input', () => {
      autoFilterSpeed = parseFloat(afSpeedSlider.value);
      afSpeedVal.textContent = parseFloat(afSpeedSlider.value).toFixed(2);
      saveSoundSettings();
    });
  }

  // Filter Q (resonance) slider
  const afQSlider = document.getElementById('snd-af-q');
  const afQVal = document.getElementById('snd-af-q-val');
  if (afQSlider && afQVal) {
    afQSlider.addEventListener('input', () => {
      autoFilterQ = parseFloat(afQSlider.value);
      afQVal.textContent = parseFloat(afQSlider.value).toFixed(1);
      saveSoundSettings();
    });
  }

  // Filter type (LP/BP) and poles (2P/4P) switches
  const afTypeBtn = document.getElementById('snd-af-type');
  if (afTypeBtn) afTypeBtn.addEventListener('click', (e) => {
    e.stopPropagation(); e.preventDefault();
    autoFilterType = autoFilterType === 'lowpass' ? 'bandpass' : 'lowpass';
    // Only change node type when filter is ON; OFF keeps lowpass@20kHz (transparent)
    if (autoFilterEnabled) {
      autoFilter.type = autoFilterType;
      autoFilter2.type = autoFilterType;
    }
    afTypeBtn.textContent = autoFilterType === 'lowpass' ? 'LP' : 'BP';
    saveSoundSettings();
  });
  const afPoleBtn = document.getElementById('snd-af-poles');
  if (afPoleBtn) afPoleBtn.addEventListener('click', (e) => {
    e.stopPropagation(); e.preventDefault();
    autoFilterPoles = autoFilterPoles === 2 ? 4 : 2;
    afPoleBtn.textContent = autoFilterPoles + 'P';
    // In 2-pole mode, keep 2nd filter fully open
    if (autoFilterPoles === 2) {
      autoFilter2.frequency.setValueAtTime(20000, audioCtx.currentTime);
    }
    saveSoundSettings();
  });

  // Saturation drive slider
  const driveSlider = document.getElementById('snd-drive');
  const driveVal = document.getElementById('snd-drive-val');
  if (driveSlider && driveVal) {
    driveSlider.addEventListener('input', () => {
      saturationDrive = parseFloat(driveSlider.value);
      driveVal.textContent = parseFloat(driveSlider.value).toFixed(2);
      // Update e-piano master drive WaveShaper
      _updateEpianoDriveCurve(saturationDrive);
      saveSoundSettings();
    });
  }

  // Velocity sensitivity sliders
  const velSliders = [
    ['vel-threshold', 'vel-thr-val', 'velThreshold'],
    ['vel-drive', 'vel-drv-val', 'velDrive'],
    ['vel-compand', 'vel-cmp-val', 'velCompand'],
    ['vel-range', 'vel-rng-val', 'velRange'],
  ];
  velSliders.forEach(([sid, vid, key]) => {
    const s = document.getElementById(sid);
    const v = document.getElementById(vid);
    if (s && v) {
      // Initialize from AppState
      s.value = AppState[key];
      v.textContent = AppState[key];
      s.addEventListener('input', () => {
        AppState[key] = parseInt(s.value);
        v.textContent = s.value;
        drawVelocityCurve();
        saveAppSettings();
      });
    }
  });
  drawVelocityCurve();

  // --- E.Piano Mixer sliders ---
  // Voicing knob (PU Symmetry) — the ONLY tine-side control, same as real Rhodes tech adjustment
  var puSymSlider = document.getElementById('ep-pu-sym');
  var puSymVal = document.getElementById('ep-pu-sym-val');
  if (puSymSlider && puSymVal) puSymSlider.addEventListener('input', () => {
    EpState.pickupSymmetry = parseFloat(puSymSlider.value);
    puSymVal.textContent = parseFloat(puSymSlider.value).toFixed(2);
    if (typeof epianoUpdateLUTs === 'function') epianoUpdateLUTs();
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ pickupSymmetry: EpState.pickupSymmetry });
    }
    _saveEpMixer();
  });

  // PU Distance is fixed by the physical model (not a user knob).
  // Varies by year/model in presets, not by slider.

  // Spring reverb REV knob — controls wet return level (_epReverbPot)
  var epRevSlider = document.getElementById('ep-rev');
  var epRevVal = document.getElementById('ep-rev-val');
  if (epRevSlider && epRevVal) epRevSlider.addEventListener('input', () => {
    var val = parseFloat(epRevSlider.value);
    EpState.springReverbMix = val;
    epRevVal.textContent = val.toFixed(2);
    if (typeof _epReverbPot !== 'undefined' && _epReverbPot) {
      _epReverbPot.gain.setValueAtTime(val, audioCtx.currentTime);
    }
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ springReverbMix: val });
    }
    _saveEpMixer();
  });

  // Spring reverb DWELL knob — controls V3 send drive (saturation character)
  var epDwellSlider = document.getElementById('ep-dwell');
  var epDwellVal = document.getElementById('ep-dwell-val');
  if (epDwellSlider && epDwellVal) epDwellSlider.addEventListener('input', () => {
    var val = parseFloat(epDwellSlider.value);
    EpState.springDwell = val;
    epDwellVal.textContent = val.toFixed(1);
    if (typeof _epV3Drive !== 'undefined' && _epV3Drive) {
      // Real pot never reaches true zero (residual resistance + coupling capacitor leakage)
      var driveVal = Math.max(val, 0.5);
      _epV3Drive.gain.setValueAtTime(driveVal, audioCtx.currentTime);
    }
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ springDwell: val });
    }
    _saveEpMixer();
  });

  // Spring reverb DECAY knob — feedback loop gain (T60 length)
  var epDecaySlider = document.getElementById('ep-decay');
  var epDecayVal = document.getElementById('ep-decay-val');
  if (epDecaySlider && epDecayVal) epDecaySlider.addEventListener('input', () => {
    var val = parseFloat(epDecaySlider.value);
    EpState.springFeedbackScale = val;
    epDecayVal.textContent = val.toFixed(2);
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ springFeedbackScale: val });
    }
    _saveEpMixer();
  });

  // Spring reverb STEREO toggle — mono/stereo (tank0→L, tank1→R) decorrelation
  var epStereoToggle = document.getElementById('ep-stereo');
  var epStereoVal = document.getElementById('ep-stereo-val');
  if (epStereoToggle && epStereoVal) epStereoToggle.addEventListener('change', () => {
    var on = !!epStereoToggle.checked;
    EpState.springStereoEnabled = on;
    epStereoVal.textContent = on ? 'ON' : 'OFF';
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ springStereoEnabled: on });
    }
    _saveEpMixer();
  });

  // Mechanical noise — single knob controls all mechanical layers
  var epMechSlider = document.getElementById('ep-mechanical');
  var epMechVal = document.getElementById('ep-mechanical-val');
  if (epMechSlider && epMechVal) epMechSlider.addEventListener('input', () => {
    var val = parseFloat(epMechSlider.value);
    EpState.attackNoise = val;
    EpState.releaseNoise = val;
    epMechVal.textContent = val.toFixed(2);
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ attackNoise: val, releaseNoise: val, releaseRing: val });
    }
    _saveEpMixer();
  });

  // Rhodes level — PU signal volume (0=mute, hear only mechanical)
  var epRhodesSlider = document.getElementById('ep-rhodes');
  var epRhodesVal = document.getElementById('ep-rhodes-val');
  if (epRhodesSlider && epRhodesVal) epRhodesSlider.addEventListener('input', () => {
    var val = parseFloat(epRhodesSlider.value);
    EpState.rhodesLevel = val;
    epRhodesVal.textContent = val.toFixed(2);
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ rhodesLevel: val });
    }
  });

  // Tine radiation — acoustic tine radiation level
  var epTineSlider = document.getElementById('ep-tine');
  var epTineVal = document.getElementById('ep-tine-val');
  if (epTineSlider && epTineVal) epTineSlider.addEventListener('input', () => {
    var val = parseFloat(epTineSlider.value);
    EpState.tineRadiation = val;
    epTineVal.textContent = val.toFixed(2);
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ tineRadiation: val });
    }
    _saveEpMixer();
  });

  renderSoundControls();
  loadSoundSettings();
  _loadEpMixer();
  _updateEpMixerVisibility();
  // Always show tap-to-start overlay (browser requires user gesture for AudioContext)
  _showAudioOverlay();

  // --- AMP CHAIN dev sliders (shown for amp presets: Suitcase/Twin/etc.) ---
  // Show when URL has ?amp=... OR when current preset uses the amp chain
  var isAmpPreset = !!_ampPresetParam ||
    (AudioState.instrument && AudioState.instrument.epiano &&
     EP_AMP_PRESETS[AudioState.instrument.epiano] &&
     EP_AMP_PRESETS[AudioState.instrument.epiano].useCabinet);
  if (isAmpPreset) {
    var ampSec = document.getElementById('ep-amp-section');
    if (ampSec) ampSec.style.display = '';

    function _ampSlider(id, valId, param, fmt) {
      var sl = document.getElementById(id);
      var vl = document.getElementById(valId);
      if (!sl || !vl) return;
      sl.addEventListener('input', function() {
        var v = parseFloat(sl.value);
        vl.textContent = fmt ? fmt(v) : v.toFixed(2);
        var msg = {};
        msg[param] = v;
        if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
          epianoWorkletUpdateParams(msg);
        }
      });
    }
    _ampSlider('ep-v1a-gain', 'ep-v1a-gain-val', 'v1aGain', function(v) { return v.toFixed(0); });
    _ampSlider('ep-v2b-gain', 'ep-v2b-gain-val', 'v2bGain', function(v) { return v.toFixed(0); });
    _ampSlider('ep-v4b-gain', 'ep-v4b-gain-val', 'v4bGain', function(v) { return v.toFixed(1); });
    _ampSlider('ep-pwr-gain', 'ep-pwr-gain-val', 'powerGain', function(v) { return v.toFixed(2); });
    _ampSlider('ep-cab-gain', 'ep-cab-gain-val', 'cabinetGain', function(v) { return v.toFixed(1); });
    _ampSlider('ep-cab-hpf', 'ep-cab-hpf-val', 'cabHPFFreq', function(v) { return v.toFixed(0); });
    _ampSlider('ep-cab-peak', 'ep-cab-peak-val', 'cabPeakFreq', function(v) { return v.toFixed(0); });
    _ampSlider('ep-cab-lpf', 'ep-cab-lpf-val', 'cabLPFFreq', function(v) { return v.toFixed(0); });
    // Tonestack (Bass/Mid/Treble → worklet recomputes biquad coefficients)
    function _tsSlider(id, valId, param) {
      var sl = document.getElementById(id);
      var vl = document.getElementById(valId);
      if (!sl || !vl) return;
      sl.addEventListener('input', function() {
        var v = parseFloat(sl.value);
        vl.textContent = v.toFixed(2);
        EpState['tonestack' + param.charAt(0).toUpperCase() + param.slice(1)] = v;
        if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
          epianoWorkletUpdateParams({});
        }
      });
    }
    _tsSlider('ep-ts-bass', 'ep-ts-bass-val', 'bass');
    _tsSlider('ep-ts-mid', 'ep-ts-mid-val', 'mid');
    _tsSlider('ep-ts-treble', 'ep-ts-treble-val', 'treble');
    // Suitcase: hide MID (Peterson Baxandall is 2-band Bass/Treble only)
    if (_ampPresetParam === 'suit') {
      var midLabel = document.getElementById('ep-ts-mid');
      if (midLabel && midLabel.parentElement) midLabel.parentElement.style.display = 'none';
    }
  }
});
