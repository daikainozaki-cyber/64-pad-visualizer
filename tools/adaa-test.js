// ADAA correctness test
var LUT_SIZE = 1024;
var LUT_MASK = LUT_SIZE - 1;

function lutLookup(lut, x) {
  var pos = (x * 0.5 + 0.5) * LUT_MASK;
  if (pos < 0) pos = 0;
  if (pos > LUT_MASK) pos = LUT_MASK;
  var idx = pos | 0;
  var frac = pos - idx;
  if (idx >= LUT_MASK) return lut[LUT_MASK];
  return lut[idx] + frac * (lut[idx + 1] - lut[idx]);
}

function computeADAALut(lut) {
  var adaa = new Float32Array(LUT_SIZE);
  var dx = 2.0 / LUT_MASK;
  adaa[0] = 0;
  for (var i = 1; i < LUT_SIZE; i++) {
    adaa[i] = adaa[i - 1] + (lut[i - 1] + lut[i]) * 0.5 * dx;
  }
  return adaa;
}

var ADAA_EPS = 1e-5;
function adaaLookup(lut, adaaLut, x, prevX) {
  var diff = x - prevX;
  if (diff > ADAA_EPS || diff < -ADAA_EPS) {
    return (lutLookup(adaaLut, x) - lutLookup(adaaLut, prevX)) / diff;
  }
  return lutLookup(lut, x);
}

// Test 1: Identity LUT (f(x) = x)
console.log('=== Test 1: Identity f(x) = x ===');
var identityLUT = new Float32Array(LUT_SIZE);
for (var i = 0; i < LUT_SIZE; i++) {
  identityLUT[i] = (i / LUT_MASK) * 2 - 1; // maps [0,1023] → [-1,+1]
}
var identityADAA = computeADAALut(identityLUT);
console.log('F(-1)=' + identityADAA[0].toFixed(4) + ' F(0)=' + lutLookup(identityADAA, 0).toFixed(4) + ' F(1)=' + identityADAA[LUT_MASK].toFixed(4));

// Simulate a sine wave and compare ADAA vs direct
var fs = 48000, freq = 440, amp = 0.5;
var prevX = 0, maxErr = 0, sumDirect = 0, sumADAA = 0;
for (var n = 0; n < 1024; n++) {
  var x = amp * Math.sin(2 * Math.PI * freq * n / fs);
  var direct = lutLookup(identityLUT, x);
  var adaa = adaaLookup(identityLUT, identityADAA, x, prevX);
  var err = Math.abs(direct - adaa);
  if (err > maxErr) maxErr = err;
  sumDirect += direct * direct;
  sumADAA += adaa * adaa;
  prevX = x;
}
console.log('Identity: maxErr=' + maxErr.toFixed(6) + ' RMS_direct=' + Math.sqrt(sumDirect/1024).toFixed(4) + ' RMS_adaa=' + Math.sqrt(sumADAA/1024).toFixed(4));

// Test 2: Hard clip LUT (f(x) = tanh(3x))
console.log('\n=== Test 2: Soft clip f(x) = tanh(3x) ===');
var clipLUT = new Float32Array(LUT_SIZE);
for (var i = 0; i < LUT_SIZE; i++) {
  var x = (i / LUT_MASK) * 2 - 1;
  clipLUT[i] = Math.tanh(3 * x);
}
var clipADAA = computeADAALut(clipLUT);
console.log('F(-1)=' + clipADAA[0].toFixed(4) + ' F(0)=' + lutLookup(clipADAA, 0).toFixed(4) + ' F(1)=' + clipADAA[LUT_MASK].toFixed(4));

prevX = 0; maxErr = 0; sumDirect = 0; sumADAA = 0;
for (var n = 0; n < 1024; n++) {
  var x = 0.8 * Math.sin(2 * Math.PI * freq * n / fs);
  var direct = lutLookup(clipLUT, x);
  var adaa = adaaLookup(clipLUT, clipADAA, x, prevX);
  var err = Math.abs(direct - adaa);
  if (err > maxErr) maxErr = err;
  sumDirect += direct * direct;
  sumADAA += adaa * adaa;
  prevX = x;
}
console.log('Clip: maxErr=' + maxErr.toFixed(6) + ' RMS_direct=' + Math.sqrt(sumDirect/1024).toFixed(4) + ' RMS_adaa=' + Math.sqrt(sumADAA/1024).toFixed(4));
console.log('Ratio RMS_adaa/RMS_direct = ' + (Math.sqrt(sumADAA/1024) / Math.sqrt(sumDirect/1024)).toFixed(4));

// Test 3: Check sample-by-sample output comparison
console.log('\n=== Test 3: Sample comparison (first 20 samples) ===');
prevX = 0;
for (var n = 0; n < 20; n++) {
  var x = 0.8 * Math.sin(2 * Math.PI * freq * n / fs);
  var direct = lutLookup(clipLUT, x);
  var adaa = adaaLookup(clipLUT, clipADAA, x, prevX);
  console.log('n=' + n + ' x=' + x.toFixed(4) + ' direct=' + direct.toFixed(4) + ' adaa=' + adaa.toFixed(4) + ' ratio=' + (direct !== 0 ? (adaa/direct).toFixed(3) : 'N/A'));
  prevX = x;
}
