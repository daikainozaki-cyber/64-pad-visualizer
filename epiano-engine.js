// ========================================
// E-PIANO PHYSICAL MODELING ENGINE
// ========================================
// Modal synthesis (tine) + nonlinear chain (pickup → preamp → tonestack → poweramp → cabinet)
// Design: urinami-san — "tines are near-pure sine waves; harmonics come from pickup and amp saturation"

// --- LUT size ---
var EP_LUT_SIZE = 1024;

// --- Shared resources (initialized once) ---
var _epHammerNoiseBuf = null;   // AudioBuffer: short filtered noise burst
var _epCabinetNode = null;      // ConvolverNode: shared cabinet IR
var _epCabinetGain = null;      // GainNode: cabinet output level
var _epMetalBuf = null;         // AudioBuffer: pre-computed metallic attack (commuted synthesis)
var _epInitialized = false;
var _epRealIRLoaded = false;    // true when real Twin Reverb IR is loaded

// --- Current LUTs (Float32Array, recomputed on param change) ---
var _epPickupLUT = null;
var _epPreampLUT = null;
var _epPowerampLUT = null;

// --- Current tonestack IIR coefficients ---
var _epTonestackFF = null;  // feedforward (b coefficients)
var _epTonestackFB = null;  // feedback (a coefficients)

// --- E-Piano parameters (UI-controllable) ---
var EpState = {
  pickupSymmetry: 0.0,    // -1..1: vertical offset (0=center, +=more 2nd harmonic)
  pickupDistance: 0.5,     // 0.1..1.0: horizontal gap (closer=more distortion)
  preampGain: 1.0,         // 0.5..5.0: input drive
  tonestackBass: 0.5,      // 0..1
  tonestackMid: 0.5,       // 0..1
  tonestackTreble: 0.5,    // 0..1
  powerampDrive: 1.0,      // 0.5..3.0
  preset: 'Rhodes Stage + Twin',
  // Component mixer (0..2, default 1.0)
  tineBodyMix: 1.0,        // fundamental + tone bar (sustain)
  tineAttackMix: 1.0,      // upper harmonic fast-decay modes ("para")
  hammerClickMix: 1.0,     // detuned osc soft thud
  hammerNoiseMix: 1.0,     // noise buffer mechanical texture
  metalMix: 0.0,           // commuted synthesis metallic attack (default off — experimental)
};

// ========================================
// AMP MODEL PRESETS
// ========================================
var EP_AMP_PRESETS = {
  'Rhodes Stage + Twin': {
    pickupType: 'rhodes',
    preampType: '12AX7',
    powerampType: '6L6',
    useTonestack: true,
    useCabinet: true,
  },
  'Rhodes Suitcase': {
    pickupType: 'rhodes',
    preampType: 'NE5534',
    powerampType: 'GeTr',
    useTonestack: true,
    useCabinet: true,
  },
  'Wurlitzer 200A': {
    pickupType: 'wurlitzer',
    preampType: 'BJT',
    powerampType: 'SS',
    useTonestack: true,
    useCabinet: true,
  },
  'Rhodes DI': {
    pickupType: 'rhodes',
    preampType: null,
    powerampType: null,
    useTonestack: false,
    useCabinet: false,
  },
};

// ========================================
// LUT COMPUTATION FUNCTIONS
// ========================================

