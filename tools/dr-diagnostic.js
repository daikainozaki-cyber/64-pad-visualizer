#!/usr/bin/env node
// DR Diagnostic: compute unclamped tine amplitudes for all 88 keys
// Mirrors computeTineAmplitude() from epiano-worklet-processor.js exactly.

var TINE_EI = 180e9 * Math.PI * Math.pow(1e-3, 4) / 4; // 1.414e-4 N⋅m²

var TINE_LENGTH_TABLE = [
  157.0, 157.0, 157.0, 157.0, 157.0, 157.0, 157.0, 153.8,
  150.6, 147.4, 144.2, 141.0, 137.9, 134.7, 131.5, 128.3,
  125.1, 121.9, 118.7, 115.5, 112.4, 109.2, 106.0, 102.8,
  99.6, 96.4, 93.2, 90.1, 86.9, 83.7, 80.5, 77.3,
  74.1, 71.0, 67.8, 65.4, 63.0, 60.6, 58.3, 56.0,
  54.7, 53.4, 52.2, 50.9, 49.8, 48.6, 47.5, 46.3,
  45.3, 44.2, 43.2, 42.2, 41.2, 40.2, 39.3, 38.4,
  37.5, 36.6, 35.7, 34.9, 34.1, 33.3, 32.5, 31.7,
  31.0, 30.3, 29.6, 28.9, 28.2, 27.5, 26.9, 26.3,
  25.7, 25.1, 24.5, 23.9, 23.3, 22.8, 22.3, 21.7,
  21.2, 20.7, 20.3, 19.8, 19.3, 18.9, 18.4, 18.0
];

function tineLength(midi) {
  var idx = midi - 21;
  if (idx >= 0 && idx < 88) return TINE_LENGTH_TABLE[idx];
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

function escapementMm(midi) {
  var key = midi - 20;
  if (key < 1) key = 1; if (key > 88) key = 88;
  var t = (key - 1) / 87;
  return 7.94 * (1 - t) + 1.59 * t;
}

var BETAL = [1.8751, 4.6941, 7.8548];
var SIGMA = [0.7341, 1.0185, 0.9992];

function cantileverPhi(xi, m) {
  var bx = BETAL[m] * xi;
  return Math.cosh(bx) - Math.cos(bx) - SIGMA[m] * (Math.sinh(bx) - Math.sin(bx));
}
var PHI_TIP = [cantileverPhi(1.0, 0), cantileverPhi(1.0, 1), cantileverPhi(1.0, 2)];

function modeExcitation(xi, m) {
  return cantileverPhi(xi, m) / PHI_TIP[m];
}

var HAMMER_RELMASS = [0.67, 0.83, 1.00, 1.17, 0.67];

function getHammerRelMass(midi) {
  var key = midi - 20;
  if (key <= 30) return HAMMER_RELMASS[0];
  if (key <= 40) return HAMMER_RELMASS[1];
  if (key <= 50) return HAMMER_RELMASS[2];
  if (key <= 64) return HAMMER_RELMASS[3];
  return HAMMER_RELMASS[4];
}

// A4 reference (forte, vel=1.0)
var Lr = tineLength(69) * 1e-3;
var Lr3 = Lr * Lr * Lr;
var k_ref = 3 * TINE_EI / Lr3;
var m_ref = getHammerRelMass(69) * 0.030;
var xsr = strikingLine(69) * 1e-3;
var xir = Math.min(xsr / Lr, 0.95);
var phir = modeExcitation(xir, 0);
var TINE_A4_RAW = Math.sqrt(m_ref / k_ref) * 1.0 * phir;

var noteNames = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];

console.log('=== Rhodes Dynamic Range Diagnostic ===');
console.log('TINE_EI:', TINE_EI.toExponential(4));
console.log('A4 ref: L=' + (Lr*1000).toFixed(1) + 'mm k_eff=' + k_ref.toFixed(3) +
  ' m_h=' + (m_ref*1000).toFixed(1) + 'g xi=' + xir.toFixed(3) +
  ' phi=' + phir.toFixed(4) + ' A4_RAW=' + TINE_A4_RAW.toExponential(4));
console.log('');
console.log('MIDI | Note  | L(mm)  | k_eff    | sqrt(m/k) | xi    | phi   | esc(mm) | ff(mm)  | pp(mm)  | ff_clamp | pp_clamp | DR_eff');
console.log('-----|-------|--------|----------|-----------|-------|-------|---------|---------|---------|----------|----------|-------');

