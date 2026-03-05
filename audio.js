// ========================================
// AUDIO ENGINE
// ========================================
let _soundMuted = true; // Sound OFF by default — user turns on explicitly
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
loCutFilter.frequency.value = 80;
loCutFilter.Q.value = 0.707;
let loCutEnabled = false;

const hiCutFilter = audioCtx.createBiquadFilter();
hiCutFilter.type = 'lowpass';
hiCutFilter.frequency.value = 10000;
hiCutFilter.Q.value = 0.707;
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
        if (inst.sampler) {
          _decodeSamplerZones(inst.sampler);
        } else if (inst.data) {
          wafPlayer.loader.decodeAfterLoading(audioCtx, inst.data);
        }
      });
    });
  }
}
document.addEventListener('mousedown', ensureAudioResumed, { once: true });
document.addEventListener('touchstart', ensureAudioResumed, { once: true });

function getAudioCtx() { ensureAudioResumed(); return audioCtx; }

// --- WebAudioFont player + instrument presets ---
const wafPlayer = new WebAudioFontPlayer();

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

// Visual debug for sampler noteOn (shows in version tag)
function _dbgSampler(msg) {
  var tag = document.querySelector('.version-tag');
  if (tag) tag.textContent = 'V3.3 ' + msg;
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
      // WebAudioFont (no noise, no velocity layers — clean fallback)
      'Rhodes 1': { data: _tone_0040_FluidR3_GM_sf2_file, label: 'Rhodes 1' },
      'Rhodes 2': { data: _tone_0040_GeneralUserGS_sf2_file, label: 'Rhodes 2' },
      'Rhodes 3': { data: _tone_0040_Chaos_sf2_file, label: 'Rhodes 3' },
      'FM EP 1':  { data: _tone_0050_FluidR3_GM_sf2_file, label: 'FM EP 1' },
      'FM EP 2':  { data: _tone_0050_GeneralUserGS_sf2_file, label: 'FM EP 2' },
      // Sampler (5 velocity layers, baked loops)
      'jRhodes3c': {
        sampler: typeof _jRhodes3c !== 'undefined' ? _jRhodes3c : null,
        label: '1977 Rhodes Mark I (Sampler)',
      },
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
  // Selecting an engine turns sound on
  if (_soundMuted) { _soundMuted = false; _updateMuteBtn(); }
  _hideFirstTimeHint();
  noteOffAll();
  AudioState.engineKey = key;
  AudioState.engine = ENGINES[key];
  AudioState.presetKey = AudioState.engine.defaultPreset;
  AudioState.instrument = AudioState.engine.presets[AudioState.presetKey];
  // Decode new engine's presets
  Object.values(AudioState.engine.presets).forEach(p => {
    if (p.sampler) {
      _decodeSamplerZones(p.sampler);
    } else if (p.data) {
      wafPlayer.loader.decodeAfterLoading(audioCtx, p.data);
    }
  });
  renderSoundControls();
  saveSoundSettings();
}

function setPreset(name) {
  if (!AudioState.engine.presets[name]) return;
  AudioState.presetKey = name;
  AudioState.instrument = AudioState.engine.presets[name];
  const sel = document.getElementById('organ-preset');
  if (sel) sel.value = name;
  saveSoundSettings();
}

function saveSoundSettings() {
  try {
    const s = {};
    s.engine = AudioState.engineKey;
    s.preset = AudioState.presetKey;
    ['snd-volume','snd-reverb','snd-tremolo','snd-tremolo-spd','snd-phaser','snd-flanger','snd-locut','snd-hicut'].forEach(id => {
      const el = document.getElementById(id);
      if (el) s[id] = el.value;
    });
    const lc = document.getElementById('snd-locut-toggle');
    const hc = document.getElementById('snd-hicut-toggle');
    if (lc) s.loCutEnabled = lc.checked;
    if (hc) s.hiCutEnabled = hc.checked;
    s.soundMuted = _soundMuted;
    localStorage.setItem('64pad-sound', JSON.stringify(s));
  } catch(_) {}
}