function computePickupLUT_Rhodes(symmetry, distance) {
  var lut = new Float32Array(EP_LUT_SIZE);
  // Rhodes PU: electromagnetic pickup — Falaize & Hélie 2017 (IRCAM) equations (25-27)
  // Port-Hamiltonian model: magnet (sphere) + coil + ferrous tine
  //
  // The position-dependent modulation coefficient (velocity factor removed for WaveShaper):
  //   g(q) = [1/f1(q) - 2*Lhor²/f1²(q)] - [1/f2(q) - 2*Lhor²/f2²(q)]
  //   f1(q) = (q - Rp + Lver)² + Lhor²
  //   f2(q) = (q + Rp + Lver)² + Lhor²
  //
  // Lver = vertical offset (voicing) — controls even/odd harmonic balance
  //   Lver=0: tine centered on PU axis → odd harmonics only
  //   Lver>0: tine offset → 2nd harmonic dominates → "bell" quality
  // Lhor = horizontal gap — controls overall nonlinearity strength
  // Rp = coil radius (fixed)
  //
  // Refs: Falaize & Hélie JSV 2017 eq(25-27), Shear 2011 (UCSB)

  var Lhor = distance * 0.3 + 0.15;   // horizontal gap, normalized (0.15-0.45)
  var Lver = symmetry * 0.3 + 0.15;   // vertical offset: always some asymmetry (Rhodes voicing)
  var Rp = 0.25;                       // coil radius, normalized

  var Lhor2 = Lhor * Lhor;

  for (var i = 0; i < EP_LUT_SIZE; i++) {
    var q = (i / (EP_LUT_SIZE - 1)) * 2 - 1; // tine displacement, normalized -1..1

    // Falaize eq(26): f1(q) = (q - Rp + Lver)² + Lhor²
    var d1 = q - Rp + Lver;
    var f1 = d1 * d1 + Lhor2;

    // Falaize eq(27): f2(q) = (q + Rp + Lver)² + Lhor²
    var d2 = q + Rp + Lver;
    var f2 = d2 * d2 + Lhor2;

    // Position-dependent modulation: g(q) from eq(25), velocity factor removed
    // g(q) = [1/f1 - 2*Lhor²/f1²] - [1/f2 - 2*Lhor²/f2²]
    var g1 = 1.0 / f1 - 2.0 * Lhor2 / (f1 * f1);
    var g2 = 1.0 / f2 - 2.0 * Lhor2 / (f2 * f2);
    lut[i] = g1 - g2;
  }

  // Remove DC offset at LUT center (input=0) to prevent WaveShaper bias
  var dcOffset = lut[Math.floor(EP_LUT_SIZE / 2)];
  for (var i = 0; i < EP_LUT_SIZE; i++) lut[i] -= dcOffset;
  // Normalize to -1..1
  var maxVal = 0;
  for (var i = 0; i < EP_LUT_SIZE; i++) {
    if (Math.abs(lut[i]) > maxVal) maxVal = Math.abs(lut[i]);
  }
  if (maxVal > 0) {
    for (var i = 0; i < EP_LUT_SIZE; i++) lut[i] /= maxVal;
  }
  return lut;
}

function computePickupLUT_Wurlitzer(distance) {
  var lut = new Float32Array(EP_LUT_SIZE);
  var d0 = distance * 0.5 + 0.2; // base gap
  for (var i = 0; i < EP_LUT_SIZE; i++) {
    var x = (i / (EP_LUT_SIZE - 1)) * 2 - 1; // -1..1
    // Electrostatic: capacitance ∝ 1/(d0+x), clamp to avoid division by zero
    var displacement = x * 0.8; // scale to physical range
    lut[i] = 1.0 / (d0 + displacement) - 1.0 / d0; // zero-centered
  }
  // Normalize
  var maxVal = 0;
  for (var i = 0; i < EP_LUT_SIZE; i++) {
    if (Math.abs(lut[i]) > maxVal) maxVal = Math.abs(lut[i]);
  }
  if (maxVal > 0) {
    for (var i = 0; i < EP_LUT_SIZE; i++) lut[i] /= maxVal;
  }
  return lut;
}

function computePreampLUT_12AX7() {
  // Twin Reverb AB763 first preamp stage — Koren model with circuit operating point
  // Circuit: 12AX7 triode, Ra=100kΩ, Rk=1.5kΩ (bypassed), Vb+=330V
  // Operating point: Vgk_bias ≈ -1.5V, Vp ≈ 190V, Ip ≈ 1.4mA
  // Grid swing: ±3V max before grid conduction / cutoff
  // Refs: Koren tube model, fenderguru.com AB763 schematic
  var lut = new Float32Array(EP_LUT_SIZE);
  var mu = 100, ex = 1.4, kG1 = 1060, kP = 600, kVB = 300;
  // Circuit params
  var Vb = 330;       // B+ supply voltage
  var Ra = 100000;    // plate load resistor (100kΩ)
  var Vgk_bias = -1.5; // grid bias from cathode resistor
  var gridSwing = 3.0;  // max grid voltage swing (±3V)

  // First pass: compute raw plate voltages across input range
  var rawOut = new Float32Array(EP_LUT_SIZE);
  for (var i = 0; i < EP_LUT_SIZE; i++) {
    var x = (i / (EP_LUT_SIZE - 1)) * 2 - 1; // -1..1 input
    var Vgk = Vgk_bias + x * gridSwing;
    // Grid conduction clamp: grid can't go much above 0V
    if (Vgk > 0.3) Vgk = 0.3 + (Vgk - 0.3) * 0.05; // hard clip at grid conduction
    // Iterative load line: Vp = Vb - Ip*Ra, Ip = f(Vgk, Vp)
    // Use 3 Newton iterations for convergence
    var Vp = 190; // initial guess (operating point)
    for (var iter = 0; iter < 3; iter++) {
      var E1 = Math.log(1 + Math.exp(kP * (1/mu + Vgk / Math.sqrt(kVB + Vp*Vp)))) / kP;
      var Ip = Math.pow(Math.max(E1, 0), ex) / kG1;
      Vp = Vb - Ip * Ra;
      if (Vp < 0) Vp = 0; // plate can't go negative
    }
    rawOut[i] = Vp;
  }

  // Normalize: center at operating point, scale to -1..1
  var Vp_rest = rawOut[Math.floor(EP_LUT_SIZE / 2)];
  var maxSwing = 0;
  for (var i = 0; i < EP_LUT_SIZE; i++) {
    lut[i] = rawOut[i] - Vp_rest;
    if (Math.abs(lut[i]) > maxSwing) maxSwing = Math.abs(lut[i]);
  }
  // Invert: increasing grid voltage → decreasing plate voltage (common cathode)
  if (maxSwing > 0) {
    for (var i = 0; i < EP_LUT_SIZE; i++) lut[i] = -lut[i] / maxSwing;
  }
  return lut;
}

