// ========================================
// SPRING REVERB AudioWorklet PROCESSOR
// ========================================
// Välimäki, Parker & Abel (2010) "Parametric Spring Reverberation Effect"
// Two-block model: low chirps (stretched AP) + high chirps (standard AP)
// Accutronics 4AB3C1B (Fender Twin Reverb): 2 springs, stereo decorrelation
//
// References:
//   [1] Välimäki, Parker & Abel (2010) JAES Vol.58 No.7/8
//   [2] Parker (2011) EURASIP, efficient dispersion structures
//   [3] Gajarsky MATLAB implementation (github.com/tomas-gajarsky/parametric-spring-reverb)
//   [4] US8391504B1 Abel/Berners patent (Universal Audio)

class SpringReverbProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    var fs = sampleRate; // AudioWorkletGlobalScope global

    // --- Spring configurations (2 springs for stereo) ---
    // Different Td creates natural stereo spread (real Accutronics tanks use 2-3 springs)
    var configs = [
      { Td: 0.066, aa1: 0.75, ah: 0.60, gLf: -0.80, gHf: -0.77 }, // L: shorter spring
      { Td: 0.082, aa1: 0.72, ah: 0.58, gLf: -0.78, gHf: -0.75 }, // R: longer spring
    ];

    this._springs = new Array(2);

    for (var c = 0; c < 2; c++) {
      var cfg = configs[c];
      var sp = {};

      // --- Stretching factor (chirp rate control) ---
      var fc = 4300; // max chirp frequency (Hz)
      var K = fs / (2 * fc);
      var K1 = Math.floor(K);
      if (K1 < 1) K1 = 1;
      var d = K - K1;                  // fractional part
      var a1 = (1 - d) / (1 + d);     // fractional delay allpass coefficient
      var a2 = cfg.aa1;               // spring allpass coefficient

      sp.K1 = K1;
      sp.a1 = a1;
      sp.a2 = a2;
      sp.ah = cfg.ah;
      sp.gLf = cfg.gLf;
      sp.gHf = cfg.gHf;

      // === LOW CHIRPS BLOCK (C_lf) ===

      // Stretched allpass cascade: M=100 stages
      var M = 100;
      sp.M = M;

      // Each stage needs K1+2 history values for x[] and y[]
      // Pad to next power of 2 for bitmask access
      var SL = 8;
      while (SL < K1 + 2) SL *= 2;
      sp.SL = SL;
      sp.SM = SL - 1;

      sp.apLfX = new Float32Array(M * SL); // input history per stage
      sp.apLfY = new Float32Array(M * SL); // output history per stage
      sp.apLfPtr = new Int32Array(M);       // write pointer per stage

      // DC blocking filter (HPF ~40Hz)
      sp.adc = Math.tan(Math.PI / 4 - Math.PI * 40 / fs);
      sp.dcGain = 0.5 * (1 + sp.adc);
      sp.dcPrevX = 0;
      sp.dcPrevY = 0;

      // Multitap delay line (feedback path)
      var baseDelaySamples = Math.round(cfg.Td * fs);
      var apGroupDelay = Math.round(K * M * ((1 - a2) / (1 + a2)));
      sp.baseDelay = baseDelaySamples;
      sp.apGroupDelay = apGroupDelay;

      // Multitap parameters
      sp.gRipple = 0.1;
      sp.gEcho = 0.1;
      sp.nRipple = 0.5;
      sp.lRipple = Math.round(2 * K * sp.nRipple);

      // Delay buffer (power of 2, enough for max delay + modulation headroom)
      var maxDelay = baseDelaySamples + 128;
      var dlLfSize = 256;
      while (dlLfSize < maxDelay) dlLfSize *= 2;
      sp.dlLf = new Float32Array(dlLfSize);
      sp.dlLfMask = dlLfSize - 1;
      sp.dlLfWr = 0;

      // Delay modulation (correlated noise)
      sp.gMod = 8;
      sp.noiseAint = 0.93;
      sp.noisePrev = 0;

      // Spectral shaping (stretched IIR resonator, Eq. 3 in [1])
      // Peak raised from 95Hz to 1kHz: input is HPF'd at 318Hz by AB763 circuit.
      // BW widened to 800Hz to cover the spring's characteristic range (500Hz-2kHz).
      var fPeak = 1000;  // Hz (spring "drip" frequency range)
      var B = 800;       // bandwidth Hz
      var Keq = Math.floor(K);
      if (Keq < 1) Keq = 1;
      var R = 1 - (Math.PI * B * Keq) / fs;
      if (R < 0) R = 0.01;
      var pCos0 = ((1 + R * R) / (2 * R)) * Math.cos((2 * Math.PI * fPeak * Keq) / fs);
      // Normalize resonator to unity peak gain to prevent feedback instability.
      // Raw peak gain = (1+R). Dividing A0 by (1+R) gives unity at peak.
      // This ensures feedback_gain × resonator_peak < 1.0 (stable decay).
      sp.resA0half = (1 - R * R) / 2 / (1 + R);  // = (1-R)/2
      sp.resA1 = -2 * R * pCos0;
      sp.resA2 = R * R;
      sp.Keq = Keq;

      // Resonator delay buffer (needs 2*Keq history for both input and output)
      var resBufSize = 4;
      while (resBufSize < 2 * Keq + 4) resBufSize *= 2;
      sp.resIn = new Float32Array(resBufSize);
      sp.resOut = new Float32Array(resBufSize);
      sp.resMask = resBufSize - 1;
      sp.resWr = 0;

      // LPF: 3 cascaded 2nd-order Butterworth sections (6th-order total, ~4750Hz)
      // Q values for 6th-order Butterworth: 0.5176, 0.7071, 1.9319
      var qs = [0.5176, 0.7071, 1.9319];
      sp.lpfB0 = new Float32Array(3);
      sp.lpfB1 = new Float32Array(3);
      sp.lpfB2 = new Float32Array(3);
      sp.lpfA1 = new Float32Array(3);
      sp.lpfA2 = new Float32Array(3);
      sp.lpfX1 = new Float32Array(3); // x[n-1] per section
      sp.lpfX2 = new Float32Array(3); // x[n-2] per section
      sp.lpfY1 = new Float32Array(3); // y[n-1] per section
      sp.lpfY2 = new Float32Array(3); // y[n-2] per section

      var omegaC = 2 * Math.PI * 4750 / fs;
      var tanHalf = Math.tan(omegaC / 2);
      var tanSq = tanHalf * tanHalf;
      for (var s = 0; s < 3; s++) {
        var norm = 1 / (1 + tanHalf / qs[s] + tanSq);
        sp.lpfB0[s] = tanSq * norm;
        sp.lpfB1[s] = 2 * tanSq * norm;
        sp.lpfB2[s] = tanSq * norm;
        sp.lpfA1[s] = 2 * (tanSq - 1) * norm;
        sp.lpfA2[s] = (1 - tanHalf / qs[s] + tanSq) * norm;
      }

      // Feedback state
      sp.lfFeedback = 0;

      // --- Feedback loss filter G(z) (replaces flat g_lf + separate LPF) ---
      // Correct formula: G(f) = 10^(-3 * D / (T60(f) * fs))
      // where D = round-trip delay in samples, T60(f) = decay time at frequency f.
      //
      // Accutronics 4AB3C1B (Twin Reverb, Long decay):
      //   T60 @500Hz ≈ 3.0s, @2kHz ≈ 1.5s, @5kHz ≈ 0.5s
      //
      // Design: 1st-order shelving filter fitted to G(DC) and G(Nyquist).
      // G(DC)  = 10^(-3*D/(T60_low*fs))  ≈ 0.953 (at D=3168, T60=3.0s, fs=48k)
      // G(π)   = 10^(-3*D/(T60_high*fs)) ≈ 0.778 (T60=0.5s)
      //
      // 1-pole loss filter: H(z) = (b0 + b1*z^-1) / (1 + a1*z^-1)
      // |H(0)| = gDC, |H(π)| = gNyq
      var D = baseDelaySamples;
      var t60Low = 3.0;   // seconds (low freq decay)
      var t60High = 0.5;  // seconds (high freq decay)
      var gDC  = Math.pow(10, -3 * D / (t60Low * fs));
      var gNyq = Math.pow(10, -3 * D / (t60High * fs));

      // 1-pole loss filter design (Välimäki "On the Design of Loss Filters"):
      // H(z) = g * (1 + p*z^-1) / (1 + p*g^2/gNyq^2 * z^-1)  -- not standard
      // Simpler: direct 1-pole fit.
      // |H(0)| = (b0+b1)/(1+a1) = gDC
      // |H(π)| = (b0-b1)/(1-a1) = gNyq
      // Choose a1 to interpolate, then solve b0,b1:
      var coeff = (gDC - gNyq) / (gDC + gNyq);
      sp.lossFiltB0 = gDC * (1 - coeff) / 1; // simplified: b0
      sp.lossFiltB1 = gDC * (1 + coeff) / 1 - sp.lossFiltB0; // b1
      // More direct: use the standard 1-pole loss filter
      // H(z) = g_avg * (1 - p) / (1 - p*z^-1) with p chosen to fit
      var p = (1 - gNyq / gDC) / (1 + gNyq / gDC);
      sp.lossFiltB = gDC * (1 - p);  // feedforward
      sp.lossFiltA = -p;              // feedback (negated for y = b*x - a*y_prev)
      sp.lossFiltPrevY = 0;

      // --- Output pre-delay (one-way spring travel time) ---
      // Real spring: input at one end, output at other end.
      // Minimum delay = one-way travel time = Td/2.
      // Without this, wet signal arrives simultaneously with dry → phase effect, not reverb.
      var preDelaySamples = Math.round(cfg.Td * fs / 2);
      var preDlSize = 256;
      while (preDlSize < preDelaySamples + 16) preDlSize *= 2;
      sp.preDl = new Float32Array(preDlSize);
      sp.preDlMask = preDlSize - 1;
      sp.preDlWr = 0;
      sp.preDelay = preDelaySamples;

      // === HIGH CHIRPS BLOCK (C_hf) ===

      var Mh = 200;
      sp.Mh = Mh;
      sp.apHfPrevX = new Float32Array(Mh);
      sp.apHfPrevY = new Float32Array(Mh);

      // High chirps delay line
      var maxDelayHf = Math.round(baseDelaySamples / 2.3) + 128;
      var dlHfSize = 256;
      while (dlHfSize < maxDelayHf) dlHfSize *= 2;
      sp.dlHf = new Float32Array(dlHfSize);
      sp.dlHfMask = dlHfSize - 1;
      sp.dlHfWr = 0;

      sp.hfFeedback = 0;

      // Cross-coupling (high→low)
      sp.c1 = 0.1;

      this._springs[c] = sp;
    }

    // Previous high chirps output for cross-coupling (per channel)
    this._hfPrev = new Float32Array(2);

    // Pseudo-random noise state (LCG for deterministic, GC-free noise)
    this._noiseSeed = 48271;

    // MessagePort for runtime parameter updates
    this.port.onmessage = function(e) {
      var d = e.data;
      if (d.type === 'setDecay') {
        // Map decay 0..1 to feedback gains (higher = longer tail)
        for (var c = 0; c < 2; c++) {
          this._springs[c].gLf = -(0.6 + d.value * 0.35);
          this._springs[c].gHf = -(0.57 + d.value * 0.35);
        }
      }
    }.bind(this);
  }

  // Fast pseudo-random [0, 1)
  _rand() {
    this._noiseSeed = (this._noiseSeed * 16807) % 2147483647;
    return this._noiseSeed / 2147483647;
  }

  process(inputs, outputs) {
    var input = inputs[0];
    var output = outputs[0];
    if (!input || !input[0] || !output[0]) return true;

    var inMono = input[0];
    var outL = output[0];
    var outR = output[1] || output[0];
    var N = inMono.length;

    var sp0 = this._springs[0];
    var sp1 = this._springs[1];

    for (var i = 0; i < N; i++) {
      var x = inMono[i];
      outL[i] = this._processSingle(x, sp0, 0);
      outR[i] = this._processSingle(x, sp1, 1);
    }

    return true;
  }

  _processSingle(x, sp, ch) {
    // --- 1. Input with feedback + cross-coupling ---
    // Loss filter G(z) already provides the correct per-round-trip attenuation.
    // No separate g_lf multiplication — the loss filter IS the feedback gain.
    // Sign: positive addition (recirculating delay, same as - (-g) * feedback).
    var lfIn = x + sp.lfFeedback + sp.c1 * this._hfPrev[ch];
    var hfIn = x - sp.gHf * sp.hfFeedback;

    // ========================================
    // LOW CHIRPS BLOCK
    // ========================================

    // --- 2. DC blocking filter (HPF ~40Hz) ---
    var dcOut = sp.dcGain * lfIn - sp.dcGain * sp.dcPrevX + sp.adc * sp.dcPrevY;
    sp.dcPrevX = lfIn;
    sp.dcPrevY = dcOut;

    // --- 3. Stretched allpass cascade (M=100 stages) ---
    // Transfer function per stage:
    //   y[n] = a1*x[n] + a1*a2*x[n-1] + a2*x[n-K1] + x[n-K1-1]
    //          - a2*y[n-1] - a1*a2*y[n-K1] - a1*y[n-K1-1]
    var apIn = dcOut;
    var M = sp.M;
    var K1 = sp.K1;
    var a1 = sp.a1;
    var a2 = sp.a2;
    var a1a2 = a1 * a2;
    var SL = sp.SL;
    var SM = sp.SM;

    for (var s = 0; s < M; s++) {
      var base = s * SL;
      var wr = sp.apLfPtr[s];

      // Write current input to history
      sp.apLfX[base + wr] = apIn;

      // Read delayed inputs: x[n-1], x[n-K1], x[n-K1-1]
      var xn1  = sp.apLfX[base + ((wr - 1    + SL) & SM)];
      var xnK  = sp.apLfX[base + ((wr - K1   + SL) & SM)];
      var xnK1 = sp.apLfX[base + ((wr - K1 - 1 + SL) & SM)];

      // Read delayed outputs: y[n-1], y[n-K1], y[n-K1-1]
      var yn1  = sp.apLfY[base + ((wr - 1    + SL) & SM)];
      var ynK  = sp.apLfY[base + ((wr - K1   + SL) & SM)];
      var ynK1 = sp.apLfY[base + ((wr - K1 - 1 + SL) & SM)];

      // Stretched allpass equation
      var apOut = a1 * apIn + a1a2 * xn1 + a2 * xnK + xnK1
                - a2 * yn1 - a1a2 * ynK - a1 * ynK1;

      // Write output to history
      sp.apLfY[base + wr] = apOut;

      // Advance write pointer (circular)
      sp.apLfPtr[s] = (wr + 1) & SM;

      // Output of this stage → input of next
      apIn = apOut;
    }

    // apIn is now the cascade output (equivalent to y2[M+1] in MATLAB)
    var apCascadeOut = apIn;

    // --- 4. Write cascade output to delay line ---
    var dlMask = sp.dlLfMask;
    var dlWr = sp.dlLfWr;
    sp.dlLf[dlWr] = apCascadeOut;

    // --- 5. Delay modulation (filtered noise → slowly varying delay) ---
    var noiseRaw = this._rand();
    var noiseFilt = (1 - sp.noiseAint) * noiseRaw + sp.noiseAint * sp.noisePrev;
    sp.noisePrev = noiseFilt;

    // Total delay = round-trip minus allpass group delay + modulation
    var L = sp.baseDelay - sp.apGroupDelay + Math.round(sp.gMod * noiseFilt);
    if (L < 4) L = 4;

    var lEcho = Math.round(L / 5);
    var lRipple = sp.lRipple;
    var l0 = L - lEcho - lRipple;
    if (l0 < 1) l0 = 1;

    // --- 6. Multitap delay read (4 taps for reflection structure) ---
    var tap0 = sp.dlLf[(dlWr - l0                   + dlMask + 1) & dlMask];
    var tap1 = sp.dlLf[(dlWr - l0 - lRipple         + dlMask + 1) & dlMask];
    var tap2 = sp.dlLf[(dlWr - l0 - lEcho           + dlMask + 1) & dlMask];
    var tap3 = sp.dlLf[(dlWr - l0 - lEcho - lRipple + dlMask + 1) & dlMask];

    // Multitap sum normalized to 1.0 to prevent loop gain > 1.
    // Raw weights: 0.01 + 0.1 + 0.1 + 1.0 = 1.21.
    // Without normalization, loop gain = 1.21 × loss_filter_max > 1.0 → oscillation.
    var rawFeedback = (sp.gEcho * sp.gRipple * tap0
                    + sp.gEcho * tap1
                    + sp.gRipple * tap2
                    + tap3) * 0.826;  // 1/1.21 = 0.826

    // --- 6b. Loss filter G(z) — frequency-dependent decay per round trip ---
    // Abel (US8391504B1): attenuation filter A(z) provides frequency-dependent loss.
    // G(f) = 10^(-3*D/(T60(f)*fs)) — correct T60-based design.
    // 1-pole: H(z) = b/(1 + a*z^-1), fitted to G(DC) and G(Nyquist).
    // Replaces flat g_lf — the loss filter IS the feedback gain (no separate g_lf needed).
    var lossOut = sp.lossFiltB * rawFeedback - sp.lossFiltA * sp.lossFiltPrevY;
    sp.lossFiltPrevY = lossOut;
    sp.lfFeedback = lossOut;

    sp.dlLfWr = (dlWr + 1) & dlMask;

    // --- 7. Spectral shaping (stretched IIR resonator) ---
    // The resonator concentrates dispersed energy into a peak band, maintaining peak amplitude.
    // Without it, 100-stage allpass spreads energy across 73ms → instantaneous amplitude drops
    // to ~1/sqrt(3500) of input → tail becomes inaudible.
    // Original Välimäki: f_peak=95Hz. Our input is HPF'd at 318Hz, so peak is raised to match.
    // The resonator is tuned in constructor: sp.resA0half, sp.resA1, sp.resA2, sp.Keq
    var Keq = sp.Keq;
    var rMask = sp.resMask;
    var rWr = sp.resWr;

    sp.resIn[rWr] = apCascadeOut;

    var resInNow  = apCascadeOut;
    var resIn2K   = sp.resIn[(rWr - 2 * Keq + rMask + 1) & rMask];
    var resOutK   = sp.resOut[(rWr - Keq     + rMask + 1) & rMask];
    var resOut2K  = sp.resOut[(rWr - 2 * Keq + rMask + 1) & rMask];

    var resResult = sp.resA0half * (resInNow - resIn2K) - sp.resA1 * resOutK - sp.resA2 * resOut2K;

    sp.resOut[rWr] = resResult;
    sp.resWr = (rWr + 1) & rMask;

    var lfOutput = resResult;

    // ========================================
    // HIGH CHIRPS BLOCK
    // ========================================

    // --- 9. Standard allpass cascade (Mh=200 stages) ---
    var hfInput = hfIn;
    var Mh = sp.Mh;
    var ah = sp.ah;

    for (var s = 0; s < Mh; s++) {
      var prevX = sp.apHfPrevX[s];
      var prevY = sp.apHfPrevY[s];
      // Standard 1st-order allpass: y[n] = a*x[n] + x[n-1] - a*y[n-1]
      var hfOut = ah * hfInput + prevX - ah * prevY;
      sp.apHfPrevX[s] = hfInput;
      sp.apHfPrevY[s] = hfOut;
      hfInput = hfOut;
    }

    var hfCascadeOut = hfInput;

    // --- 10. High chirps delay line + feedback ---
    var hfDlMask = sp.dlHfMask;
    var hfDlWr = sp.dlHfWr;
    sp.dlHf[hfDlWr] = hfCascadeOut;

    var Lh = Math.round(L / 2.3);
    if (Lh < 1) Lh = 1;
    sp.hfFeedback = sp.dlHf[(hfDlWr - Lh + hfDlMask + 1) & hfDlMask];
    sp.dlHfWr = (hfDlWr + 1) & hfDlMask;

    // Store for cross-coupling
    this._hfPrev[ch] = hfCascadeOut;

    // --- 11. Output pre-delay (one-way spring travel time) ---
    // Real spring: signal enters at one end, exits at the other.
    // Minimum latency = one-way travel time (Td/2 ≈ 33-41ms).
    // Without this, wet arrives with dry → phase effect, not reverb.
    var wetRaw = lfOutput + hfCascadeOut * 0.001;
    var pdMask = sp.preDlMask;
    var pdWr = sp.preDlWr;
    sp.preDl[pdWr] = wetRaw;
    var wetDelayed = sp.preDl[(pdWr - sp.preDelay + pdMask + 1) & pdMask];
    sp.preDlWr = (pdWr + 1) & pdMask;

    return wetDelayed;
  }
}

registerProcessor('spring-reverb-processor', SpringReverbProcessor);