for (var midi = 21; midi <= 108; midi++) {
  var L_m = tineLength(midi) * 1e-3;
  var L3 = L_m * L_m * L_m;
  var k_eff = 3 * TINE_EI / L3;
  var m_hammer = getHammerRelMass(midi) * 0.030;
  var sqrtMK = Math.sqrt(m_hammer / k_eff);

  var xs_m = strikingLine(midi) * 1e-3;
  var xi = Math.min(xs_m / L_m, 0.95);
  var phi = modeExcitation(xi, 0);

  var escMm = escapementMm(midi);
  var escDynamic = escMm / 7.94;

  // Forte (vel=1.0)
  var velFF = Math.pow(1.0, 1.0 / (0.5 + 0.5 * escDynamic));
  var A_ff = Math.sqrt(m_hammer / k_eff) * Math.sqrt(velFF) * phi;
  var ff_pu = (A_ff / TINE_A4_RAW) * 0.12;
  var ff_mm = ff_pu * 25;

  // PP (vel=0.03)
  var velPP = Math.pow(0.03, 1.0 / (0.5 + 0.5 * escDynamic));
  var A_pp = Math.sqrt(m_hammer / k_eff) * Math.sqrt(velPP) * phi;
  var pp_pu = (A_pp / TINE_A4_RAW) * 0.12;
  var pp_mm = pp_pu * 25;

  var ff_clamp = ff_mm > escMm;
  var pp_clamp = pp_mm > escMm;
  var ff_eff = ff_clamp ? escMm : ff_mm;
  var pp_eff = pp_clamp ? escMm : pp_mm;
  var dr = pp_eff > 0.001 ? (ff_eff / pp_eff) : 999;

  var nn = noteNames[midi % 12] + (Math.floor(midi / 12) - 1);
  nn = (nn + '     ').substring(0, 5);

  var flag = '';
  if (ff_clamp && pp_clamp) flag = ' *** BOTH CLAMPED - DR=0';
  else if (ff_clamp) flag = ' ** ff clamped';
  else if (dr < 2) flag = ' * low DR';

  console.log(
    (midi + '    ').substring(0, 4) + ' | ' + nn + ' | ' +
    (tineLength(midi)).toFixed(1).padStart(6) + ' | ' +
    k_eff.toFixed(3).padStart(8) + ' | ' +
    (sqrtMK * 1000).toFixed(1).padStart(9) + ' | ' +
    xi.toFixed(3).padStart(5) + ' | ' +
    phi.toFixed(3).padStart(5) + ' | ' +
    escMm.toFixed(2).padStart(7) + ' | ' +
    ff_mm.toFixed(2).padStart(7) + ' | ' +
    pp_mm.toFixed(2).padStart(7) + ' | ' +
    (ff_clamp ? 'CLAMP' : '  ok ').padStart(8) + ' | ' +
    (pp_clamp ? 'CLAMP' : '  ok ').padStart(8) + ' | ' +
    dr.toFixed(1).padStart(5) + flag
  );
}

// --- Part 2: qRange and PU input fractions ---
console.log('\n=== PU Distortion Balance Diagnostic ===');
console.log('MIDI | Note  | tineAmp_ff | tipFactor | qRange | puInput_ff | puInput_pp | distortion_ratio');

// tipDisplacementFactor uses BEAM_PHI_STRIKE which we don't have in Node.
// Approximate with the E-B mode shape (same as fallback).
function tipDisplacementFactor_approx(midi) {
  var L = tineLength(midi);
  var xs = strikingLine(midi);
  var xi = Math.min(xs / L, 0.95);
  var phi = modeExcitation(xi, 0);
  var relMass = getHammerRelMass(midi);
  var massScale = Math.sqrt(relMass);
  // Reference B3 (MIDI 59)
  var Lr = tineLength(59);
  var xsr = strikingLine(59);
  var xir = Math.min(xsr / Lr, 0.95);
  var phir = modeExcitation(xir, 0);
  var hr_mass = getHammerRelMass(59);
  var TIP_REF = Math.sqrt(hr_mass) * Math.pow(Lr, 1.5) * phir;
  return massScale * Math.pow(L, 1.5) * phi / TIP_REF;
}

for (var midi = 21; midi <= 108; midi += 3) { // every 3 semitones
  var L_m = tineLength(midi) * 1e-3;
  var L3 = L_m * L_m * L_m;
  var k_eff = 3 * TINE_EI / L3;
  var m_hammer = getHammerRelMass(midi) * 0.030;
  var xs_m = strikingLine(midi) * 1e-3;
  var xi = Math.min(xs_m / L_m, 0.95);
  var phi = modeExcitation(xi, 0);
  var escMm = escapementMm(midi);
  var escDynamic = escMm / 7.94;

  // ff (vel=1.0)
  var velFF = Math.pow(1.0, 1.0 / (0.5 + 0.5 * escDynamic));
  var A_ff = Math.sqrt(m_hammer / k_eff) * Math.sqrt(velFF) * phi;
  var ff_pu = (A_ff / TINE_A4_RAW) * 0.12;

  // pp (vel=0.03)
  var velPP = Math.pow(0.03, 1.0 / (0.5 + 0.5 * escDynamic));
  var A_pp = Math.sqrt(m_hammer / k_eff) * Math.sqrt(velPP) * phi;
  var pp_pu = (A_pp / TINE_A4_RAW) * 0.12;

  var tipFactor = tipDisplacementFactor_approx(midi);
  var qRange = tipFactor * 0.4;
  if (qRange < 0.12) qRange = 0.12;
  if (qRange > 0.8) qRange = 0.8;

  var puInput_ff = ff_pu / qRange;
  var puInput_pp = pp_pu / qRange;

  var nn = noteNames[midi % 12] + (Math.floor(midi / 12) - 1);
  nn = (nn + '     ').substring(0, 5);

  console.log(
    (midi + '    ').substring(0, 4) + ' | ' + nn + ' | ' +
    ff_pu.toFixed(4).padStart(10) + ' | ' +
    tipFactor.toFixed(3).padStart(9) + ' | ' +
    qRange.toFixed(3).padStart(6) + ' | ' +
    puInput_ff.toFixed(3).padStart(10) + ' | ' +
    puInput_pp.toFixed(3).padStart(10) + ' | ' +
    (puInput_ff > 0.5 ? 'HIGH' : puInput_ff > 0.3 ? 'mod' : 'low')
  );
}