function computePreampLUT_NE5534() {
  // Op-amp: linear until rail, then hard clip with slight softening
  var lut = new Float32Array(EP_LUT_SIZE);
  var rail = 0.85;
  for (var i = 0; i < EP_LUT_SIZE; i++) {
    var x = (i / (EP_LUT_SIZE - 1)) * 2 - 1;
    if (Math.abs(x) < rail) {
      lut[i] = x;
    } else {
      var excess = (Math.abs(x) - rail) / (1 - rail);
      lut[i] = (x > 0 ? 1 : -1) * (rail + (1 - rail) * Math.tanh(excess * 3));
    }
  }
  return lut;
}

function computePreampLUT_BJT() {
  // Bipolar transistor: moderate soft clip
  var lut = new Float32Array(EP_LUT_SIZE);
  for (var i = 0; i < EP_LUT_SIZE; i++) {
    var x = (i / (EP_LUT_SIZE - 1)) * 2 - 1;
    // Asymmetric: NPN clips positive harder
    lut[i] = x >= 0
      ? Math.tanh(x * 2.0) * 0.9
      : Math.tanh(x * 1.5) * 1.05;
  }
  return lut;
}

function computePowerampLUT_6L6() {
  // Push-pull Class AB: even harmonics cancel, crossover region
  var lut = new Float32Array(EP_LUT_SIZE);
  for (var i = 0; i < EP_LUT_SIZE; i++) {
    var x = (i / (EP_LUT_SIZE - 1)) * 2 - 1;
    var tubeA = Math.tanh(x * 1.5 + 0.05);  // slight bias offset
    var tubeB = Math.tanh(-x * 1.5 + 0.05);
    lut[i] = (tubeA - tubeB) * 0.5;
  }
  return lut;
}

function computePowerampLUT_GeTr() {
  // Germanium transistor: softer than silicon, warmer clipping
  var lut = new Float32Array(EP_LUT_SIZE);
  for (var i = 0; i < EP_LUT_SIZE; i++) {
    var x = (i / (EP_LUT_SIZE - 1)) * 2 - 1;
    // Cubic soft clipper (germanium-like rounded knee)
    if (Math.abs(x) < 0.667) {
      lut[i] = x - (x * x * x) / 3;
    } else {
      lut[i] = (x > 0 ? 1 : -1) * 0.667;
    }
  }
  return lut;
}

function computePowerampLUT_SS() {
  // Solid-state: quasi-complementary output, harder clip
  var lut = new Float32Array(EP_LUT_SIZE);
  for (var i = 0; i < EP_LUT_SIZE; i++) {
    var x = (i / (EP_LUT_SIZE - 1)) * 2 - 1;
    lut[i] = Math.tanh(x * 2.5) * 0.85;
  }
  return lut;
}

// ========================================
// TONESTACK (Fender TMB — IIR coefficients)
// ========================================
// Simplified Fender tonestack using 3 cascaded biquads
// (Full Yeh & Smith 2006 3rd-order IIR approximated as lowshelf + peaking + highshelf)

function computeTonestackBiquads(bass, mid, treble, sr) {
  // Returns array of 3 biquad parameter objects for BiquadFilterNode
  // Twin Reverb AB763 character approximation
  return [
    {
      type: 'lowshelf',
      frequency: 250,
      gain: (bass - 0.5) * 20,  // ±10 dB
    },
    {
      type: 'peaking',
      frequency: 800,
      Q: 1.2,
      gain: (mid - 0.5) * 16,   // ±8 dB (Twin has no mid pot, but we add it)
    },
    {
      type: 'highshelf',
      frequency: 3000,
      gain: (treble - 0.5) * 20, // ±10 dB
    },
  ];
}

// ========================================
// PER-KEY VARIATION TABLE (Rhodes individuality)
// ========================================
// Real Rhodes pianos have per-key variation from manufacturing tolerances,
// aging, repair history, and tine/pickup alignment differences.
// "Perfect" parameters sound like a synth. Imperfection = warmth.
// Vintage Vibe parts are "too hi-fi" because they're too uniform.
// Seed-based pseudo-random: deterministic per key, different per key.