function _showFirstTimeHint() {
  var header = document.getElementById('sound-header');
  if (!header) return;
  var hint = document.createElement('div');
  hint.id = 'sound-first-hint';
  hint.textContent = I18N && I18N.t ? I18N.t('ui.sound_hint') : 'Select ORGAN or E.PIANO to enable sound';
  hint.style.cssText = 'font-size:0.65rem;color:#4a9eff;text-align:center;padding:2px 0;animation:hint-pulse 2s ease-in-out infinite';
  header.parentNode.insertBefore(hint, header);
}

function _hideFirstTimeHint() {
  var hint = document.getElementById('sound-first-hint');
  if (hint) hint.remove();
}

function loadSoundSettings() {
  try {
    const raw = localStorage.getItem('64pad-sound');
    if (!raw) { _showFirstTimeHint(); return; }
    const s = JSON.parse(raw);
    if (s.engine && ENGINES[s.engine]) {
      // setEngine turns sound on, so temporarily suppress
      var wasMuted = _soundMuted;
      setEngine(s.engine);
      if (s.preset && AudioState.engine.presets[s.preset]) setPreset(s.preset);
      // Restore muted state from saved settings (default: muted)
      _soundMuted = s.soundMuted !== undefined ? s.soundMuted : true;
      _updateMuteBtn();
    }
    ['snd-volume','snd-reverb','snd-tremolo','snd-tremolo-spd','snd-phaser','snd-flanger','snd-locut','snd-hicut'].forEach(id => {
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
  } catch(_) {}
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

function _updateMuteBtn() {
  var btn = document.getElementById('sound-mute-btn');
  if (btn) {
    btn.textContent = _soundMuted ? '\uD83D\uDD07' : '\uD83D\uDD0A';
    btn.style.opacity = _soundMuted ? '0.5' : '1';
  }
  // Dim engine buttons when muted
  document.querySelectorAll('.engine-btn').forEach(function(b) {
    b.style.opacity = _soundMuted ? '0.4' : '';
  });
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
  // Kill same note if re-triggered
  const existing = activeVoices.get(midi);
  if (existing) {
    try { existing.envelope.cancel(); } catch(_){}
    activeVoices.delete(midi);
  }

  // Route to sampler engine or WebAudioFont
  let envelope;
  if (AudioState.instrument.sampler) {
    envelope = _samplerNoteOn(AudioState.instrument.sampler, midi, velocity, masterGain);
  } else {
    envelope = wafPlayer.queueWaveTable(
      audioCtx, masterGain, AudioState.instrument.data,
      0, midi, 99999, velocity
    );
  }
  if (!envelope) {
    // Sample not yet decoded — retry after short delay (up to 3 times)
    _retries = _retries || 0;
    if (_retries < 3) {
      setTimeout(() => noteOn(midi, velocity, poly, _retries + 1), 100);
    }
    return;
  }
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
  // Set initial mute button state
  _updateMuteBtn();
  // Hide CHS export on production (reverse-engineered Chordcat format — dev only)
  if (!IS_DEV) {
    ['btn-chs-export-plain', 'btn-chs-export-mem', 'btn-chs-import'].forEach(function(id) { var b = document.getElementById(id); if (b) b.style.display = 'none'; });
  }
  [['snd-reverb','snd-rev-val'],['snd-volume','snd-vol-val'],['snd-tremolo','snd-trm-val'],['snd-tremolo-spd','snd-trm-spd-val'],['snd-phaser','snd-phs-val'],['snd-flanger','snd-flg-val']].forEach(([sid, vid]) => {
    const s = document.getElementById(sid);
    const v = document.getElementById(vid);
    if (s && v) s.addEventListener('input', () => {
      v.textContent = sid === 'snd-tremolo-spd' ? parseFloat(s.value).toFixed(1) : parseFloat(s.value).toFixed(2);
      saveSoundSettings();
    });
  });
  // Real-time VOL → masterGain (WebAudioFont)
  const volSlider = document.getElementById('snd-volume');
  if (volSlider) volSlider.addEventListener('input', () => {
    const val = parseFloat(volSlider.value);
    masterGain.gain.setValueAtTime(val, audioCtx.currentTime);
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

  // Preset selector (populated by renderSoundControls)
  const presetSel = document.getElementById('organ-preset');
  if (presetSel) {
    presetSel.addEventListener('change', () => { setPreset(presetSel.value); saveSoundSettings(); });
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

  renderSoundControls();
  loadSoundSettings();
});
