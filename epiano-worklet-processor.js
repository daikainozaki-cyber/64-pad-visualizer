// ========================================
// E-PIANO AudioWorklet PROCESSOR
// ========================================
// All DSP runs sample-by-sample inside process(). No Web Audio nodes.
// Modal synthesis (tine) → PU nonlinear (LUT) → preamp → tonestack → V2B → harp LPF
// → V4B bloom → poweramp → output (to ConvolverNode cabinet on main thread).
//
// 3 axioms: ①process() self-contained ②Float32Array for-loops only ③GC zero
//
// Design: urinami-san — "tines are near-pure sine waves; harmonics come from pickup and amp saturation"
// Architecture: PAD DAW Phase 1-4 SoA pattern (GC zero, no new/filter/forEach in process())

// --- Constants ---
var MAX_VOICES = 16;
var LUT_SIZE = 1024;
var LUT_MASK = LUT_SIZE - 1;
var TWO_PI = 2 * Math.PI;

// --- Q-value table (Shear 2011, 1974 Mark I) ---
var Q_TABLE_MIDI = [39,51,59,60,61,62,64,75,87];
var Q_TABLE_VAL  = [949,731,1101,1238,1040,1156,1520,2175,1761];

// --- Euler-Bernoulli cantilever constants ---
var BETAL = [1.8751, 4.6941, 7.8548];
var SIGMA = [0.7341, 1.0185, 0.9992];

// --- Pre-compute cantilever tip values ---
function cantileverPhi(xi, m) {
  var bx = BETAL[m] * xi;
  return Math.cosh(bx) - Math.cos(bx) - SIGMA[m] * (Math.sinh(bx) - Math.sin(bx));
}
var PHI_TIP = [cantileverPhi(1.0, 0), cantileverPhi(1.0, 1), cantileverPhi(1.0, 2)];

function modeExcitation(xi, m) {
  return cantileverPhi(xi, m) / PHI_TIP[m];
}

// --- Physical data functions ---
function interpolateQ(midi) {
  if (midi <= Q_TABLE_MIDI[0]) return Q_TABLE_VAL[0];
  if (midi >= Q_TABLE_MIDI[Q_TABLE_MIDI.length - 1]) return Q_TABLE_VAL[Q_TABLE_VAL.length - 1];
  for (var i = 0; i < Q_TABLE_MIDI.length - 1; i++) {
    if (midi >= Q_TABLE_MIDI[i] && midi <= Q_TABLE_MIDI[i + 1]) {
      var frac = (midi - Q_TABLE_MIDI[i]) / (Q_TABLE_MIDI[i + 1] - Q_TABLE_MIDI[i]);
      return Q_TABLE_VAL[i] + frac * (Q_TABLE_VAL[i + 1] - Q_TABLE_VAL[i]);
    }
  }
  return 1200;
}

function tineLength(midi) {
  var key = midi - 20;
  if (key < 1) key = 1; if (key > 88) key = 88;
  return 157 * Math.exp(-0.0249 * (key - 1));
}

function strikingLine(midi) {
  var key = midi - 20;
  if (key < 1) key = 1; if (key > 88) key = 88;
  var t = (key - 1) / 87;
  return 57.15 * (1 - t) + 3.175 * t;
}

function puGapMm(midi) {
  var key = midi - 20;
  if (key < 1) key = 1; if (key > 88) key = 88;
  if (key <= 30) return 1.588;
  if (key <= 65) return 0.794;
  return 1.588;
}

function getHammerParams(midi, velocity) {
  var key = midi - 20;
  var Tc0, relMass;
  if (key <= 30)      { Tc0 = 0.0035; relMass = 0.67; }
  else if (key <= 40) { Tc0 = 0.0025; relMass = 0.83; }
  else if (key <= 50) { Tc0 = 0.0017; relMass = 1.00; }
  else if (key <= 64) { Tc0 = 0.0012; relMass = 1.17; }
  else                { Tc0 = 0.00015; relMass = 0.67; }
  var Tc = Tc0 * Math.pow(Math.max(velocity, 0.1), -0.286);
  return { Tc: Tc, relMass: relMass };
}

function hasTonebar(midi) { return midi > 27; }

function tonebarPhase(midi) {
  if (midi <= 52) return -1;
  if (midi <= 71) return 1;
  if (midi <= 81) return -1;
  return 1;
}

// --- Tip displacement factor (relative to reference key B3/MIDI 59) ---
var TIP_REF = 0; // computed once

function tipDisplacementFactor(midi) {
  var L = tineLength(midi);
  var xs = strikingLine(midi);
  var xi = Math.min(xs / L, 0.95);
  var phi = modeExcitation(xi, 0);
  var hammer = getHammerParams(midi, 0.5);
  var massScale = Math.sqrt(hammer.relMass);
  if (TIP_REF === 0) {
    var Lr = tineLength(59);
    var xsr = strikingLine(59);
    var xir = Math.min(xsr / Lr, 0.95);
    var phir = modeExcitation(xir, 0);
    var hr = getHammerParams(59, 0.5);
    TIP_REF = Math.sqrt(hr.relMass) * Math.pow(Lr, 1.5) * phir;
  }
  return massScale * Math.pow(L, 1.5) * phi / TIP_REF;
}

// --- Per-key variation (deterministic pseudo-random) ---
var KEY_VARIATION = new Float32Array(128 * 3); // [lverOffset, lhorOffset, decayScale] × 128
(function() {
  function hash(s) {
    s = ((s >>> 16) ^ s) * 0x45d9f3b;
    s = ((s >>> 16) ^ s) * 0x45d9f3b;
    return ((s >>> 16) ^ s) / 4294967296;
  }
  for (var k = 0; k < 128; k++) {
    var seed = k * 2654435761;
    KEY_VARIATION[k * 3 + 0] = (hash(seed) - 0.5) * 0.06;     // lverOffset
    KEY_VARIATION[k * 3 + 1] = (hash(seed + 1) - 0.5) * 0.04; // lhorOffset
    KEY_VARIATION[k * 3 + 2] = 0.92 + hash(seed + 3) * 0.16;  // decayScale
  }
})();