var _epKeyVariation = null;

function _initKeyVariation() {
  if (_epKeyVariation) return;
  _epKeyVariation = new Array(128);
  for (var k = 0; k < 128; k++) {
    // Simple deterministic hash per key (no Math.random — reproducible)
    var seed = k * 2654435761; // Knuth multiplicative hash
    var h = function(s) { s = ((s >>> 16) ^ s) * 0x45d9f3b; s = ((s >>> 16) ^ s) * 0x45d9f3b; return ((s >>> 16) ^ s) / 4294967296; };
    _epKeyVariation[k] = {
      lverOffset:    (h(seed)     - 0.5) * 0.06,  // ±3% voicing alignment
      lhorOffset:    (h(seed + 1) - 0.5) * 0.04,  // ±2% gap distance
      tonebarDetune: (h(seed + 2) - 0.5) * 0.008, // ±0.4% tonebar detuning
      decayScale:    0.92 + h(seed + 3) * 0.16,    // 0.92-1.08 decay variation
      hammerHard:    0.90 + h(seed + 4) * 0.20,    // 0.90-1.10 hammer hardness
    };
  }
}

// ========================================
// MODE FREQUENCIES (Modal Synthesis)
// ========================================

function computeModeFrequencies(midiNote, velocity) {
  _initKeyVariation();
  var kv = _epKeyVariation[midiNote] || _epKeyVariation[60]; // fallback to middle C

  var f0 = 440 * Math.pow(2, (midiNote - 69) / 12);
  velocity = velocity || 0.5;
  // Velocity scaling: harder hit excites upper modes disproportionately
  // Hammer stiffens under compression → shorter contact → more HF energy
  // Per-key hammer hardness variation affects this relationship
  var velPow = Math.pow(velocity, 1.5) * kv.hammerHard;
  var pitchScale = Math.pow(2, -(midiNote - 21) / 24); // higher pitch = faster decay
  var decayVar = kv.decayScale; // per-key decay variation

  // Beam mode decay: velocity-dependent (urinami-san 2026-03-22)
  // Harder strike = shorter hammer contact = sharper excitation pulse
  // = upper modes get MORE energy but also decay FASTER
  // Soft strike = longer contact = gentler excitation = upper modes barely excited
  var velDecayScale = 1.0 - velocity * 0.4; // hard hit: 0.6×, soft: 1.0×

  return {
    // MEASURED ratios (Gabrielli 2020 via Sonderboe 2024):
    //   beam mode 2 = 7.11×, beam mode 3 = 20.25×
    // Very sparse — huge jumps between modes = thin steel rod character
    frequencies: [
      f0,                              // tine fundamental
      f0 * (1.005 + kv.tonebarDetune), // tone bar (slightly detuned + per-key variation)
      f0 * 7.11,                       // beam mode 2 — MEASURED (Gabrielli)
      f0 * 20.25,                      // beam mode 3 — MEASURED (Gabrielli)
    ],
    amplitudes: [
      1.0,                    // fundamental — always dominant
      0.3,                    // tone bar — sustain body
      0.08 + velPow * 0.15,   // beam mode 2 — velocity-dependent (0.08-0.23)
      0.02 + velPow * 0.06,   // beam mode 3 — mostly on hard hits (0.02-0.08)
    ],
    decayTimes: [
      2.5 * pitchScale * decayVar,                    // tine fundamental
      4.0 * pitchScale * decayVar,                    // tone bar (longest sustain)
      0.035 * pitchScale * decayVar * velDecayScale,   // beam mode 2 (velocity-dependent)
      0.015 * pitchScale * decayVar * velDecayScale,   // beam mode 3 (velocity-dependent)
    ],
  };
}

// ========================================
// METALLIC ATTACK BUFFER (Commuted Synthesis)
// ========================================
// Pre-compute a "struck metal" waveform at reference pitch (A4=440Hz).
// 20+ inharmonic partials with fast decay = dense metallic transient.
// On noteOn, playbackRate shifts to target pitch. One node, many partials.

