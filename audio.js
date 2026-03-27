// ========================================
// AUDIO ENGINE
// ========================================
let _soundMuted = true; // Sound OFF by default — user turns on explicitly
// AudioWorklet e-piano is default. ?node=1 falls back to Web Audio node version.
const _useEpianoWorklet = new URLSearchParams(window.location.search).get('node') !== '1';
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// --- Master audio graph ---
// Master compressor bypassed: was squashing e-piano attack transients.
// threshold=-12dB + ratio=4:1 → attack peak compressed → sustain louder → "slow attack" illusion.
// TODO: re-evaluate if needed for other instruments (sampler, organ).
const masterComp = audioCtx.createGain();
masterComp.gain.setValueAtTime(1.0, 0);
masterComp.connect(audioCtx.destination);

const _sr = audioCtx.sampleRate;
// Spring reverb IR synthesis (Twin Reverb 6G15 Accutronics tank character)
// Key physics: helical spring group velocity ∝ √f → higher frequencies arrive first
// → characteristic downward chirp on each reflection. Multiple springs (2-3) with
// different lengths create the dense, metallic quality.
const _rvLen = Math.floor(_sr * 2.5); // springs ring longer than room reverb
const _rvBuf = audioCtx.createBuffer(2, _rvLen, _sr);
for (let _ch = 0; _ch < 2; _ch++) {
  const d = _rvBuf.getChannelData(_ch);
  // Spring reverb v4: Allpass cascade dispersion model
  // Based on: Abel/Smith (DAFx-06), Välimäki/Parker/Abel (JAES 2010), Parker (EURASIP 2011)
  // Key insight: spring chirp = impulse through cascaded allpass filters.
  // NOT sine sweeps. The allpass cascade naturally generates the dense, dispersive chirp
  // with physically correct frequency-dependent delay.
  //
  // Accutronics 4AB3C1B (Twin Reverb tank): 2 springs, ~33ms/~41ms delay, 2.75-4.0s decay

  // --- Step 1: Generate chirp via allpass cascade ---
  // Feed impulse through N cascaded 1st-order allpass filters:
  //   y[n] = a * x[n] + x[n-1] - a * y[n-1]
  // This disperses the impulse into a dense chirp (high freq first, low freq last).
  // N controls chirp duration, a controls chirp character.
  const apCoeff = 0.6;  // allpass coefficient (Abel: 0.5-0.7)
  const numAllpass = 300; // cascade depth (Välimäki: 200-500 for full chirp)

  // Generate one chirp per spring
  const springConfigs = [
    { delay: Math.floor(0.033 * _sr), ap: numAllpass, coeff: apCoeff },       // Spring 1
    { delay: Math.floor(0.041 * _sr), ap: numAllpass + 40, coeff: apCoeff + 0.02 }, // Spring 2 (slightly different)
  ];

  // Temp buffer for building each spring's contribution
  const chirpLen = Math.floor(0.40 * _sr); // chirp spreads over ~400ms (longer tail)
  for (let s = 0; s < springConfigs.length; s++) {
    const sp = springConfigs[s];
    // Start with unit impulse
    const chirp = new Float32Array(chirpLen);
    chirp[0] = 1.0;

    // Cascade allpass filters
    for (let n = 0; n < sp.ap; n++) {
      // Each allpass: y[i] = a*x[i] + x[i-1] - a*y[i-1]
      let prev_x = 0, prev_y = 0;
      for (let i = 0; i < chirpLen; i++) {
        const x = chirp[i];
        const y = sp.coeff * x + prev_x - sp.coeff * prev_y;
        chirp[i] = y;
        prev_x = x;
        prev_y = y;
      }
    }

    // --- Step 2: Add reflections (spring end echoes with feedback) ---
    // Each round-trip adds another dispersed chirp copy, with loss + LPF
    const roundTrip = sp.delay * 2;
    const numReflections = 30;
    const reflGain = 0.88; // more energy retained → longer, deeper tail

    // Stereo: offset between channels
    const stereoOffset = _ch * Math.floor(0.0025 * _sr); // 2.5ms L/R offset

    for (let r = 0; r < numReflections; r++) {
      const reflStart = r * roundTrip + stereoOffset;
      const gain = Math.pow(reflGain, r) * (r === 0 ? 1.0 : 0.9);
      // Alternate polarity on reflections (phase inversion at fixed end)
      const polarity = (r % 2 === 0) ? 1.0 : -1.0;
      for (let i = 0; i < chirpLen; i++) {
        const idx = reflStart + i;
        if (idx >= 0 && idx < _rvLen) {
          d[idx] += chirp[i] * gain * polarity * 15.0 / springConfigs.length;
        }
      }
    }
  }

  // --- Step 3: Frequency-dependent decay (LPF in feedback path) ---
  // High frequencies decay faster than low (spring wire resistance).
  // Apply progressive LPF: stronger at later times.
  const lpfBase = Math.exp(-2 * Math.PI * 5000 / _sr); // 5kHz cutoff
  let lpState = 0;
  for (let pass = 0; pass < 3; pass++) { // 3 passes = steeper rolloff
    lpState = 0;
    for (let i = 0; i < _rvLen; i++) {
      lpState = lpfBase * lpState + (1 - lpfBase) * d[i];
      // Blend: early = original, late = filtered (progressive darkening)
      const t = i / _sr;
      const blend = Math.min(1, t / 2.5); // full LPF after 2.5s (slower darkening)
      d[i] = d[i] * (1 - blend * 0.3) + lpState * blend * 0.3;
    }
  }

  // --- Step 4: Bandpass (spring tank bandwidth ~100Hz-6kHz) ---
  const hpAlpha = 1 - Math.exp(-2 * Math.PI * 100 / _sr);
  const lpAlpha = Math.exp(-2 * Math.PI * 6000 / _sr);
  let hpPrev = 0, lpPrev = 0;
  for (let i = 0; i < _rvLen; i++) {
    const hpOut = d[i] - hpPrev;
    hpPrev += hpAlpha * hpOut;
    lpPrev = lpAlpha * lpPrev + (1 - lpAlpha) * hpOut;
    d[i] = lpPrev;
  }
  // RMS normalize (preserves attack-to-tail ratio better than peak normalize)
  // Peak normalize crushes tail because early chirp dominates.
  let rmsSum = 0;
  for (let i = 0; i < _rvLen; i++) rmsSum += d[i] * d[i];
  const rms = Math.sqrt(rmsSum / _rvLen);
  const targetRms = 0.15; // target RMS level
  if (rms > 0) {
    const scale = targetRms / rms;
    for (let i = 0; i < _rvLen; i++) d[i] *= scale;
    // Soft clip if peaks exceed ±1 (preserve shape, just limit)
    for (let i = 0; i < _rvLen; i++) {
      if (d[i] > 1.0) d[i] = 1.0;
      else if (d[i] < -1.0) d[i] = -1.0;
    }
  }
}
const masterReverb = audioCtx.createConvolver();
masterReverb.buffer = _rvBuf;
const masterReverbGain = audioCtx.createGain();
masterReverbGain.gain.setValueAtTime(0.25, 0); // urinami-san default: warm spring character
masterReverb.connect(masterReverbGain);
masterReverbGain.connect(masterComp);
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