// --- LUT lookup (linear interpolation, no branching in hot path) ---
function lutLookup(lut, x) {
  // x in [-1, 1] → index in [0, LUT_SIZE-1]
  var pos = (x * 0.5 + 0.5) * LUT_MASK;
  if (pos < 0) pos = 0;
  if (pos > LUT_MASK) pos = LUT_MASK;
  var idx = pos | 0; // floor
  var frac = pos - idx;
  if (idx >= LUT_MASK) return lut[LUT_MASK];
  return lut[idx] + frac * (lut[idx + 1] - lut[idx]);
}

// --- 2x oversampled LUT lookup (matches WaveShaperNode oversample='2x') ---
// Reduces aliasing from nonlinear stages (preamp, poweramp).
// Method: linear-interpolate upsample → 2x LUT → 3-tap halfband downsample.
// Per-voice state: previous input sample (for interpolation).
var _os2x_prev = new Float32Array(MAX_VOICES * 2); // [preamp_prev, poweramp_prev] per voice
var _OS2X_PREAMP = 0;
var _OS2X_POWER = 1;

function lutLookup2x(lut, x, voiceIdx, stageIdx) {
  var prevIdx = voiceIdx * 2 + stageIdx;
  var prev = _os2x_prev[prevIdx];
  _os2x_prev[prevIdx] = x;
  // 2 interpolated samples at 2x rate
  var mid = (prev + x) * 0.5; // midpoint between previous and current
  // LUT at both points
  var y0 = lutLookup(lut, mid);
  var y1 = lutLookup(lut, x);
  // Halfband downsample: weighted average (simple but effective)
  return y0 * 0.25 + y1 * 0.75;
}

// --- Biquad filter state (IIR, direct form II transposed) ---
// coefficients: [b0, b1, b2, a1, a2] (a0 normalized to 1)
// state: [z1, z2]

function biquadProcess(coeff, state, x) {
  var b0 = coeff[0], b1 = coeff[1], b2 = coeff[2], a1 = coeff[3], a2 = coeff[4];
  var y = b0 * x + state[0];
  state[0] = b1 * x - a1 * y + state[1];
  state[1] = b2 * x - a2 * y;
  return y;
}

// --- Biquad coefficient builders (from AudioParam equivalents) ---
function biquadLowpass(freq, Q, fs) {
  var w0 = TWO_PI * freq / fs;
  var cosw0 = Math.cos(w0), sinw0 = Math.sin(w0);
  var alpha = sinw0 / (2 * Q);
  var a0 = 1 + alpha;
  return [
    ((1 - cosw0) / 2) / a0,
    (1 - cosw0) / a0,
    ((1 - cosw0) / 2) / a0,
    (-2 * cosw0) / a0,
    (1 - alpha) / a0
  ];
}

function biquadHighpass(freq, Q, fs) {
  var w0 = TWO_PI * freq / fs;
  var cosw0 = Math.cos(w0), sinw0 = Math.sin(w0);
  var alpha = sinw0 / (2 * Q);
  var a0 = 1 + alpha;
  return [
    ((1 + cosw0) / 2) / a0,
    (-(1 + cosw0)) / a0,
    ((1 + cosw0) / 2) / a0,
    (-2 * cosw0) / a0,
    (1 - alpha) / a0
  ];
}

function biquadPeaking(freq, Q, gainDB, fs) {
  var A = Math.pow(10, gainDB / 40);
  var w0 = TWO_PI * freq / fs;
  var cosw0 = Math.cos(w0), sinw0 = Math.sin(w0);
  var alpha = sinw0 / (2 * Q);
  var a0 = 1 + alpha / A;
  return [
    (1 + alpha * A) / a0,
    (-2 * cosw0) / a0,
    (1 - alpha * A) / a0,
    (-2 * cosw0) / a0,
    (1 - alpha / A) / a0
  ];
}

function biquadLowShelf(freq, gainDB, fs) {
  var A = Math.pow(10, gainDB / 40);
  var w0 = TWO_PI * freq / fs;
  var cosw0 = Math.cos(w0), sinw0 = Math.sin(w0);
  var alpha = sinw0 / 2 * Math.sqrt(2); // S=1 (slope)
  var sqA = Math.sqrt(A);
  var a0 = (A + 1) + (A - 1) * cosw0 + 2 * sqA * alpha;
  return [
    (A * ((A + 1) - (A - 1) * cosw0 + 2 * sqA * alpha)) / a0,
    (2 * A * ((A - 1) - (A + 1) * cosw0)) / a0,
    (A * ((A + 1) - (A - 1) * cosw0 - 2 * sqA * alpha)) / a0,
    (-2 * ((A - 1) + (A + 1) * cosw0)) / a0,
    ((A + 1) + (A - 1) * cosw0 - 2 * sqA * alpha) / a0
  ];
}

function biquadHighShelf(freq, gainDB, fs) {
  var A = Math.pow(10, gainDB / 40);
  var w0 = TWO_PI * freq / fs;
  var cosw0 = Math.cos(w0), sinw0 = Math.sin(w0);
  var alpha = sinw0 / 2 * Math.sqrt(2);
  var sqA = Math.sqrt(A);
  var a0 = (A + 1) - (A - 1) * cosw0 + 2 * sqA * alpha;
  return [
    (A * ((A + 1) + (A - 1) * cosw0 + 2 * sqA * alpha)) / a0,
    (-2 * A * ((A - 1) + (A + 1) * cosw0)) / a0,
    (A * ((A + 1) + (A - 1) * cosw0 - 2 * sqA * alpha)) / a0,
    (2 * ((A - 1) - (A + 1) * cosw0)) / a0,
    ((A + 1) - (A - 1) * cosw0 - 2 * sqA * alpha) / a0
  ];
}

// ========================================
// LUT COMPUTATION (same physics as epiano-engine.js)
// ========================================

