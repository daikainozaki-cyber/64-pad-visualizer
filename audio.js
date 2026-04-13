// ========================================
// AUDIO ENGINE
// ========================================
// Master graph (audioCtx / masterComp / masterGain / tremoloNode) lives in
// audio-master.js. Effect chain (Auto Filter / Phaser / Flanger / Lo-Cut /
// Hi-Cut) lives in audio-effects.js. E-piano routing (direct/amp out,
// plate reverb, drive waveshaper, tremolo LFO) lives in audio-reverb.js.
// This file assumes those globals are already defined.
// ========================================

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

// Sampler engine (velocity-layer-aware) lives in audio-sampler.js.

// ======== SOUND ENGINES ========
const ENGINES = {
  epiano: {
    name: 'E.PIANO',
    presets: {
      'Rhodes DI':             { epiano: 'Rhodes DI',             label: 'Pad Sensei MK1' },
      'Rhodes Suitcase':       { epiano: 'Rhodes Suitcase',       label: 'Pad Sensei MK1 Suitcase' },
    },
    defaultPreset: 'Rhodes DI',  // internal key unchanged (EP_AMP_PRESETS reference)
  },
};

// 2026-04-07: jRhodes3c sampler REMOVED.
// Physical model (Pad Sensei MK1) surpassed sampler — urinami-san confirmed.
// Saves 35MB lazy-load. Sampler engine code moved to audio-sampler.js
// (Phase 0.1.d, 2026-04-13) for MRC / PAD DAW reuse.

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
  var isEpiano = !!(AudioState.instrument && AudioState.instrument.epiano);
  sec.style.display = isEpiano ? '' : 'none';
  var epPreset = isEpiano ? EP_AMP_PRESETS[AudioState.instrument.epiano] : null;
  var hasSpring = !!(epPreset && epPreset.useSpringReverb);
  var isSuitcase = !!(epPreset && epPreset.powerampType === 'GeTr');
  // REVERB section: show when preset has spring reverb
  var revSec = document.getElementById('ep-reverb-section');
  if (revSec) revSec.style.display = hasSpring ? '' : 'none';
  // BASS/TREBLE: show for Suitcase (Baxandall EQ)
  var bassLabel = document.getElementById('ep-eq-bass-label');
  var trebleLabel = document.getElementById('ep-eq-treble-label');
  if (bassLabel) bassLabel.style.display = isSuitcase ? '' : 'none';
  if (trebleLabel) trebleLabel.style.display = isSuitcase ? '' : 'none';
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
  var revKnob = EpState.springReverbMix / 1.4 * 9 + 1; // internal → 1-10
  if (rev) rev.value = revKnob;
  if (revVal) revVal.textContent = revKnob.toFixed(1);
  var dwell = document.getElementById('ep-dwell');
  var dwellVal = document.getElementById('ep-dwell-val');
  if (dwell) dwell.value = EpState.springDwell;
  if (dwellVal) dwellVal.textContent = EpState.springDwell.toFixed(1);
  var decay = document.getElementById('ep-decay');
  var decayVal = document.getElementById('ep-decay-val');
  var decayKnob = (EpState.springFeedbackScale - 0.3) / 0.69 * 9 + 1; // internal → 1-10
  if (decay) decay.value = decayKnob;
  if (decayVal) decayVal.textContent = decayKnob.toFixed(1);
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
    // Migrate removed Spring EXP preset → Rhodes DI
    if (s.preset === 'Rhodes DI Spring EXP') s.preset = 'Rhodes DI';
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
    EpState.preset = AudioState.instrument.epiano;
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
    var knob = parseFloat(epRevSlider.value); // 1-10
    var val = (knob - 1) / 9 * 1.4; // → internal 0-1.4
    EpState.springReverbMix = val;
    epRevVal.textContent = knob.toFixed(1);
    if (typeof _epReverbPot !== 'undefined' && _epReverbPot) {
      _epReverbPot.gain.setValueAtTime(val, audioCtx.currentTime);
    }
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ springReverbMix: val });
    }
    _updatePlateRouting();
    _saveEpMixer();
  });

  // Reverb TYPE selector (Spring / Plate)
  var epReverbType = document.getElementById('ep-reverb-type');
  if (epReverbType) epReverbType.addEventListener('change', () => {
    EpState.reverbType = epReverbType.value;
    var isSpring = EpState.reverbType === 'spring';
    // Spring: worklet internal. Plate: audio.js convolver
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ useSpringReverb: isSpring });
    }
    _updatePlateRouting();
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
    var knob = parseFloat(epDecaySlider.value); // 1-10
    var val = 0.3 + (knob - 1) / 9 * 0.69; // → internal 0.3-0.99
    EpState.springFeedbackScale = val;
    epDecayVal.textContent = knob.toFixed(1);
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

  // Suitcase Baxandall EQ — always wire up (runs inside E.PIANO MIXER)
  function _eqSlider(id, valId, param) {
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
  _eqSlider('ep-eq-bass', 'ep-eq-bass-val', 'bass');
  _eqSlider('ep-eq-treble', 'ep-eq-treble-val', 'treble');
});