// E-piano output: spring reverb = timbre (part of amp voice), room reverb = space (separate layer).
// "スプリングリバーブって音色なのよ。空間表現と言うより。" — urinami-san (2026-03-23)
// Both coexist: amp's spring reverb colors the tone, master reverb adds room acoustics.
const epianoDirectOut = audioCtx.createGain();
epianoDirectOut.gain.setValueAtTime(0.49, 0); // urinami-san default VOL
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
      'Rhodes DI':        { epiano: 'Rhodes DI', label: 'Rhodes Clean DI' },
      // 'Rhodes Stage + Twin' hidden until spring reverb is ready (separate release).
      // Accidentally deployed — urinami-san caught it 2026-03-27.
    },
    defaultPreset: 'Rhodes DI',
  },
};

// Lazy-load jRhodes3c sampler in background (35MB).
// Clean DI is playable immediately. Sampler appears in preset list when ready.
function _lazyLoadSampler() {
  var script = document.createElement('script');
  script.src = 'jrhodes3c-samples.js?v=4.8.61';
  script.onload = function() {
    if (typeof _jRhodes3c === 'undefined') return;
    // Add sampler preset to epiano engine
    ENGINES.epiano.presets['jRhodes3c'] = {
      sampler: _jRhodes3c,
      label: '1977 Rhodes Mark I (Sampler)',
    };
    // Rebuild preset dropdown to show new option
    if (typeof renderSoundControls === 'function') renderSoundControls();
    // Decode sample zones
    if (typeof _decodeSamplerZones === 'function') _decodeSamplerZones(_jRhodes3c);
    console.log('[64PE] jRhodes3c sampler loaded (background)');
  };
  document.head.appendChild(script);
}
// Start loading after page is interactive (2s delay)
setTimeout(_lazyLoadSampler, 2000);

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
  saveSoundSettings();
  _updateEpMixerVisibility();
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
  // R slider: always hidden. Calibration via console: EpState.beamDecayR=X; epianoWorkletUpdateParams({beamDecayR:X})
  // Per-key curve is the default (beamDecayR=0). Override for A/B testing only.
}