function computePickupLUT(symmetry, distance, gapScale, qRange) {
  var lut = new Float32Array(LUT_SIZE);
  var sym = symmetry < 0 ? 0 : (symmetry > 1 ? 1 : symmetry);
  var Rp = 0.2;
  var Lver = sym * 0.25;
  var baseLhor = distance * 0.35 + 0.05;
  var gs = (gapScale !== undefined) ? gapScale : 1.0;
  var Lhor = baseLhor * gs;
  var Lhor2 = Lhor * Lhor;
  var qr = (qRange !== undefined && qRange > 0) ? qRange : 1.0;

  for (var i = 0; i < LUT_SIZE; i++) {
    var q = ((i / (LUT_SIZE - 1)) * 2 - 1) * qr;
    var d1 = q - Rp + Lver;
    var f1 = d1 * d1 + Lhor2;
    var d2 = q + Rp + Lver;
    var f2 = d2 * d2 + Lhor2;
    lut[i] = (1.0 / f1 - 2.0 * Lhor2 / (f1 * f1)) - (1.0 / f2 - 2.0 * Lhor2 / (f2 * f2));
  }
  var dcOffset = lut[LUT_SIZE >> 1];
  for (var i = 0; i < LUT_SIZE; i++) lut[i] -= dcOffset;
  // Unity-gain normalize to reference PU position
  var refLhor = 0.25, refLhor2 = refLhor * refLhor;
  var refD1 = 0 - Rp + 0.15, refF1 = refD1 * refD1 + refLhor2;
  var refD2 = 0 + Rp + 0.15, refF2 = refD2 * refD2 + refLhor2;
  var refPeak = Math.abs((1.0 / refF1 - 2.0 * refLhor2 / (refF1 * refF1)) - (1.0 / refF2 - 2.0 * refLhor2 / (refF2 * refF2)));
  if (refPeak > 0) {
    var scale = 0.7 / refPeak;
    for (var i = 0; i < LUT_SIZE; i++) {
      lut[i] *= scale;
      if (lut[i] > 0.95) lut[i] = 0.95;
      if (lut[i] < -0.95) lut[i] = -0.95;
    }
  }
  return lut;
}

function computePreampLUT() {
  // 12AX7 Koren model (Twin Reverb AB763 V1A)
  var lut = new Float32Array(LUT_SIZE);
  var mu = 100, ex = 1.4, kG1 = 1060, kP = 600, kVB = 300;
  var Vb = 330, Ra = 100000, Vgk_bias = -1.5, gridSwing = 3.0;
  var rawOut = new Float32Array(LUT_SIZE);
  for (var i = 0; i < LUT_SIZE; i++) {
    var x = (i / (LUT_SIZE - 1)) * 2 - 1;
    var Vgk = Vgk_bias + x * gridSwing;
    if (Vgk > 0.3) Vgk = 0.3 + (Vgk - 0.3) * 0.05;
    var Vp = 190;
    for (var iter = 0; iter < 3; iter++) {
      var E1 = Math.log(1 + Math.exp(kP * (1 / mu + Vgk / Math.sqrt(kVB + Vp * Vp)))) / kP;
      var Ip = Math.pow(Math.max(E1, 0), ex) / kG1;
      Vp = Vb - Ip * Ra;
      if (Vp < 0) Vp = 0;
    }
    rawOut[i] = Vp;
  }
  var Vp_rest = rawOut[LUT_SIZE >> 1];
  var maxSwing = 0;
  for (var i = 0; i < LUT_SIZE; i++) {
    lut[i] = rawOut[i] - Vp_rest;
    if (Math.abs(lut[i]) > maxSwing) maxSwing = Math.abs(lut[i]);
  }
  if (maxSwing > 0) {
    for (var i = 0; i < LUT_SIZE; i++) lut[i] = -lut[i] / maxSwing;
  }
  return lut;
}

// Exact copy of epiano-engine.js computePickupLUT_Wurlitzer()
function computePickupLUT_Wurlitzer(distance) {
  var lut = new Float32Array(LUT_SIZE);
  var d0 = distance * 0.5 + 0.2;
  for (var i = 0; i < LUT_SIZE; i++) {
    var x = (i / (LUT_SIZE - 1)) * 2 - 1;
    var displacement = x * 0.8;
    lut[i] = 1.0 / (d0 + displacement) - 1.0 / d0;
  }
  var maxVal = 0;
  for (var i = 0; i < LUT_SIZE; i++) {
    if (Math.abs(lut[i]) > maxVal) maxVal = Math.abs(lut[i]);
  }
  if (maxVal > 0) {
    for (var i = 0; i < LUT_SIZE; i++) lut[i] /= maxVal;
  }
  return lut;
}

// Exact copy of epiano-engine.js computePreampLUT_NE5534()
function computePreampLUT_NE5534() {
  var lut = new Float32Array(LUT_SIZE);
  var rail = 0.85;
  for (var i = 0; i < LUT_SIZE; i++) {
    var x = (i / (LUT_SIZE - 1)) * 2 - 1;
    if (Math.abs(x) < rail) {
      lut[i] = x;
    } else {
      var excess = (Math.abs(x) - rail) / (1 - rail);
      lut[i] = (x > 0 ? 1 : -1) * (rail + (1 - rail) * Math.tanh(excess * 3));
    }
  }
  return lut;
}

// Exact copy of epiano-engine.js computePreampLUT_BJT()
function computePreampLUT_BJT() {
  var lut = new Float32Array(LUT_SIZE);
  for (var i = 0; i < LUT_SIZE; i++) {
    var x = (i / (LUT_SIZE - 1)) * 2 - 1;
    lut[i] = x >= 0
      ? Math.tanh(x * 2.0) * 0.9
      : Math.tanh(x * 1.5) * 1.05;
  }
  return lut;
}

function computePowerampLUT() {
  // Exact copy of epiano-engine.js computePowerampLUT_6L6()
  // Push-pull Class AB: even harmonics cancel, crossover region
  var lut = new Float32Array(LUT_SIZE);
  for (var i = 0; i < LUT_SIZE; i++) {
    var x = (i / (LUT_SIZE - 1)) * 2 - 1;
    var tubeA = Math.tanh(x * 1.5 + 0.05);  // slight bias offset
    var tubeB = Math.tanh(-x * 1.5 + 0.05);
    lut[i] = (tubeA - tubeB) * 0.5;
  }
  return lut;
}