function _createMetalBuf(ctx) {
  var sr = ctx.sampleRate;
  var len = Math.floor(sr * 0.025); // 25ms — very short burst, metallic then gone
  var buf = ctx.createBuffer(1, len, sr);
  var d = buf.getChannelData(0);
  var refF0 = 440; // reference pitch = A4

  // Euler-Bernoulli beam modes + extra inharmonic partials
  // More partials = denser = more metallic
  var partials = [
    // [frequency ratio, amplitude, decay time constant (seconds)]
    // Rhodes tine = clamped-free steel rod (r=0.5mm, L=22-156mm)
    // MEASURED mode ratios (Gabrielli 2020 via Sonderboe 2024):
    //   Mode 2: 7.11×  Mode 3: 20.25×
    // Ideal E-B beam: 6.27, 17.55, 34.39 — measured is HIGHER (tuning spring effect)
    // Key: VERY sparse — huge gaps between modes = thin metal rod character
    //
    // Tone bar: coupled modes near fundamental (beating = shimmer)
    [0.97,   0.12, 0.006],   // tone bar coupled mode (below f0)
    [1.02,   0.10, 0.006],   // tone bar coupled mode (above f0)
    [7.11,   0.25, 0.003],   // beam mode 2 — MEASURED (Gabrielli)
    [20.25,  0.10, 0.002],   // beam mode 3 — MEASURED (Gabrielli)
    [40.0,   0.04, 0.001],   // beam mode 4 — estimated (extrapolated)
    [65.0,   0.02, 0.001],   // beam mode 5 — estimated
  ];

  for (var i = 0; i < len; i++) {
    var t = i / sr;
    var sample = 0;
    for (var p = 0; p < partials.length; p++) {
      var freq = refF0 * partials[p][0];
      if (freq > sr / 2.2) continue; // Nyquist guard
      var amp = partials[p][1];
      var decay = partials[p][2];
      sample += amp * Math.sin(2 * Math.PI * freq * t) * Math.exp(-t / decay);
    }
    d[i] = sample;
  }

  // Normalize peak to 1.0
  var peak = 0;
  for (var i = 0; i < len; i++) {
    if (Math.abs(d[i]) > peak) peak = Math.abs(d[i]);
  }
  if (peak > 0) {
    for (var i = 0; i < len; i++) d[i] /= peak;
  }

  return buf;
}

// ========================================
// REAL CABINET IR LOADER
// ========================================
// Loads measured Twin Reverb IR (Shift Line 1973 Twin 73 pack, free/open)
// Falls back to synthetic IR if fetch fails

function _loadRealCabinetIR(ctx) {
  if (_epRealIRLoaded) return;
  fetch('twin-cab-ir.wav')
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then(function(buf) { return ctx.decodeAudioData(buf); })
    .then(function(decoded) {
      // IR is mono 48kHz — ConvolverNode needs at least 1ch
      _epCabinetNode.buffer = decoded;
      _epRealIRLoaded = true;
    })
    .catch(function(e) {
      // Keep synthetic IR as fallback — no error to user
    });
}

// ========================================
// CABINET IR GENERATION (synthetic fallback)
// ========================================

function _createCabinetIR(ctx, type) {
  // Synthetic cabinet impulse response — Twin Reverb 2x12" Jensen C12N
  // Real speaker: bass resonance ~80Hz, body 200-400Hz,
  // PRESENCE PEAK 3-4kHz (speaker breakup mode — the "sparkle" of Twin),
  // rolloff above 5-6kHz (paper cone natural limit)
  var sr = ctx.sampleRate;
  var len = Math.floor(sr * 0.05); // 50ms
  var buf = ctx.createBuffer(2, len, sr);

  // Mode frequencies and amplitudes modeled from Jensen C12N response curves
  var modes = [
    // [freq, amplitude, decay_rate]
    [80,   0.30, 80],   // bass resonance (cone fundamental)
    [250,  0.25, 100],  // low-mid body
    [600,  0.15, 130],  // mid body
    [1200, 0.12, 150],  // upper mid
    [2500, 0.18, 180],  // presence (building toward peak)
    [3500, 0.25, 200],  // PRESENCE PEAK — speaker breakup, Twin "sparkle"
    [4500, 0.10, 250],  // high-end air (rolling off)
  ];

  for (var ch = 0; ch < 2; ch++) {
    var d = buf.getChannelData(ch);
    for (var i = 0; i < len; i++) {
      var t = i / sr;
      var sample = 0;
      // Initial impulse (direct sound)
      if (i < 3) sample += 0.6;
      // Sum of resonant modes
      for (var m = 0; m < modes.length; m++) {
        var freq = modes[m][0], amp = modes[m][1], dec = modes[m][2];
        sample += amp * Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * dec);
      }
      // Slight stereo spread (dual speakers, slightly different mic positions)
      if (ch === 1 && i > 0) {
        d[i] = sample * 0.95; // subtle level difference
      } else {
        d[i] = sample;
      }
    }
  }
  return buf;
}

// ========================================
// HAMMER NOISE BUFFER
// ========================================

