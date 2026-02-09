// ========================================
// AUDIO ENGINE
// ========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// --- Master audio graph ---
const masterComp = audioCtx.createDynamicsCompressor();
masterComp.threshold.setValueAtTime(-12, 0);
masterComp.ratio.setValueAtTime(4, 0);
masterComp.knee.setValueAtTime(12, 0);
masterComp.connect(audioCtx.destination);

const _sr = audioCtx.sampleRate;
const _rvLen = Math.floor(_sr * 1.5);
const _rvBuf = audioCtx.createBuffer(2, _rvLen, _sr);
for (let _ch = 0; _ch < 2; _ch++) {
  const d = _rvBuf.getChannelData(_ch);
  for (let i = 0; i < _rvLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / _rvLen, 2.8);
}
const masterReverb = audioCtx.createConvolver();
masterReverb.buffer = _rvBuf;
const masterReverbGain = audioCtx.createGain();
masterReverbGain.gain.setValueAtTime(0.08, 0);
masterReverb.connect(masterReverbGain);
masterReverbGain.connect(masterComp);
const masterGain = audioCtx.createGain();
masterGain.gain.setValueAtTime(0.6, 0);

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
masterGain.connect(phaserFilters[0]);
phaserFilters[3].connect(phaserWet);
phaserWet.connect(phaserMix);
masterGain.connect(phaserMix);

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
loCutFilter.frequency.setValueAtTime(80, 0);
loCutFilter.Q.setValueAtTime(0.707, 0);
let loCutEnabled = false;

const hiCutFilter = audioCtx.createBiquadFilter();
hiCutFilter.type = 'lowpass';
hiCutFilter.frequency.setValueAtTime(10000, 0);
hiCutFilter.Q.setValueAtTime(0.707, 0);
let hiCutEnabled = false;

// Chain: flangerMix → loCut → hiCut → masterComp / masterReverb
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
  chain.connect(masterReverb);
}

flangerMix.connect(masterComp);
flangerMix.connect(masterReverb);

// Rotary speaker / tremolo LFO
const tremoloLFO = audioCtx.createOscillator();
tremoloLFO.type = 'sine';
tremoloLFO.frequency.setValueAtTime(4.5, 0);
const tremoloGain = audioCtx.createGain();
tremoloGain.gain.setValueAtTime(0, 0);
tremoloLFO.connect(tremoloGain);
tremoloGain.connect(masterGain.gain);
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
        wafPlayer.loader.decodeAfterLoading(audioCtx, inst.data);
      });
    });
  }
}
document.addEventListener('mousedown', ensureAudioResumed, { once: true });
document.addEventListener('touchstart', ensureAudioResumed, { once: true });

function getAudioCtx() { ensureAudioResumed(); return audioCtx; }

// --- WebAudioFont player + instrument presets ---
const wafPlayer = new WebAudioFontPlayer();

// ======== SOUND ENGINES ========
const ENGINES = {
  organ: {
    name: 'ORGAN',
    presets: {
      'Drawbar':    { data: _tone_0160_FluidR3_GM_sf2_file, label: 'Drawbar Organ' },
      'Percussive': { data: _tone_0170_FluidR3_GM_sf2_file, label: 'Percussive Organ' },
      'Rock':       { data: _tone_0180_FluidR3_GM_sf2_file, label: 'Rock Organ' },
      'Church':     { data: _tone_0190_FluidR3_GM_sf2_file, label: 'Church Organ' },
    },
    defaultPreset: 'Drawbar',
  },
  ep: {
    name: 'E.PIANO',
    presets: {
      'Rhodes 1':  { data: _tone_0040_FluidR3_GM_sf2_file, label: 'Rhodes 1' },
      'Rhodes 2':  { data: _tone_0040_GeneralUserGS_sf2_file, label: 'Rhodes 2' },
      'Rhodes 3':  { data: _tone_0040_Chaos_sf2_file, label: 'Rhodes 3' },
      'Rhodes 4':  { data: _tone_0040_JCLive_sf2_file, label: 'Rhodes 4' },
      'Rhodes 5':  { data: _tone_0040_SBLive_sf2, label: 'Rhodes 5' },
      'FM EP 1':   { data: _tone_0050_FluidR3_GM_sf2_file, label: 'FM EP 1' },
      'FM EP 2':   { data: _tone_0050_GeneralUserGS_sf2_file, label: 'FM EP 2' },
    },
    defaultPreset: 'Rhodes 1',
  },
};

const AudioState = {
  engineKey: 'organ',
  engine: ENGINES['organ'],
  presetKey: 'Drawbar',
  instrument: ENGINES['organ'].presets['Drawbar'],
};

function setEngine(key) {
  if (!ENGINES[key]) return;
  noteOffAll();
  AudioState.engineKey = key;
  AudioState.engine = ENGINES[key];
  AudioState.presetKey = AudioState.engine.defaultPreset;
  AudioState.instrument = AudioState.engine.presets[AudioState.presetKey];
  // Decode new engine's presets
  Object.values(AudioState.engine.presets).forEach(p => {
    wafPlayer.loader.decodeAfterLoading(audioCtx, p.data);
  });
  renderSoundControls();
}

function setPreset(name) {
  if (!AudioState.engine.presets[name]) return;
  AudioState.presetKey = name;
  AudioState.instrument = AudioState.engine.presets[name];
  const sel = document.getElementById('organ-preset');
  if (sel) sel.value = name;
}

