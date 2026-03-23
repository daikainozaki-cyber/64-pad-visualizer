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
var _epSpringReverb = null;     // ConvolverNode: spring reverb (Accutronics 4AB3C1B)
var _epMetalBuf = null;         // AudioBuffer: pre-computed metallic attack (commuted synthesis)
var _epInitialized = false;
var _epRealIRLoaded = false;    // true when real Twin Reverb IR is loaded

// --- AB763 shared signal chain (correct Fender reverb routing) ---
// Per-voice V2B → _epDryBus ─────────────────────────────────────┐
// Per-voice tonestack → _epSendHPF → V3 → spring → V4A → pot ───┤→ _epV4B → poweramp → cabinet
var _epDryBus = null;           // GainNode: per-voice V2B outputs sum here
var _epSendHPF = null;          // BiquadFilter: HPF 318Hz on reverb send (500pF/1MΩ RC)
var _epV3Driver = null;         // WaveShaper: 12AT7 reverb driver (parallel triodes)
var _epV3LUT = null;            // Float32Array: 12AT7 driver LUT
var _epV4AGain = null;          // GainNode: reverb recovery amp (~36dB, essentially linear)
var _epReverbPot = null;        // GainNode: reverb return level control
var _epV4B = null;              // WaveShaper: post-mix 12AX7 stage ("bloom")
var _epV4BMakeup = null;        // GainNode: V4B output level
var _epPowerDrive = null;       // GainNode: shared poweramp drive control
var _epSharedPoweramp = null;   // WaveShaper: shared 6L6 poweramp
var _epSharedPowerMakeup = null;// GainNode: poweramp output level

// --- Current LUTs (Float32Array, recomputed on param change) ---
var _epPickupLUT = null;
var _epPreampLUT = null;
var _epPowerampLUT = null;

// --- Current tonestack IIR coefficients ---
var _epTonestackFF = null;  // feedforward (b coefficients)
var _epTonestackFB = null;  // feedback (a coefficients)