function _createHammerNoiseBuf(ctx) {
  var sr = ctx.sampleRate;
  var len = Math.floor(sr * 0.003); // 3ms — very short metallic click
  var buf = ctx.createBuffer(1, len, sr);
  var d = buf.getChannelData(0);
  // Simple 1-pole highpass to remove low freq content (metal click = high freq)
  var prev = 0;
  for (var i = 0; i < len; i++) {
    var t = i / len;
    var raw = (Math.random() * 2 - 1) * Math.exp(-t * 15); // fast decay
    // Highpass: output = current - previous (differentiator ≈ HPF)
    d[i] = raw - prev * 0.7;
    prev = raw;
  }
  return buf;
}

// ========================================
// INITIALIZATION
// ========================================

function epianoInit(ctx, masterDest) {
  if (_epInitialized) return;

  // Hammer noise buffer (shared, reused by all voices)
  _epHammerNoiseBuf = _createHammerNoiseBuf(ctx);

  // Metallic attack buffer (commuted synthesis, shared)
  _epMetalBuf = _createMetalBuf(ctx);

  // Cabinet IR convolver (shared) — start with synthetic, upgrade to real IR async
  _epCabinetNode = ctx.createConvolver();
  _epCabinetNode.buffer = _createCabinetIR(ctx, 'twin'); // fallback synthetic
  _epCabinetGain = ctx.createGain();
  _epCabinetGain.gain.setValueAtTime(6.0, 0); // real IR is quieter than synthetic — boost
  _epCabinetNode.connect(_epCabinetGain);
  _epCabinetGain.connect(masterDest);

  // Load real Twin Reverb IR (1973 Twin + JBL D120F, Shift Line free pack)
  // Async: replaces synthetic IR when ready. No audible gap — just gets better.
  _loadRealCabinetIR(ctx);

  // Default LUTs
  epianoUpdateLUTs();
  _epInitialized = true;
}

function epianoUpdateLUTs() {
  var preset = EP_AMP_PRESETS[EpState.preset] || EP_AMP_PRESETS['Rhodes Stage + Twin'];

  // Pickup LUT
  if (preset.pickupType === 'wurlitzer') {
    _epPickupLUT = computePickupLUT_Wurlitzer(EpState.pickupDistance);
  } else {
    _epPickupLUT = computePickupLUT_Rhodes(EpState.pickupSymmetry, EpState.pickupDistance);
  }

  // Preamp LUT
  if (preset.preampType === '12AX7') {
    _epPreampLUT = computePreampLUT_12AX7();
  } else if (preset.preampType === 'NE5534') {
    _epPreampLUT = computePreampLUT_NE5534();
  } else if (preset.preampType === 'BJT') {
    _epPreampLUT = computePreampLUT_BJT();
  } else {
    _epPreampLUT = null;
  }

  // Poweramp LUT
  if (preset.powerampType === '6L6') {
    _epPowerampLUT = computePowerampLUT_6L6();
  } else if (preset.powerampType === 'GeTr') {
    _epPowerampLUT = computePowerampLUT_GeTr();
  } else if (preset.powerampType === 'SS') {
    _epPowerampLUT = computePowerampLUT_SS();
  } else {
    _epPowerampLUT = null;
  }
}

// ========================================
// VOICE CREATION (noteOn)
// ========================================