function renderSoundControls() {
  // Update engine buttons
  document.querySelectorAll('.engine-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById('eng-' + AudioState.engineKey);
  if (activeBtn) activeBtn.classList.add('active');
  // Update preset dropdown
  const sel = document.getElementById('organ-preset');
  if (sel) {
    sel.innerHTML = '';
    Object.entries(AudioState.engine.presets).forEach(([key, inst]) => {
      const opt = document.createElement('option');
      opt.value = key; opt.textContent = inst.label;
      sel.appendChild(opt);
    });
    sel.value = AudioState.presetKey;
  }
}

// --- Voice management ---
const activeVoices = new Map(); // midi → { envelope }

function noteOn(midi, velocity, poly) {
  ensureAudioResumed();
  // Kill same note if re-triggered
  const existing = activeVoices.get(midi);
  if (existing) {
    try { existing.envelope.cancel(); } catch(_){}
    activeVoices.delete(midi);
  }

  velocity = velocity || 0.8;
  // queueWaveTable: sustain for very long duration, cancel on noteOff
  const envelope = wafPlayer.queueWaveTable(
    audioCtx, masterGain, AudioState.instrument.data,
    0, midi, 99999, velocity
  );
  if (!envelope) return; // Sample not yet decoded
  activeVoices.set(midi, { envelope });
}

function noteOff(midi) {
  const v = activeVoices.get(midi);
  if (!v) return;
  try { v.envelope.cancel(); } catch(_){}
  activeVoices.delete(midi);
}

function noteOffAll() {
  for (const [midi, v] of [...activeVoices.entries()]) {
    v.envelope.cancel();
  }
  activeVoices.clear();
}

// Global held-note tracking (mouse / touch)
let _heldMidi = null;
let _heldTouchMidi = null;
document.addEventListener('mouseup', () => {
  if (_heldMidi !== null) { noteOff(_heldMidi); _heldMidi = null; }
});
document.addEventListener('touchend', () => {
  if (_heldTouchMidi !== null) { noteOff(_heldTouchMidi); _heldTouchMidi = null; }
});
document.addEventListener('touchcancel', () => {
  if (_heldTouchMidi !== null) { noteOff(_heldTouchMidi); _heldTouchMidi = null; }
});
// Safety: if window loses focus while holding, release note
window.addEventListener('blur', () => {
  if (_heldMidi !== null) { noteOff(_heldMidi); _heldMidi = null; }
  if (_heldTouchMidi !== null) { noteOff(_heldTouchMidi); _heldTouchMidi = null; }
});

function playMidiNotes(midiNotes) {
  midiNotes.forEach(m => noteOn(m, undefined, true)); // poly=true for chords
  setTimeout(() => { midiNotes.forEach(m => noteOff(m)); }, 600);
}

// Slider labels + live parameter update
onReady(() => {
  // Hide CHS export on production (reverse-engineered Chordcat format — dev only)
  if (!IS_DEV) {
    ['btn-chs-export-plain', 'btn-chs-export-mem'].forEach(function(id) { var b = document.getElementById(id); if (b) b.style.display = 'none'; });
  }
  [['snd-reverb','snd-rev-val'],['snd-volume','snd-vol-val'],['snd-tremolo','snd-trm-val'],['snd-tremolo-spd','snd-trm-spd-val'],['snd-phaser','snd-phs-val'],['snd-flanger','snd-flg-val']].forEach(([sid, vid]) => {
    const s = document.getElementById(sid);
    const v = document.getElementById(vid);
    if (s && v) s.addEventListener('input', () => {
      v.textContent = sid === 'snd-tremolo-spd' ? parseFloat(s.value).toFixed(1) : parseFloat(s.value).toFixed(2);
    });
  });
  // Real-time VOL → masterGain
  const volSlider = document.getElementById('snd-volume');
  if (volSlider) volSlider.addEventListener('input', () => {
    masterGain.gain.setValueAtTime(parseFloat(volSlider.value), audioCtx.currentTime);
  });
  // Initialize masterGain from slider
  if (volSlider) masterGain.gain.setValueAtTime(parseFloat(volSlider.value), 0);

  // Real-time REV → masterReverbGain
  const revSlider = document.getElementById('snd-reverb');
  if (revSlider) revSlider.addEventListener('input', () => {
    masterReverbGain.gain.setValueAtTime(parseFloat(revSlider.value), audioCtx.currentTime);
  });

  // Real-time TREM → tremoloGain depth
  const trmSlider = document.getElementById('snd-tremolo');
  if (trmSlider) trmSlider.addEventListener('input', () => {
    tremoloGain.gain.setValueAtTime(parseFloat(trmSlider.value), audioCtx.currentTime);
  });

  // Real-time SPEED → tremoloLFO frequency
  const trmSpd = document.getElementById('snd-tremolo-spd');
  if (trmSpd) trmSpd.addEventListener('input', () => {
    tremoloLFO.frequency.setValueAtTime(parseFloat(trmSpd.value), audioCtx.currentTime);
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
  });
  if (loCutSlider && loCutVal) {
    loCutSlider.addEventListener('input', () => {
      loCutVal.textContent = parseInt(loCutSlider.value);
      loCutFilter.frequency.setValueAtTime(parseFloat(loCutSlider.value), audioCtx.currentTime);
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
  });
  if (hiCutSlider && hiCutVal) {
    hiCutSlider.addEventListener('input', () => {
      hiCutVal.textContent = parseInt(hiCutSlider.value);
      hiCutFilter.frequency.setValueAtTime(parseFloat(hiCutSlider.value), audioCtx.currentTime);
    });
  }

  // Preset selector (populated by renderSoundControls)
  const presetSel = document.getElementById('organ-preset');
  if (presetSel) {
    presetSel.addEventListener('change', () => setPreset(presetSel.value));
  }
  renderSoundControls();
});