// --- E-Piano parameters (UI-controllable) ---
var EpState = {
  pickupSymmetry: 0.15,   // -1..1: vertical offset (0=center, +=more 2nd harmonic)
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
  use2ndPreamp: true,      // AB763 V2A+V2B (cathode follower + 2nd gain stage)
  brightSwitch: false,     // AB763 bright cap bypass (increases C1 → more treble)
  springReverbMix: 0.12,   // Spring reverb wet level (Fender "2-3" ≈ 0.08-0.15)
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
    useSpringReverb: true,   // Accutronics 4AB3C1B via V3 driver
  },
  'Rhodes Suitcase': {
    pickupType: 'rhodes',
    preampType: 'NE5534',
    powerampType: 'GeTr',
    useTonestack: true,
    useCabinet: true,
    useSpringReverb: false,  // Suitcase has vibrato, not spring reverb
  },
  'Wurlitzer 200A': {
    pickupType: 'wurlitzer',
    preampType: 'BJT',
    powerampType: 'SS',
    useTonestack: true,
    useCabinet: true,
    useSpringReverb: false,  // Built-in speaker, no spring reverb
  },
  'Rhodes DI': {
    pickupType: 'rhodes',
    preampType: null,
    powerampType: null,
    useTonestack: false,
    useCabinet: false,
    useSpringReverb: false,
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

function computeV3DriverLUT_12AT7() {
  // 12AT7 reverb driver — Koren model, both triode sections paralleled
  // AB763: V3 drives reverb output transformer (Hammond 1750A, 22.8kΩ primary)
  // Why 12AT7: low rp (10.9kΩ vs 62.5kΩ) = better current drive into transformer
  // Parallel triodes: rp halved to ~5.5kΩ, gm doubled to ~11mA/V
  //
  // Operating point (measured): Vgk=-8.2V, Vp≈450V, Ip≈1.86mA/section
  // High headroom: grid swings ±10V before clipping vs 12AX7's ±3V
  // At normal Volume (3-5): essentially clean
  // At pushed Volume (7+): grid conduction = gritty reverb character
  //
  // Refs: Koren tube model, ampbooks.com reverb driver analysis,
  //       Rob Robinette AB763, fenderguru.com tube specs
  var lut = new Float32Array(EP_LUT_SIZE);
  var mu = 60, ex = 1.35, kG1 = 460, kP = 300, kVB = 300;
  var Vgk_bias = -8.2;
  var gridSwing = 10.0; // wider than 12AX7 — more headroom before clipping

  var rawOut = new Float32Array(EP_LUT_SIZE);
  for (var i = 0; i < EP_LUT_SIZE; i++) {
    var x = (i / (EP_LUT_SIZE - 1)) * 2 - 1;
    var Vgk = Vgk_bias + x * gridSwing;
    // Grid conduction: soft clamp above ~0V (grid can't go much positive)
    if (Vgk > 0.3) Vgk = 0.3 + (Vgk - 0.3) * 0.02;
    // Koren plate current model (transformer-coupled: Vp stays near B+)
    var Vp = 450;
    var E1 = Math.log(1 + Math.exp(kP * (1 / mu + Vgk / Math.sqrt(kVB + Vp * Vp)))) / kP;
    var Ip = Math.pow(Math.max(E1, 0), ex) / kG1;
    rawOut[i] = Ip * 2; // parallel sections double the current
  }
  // Center at operating point, normalize to -1..1
  var Ip_rest = rawOut[Math.floor(EP_LUT_SIZE / 2)];
  var maxSwing = 0;
  for (var i = 0; i < EP_LUT_SIZE; i++) {
    lut[i] = rawOut[i] - Ip_rest;
    if (Math.abs(lut[i]) > maxSwing) maxSwing = Math.abs(lut[i]);
  }
  if (maxSwing > 0) {
    for (var i = 0; i < EP_LUT_SIZE; i++) lut[i] /= maxSwing;
  }
  return lut;
}

// ========================================
// TONESTACK (Fender TMB — Hybrid Biquad + WaveShaper)
// ========================================
// Biquad chain for frequency shaping (calibrated to Yeh & Smith 2006 AB763 curve)
// + mild WaveShaper between stages for nonlinear interaction (carbon comp saturation)
// → "chime" quality that pure linear IIR cannot produce
//
// Signal flow: HPF(DC block) → LowShelf(bass) → WS(mild saturation) → Peaking(mid scoop) → HighShelf(treble)
//
// Why not IIR: IIRFilterNode retains internal state after input drops → ringing artifacts
// amplified by downstream gain stages. BiquadFilterNode doesn't have this problem.
// Why WaveShaper: real passive tonestack has micro-nonlinearities from carbon comp resistors
// and capacitor dielectric absorption. These create subtle intermodulation that contributes
// to the "alive" quality of tube amps.

var _epTonestackSatLUT = null;

function _initTonestackSatLUT() {
  if (_epTonestackSatLUT) return;
  // Very mild saturation: models carbon composition resistor nonlinearity
  // At low signal: nearly linear. At peaks: gentle 2nd harmonic generation.
  var size = 256;
  _epTonestackSatLUT = new Float32Array(size);
  for (var i = 0; i < size; i++) {
    var x = (i / (size - 1)) * 2 - 1; // -1..1
    // Soft asymmetric saturation: slight 2nd harmonic bias
    // tanh(1.2x) + 0.05*x² gives ~1% 2nd harmonic at full scale
    _epTonestackSatLUT[i] = Math.tanh(1.2 * x) + 0.05 * x * Math.abs(x);
  }
  // Normalize so peak output = 1.0
  var peak = 0;
  for (var i = 0; i < size; i++) {
    if (Math.abs(_epTonestackSatLUT[i]) > peak) peak = Math.abs(_epTonestackSatLUT[i]);
  }
  if (peak > 0) {
    for (var i = 0; i < size; i++) _epTonestackSatLUT[i] /= peak;
  }
}

function computeTonestackParams(bass, mid, treble, bright) {
  // Returns Biquad parameters calibrated to AB763 Yeh & Smith curve:
  //   50Hz: +1dB, 100Hz: -1dB, 400Hz: -10dB, 600Hz: -11dB (scoop),
  //   1kHz: -9dB, 3kHz: -2dB, 8kHz: 0dB
  //
  // Knob ranges derived from Yeh & Smith coefficient sweep:
  //   Bass 0→1:  100Hz varies -16dB to 0dB (16dB range)
  //   Mid 0→1:   600Hz varies -20dB to -3dB (17dB range)
  //   Treble 0→1: 3kHz varies -14dB to 0dB (14dB range)

  // Clamp
  var b = Math.max(0, Math.min(1, bass));
  var m = Math.max(0, Math.min(1, mid));
  var t = Math.max(0, Math.min(1, treble));

  return {
    // DC blocking highpass (passive network has zero DC pass-through)
    hpf: { type: 'highpass', frequency: 30, Q: 0.707 },

    // Low shelf: bass control. Fender bass pot range ≈ 16 dB.
    // Center frequency 100Hz (AB763 bass cap + pot interaction)
    lowShelf: {
      type: 'lowshelf',
      frequency: 100,
      gain: -16 + b * 16  // -16 to 0 dB
    },

    // Mid scoop: peaking EQ. THE Fender TMB signature.
    // AB763 fixed 6.8K = deep scoop. Mid knob controls depth.
    // Q calibrated to match Yeh & Smith: scoop spans ~200Hz-2kHz
    midScoop: {
      type: 'peaking',
      frequency: 600,
      Q: 0.8,
      gain: -17 + m * 14  // -17 to -3 dB (always some scoop — Fender character)
    },

    // High shelf: treble control. Bright switch shifts the knee lower.
    // AB763 treble cap 250pF → bright bypass multiplies C1 → lower frequency
    highShelf: {
      type: 'highshelf',
      frequency: bright ? 1500 : 3000,
      gain: -14 + t * 14   // -14 to 0 dB
    }
  };
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
// SPRING REVERB IR (Allpass cascade — Abel/Välimäki/Parker)
// ========================================
// Accutronics 4AB3C1B (Twin Reverb): 2 springs, allpass dispersion model

function _createSpringReverbIR(ctx) {
  var sr = ctx.sampleRate;
  var len = Math.floor(sr * 2.5);
  var buf = ctx.createBuffer(2, len, sr);

  var springConfigs = [
    { delay: Math.floor(0.033 * sr), numAP: 800, apCoeff: 0.70 },
    { delay: Math.floor(0.041 * sr), numAP: 900, apCoeff: 0.72 },
  ];

  var chirpLen = Math.floor(0.40 * sr);
  var reflGain = 0.88;
  var numReflections = 30;

  for (var ch = 0; ch < 2; ch++) {
    var d = buf.getChannelData(ch);

    for (var s = 0; s < springConfigs.length; s++) {
      var sp = springConfigs[s];

      // Generate chirp: impulse → allpass cascade
      var chirp = new Float32Array(chirpLen);
      chirp[0] = 1.0;
      for (var n = 0; n < sp.numAP; n++) {
        var prev_x = 0, prev_y = 0;
        for (var i = 0; i < chirpLen; i++) {
          var x = chirp[i];
          var y = sp.apCoeff * x + prev_x - sp.apCoeff * prev_y;
          chirp[i] = y;
          prev_x = x;
          prev_y = y;
        }
      }

      // Add reflections with polarity inversion at fixed ends
      // Each reflection: shorter effective chirp (energy loss = HF dies first)
      var roundTrip = sp.delay * 2;
      var stereoOffset = ch * Math.floor(0.0025 * sr);
      for (var r = 0; r < numReflections; r++) {
        var reflStart = r * roundTrip + stereoOffset;
        var gain = Math.pow(reflGain, r);
        var polarity = (r % 2 === 0) ? 1.0 : -1.0;
        // Later reflections use shorter window of chirp (attack fades out)
        var effLen = Math.floor(chirpLen / (1 + r * 0.3));
        for (var i = 0; i < effLen; i++) {
          var idx = reflStart + i;
          if (idx >= 0 && idx < len) {
            // Fade within each reflection to avoid hard cutoff
            var fade = (i < effLen - 64) ? 1.0 : (effLen - i) / 64;
            d[idx] += chirp[i] * gain * polarity * fade * 15.0 / springConfigs.length;
          }
        }
      }
    }

    // Frequency-dependent decay (LPF progressive darkening)
    var lpfBase = Math.exp(-2 * Math.PI * 5000 / sr);
    var lpState = 0;
    for (var pass = 0; pass < 3; pass++) {
      lpState = 0;
      for (var i = 0; i < len; i++) {
        lpState = lpfBase * lpState + (1 - lpfBase) * d[i];
        var t = i / sr;
        var blend = Math.min(1, t / 2.5);
        d[i] = d[i] * (1 - blend * 0.3) + lpState * blend * 0.3;
      }
    }

    // Bandpass 100Hz-6kHz
    var hpAlpha = 1 - Math.exp(-2 * Math.PI * 100 / sr);
    var lpAlpha2 = Math.exp(-2 * Math.PI * 6000 / sr);
    var hpPrev = 0, lpPrev = 0;
    for (var i = 0; i < len; i++) {
      var hpOut = d[i] - hpPrev;
      hpPrev += hpAlpha * hpOut;
      lpPrev = lpAlpha2 * lpPrev + (1 - lpAlpha2) * hpOut;
      d[i] = lpPrev;
    }

    // RMS normalize
    var rmsSum = 0;
    for (var i = 0; i < len; i++) rmsSum += d[i] * d[i];
    var rms = Math.sqrt(rmsSum / len);
    if (rms > 0) {
      var scale = 0.15 / rms;
      for (var i = 0; i < len; i++) {
        d[i] = Math.max(-1, Math.min(1, d[i] * scale));
      }
    }
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

  // === AB763 SHARED SIGNAL CHAIN (correct Fender reverb routing) ===
  //
  // Real AB763 Vibrato channel signal flow:
  //   V1A → V2A(CF) → tonestack → Volume pot
  //     ├─ [SEND] HPF(318Hz) → V3(12AT7) → spring tank → V4A(recovery) → reverb pot ─┐
  //     └─ [DRY]  V2B(gain) ──────────────────────────────────────────────────────────────┤
  //                                                     passive mix at V4B grid ←─────────┘
  //                                                             ↓
  //                                                     V4B (12AX7, 3rd gain stage)
  //                                                             ↓
  //                                                     tremolo → phase inverter
  //                                                             ↓
  //                                                     poweramp (4×6L6) → cabinet
  //
  // Key insight: wet and dry go through the SAME V4B → poweramp → cabinet.
  // Their interaction in V4B creates the "bloom" — harmonics that neither signal
  // produces alone. This is why routing matters more than IR quality.

  // --- 1. Cabinet (end of chain) ---
  _epCabinetNode = ctx.createConvolver();
  _epCabinetNode.buffer = _createCabinetIR(ctx, 'twin');
  _epCabinetGain = ctx.createGain();
  _epCabinetGain.gain.setValueAtTime(6.0, 0); // rebalanced for gain staging redesign
  _epCabinetNode.connect(_epCabinetGain);
  _epCabinetGain.connect(masterDest);
  _loadRealCabinetIR(ctx);

  // --- 2. Shared poweramp (6L6 push-pull Class AB) ---
  // Moved from per-voice to shared: all notes interact in the power stage
  // (real amp has ONE power amp for all notes)
  _epSharedPowerMakeup = ctx.createGain();
  _epSharedPowerMakeup.gain.setValueAtTime(2.0, 0); // compensates for poweramp unity-gain normalization
  _epSharedPowerMakeup.connect(_epCabinetNode);

  _epSharedPoweramp = ctx.createWaveShaper();
  _epSharedPoweramp.oversample = '2x';
  _epSharedPoweramp.connect(_epSharedPowerMakeup);

  _epPowerDrive = ctx.createGain();
  _epPowerDrive.gain.setValueAtTime(EpState.powerampDrive, 0);
  _epPowerDrive.connect(_epSharedPoweramp);

  // --- 3. V4B: post-mix tube stage (12AX7) ---
  // Wet + dry sum at V4B's grid through passive resistor network.
  // V4B's nonlinearity creates intermodulation between reverb tail and notes = "bloom".
  // Uses same 12AX7 characteristics as V1A/V2B (shared cathode with V4A: 820Ω)
  _epV4BMakeup = ctx.createGain();
  _epV4BMakeup.gain.setValueAtTime(1.5, 0); // V4B is now unity-gain; makeup provides actual gain
  _epV4BMakeup.connect(_epPowerDrive);

  _epV4B = ctx.createWaveShaper();
  // V4B LUT: 12AX7 normalized to unity center gain (no amplification in linear region)
  // Small signals pass through unchanged (no intermodulation/metallic artifacts).
  // Large signals get soft-clipped (tube compression for chords = "bloom").
  // Raw 12AX7 LUT has center slope ~2.0; dividing by slope gives unity gain.
  var v4bRaw = computePreampLUT_12AX7();
  var v4bCenter = Math.floor(EP_LUT_SIZE / 2);
  var v4bDx = 2.0 / EP_LUT_SIZE;
  var v4bSlope = (v4bRaw[v4bCenter + 1] - v4bRaw[v4bCenter - 1]) / (2 * v4bDx);
  if (v4bSlope > 1.0) {
    for (var i = 0; i < EP_LUT_SIZE; i++) v4bRaw[i] /= v4bSlope;
  }
  _epV4B.curve = v4bRaw;
  _epV4B.oversample = 'none';
  _epV4B.connect(_epV4BMakeup);

  // --- 4. Dry bus ---
  // Per-voice V2B outputs sum here.
  // In real circuit: V2B plate → 3.3MΩ/220kΩ divider → V4B grid (6.25% pass-through)
  // The 10pF bright cap across 3.3MΩ preserves high frequencies in dry path.
  // Web Audio gain calibrated for musical levels (not literal circuit ratios).
  _epDryBus = ctx.createGain();
  _epDryBus.gain.setValueAtTime(0.7, 0); // V2B recovery increases signal; 0.7 targets V4B at ~22% WS
  _epDryBus.connect(_epV4B);

  // --- 5. Reverb send chain: HPF → V3 → spring → V4A → pot → V4B ---

  // 5a. HPF: 500pF / 1MΩ RC network (-3dB at 318Hz)
  // Keeps bass out of reverb — critical because spring tank input impedance
  // is reactive (lower at low freq → bass draws more current → mud)
  _epSendHPF = ctx.createBiquadFilter();
  _epSendHPF.type = 'highpass';
  _epSendHPF.frequency.setValueAtTime(318, 0);
  _epSendHPF.Q.setValueAtTime(0.707, 0);

  // 5b. Reverb send bandwidth limiting (3-layer model of real circuit)
  //
  // Real AB763 reverb send has THREE mechanisms that limit HF:
  //   1. Hammond 1750A transformer leakage inductance → gentle rolloff
  //   2. Tank drive coil is INDUCTIVE: impedance ∝ frequency (14.75kΩ at 10kHz)
  //      + 22kΩ parallel resistor → constant current drive limited to ~6.5kHz
  //   3. Mechanical spring response → "output above 7kHz is almost nil"
  //
  // Combined: passes 200Hz-6kHz, steep cliff above 6-7kHz.
  // Model: highshelf (gradual tilt from coil inductance)
  //        + 2-stage LPF at 5kHz (transformer + mechanical cutoff)
  //
  // Ref: sound-au.com/articles/reverb.htm, ampbooks.com/classic-circuits/reverb/

  // 5c. V3 reverb driver (12AT7 parallel triodes)
  // Signal path: HPF → V3 drive → V3 WS → transformer → tank
  // V3 amplifies the post-tonestack signal, then transformer filters V3's output.
  // CRITICAL: transformer is AFTER V3, so V3's generated harmonics get filtered too.
  _epV3LUT = computeV3DriverLUT_12AT7();
  var _epV3Drive = ctx.createGain();
  _epV3Drive.gain.setValueAtTime(6.0, 0); // studio level: clean but adds subtle harmonics
  _epV3Driver = ctx.createWaveShaper();
  _epV3Driver.curve = _epV3LUT;
  _epV3Driver.oversample = 'none';
  _epSendHPF.connect(_epV3Drive);
  _epV3Drive.connect(_epV3Driver);

  // 5d. Post-V3 bandwidth limiting (Hammond 1750A transformer + tank input)
  //
  // This goes AFTER V3 — the transformer filters V3's output including
  // any harmonics generated by the tube's nonlinearity.
  //
  // Real circuit has THREE mechanisms:
  //   1. Hammond 1750A leakage inductance → gentle HF rolloff
  //   2. Tank drive coil is INDUCTIVE: impedance ∝ freq (14.75kΩ at 10kHz)
  //      + 22kΩ parallel resistor → constant current drive limited to ~6.5kHz
  //   3. Mechanical spring response → "output above 7kHz is almost nil"
  //
  // Model: highshelf (coil inductance tilt) + 2-stage LPF (transformer + mechanical)
  // Ref: sound-au.com/articles/reverb.htm, ampbooks.com/classic-circuits/reverb/

  // Layer 1: inductive tilt (-6dB shelf above 3kHz, models coil impedance rise)
  var _epSendTilt = ctx.createBiquadFilter();
  _epSendTilt.type = 'highshelf';
  _epSendTilt.frequency.setValueAtTime(3000, 0);
  _epSendTilt.gain.setValueAtTime(-6, 0);
  _epV3Driver.connect(_epSendTilt);

  // Layer 2+3: transformer + mechanical cutoff (steep above 5kHz)
  var _epSendLPF1 = ctx.createBiquadFilter();
  _epSendLPF1.type = 'lowpass';
  _epSendLPF1.frequency.setValueAtTime(5000, 0);
  _epSendLPF1.Q.setValueAtTime(0.707, 0);
  var _epSendLPF2 = ctx.createBiquadFilter();
  _epSendLPF2.type = 'lowpass';
  _epSendLPF2.frequency.setValueAtTime(5000, 0);
  _epSendLPF2.Q.setValueAtTime(0.707, 0);
  _epSendTilt.connect(_epSendLPF1);
  _epSendLPF1.connect(_epSendLPF2);

  // 5c. Spring reverb (Accutronics 4AB3C1B, allpass cascade model)
  _epSpringReverb = ctx.createConvolver();
  _epSpringReverb.buffer = _createSpringReverbIR(ctx);
  _epSendLPF2.connect(_epSpringReverb);

  // 5d. V4A recovery amp (~36dB voltage gain, essentially linear)
  // Signal from tank output is millivolts — V4A brings it to line level.
  // Shares 820Ω cathode resistor with V4B (runs clean due to tiny input signal)
  _epV4AGain = ctx.createGain();
  _epV4AGain.gain.setValueAtTime(0.08, 0); // V3 drive ×6 amplifies spring input; V4A compensates (6×0.08≈0.5 = original wet level)
  _epSpringReverb.connect(_epV4AGain);

  // 5e. Reverb pot (100kΩ log, controls RETURN level — send is always full)
  // Models 470kΩ/220kΩ resistive divider at V4B grid (passes 32%)
  _epReverbPot = ctx.createGain();
  _epReverbPot.gain.setValueAtTime(EpState.springReverbMix, 0);
  _epV4AGain.connect(_epReverbPot);
  _epReverbPot.connect(_epV4B); // wet → V4B (meets dry at same node)

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

  // Update shared WaveShapers (these persist across noteOn/noteOff)
  if (_epSharedPoweramp && _epPowerampLUT) {
    // Normalize to unity center gain (same as V4B — prevents hidden amplification
    // that creates intermodulation and rounds off bell/chime quality)
    var paCenter = Math.floor(EP_LUT_SIZE / 2);
    var paDx = 2.0 / EP_LUT_SIZE;
    var paSlope = (_epPowerampLUT[paCenter + 1] - _epPowerampLUT[paCenter - 1]) / (2 * paDx);
    if (paSlope > 1.0) {
      for (var i = 0; i < EP_LUT_SIZE; i++) _epPowerampLUT[i] /= paSlope;
    }
    _epSharedPoweramp.curve = _epPowerampLUT;
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
    // Mode amplitude WITHOUT tineAmplitude — voiceMixer already applies velocity.
    // Previous: amp = amplitudes[m] * tineAmplitude * mixLevel → signal = tineAmplitude² (0.09 at ff)
    // Now: amp = amplitudes[m] * mixLevel → signal = tineAmplitude (0.3 at ff)
    // This drives PU WaveShaper into its nonlinear region → 2nd harmonic → bell quality.
    var amp = modes.amplitudes[m] * mixLevel;
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

    // LPF before pickup: real PU has limited electromagnetic bandwidth.
    // High beam modes (20×, 40×) at high notes exceed Nyquist or create
    // aliasing artifacts when going through WaveShaper (oversample=none).
    var metalLPF = ctx.createBiquadFilter();
    metalLPF.type = 'lowpass';
    metalLPF.frequency.setValueAtTime(4000, now); // PU bandwidth limit
    metalLPF.Q.setValueAtTime(0.707, now);

    var metalGain = ctx.createGain();
    metalGain.gain.setValueAtTime(velocity * 0.4 * EpState.metalMix, now);

    metalSrc.connect(metalLPF);
    metalLPF.connect(metalGain);
    metalSrc.start(now);
    nodes.push(metalLPF);
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
  // High notes: shorter tines = less displacement = less PU drive (prevents hysteric overtones)
  var pitchPUScale = 1.0 + Math.max(0, (60 - midi)) * 0.004  // low: up to ~1.15×
                         - Math.max(0, (midi - 72)) * 0.008;  // high (above C5): reduce, ~0.6× at C7
  if (pitchPUScale < 0.4) pitchPUScale = 0.4; // floor
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
    // PU Drive: push signal into WaveShaper's nonlinear region.
    // Real Rhodes tine is very close to PU → steep magnetic gradient →
    // small displacement causes large flux change → strong harmonics.
    // Drive must stay below ±1 at WaveShaper input (hard clamp = digital crackle).
    // Max input: tine(0.3) × attackBoost(1.5) + metal(0.4×1.5) ≈ 1.05 at ff+metal.
    // Drive 0.85 → peak ~0.89 (within ±1). Bell harmonics from LUT asymmetry.
    var pickupDrive = ctx.createGain();
    pickupDrive.gain.setValueAtTime(0.85, now);
    lastNode.connect(pickupDrive);
    lastNode = pickupDrive;
    nodes.push(pickupDrive);

    var pickupWS = ctx.createWaveShaper();
    pickupWS.curve = _epPickupLUT;
    pickupWS.oversample = 'none';
    lastNode.connect(pickupWS);
    lastNode = pickupWS;
    nodes.push(pickupWS);
    // Makeup: compensate drive compression + maintain signal level for next stage.
    var pickupMakeup = ctx.createGain();
    pickupMakeup.gain.setValueAtTime(1.0, now);
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
    // Makeup gain after preamp — keep within ±1 for next stage
    var preampMakeup = ctx.createGain();
    preampMakeup.gain.setValueAtTime(1.0, now);
    lastNode.connect(preampMakeup);
    lastNode = preampMakeup;
    nodes.push(preampMakeup);
  }

  // --- 4b. Cathode Follower (V2A) — impedance buffer ---
  // AB763: V2A sits between V1A and tonestack. Gain ≈ 1 (slight loss from
  // cathode follower topology), low output impedance to drive passive tonestack
  // without loading. Minimal nonlinearity — modeled as simple gain.
  if (preset.preampType === '12AX7' && EpState.use2ndPreamp) {
    var cfGain = ctx.createGain();
    cfGain.gain.setValueAtTime(0.95, now);
    lastNode.connect(cfGain);
    lastNode = cfGain;
    nodes.push(cfGain);
  }

  // --- 5. Tonestack (Passive RC — linear filter only) ---
  // AB763 TMB is a passive RC network: NO nonlinear behavior.
  // Carbon comp resistor "nonlinearity" is unmeasurable in AC audio applications
  // (no DC bias across signal components). WaveShaper removed (2026-03-23).
  // Future: replace Biquad approximation with Yeh & Smith 3rd-order IIR (AudioWorklet).
  if (preset.useTonestack) {
    var tsP = computeTonestackParams(
      EpState.tonestackBass, EpState.tonestackMid, EpState.tonestackTreble,
      EpState.brightSwitch
    );

    // 5a. DC blocking HPF
    var tsHPF = ctx.createBiquadFilter();
    tsHPF.type = tsP.hpf.type;
    tsHPF.frequency.setValueAtTime(tsP.hpf.frequency, now);
    tsHPF.Q.setValueAtTime(tsP.hpf.Q, now);
    lastNode.connect(tsHPF);
    lastNode = tsHPF;
    nodes.push(tsHPF);

    // 5b. Low shelf (bass)
    var tsLow = ctx.createBiquadFilter();
    tsLow.type = tsP.lowShelf.type;
    tsLow.frequency.setValueAtTime(tsP.lowShelf.frequency, now);
    tsLow.gain.setValueAtTime(tsP.lowShelf.gain, now);
    lastNode.connect(tsLow);
    lastNode = tsLow;
    nodes.push(tsLow);

    // 5c. Mid scoop (peaking EQ — THE Fender signature)
    var tsMid = ctx.createBiquadFilter();
    tsMid.type = tsP.midScoop.type;
    tsMid.frequency.setValueAtTime(tsP.midScoop.frequency, now);
    tsMid.Q.setValueAtTime(tsP.midScoop.Q, now);
    tsMid.gain.setValueAtTime(tsP.midScoop.gain, now);
    lastNode.connect(tsMid);
    lastNode = tsMid;
    nodes.push(tsMid);

    // 5d. High shelf (treble + bright switch)
    var tsHigh = ctx.createBiquadFilter();
    tsHigh.type = tsP.highShelf.type;
    tsHigh.frequency.setValueAtTime(tsP.highShelf.frequency, now);
    tsHigh.gain.setValueAtTime(tsP.highShelf.gain, now);
    lastNode.connect(tsHigh);
    lastNode = tsHigh;
    nodes.push(tsHigh);
  }

  // --- 5.5. Tonestack insertion loss ---
  // Real Fender TMB is a passive voltage divider. Even at "neutral" knob settings,
  // broadband insertion loss is -23 to -25dB. The Biquad shelves model the
  // frequency SHAPE (~-5dB) but NOT the insertion loss.
  // This GainNode models the missing ~-18dB (total with Biquads ≈ -23dB).
  // "昔はできるだけクリーンに作りたかった。でも出来なかっただけ" — urinami-san
  if (preset.useTonestack) {
    var tsInsertionLoss = ctx.createGain();
    tsInsertionLoss.gain.setValueAtTime(0.2, now); // -14dB: passive RC voltage divider loss (studio level)
    lastNode.connect(tsInsertionLoss);
    lastNode = tsInsertionLoss;
    nodes.push(tsInsertionLoss);
  }

  // --- 5.6. Reverb send (AB763: post-tonestack → HPF(318Hz) → V3 → spring → V4A → pot → V4B) ---
  // Send taps AFTER tonestack insertion loss (matches real AB763: send is post-Volume-pot level).
  // V3 (12AT7) drives the tank — mostly clean, compresses HF transients when driven.
  // Wet returns through V4A recovery and meets dry at V4B (shared "bloom" stage).
  if (_epSendHPF && preset.useSpringReverb) {
    lastNode.connect(_epSendHPF);
  }

  // --- 5b. 2nd Preamp Stage (V2B) — recovery amp after tonestack ---
  // AB763: V2B recovers the massive tonestack loss (×57 in real circuit).
  // This is NOT a user-adjustable "drive" — it's a fixed circuit-determined recovery gain.
  // Real V2B: 47mV in → 2.7V out. Our ×8 drive pushes post-loss signal to ~22% WS range.
  // The tonestack-shaped harmonics get another round of tube nonlinearity:
  //   2nd-of-2nd = 4th harmonic, 2nd×3rd = 5th, beam mode 7.11× products
  //   → intermodulation density and "shimmer" that 1 stage can't produce
  if (preset.preampType === '12AX7' && _epPreampLUT && EpState.use2ndPreamp) {
    var preamp2InputGain = ctx.createGain();
    preamp2InputGain.gain.setValueAtTime(5.0, now); // fixed recovery: ×5 into WS → ~15% operating point
    lastNode.connect(preamp2InputGain);
    lastNode = preamp2InputGain;
    nodes.push(preamp2InputGain);

    var preamp2WS = ctx.createWaveShaper();
    preamp2WS.curve = _epPreampLUT;
    preamp2WS.oversample = 'none'; // latency budget: PU(none)+V1A(2x)+V2B(none)+power(2x) = 2 stages at 2x
    lastNode.connect(preamp2WS);
    lastNode = preamp2WS;
    nodes.push(preamp2WS);

    // Makeup gain — V2B recovery output
    var preamp2Makeup = ctx.createGain();
    preamp2Makeup.gain.setValueAtTime(1.5, now); // compensates WS compression + feeds dry bus at correct level
    lastNode.connect(preamp2Makeup);
    lastNode = preamp2Makeup;
    nodes.push(preamp2Makeup);
  }

  // --- 6. Route to shared AB763 chain or direct output ---
  // Cabinet presets: per-voice ends at V2B → shared dry bus → V4B → poweramp → cabinet
  // DI preset: per-voice output goes directly to masterDest (no shared chain)
  // Poweramp moved from per-voice to shared (real amp: all notes through ONE power stage)
  if (preset.useCabinet && _epDryBus) {
    lastNode.connect(_epDryBus);
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