function epianoNoteOn(ctx, midi, velocity, masterDest) {
  if (!_epInitialized) epianoInit(ctx, masterDest);

  var preset = EP_AMP_PRESETS[EpState.preset] || EP_AMP_PRESETS['Rhodes Stage + Twin'];
  var now = ctx.currentTime;
  var modes = computeModeFrequencies(midi, velocity);
  var nodes = []; // track all nodes for cleanup

  // --- 1. Modal synthesis: OscillatorNodes ---
  // Hammer strike energy: physically limited by key travel distance.
  // Velocity controls hammer speed, but tine displacement has a ceiling.
  // Use sqrt curve to model this saturation (energy ∝ v², displacement ∝ √energy)
  var tineAmplitude = Math.sqrt(velocity) * 0.3; // saturates naturally: 0.3 at v=1.0
  var voiceMixer = ctx.createGain();
  voiceMixer.gain.setValueAtTime(tineAmplitude, now);
  nodes.push(voiceMixer);

  var oscillators = [];
  for (var m = 0; m < modes.frequencies.length; m++) {
    var freq = modes.frequencies[m];
    if (freq > ctx.sampleRate / 2) continue; // skip above Nyquist

    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    var modeGain = ctx.createGain();
    // modes 0,1 = body (sustain), modes 2+ = attack (fast decay)
    var mixLevel = (m < 2) ? EpState.tineBodyMix : EpState.tineAttackMix;
    var amp = modes.amplitudes[m] * tineAmplitude * mixLevel;
    modeGain.gain.setValueAtTime(amp, now);
    // Exponential decay
    modeGain.gain.setTargetAtTime(0, now, modes.decayTimes[m]);

    osc.connect(modeGain);
    modeGain.connect(voiceMixer);
    osc.start(now);
    oscillators.push(osc);
    nodes.push(osc, modeGain);
  }

  // --- 2. Hammer contact: soft neoprene/rubber thud ---
  // The hammer tip is SOFT (neoprene/rubber). It doesn't "click" like metal.
  // The metallic character comes from tine beam modes + pickup nonlinearity,
  // NOT from the hammer itself. This component models the dull mechanical
  // contact sound — low frequency, rounded envelope.
  var clickOsc1 = ctx.createOscillator();
  clickOsc1.type = 'sine';
  clickOsc1.frequency.setValueAtTime(800 + velocity * 600, now); // 0.8-1.4kHz (soft thud)

  var clickOsc2 = ctx.createOscillator();
  clickOsc2.type = 'sine';
  clickOsc2.frequency.setValueAtTime(1200 + velocity * 800, now); // 1.2-2.0kHz

  var clickEnv = ctx.createGain();
  clickEnv.gain.setValueAtTime(velocity * 0.03 * EpState.hammerClickMix, now);
  clickEnv.gain.setTargetAtTime(0, now, 0.008); // 8ms decay (softer than 3ms)

  clickOsc1.connect(clickEnv);
  clickOsc2.connect(clickEnv);
  clickOsc1.start(now);
  clickOsc2.start(now);
  clickOsc1.stop(now + 0.04);
  clickOsc2.stop(now + 0.04);
  nodes.push(clickOsc1, clickOsc2, clickEnv);

  // Component B: very subtle noise texture (mechanical rattle)
  var noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = _epHammerNoiseBuf;
  noiseSrc.playbackRate.setValueAtTime(1.0 + velocity * 0.5, now);

  var noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(velocity * 0.003 * EpState.hammerNoiseMix, now);

  var clickHPF = ctx.createBiquadFilter();
  clickHPF.type = 'highpass';
  clickHPF.frequency.setValueAtTime(3000, now);
  clickHPF.Q.setValueAtTime(0.5, now);

  noiseSrc.connect(clickHPF);
  clickHPF.connect(noiseGain);
  noiseSrc.start(now);
  nodes.push(noiseSrc, noiseGain, clickHPF);

  // --- 2b. Metallic attack: resonant filter bank ---
  // Impulse → parallel bandpass filters tuned to beam mode frequencies
  // Each filter rings at its resonant frequency, creating dense inharmonic
  // partials that sound "metallic". This is how bells/chimes work.
  // The impulse excites ALL resonances simultaneously = metallic transient.
  if (EpState.metalMix > 0 && _epMetalBuf) {
    // Commuted synthesis: pre-computed metallic attack buffer (20 inharmonic partials)
    // Pitch-shift by playbackRate to match current note
    var metalSrc = ctx.createBufferSource();
    metalSrc.buffer = _epMetalBuf;
    // Buffer was computed at A4 (440Hz). Shift to target pitch.
    var targetF0 = modes.frequencies[0];
    metalSrc.playbackRate.setValueAtTime(targetF0 / 440, now);

    var metalGain = ctx.createGain();
    metalGain.gain.setValueAtTime(velocity * 0.4 * EpState.metalMix, now);

    metalSrc.connect(metalGain);
    metalSrc.start(now);
    nodes.push(metalSrc, metalGain);
  }

  // --- 3. Pickup nonlinearity ---
  // Sum tine oscillators + hammer click + metal resonance before pickup
  var pickupInput = ctx.createGain();
  // Per-key pickup variation (Lver/Lhor offset baked into input gain)
  var kvPU = _epKeyVariation[midi] || _epKeyVariation[60];
  // Pitch-dependent PU input gain (urinami-san 2026-03-22):
  // Low notes: longer tines → larger displacement → drives PU harder → boomy
  // High notes: shorter tines → smaller displacement → PU stays linear → bell-like
  // Magnet size also varies: low = larger magnet, gentler gradient
  var pitchPUScale = 1.0 + Math.max(0, (60 - midi)) * 0.004; // low notes: up to ~1.15× (gentle)
  // Attack boost: tine approaches PU during large displacement (Lhor dynamic change)
  // Falaize model is more sensitive than tanh — keep boost moderate
  var attackBoost = 1.0 + velocity * 0.5 * pitchPUScale; // up to ~1.6× on low forte
  pickupInput.gain.setValueAtTime(attackBoost, now);
  pickupInput.gain.setTargetAtTime(pitchPUScale, now, 0.03); // settle to pitch-dependent baseline
  voiceMixer.connect(pickupInput);
  clickEnv.connect(pickupInput);  // hammer soft thud
  noiseGain.connect(pickupInput); // mechanical texture
  if (EpState.metalMix > 0) metalGain.connect(pickupInput); // metallic resonance
  nodes.push(pickupInput);

  var lastNode = pickupInput;
  if (_epPickupLUT) {
    var pickupWS = ctx.createWaveShaper();
    pickupWS.curve = _epPickupLUT;
    pickupWS.oversample = 'none';
    lastNode.connect(pickupWS);
    lastNode = pickupWS;
    nodes.push(pickupWS);
    // Makeup gain: WaveShaper compresses signal (tanh), restore level
    var pickupMakeup = ctx.createGain();
    pickupMakeup.gain.setValueAtTime(1.8, now);
    lastNode.connect(pickupMakeup);
    lastNode = pickupMakeup;
    nodes.push(pickupMakeup);
  }

  // --- 4. Preamp ---
  if (_epPreampLUT) {
    var preampInputGain = ctx.createGain();
    preampInputGain.gain.setValueAtTime(EpState.preampGain, now);
    lastNode.connect(preampInputGain);
    lastNode = preampInputGain;
    nodes.push(preampInputGain);

    var preampWS = ctx.createWaveShaper();
    preampWS.curve = _epPreampLUT;
    preampWS.oversample = '2x';
    lastNode.connect(preampWS);
    lastNode = preampWS;
    nodes.push(preampWS);
    // Makeup gain after preamp compression
    var preampMakeup = ctx.createGain();
    preampMakeup.gain.setValueAtTime(1.5, now);
    lastNode.connect(preampMakeup);
    lastNode = preampMakeup;
    nodes.push(preampMakeup);
  }

  // --- 5. Tonestack (3 biquads) ---
  if (preset.useTonestack) {
    var tsParams = computeTonestackBiquads(
      EpState.tonestackBass, EpState.tonestackMid, EpState.tonestackTreble, ctx.sampleRate
    );
    for (var b = 0; b < tsParams.length; b++) {
      var bq = ctx.createBiquadFilter();
      bq.type = tsParams[b].type;
      bq.frequency.setValueAtTime(tsParams[b].frequency, now);
      if (tsParams[b].Q !== undefined) bq.Q.setValueAtTime(tsParams[b].Q, now);
      if (tsParams[b].gain !== undefined) bq.gain.setValueAtTime(tsParams[b].gain, now);
      lastNode.connect(bq);
      lastNode = bq;
      nodes.push(bq);
    }
  }

  // --- 6. Poweramp ---
  if (_epPowerampLUT) {
    var powerampInputGain = ctx.createGain();
    powerampInputGain.gain.setValueAtTime(EpState.powerampDrive, now);
    lastNode.connect(powerampInputGain);
    lastNode = powerampInputGain;
    nodes.push(powerampInputGain);

    var powerampWS = ctx.createWaveShaper();
    powerampWS.curve = _epPowerampLUT;
    powerampWS.oversample = '2x';
    lastNode.connect(powerampWS);
    lastNode = powerampWS;
    nodes.push(powerampWS);
    // Makeup gain after poweramp compression
    var powerMakeup = ctx.createGain();
    powerMakeup.gain.setValueAtTime(2.0, now);
    lastNode.connect(powerMakeup);
    lastNode = powerMakeup;
    nodes.push(powerMakeup);
  }

  // --- 7. Route to cabinet or direct ---
  if (preset.useCabinet && _epCabinetNode) {
    lastNode.connect(_epCabinetNode);
  } else {
    lastNode.connect(masterDest);
  }

  // --- Voice envelope object (matching existing interface) ---
  var maxDecay = Math.max.apply(null, modes.decayTimes);
  var stopTime = now + maxDecay * 5; // 5 time constants ≈ silence

  // Schedule auto-stop
  for (var i = 0; i < oscillators.length; i++) {
    oscillators[i].stop(stopTime);
  }

  var _cancelled = false;

  return {
    cancel: function() {
      if (_cancelled) return;
      _cancelled = true;
      var t = ctx.currentTime;
      // Damper: fast exponential decay
      voiceMixer.gain.cancelScheduledValues(t);
      voiceMixer.gain.setValueAtTime(voiceMixer.gain.value, t);
      voiceMixer.gain.setTargetAtTime(0, t, 0.05); // 50ms release
      // Stop oscillators after fadeout
      var releaseStop = t + 0.3;
      for (var i = 0; i < oscillators.length; i++) {
        try { oscillators[i].stop(releaseStop); } catch(_){}
      }
      // Disconnect all nodes after cleanup
      setTimeout(function() {
        for (var i = 0; i < nodes.length; i++) {
          try { nodes[i].disconnect(); } catch(_){}
        }
      }, 500);
    },
  };
}