function computeV3DriverLUT() {
  // Exact copy of epiano-engine.js computeV3DriverLUT_12AT7()
  // 12AT7 reverb driver — Koren model, both triode sections paralleled
  // AB763: V3 drives reverb output transformer (Hammond 1750A, 22.8kΩ primary)
  // Transformer-coupled: Vp stays near B+ (no resistive load line)
  var lut = new Float32Array(LUT_SIZE);
  var mu = 60, ex = 1.35, kG1 = 460, kP = 300, kVB = 300;
  var Vgk_bias = -8.2;
  var gridSwing = 10.0;
  var rawOut = new Float32Array(LUT_SIZE);
  for (var i = 0; i < LUT_SIZE; i++) {
    var x = (i / (LUT_SIZE - 1)) * 2 - 1;
    var Vgk = Vgk_bias + x * gridSwing;
    if (Vgk > 0.3) Vgk = 0.3 + (Vgk - 0.3) * 0.02;
    var Vp = 450; // transformer-coupled: plate stays near B+
    var E1 = Math.log(1 + Math.exp(kP * (1 / mu + Vgk / Math.sqrt(kVB + Vp * Vp)))) / kP;
    var Ip = Math.pow(Math.max(E1, 0), ex) / kG1;
    rawOut[i] = Ip * 2; // parallel sections double the current
  }
  var Ip_rest = rawOut[LUT_SIZE >> 1];
  var maxSwing = 0;
  for (var i = 0; i < LUT_SIZE; i++) {
    lut[i] = rawOut[i] - Ip_rest;
    if (Math.abs(lut[i]) > maxSwing) maxSwing = Math.abs(lut[i]);
  }
  if (maxSwing > 0) {
    for (var i = 0; i < LUT_SIZE; i++) lut[i] /= maxSwing;
  }
  return lut;
}

// Normalize LUT to unity center gain
function normalizeLUTUnityGain(lut) {
  var center = LUT_SIZE >> 1;
  var dx = 2.0 / LUT_SIZE;
  var slope = (lut[center + 1] - lut[center - 1]) / (2 * dx);
  if (slope > 1.0) {
    for (var i = 0; i < LUT_SIZE; i++) lut[i] /= slope;
  }
  return lut;
}

// ========================================
// TONESTACK PARAMETER COMPUTATION
// ========================================
function computeTonestackBiquads(bass, mid, treble, bright, fs) {
  // Exact copy of epiano-engine.js computeTonestackParams() — verified against AB763 Yeh & Smith.
  // DO NOT change these values without physics verification.
  var b = bass < 0 ? 0 : (bass > 1 ? 1 : bass);
  var m = mid < 0 ? 0 : (mid > 1 ? 1 : mid);
  var t = treble < 0 ? 0 : (treble > 1 ? 1 : treble);
  return [
    biquadHighpass(30, 0.707, fs),                             // DC blocking (passive network)
    biquadLowShelf(100, -16 + b * 16, fs),                    // Bass: -16 to 0 dB at 100Hz
    biquadPeaking(600, 0.8, -17 + m * 14, fs),                // Mid scoop: -17 to -3 dB, Q=0.8 (Fender TMB)
    biquadHighShelf(bright ? 1500 : 3000, -14 + t * 14, fs)   // Treble: -14 to 0 dB
  ];
}

// ========================================
// PROCESSOR CLASS
// ========================================

class EpianoWorkletProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    var fs = sampleRate;
    this.fs = fs;
    this.invFs = 1.0 / fs;

    // --- Voice SoA (Structure of Arrays) ---
    this.vActive       = new Uint8Array(MAX_VOICES);      // 0=free, 1=attack, 2=sustain, 3=releasing
    this.vMidi         = new Uint8Array(MAX_VOICES);
    this.vAge          = new Float64Array(MAX_VOICES);     // samples since noteOn

    // Modal synthesis: 4 modes per voice (fundamental, tonebar, beam1, beam2)
    // Phase accumulators (radians per sample)
    this.vOmega        = new Float64Array(MAX_VOICES * 4); // angular frequency / fs
    this.vPhase        = new Float64Array(MAX_VOICES * 4); // current phase
    this.vAmp          = new Float32Array(MAX_VOICES * 4); // amplitude
    this.vDecayAlpha   = new Float32Array(MAX_VOICES * 4); // exp decay per sample: e^(-1/(tau*fs))

    // (No attack buffer needed — all modes are live oscillators with per-sample phase coherence)

    // Tine amplitude (velocity-derived)
    this.vTineAmp      = new Float32Array(MAX_VOICES);

    // EM damping (Lenz's law): starts at 1.0, converges to emDampRatio over ~75ms.
    // One-pole smoother: gain = gain * alpha + target * (1 - alpha). No exp() in process().
    this.vEmDampGain   = new Float32Array(MAX_VOICES);  // current gain (starts 1.0)
    this.vEmDampTarget = new Float32Array(MAX_VOICES);  // converges to emDampRatio
    this.vEmDampCoeff  = new Float32Array(MAX_VOICES);  // pre-computed alpha = e^(-1/(0.025*fs))

    // Mechanical decay holdoff: matches old engine where decay starts AFTER EM damp phase (75ms).
    // During holdoff, vAmp stays at initial value. Beam modes ring at full amplitude = bell character.
    this.vDecayHoldoff = new Uint32Array(MAX_VOICES);   // samples to wait before applying decayAlpha

    // Release envelope
    this.vReleaseAlpha = new Float32Array(MAX_VOICES);     // per-sample release decay
    this.vReleaseGain  = new Float32Array(MAX_VOICES);     // current release multiplier

    // Per-voice PU LUT (each voice gets its own based on register)
    this.vPuLUT        = new Array(MAX_VOICES);
    for (var i = 0; i < MAX_VOICES; i++) this.vPuLUT[i] = null;

    // Per-voice biquad filter states (coupling HPF)
    // [z1, z2] per voice
    this.vCouplingState = new Float32Array(MAX_VOICES * 2);

    // Per-voice tonestack biquad states: 4 filters × 2 states = 8 per voice
    this.vTsState      = new Float32Array(MAX_VOICES * 8);

    // Per-voice DI harp LPF states (only used in DI mode, per-voice like old engine)
    this.vDiHarpState  = new Float32Array(MAX_VOICES * 2);

    // --- Shared chain state ---
    // Harp LPF (shared across all voices, applied to summed signal — amp path only)
    this.harpLPFCoeff  = biquadLowpass(5700, 0.8, fs);
    this.harpLPFState  = new Float32Array(2);

    // Reverb send HPF (318Hz, shared)
    this.sendHPFCoeff  = biquadHighpass(318, 0.707, fs);
    this.sendHPFState  = new Float32Array(2);

    // Reverb send bandwidth limiting: highshelf + 2× LPF
    this.sendTiltCoeff = biquadHighShelf(3000, -6, fs);
    this.sendTiltState = new Float32Array(2);
    this.sendLPF1Coeff = biquadLowpass(5000, 0.707, fs);
    this.sendLPF1State = new Float32Array(2);
    this.sendLPF2Coeff = biquadLowpass(5000, 0.707, fs);
    this.sendLPF2State = new Float32Array(2);

    // --- Shared LUTs (all presets pre-computed) ---
    this.preampLUT_12AX7 = computePreampLUT();
    this.preampLUT_NE5534 = computePreampLUT_NE5534();
    this.preampLUT_BJT = computePreampLUT_BJT();
    this.v3LUT       = computeV3DriverLUT();
    // Active LUT (switched by preset)
    this.preampLUT   = this.preampLUT_12AX7;
    // V4B + poweramp now on main thread (Fix 3), but keep for future use
    this.pickupType  = 'rhodes'; // 'rhodes' or 'wurlitzer'

    // Per-voice coupling HPF coefficients (3.4Hz, subsonic)
    this.couplingCoeff = biquadHighpass(3.4, 0.707, fs);

    // Tonestack coefficients (shared, updated on param change)
    this.tsCoeffs = computeTonestackBiquads(0.5, 0.5, 0.5, false, fs);

    // --- Parameters (updated via MessagePort) ---
    this.pickupSymmetry = 0.3;
    this.pickupDistance  = 0.5;
    this.preampGain     = 1.0;
    this.tsBass         = 0.5;
    this.tsMid          = 0.5;
    this.tsTreble       = 0.5;
    this.brightSwitch   = false;
    this.powerampDrive  = 1.0;
    this.volumePot      = 0.5;
    this.springReverbMix = 0.12;
    this.springDwell    = 6.0;
    this.use2ndPreamp   = true;
    this.useTonestack   = true;
    this.useCabinet     = true;
    this.useSpringReverb = true;

    // Shared chain gains
    this.dryBusGain     = 0.7;
    this.v4bMakeup      = 1.5;
    this.powerMakeup    = 2.0;
    this.cabinetGain    = 6.0;
    this.inputAtten     = 0.5;    // AB763 Hi input -6dB
    this.cfGain         = 0.95;   // cathode follower
    this.tsInsertionLoss = 0.2;   // passive TMB -14dB
    this.v2bDrive       = 5.0;    // V2B recovery gain
    this.v2bMakeup      = 1.5;
    this.v4aGain        = 5.0;    // reverb recovery
    this.reverbPot      = 0.12;

    // Voice allocation round-robin
    this.nextVoice = 0;

    // --- MessagePort handler ---
    this.port.onmessage = this._onMessage.bind(this);
  }

  _onMessage(e) {
    var msg = e.data;
    if (!msg) return;

    if (msg.type === 'noteOn') {
      this._noteOn(msg.midi, msg.velocity);
    } else if (msg.type === 'noteOff') {
      this._noteOff(msg.midi);
    } else if (msg.type === 'params') {
      this._updateParams(msg);
    } else if (msg.type === 'allNotesOff') {
      for (var i = 0; i < MAX_VOICES; i++) this.vActive[i] = 0;
    }
  }

  _updateParams(msg) {
    if (msg.pickupSymmetry !== undefined) this.pickupSymmetry = msg.pickupSymmetry;
    if (msg.pickupDistance !== undefined) this.pickupDistance = msg.pickupDistance;
    if (msg.preampGain !== undefined) this.preampGain = msg.preampGain;
    if (msg.powerampDrive !== undefined) this.powerampDrive = msg.powerampDrive;
    if (msg.volumePot !== undefined) this.volumePot = msg.volumePot;
    if (msg.springReverbMix !== undefined) {
      this.springReverbMix = msg.springReverbMix;
      this.reverbPot = msg.springReverbMix;
    }
    if (msg.springDwell !== undefined) this.springDwell = Math.max(msg.springDwell, 0.5);
    if (msg.use2ndPreamp !== undefined) this.use2ndPreamp = msg.use2ndPreamp;
    if (msg.brightSwitch !== undefined) this.brightSwitch = msg.brightSwitch;
    if (msg.useTonestack !== undefined) this.useTonestack = msg.useTonestack;
    if (msg.useCabinet !== undefined) this.useCabinet = msg.useCabinet;
    if (msg.useSpringReverb !== undefined) this.useSpringReverb = msg.useSpringReverb;

    // Recompute tonestack
    if (msg.tsBass !== undefined || msg.tsMid !== undefined || msg.tsTreble !== undefined || msg.brightSwitch !== undefined) {
      if (msg.tsBass !== undefined) this.tsBass = msg.tsBass;
      if (msg.tsMid !== undefined) this.tsMid = msg.tsMid;
      if (msg.tsTreble !== undefined) this.tsTreble = msg.tsTreble;
      this.tsCoeffs = computeTonestackBiquads(this.tsBass, this.tsMid, this.tsTreble, this.brightSwitch, this.fs);
    }

    // Preset-specific LUT switching
    if (msg.preampType !== undefined) {
      if (msg.preampType === 'NE5534') this.preampLUT = this.preampLUT_NE5534;
      else if (msg.preampType === 'BJT') this.preampLUT = this.preampLUT_BJT;
      else this.preampLUT = this.preampLUT_12AX7;
    }
    if (msg.pickupType !== undefined) {
      this.pickupType = msg.pickupType || 'rhodes';
    }
  }

  _noteOn(midi, velocity) {
    var fs = this.fs;

    // Find free voice or steal oldest
    var vi = -1;
    for (var i = 0; i < MAX_VOICES; i++) {
      var idx = (this.nextVoice + i) % MAX_VOICES;
      if (this.vActive[idx] === 0) { vi = idx; break; }
    }
    if (vi < 0) {
      // Steal oldest voice
      var oldest = 0;
      var oldestAge = 0;
      for (var i = 0; i < MAX_VOICES; i++) {
        if (this.vAge[i] > oldestAge) { oldestAge = this.vAge[i]; oldest = i; }
      }
      vi = oldest;
    }
    this.nextVoice = (vi + 1) % MAX_VOICES;

    // --- Compute mode parameters ---
    var kvi = midi * 3;
    var decayScale = (midi >= 0 && midi < 128) ? KEY_VARIATION[kvi + 2] : 1.0;

    var f0 = 440 * Math.pow(2, (midi - 69) / 12);
    var Q = interpolateQ(midi);
    var tau = Q / (Math.PI * f0);
    var hammer = getHammerParams(midi, velocity);
    var fc = 1 / (Math.PI * hammer.Tc);
    var massScale = Math.sqrt(hammer.relMass);
    var velDecayScale = 1.0 - velocity * 0.4;

    var hasTB = hasTonebar(midi);
    var tbPhase = hasTB ? tonebarPhase(midi) : 0;
    var tonebarAmp = hasTB ? 0.3 * tbPhase : 0.0;
    var tonebarDecay = hasTB ? tau : 0.001;

    // Striking line spatial excitation
    var L_mm = tineLength(midi);
    var xs_mm = strikingLine(midi);
    var xi = Math.min(xs_mm / L_mm, 0.95);
    var spatialFund = modeExcitation(xi, 0);
    var spatialBeam1 = modeExcitation(xi, 1);
    var spatialBeam2 = modeExcitation(xi, 2);
    var spatialRatio1 = spatialBeam1 / Math.max(spatialFund, 0.001);
    var spatialRatio2 = spatialBeam2 / Math.max(spatialFund, 0.001);

    var beam1Freq = f0 * 7.11;
    var beam2Freq = f0 * 20.25;

    var fundFilter = 1 / (1 + Math.pow(f0 / fc, 2));
    var beam1Filter = 1 / (1 + Math.pow(beam1Freq / fc, 2));
    var beam2Filter = 1 / (1 + Math.pow(beam2Freq / fc, 2));

    var freqResp1 = 1 / (7.11 * 7.11);
    var freqResp2 = 1 / (20.25 * 20.25);
    var beam1Rel = (beam1Filter / Math.max(fundFilter, 0.01)) * spatialRatio1 * freqResp1 * 6.5;
    var beam2Rel = (beam2Filter / Math.max(fundFilter, 0.01)) * spatialRatio2 * freqResp2 * 9.5;

    // Store mode data: [fundamental, tonebar, beam1, beam2]
    var base = vi * 4;
    var freqs = [f0, f0, beam1Freq, beam2Freq];
    var amps  = [1.0 * massScale, tonebarAmp * massScale, beam1Rel * massScale, beam2Rel * massScale];
    var decays = [tau * decayScale, tonebarDecay * decayScale, 0.035 * decayScale * velDecayScale, 0.015 * decayScale * velDecayScale];

    // EM damping: one-pole smoother (starts 1.0 → converges to emDampRatio over ~75ms).
    // The initial full-amplitude transient hitting the PU hard = the bell character.
    var puDampStrength = velocity * (1.1 - this.pickupDistance);
    if (puDampStrength < 0) puDampStrength = 0;
    if (puDampStrength > 1) puDampStrength = 1;
    var emDampRatio = 1.0 - puDampStrength * 0.4;
    this.vEmDampGain[vi]   = 1.0;          // start at full amplitude
    this.vEmDampTarget[vi] = emDampRatio;   // converge to this
    this.vEmDampCoeff[vi]  = Math.exp(-this.invFs / 0.025); // 25ms time constant

    for (var m = 0; m < 4; m++) {
      this.vOmega[base + m] = TWO_PI * freqs[m] * this.invFs;
      this.vPhase[base + m] = 0;
      this.vAmp[base + m]   = amps[m]; // FULL amplitude (EM damp applied per-sample)
      // Per-sample decay: e^(-1/(tau*fs))
      this.vDecayAlpha[base + m] = Math.exp(-this.invFs / Math.max(decays[m], 0.001));
    }

    // Tine amplitude
    this.vTineAmp[vi] = Math.sqrt(velocity) * 0.3;

    // Mechanical decay holdoff: 150ms (= old engine's attackDur).
    // Old engine: attack buffer(150ms) + sustain osc crossfade → decay starts at 150ms.
    this.vDecayHoldoff[vi] = Math.ceil(0.15 * fs);

    // Per-voice PU LUT
    var tipFactor = tipDisplacementFactor(midi);
    var gapMm = puGapMm(midi);
    var gapScale = gapMm / 0.794;
    var qRange = tipFactor;
    if (qRange < 0.3) qRange = 0.3;
    if (qRange > 5.0) qRange = 5.0;
    if (this.pickupType === 'wurlitzer') {
      this.vPuLUT[vi] = computePickupLUT_Wurlitzer(this.pickupDistance);
    } else {
      this.vPuLUT[vi] = computePickupLUT(this.pickupSymmetry, this.pickupDistance, gapScale, qRange);
    }

    // Reset filter states
    this.vCouplingState[vi * 2] = 0;
    this.vCouplingState[vi * 2 + 1] = 0;
    for (var j = 0; j < 8; j++) this.vTsState[vi * 8 + j] = 0;
    this.vDiHarpState[vi * 2] = 0;
    this.vDiHarpState[vi * 2 + 1] = 0;
    _os2x_prev[vi * 2 + _OS2X_PREAMP] = 0;
    _os2x_prev[vi * 2 + _OS2X_POWER] = 0;

    // Reset release
    this.vReleaseGain[vi] = 1.0;
    this.vReleaseAlpha[vi] = 1.0; // no release yet

    // Activate
    this.vActive[vi] = 1;
    this.vMidi[vi] = midi;
    this.vAge[vi] = 0;
  }

  _noteOff(midi) {
    // Release all voices with this MIDI note
    for (var i = 0; i < MAX_VOICES; i++) {
      if (this.vActive[i] > 0 && this.vMidi[i] === midi && this.vActive[i] !== 3) {
        this.vActive[i] = 3; // releasing
        this.vReleaseAlpha[i] = Math.exp(-this.invFs / 0.05); // 50ms release
      }
    }
  }

  process(inputs, outputs, parameters) {
    var output = outputs[0];
    if (!output || !output[0]) return true;

    var outL = output[0];
    var outR = output.length > 1 ? output[1] : outL;
    var blockSize = outL.length;

    // Check if any voice is active (skip processing if silent)
    var anyActive = 0;
    for (var v = 0; v < MAX_VOICES; v++) {
      if (this.vActive[v] > 0) { anyActive = 1; break; }
    }
    if (!anyActive) {
      for (var i = 0; i < blockSize; i++) { outL[i] = 0; outR[i] = 0; }
      return true;
    }

    var fs = this.fs;
    var invFs = this.invFs;

    // Temp buffers (per-block, reused — allocated once in constructor would be better
    // but blockSize is typically 128 and this is acceptable)
    // Actually, we process sample-by-sample, so we just need per-sample accumulators.

    for (var i = 0; i < blockSize; i++) {
      // --- Per-voice synthesis → sum to dry/DI bus ---
      var drySum = 0;
      var diSum = 0;  // DI path: per-voice harp LPF then direct output
      var sendSum = 0; // reverb send (post-tonestack, pre-V2B)

      for (var v = 0; v < MAX_VOICES; v++) {
        if (this.vActive[v] === 0) continue;

        var age = this.vAge[v];
        var base = v * 4;

        // --- 1. Modal synthesis (sample-by-sample, phase-coherent) ---
        var tineSignal = 0;

        for (var m = 0; m < 4; m++) {
          var omega = this.vOmega[base + m];
          if (omega === 0) continue;

          var amp = this.vAmp[base + m];
          if (Math.abs(amp) < 0.0001) continue;

          var phase = this.vPhase[base + m];

          // Envelope model (matches old engine exactly):
          //   Phase 1 (age < holdoff, ~75ms): EM damp only. No mechanical decay.
          //     Beam modes ring at full amplitude → bell character.
          //   Phase 2 (age >= holdoff): EM damp done. Mechanical decay starts.
          var env = amp;

          // Apply mechanical decay ONLY after holdoff phase
          if (age >= this.vDecayHoldoff[v]) {
            this.vAmp[base + m] *= this.vDecayAlpha[base + m];
          }

          var sample = env * Math.sin(phase);
          tineSignal += sample;

          // Advance phase
          this.vPhase[base + m] = phase + omega;
          // Wrap phase to prevent precision loss over time
          if (this.vPhase[base + m] > TWO_PI) {
            this.vPhase[base + m] -= TWO_PI;
          }
        }

        // Apply EM damping (Lenz's law): one-pole smoother, 1.0 → emDampRatio over ~75ms.
        // The initial full-amplitude transient = the bell character.
        {
          var emAlpha = this.vEmDampCoeff[v];
          var emTarget = this.vEmDampTarget[v];
          this.vEmDampGain[v] = this.vEmDampGain[v] * emAlpha + emTarget * (1.0 - emAlpha);
        }

        // Apply tine amplitude (velocity) and EM damping
        tineSignal *= this.vTineAmp[v] * this.vEmDampGain[v];

        // Apply release envelope
        if (this.vActive[v] === 3) {
          this.vReleaseGain[v] *= this.vReleaseAlpha[v];
          tineSignal *= this.vReleaseGain[v];
          if (this.vReleaseGain[v] < 0.0001) {
            this.vActive[v] = 0; // voice done
            continue;
          }
        }

        // --- 2. PU nonlinearity (per-voice LUT) ---
        var puOut = tineSignal;
        if (this.vPuLUT[v]) {
          puOut = lutLookup(this.vPuLUT[v], tineSignal);
        }

        // --- 3. Coupling HPF (3.4Hz, removes DC) --- inline biquad (no array alloc)
        var stateOff = v * 2;
        var couplingOut;
        {
          var b0 = this.couplingCoeff[0], b1 = this.couplingCoeff[1], b2 = this.couplingCoeff[2];
          var a1 = this.couplingCoeff[3], a2 = this.couplingCoeff[4];
          var z1 = this.vCouplingState[stateOff], z2 = this.vCouplingState[stateOff + 1];
          couplingOut = b0 * puOut + z1;
          this.vCouplingState[stateOff] = b1 * puOut - a1 * couplingOut + z2;
          this.vCouplingState[stateOff + 1] = b2 * puOut - a2 * couplingOut;
        }

        var sig = couplingOut;

        if (this.useCabinet) {
          // === AMP PATH (Rhodes Stage + Twin, Suitcase, Wurlitzer) ===

          // --- 4. Input jack attenuator (-6dB, AB763 Hi input) ---
          sig *= this.inputAtten;

          // --- 5. Preamp V1A (12AX7 LUT, 2x oversampled — matches old engine) ---
          sig *= this.preampGain;
          sig = lutLookup2x(this.preampLUT, sig, v, _OS2X_PREAMP);

          // --- 5b. Cathode follower V2A ---
          if (this.use2ndPreamp) {
            sig *= this.cfGain;
          }

          // --- 6. Tonestack (4 × biquad IIR) ---
          if (this.useTonestack) {
            var tsBase = v * 8;
            for (var f = 0; f < 4; f++) {
              var coeff = this.tsCoeffs[f];
              var sOff = tsBase + f * 2;
              var cb0 = coeff[0], cb1 = coeff[1], cb2 = coeff[2], ca1 = coeff[3], ca2 = coeff[4];
              var tz1 = this.vTsState[sOff], tz2 = this.vTsState[sOff + 1];
              var tsOut = cb0 * sig + tz1;
              this.vTsState[sOff] = cb1 * sig - ca1 * tsOut + tz2;
              this.vTsState[sOff + 1] = cb2 * sig - ca2 * tsOut;
              sig = tsOut;
            }

            // Tonestack insertion loss (-14dB)
            sig *= this.tsInsertionLoss;
          }

          // --- Reverb send tap (post-tonestack, pre-volume pot) ---
          if (this.useSpringReverb) {
            sendSum += sig;
          }

          // --- 7. Volume pot ---
          if (this.useTonestack) {
            sig *= this.volumePot;
          }

          // --- 8. V2B 2nd preamp stage (recovery after tonestack) ---
          if (this.use2ndPreamp) {
            sig *= this.v2bDrive;
            sig = lutLookup(this.preampLUT, sig);
            sig *= this.v2bMakeup;
          }

          // Sum to dry bus (→ shared harp LPF → V4B → poweramp)
          drySum += sig;

        } else {
          // === DI PATH (no amp chain) ===
          // Per-voice harp LPF → direct output. Matches old engine exactly.
          // Old engine: lastNode → diHarpLPF(5700Hz, Q=0.8) → masterDest
          // Per-voice harp LPF (5700Hz, Q=0.8) — same as old engine diHarpLPF
          var dhOff = v * 2;
          var dhc = this.harpLPFCoeff; // same coefficients
          var dhz1 = this.vDiHarpState[dhOff], dhz2 = this.vDiHarpState[dhOff + 1];
          var dhOut = dhc[0] * sig + dhz1;
          this.vDiHarpState[dhOff] = dhc[1] * sig - dhc[3] * dhOut + dhz2;
          this.vDiHarpState[dhOff + 1] = dhc[2] * sig - dhc[4] * dhOut;
          diSum += dhOut;
        }
        this.vAge[v]++;
      }

      // === SHARED CHAIN (post-voice sum) ===

      // --- Reverb send chain: HPF → V3 → tilt → LPF × 2 ---
      var wetSignal = 0;
      if (this.useSpringReverb && Math.abs(sendSum) > 0.00001) {
        // HPF 318Hz
        {
          var sc = this.sendHPFCoeff;
          var sz1 = this.sendHPFState[0], sz2 = this.sendHPFState[1];
          var sOut = sc[0] * sendSum + sz1;
          this.sendHPFState[0] = sc[1] * sendSum - sc[3] * sOut + sz2;
          this.sendHPFState[1] = sc[2] * sendSum - sc[4] * sOut;
          sendSum = sOut;
        }
        // V3 drive + nonlinearity
        sendSum *= this.springDwell;
        sendSum = lutLookup(this.v3LUT, sendSum);
        // Highshelf tilt
        {
          var tc = this.sendTiltCoeff;
          var tz1 = this.sendTiltState[0], tz2 = this.sendTiltState[1];
          var tOut = tc[0] * sendSum + tz1;
          this.sendTiltState[0] = tc[1] * sendSum - tc[3] * tOut + tz2;
          this.sendTiltState[1] = tc[2] * sendSum - tc[4] * tOut;
          sendSum = tOut;
        }
        // LPF 5kHz × 2
        {
          var lc = this.sendLPF1Coeff;
          var lz1 = this.sendLPF1State[0], lz2 = this.sendLPF1State[1];
          var lOut = lc[0] * sendSum + lz1;
          this.sendLPF1State[0] = lc[1] * sendSum - lc[3] * lOut + lz2;
          this.sendLPF1State[1] = lc[2] * sendSum - lc[4] * lOut;
          sendSum = lOut;
        }
        {
          var lc2 = this.sendLPF2Coeff;
          var lz1b = this.sendLPF2State[0], lz2b = this.sendLPF2State[1];
          var lOut2 = lc2[0] * sendSum + lz1b;
          this.sendLPF2State[0] = lc2[1] * sendSum - lc2[3] * lOut2 + lz2b;
          this.sendLPF2State[1] = lc2[2] * sendSum - lc2[4] * lOut2;
          sendSum = lOut2;
        }
        // V4A recovery + reverb pot
        // Note: actual spring reverb is EXTERNAL (separate AudioWorkletNode).
        // We output the send signal on channel 1 (output[1] if stereo).
        // The main thread routes: worklet ch1 → spring reverb → V4A gain → pot → mix at V4B.
        // For now, we skip the spring and just output the processed send.
        wetSignal = sendSum;
      }

      // --- Output routing ---
      var mainOut;

      if (this.useCabinet) {
        // === AMP PATH: shared harpLPF → output ch0 (dry) ===
        // V4B + poweramp are on main thread (for wet/dry bloom mixing).

        // Harp wiring LPF (5.7kHz, shared across all voices)
        {
          var hc = this.harpLPFCoeff;
          var hz1 = this.harpLPFState[0], hz2 = this.harpLPFState[1];
          var hIn = drySum * this.dryBusGain;
          var hOut = hc[0] * hIn + hz1;
          this.harpLPFState[0] = hc[1] * hIn - hc[3] * hOut + hz2;
          this.harpLPFState[1] = hc[2] * hIn - hc[4] * hOut;
          drySum = hOut;
        }

        // Output dry signal. V4B + poweramp + cabinet are on main thread
        // so wet (spring reverb return) can mix with dry at V4B = bloom.
        mainOut = drySum;
      } else {
        // === DI PATH: per-voice harp LPF already applied, just output ===
        mainOut = diSum;
      }

      // ch0: main signal (→ ConvolverNode cabinet OR direct output on main thread)
      // ch1: reverb send (→ spring reverb AudioWorklet on main thread)
      outL[i] = mainOut;
      if (outR !== outL) {
        outR[i] = wetSignal; // reverb send on right channel
      }
    }

    return true;
  }
}

registerProcessor('epiano-worklet-processor', EpianoWorkletProcessor);