function _saveEpMixer() {
  try {
    localStorage.setItem('64pad-ep-mixer-v2', JSON.stringify({
      pickupSymmetry: EpState.pickupSymmetry,
      springReverbMix: EpState.springReverbMix,
      springDwell: EpState.springDwell,
      beamDecayR: EpState.beamDecayR,
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
    ['springReverbMix','springDwell','beamDecayR'].forEach(function(key) {
      if (s[key] !== undefined) EpState[key] = s[key];
    });
    // Clear stale pickupSymmetry from storage so it doesn't persist
    if (s.pickupSymmetry !== undefined) {
      delete s.pickupSymmetry;
      localStorage.setItem('64pad-ep-mixer-v2', JSON.stringify(s));
    }
    // Sync sliders
    var map = {pickupSymmetry:'ep-pu-sym', springReverbMix:'ep-rev', springDwell:'ep-dwell', beamDecayR:'ep-beam-r'};
    var valMap = {pickupSymmetry:'ep-pu-sym-val', springReverbMix:'ep-rev-val', springDwell:'ep-dwell-val', beamDecayR:'ep-beam-r-val'};
    Object.keys(map).forEach(function(key) {
      var sl = document.getElementById(map[key]);
      var vl = document.getElementById(valMap[key]);
      if (sl) sl.value = EpState[key];
      if (vl) vl.textContent = (key === 'beamDecayR' && EpState[key] === 0) ? 'auto' : EpState[key].toFixed(2);
    });
  } catch(_) {}
}

function saveSoundSettings() {
  try {
    const s = {};
    s.engine = AudioState.engineKey;
    s.preset = AudioState.presetKey;
    ['snd-volume','snd-reverb','snd-tremolo','snd-tremolo-spd','snd-phaser','snd-flanger','snd-locut','snd-hicut','snd-af-depth','snd-af-speed','snd-af-q','snd-drive'].forEach(id => {
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
  // Also show the fullscreen audio overlay for first-time users
  _showAudioOverlay();
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
  // Auto-select Organ if no engine set yet (first-time user)
  if (_soundMuted) {
    setEngine('organ');
    // Expand Sound panel so first-time users see presets/volume
    if (typeof soundExpanded !== 'undefined' && !soundExpanded && typeof toggleSoundExpand === 'function') {
      toggleSoundExpand();
    }
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
    if (!raw) { _showFirstTimeHint(); return; }
    const s = JSON.parse(raw);
    if (s.engine && ENGINES[s.engine]) {
      var wasMuted = _soundMuted;
      setEngine(s.engine);
      if (s.preset && AudioState.engine.presets[s.preset]) setPreset(s.preset);
      // Sync dropdown to combined value
      var sel = document.getElementById('organ-preset');
      if (sel) sel.value = AudioState.engineKey + ':' + AudioState.presetKey;
      // Restore muted state from saved settings (default: muted)
      _soundMuted = s.soundMuted !== undefined ? s.soundMuted : true;
      _updateMuteBtn();
    }
    ['snd-volume','snd-reverb','snd-tremolo','snd-tremolo-spd','snd-phaser','snd-flanger','snd-locut','snd-hicut','snd-af-depth','snd-af-speed','snd-af-q','snd-drive'].forEach(id => {
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
  sel.innerHTML = '';
  Object.entries(ENGINES).forEach(function(entry) {
    var engineKey = entry[0], engine = entry[1];
    Object.entries(engine.presets).forEach(function(pe) {
      var opt = document.createElement('option');
      opt.value = engineKey + ':' + pe[0];
      opt.textContent = pe[1].label;
      sel.appendChild(opt);
    });
  });
  sel.value = AudioState.engineKey + ':' + AudioState.presetKey;
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
    envelope = _useEpianoWorklet
      ? epianoWorkletNoteOn(audioCtx, midi, velocity, epianoDirectOut)
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
  [['snd-reverb','snd-rev-val'],['snd-volume','snd-vol-val'],['snd-tremolo','snd-trm-val'],['snd-tremolo-spd','snd-trm-spd-val'],['snd-phaser','snd-phs-val'],['snd-flanger','snd-flg-val']].forEach(([sid, vid]) => {
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

  // Real-time REV → masterReverbGain (master reverb only; spring reverb is separate)
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

  // Beam decay R knob — per-mode decay multiplier (ear calibration)
  var epBeamRSlider = document.getElementById('ep-beam-r');
  var epBeamRVal = document.getElementById('ep-beam-r-val');
  if (epBeamRSlider && epBeamRVal) epBeamRSlider.addEventListener('input', () => {
    var val = parseFloat(epBeamRSlider.value);
    EpState.beamDecayR = val;
    epBeamRVal.textContent = val === 0 ? 'auto' : val.toFixed(1);
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ beamDecayR: val });
    }
    _saveEpMixer();
  });

  renderSoundControls();
  loadSoundSettings();
  _loadEpMixer();
  _updateEpMixerVisibility();
});
