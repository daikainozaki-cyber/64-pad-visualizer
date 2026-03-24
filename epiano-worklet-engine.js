// ========================================
// E-PIANO WORKLET ENGINE (Main Thread)
// ========================================
// Manages AudioWorkletNode for e-piano DSP.
// Signal flow:
//   EpianoWorkletNode ch0 (main) → ConvolverNode (cabinet) → masterDest
//   EpianoWorkletNode ch1 (send) → SpringReverbWorklet → V4A recovery → reverbPot → mix
//
// All DSP runs in epiano-worklet-processor.js. This file handles:
//   - AudioWorklet registration and node creation
//   - noteOn/noteOff via MessagePort
//   - Parameter updates via MessagePort
//   - Cabinet IR loading (ConvolverNode stays on main thread)
//   - Spring reverb routing (external AudioWorkletNode)

// --- State ---
var _epw_node = null;          // AudioWorkletNode
var _epw_initialized = false;
var _epw_cabinetNode = null;   // ConvolverNode
var _epw_cabinetGain = null;   // GainNode
var _epw_splitter = null;      // ChannelSplitterNode (split worklet output)
var _epw_directGain = null;    // GainNode: DI direct output (1.0 for DI, 0.0 for amp)
var _epw_springReverb = null;  // spring reverb (ConvolverNode or AudioWorkletNode)
var _epw_springWorklet = false;
var _epw_v4aGain = null;       // reverb recovery
var _epw_reverbPot = null;     // reverb return level
var _epw_merger = null;        // ChannelMergerNode (dry + wet → cabinet)
var _epw_v4bWS = null;         // WaveShaperNode: V4B bloom (dry+wet mix)
var _epw_v4bMakeup = null;     // GainNode: V4B output level
var _epw_powerDrive = null;    // GainNode: poweramp drive
var _epw_powerWS = null;       // WaveShaperNode: shared poweramp
var _epw_powerMakeup = null;   // GainNode: poweramp output
var _epw_dryWetSum = null;     // GainNode: dry+wet summing point before V4B

// Current parameters (mirrored for UI reads)
var EpwState = {
  pickupSymmetry: 0.3,
  pickupDistance: 0.5,
  preampGain: 1.0,
  tonestackBass: 0.5,
  tonestackMid: 0.5,
  tonestackTreble: 0.5,
  powerampDrive: 1.0,
  preset: 'Rhodes Stage + Twin',
  use2ndPreamp: true,
  brightSwitch: false,
  springReverbMix: 0.12,
  springDwell: 6.0,
  puModel: 'cylinder', // 'cylinder' or 'dipole' (A/B comparison)
  whirlEnabled: true,  // 2D tine whirling on/off
};

// ========================================
// CABINET IR (same as epiano-engine.js)
// ========================================

function _epwCreateCabinetIR(ctx) {
  var sr = ctx.sampleRate;
  var len = Math.floor(sr * 0.05);
  var buf = ctx.createBuffer(2, len, sr);
  var modes = [
    [80, 0.30, 80], [250, 0.25, 100], [600, 0.15, 130],
    [1200, 0.12, 150], [2500, 0.18, 180], [3500, 0.25, 200], [4500, 0.10, 250],
  ];
  for (var ch = 0; ch < 2; ch++) {
    var d = buf.getChannelData(ch);
    for (var i = 0; i < len; i++) {
      var t = i / sr;
      var sample = (i < 3) ? 0.6 : 0;
      for (var m = 0; m < modes.length; m++) {
        sample += modes[m][1] * Math.sin(2 * Math.PI * modes[m][0] * t) * Math.exp(-t * modes[m][2]);
      }
      d[i] = (ch === 1) ? sample * 0.95 : sample;
    }
  }
  return buf;
}

function _epwLoadRealCabinetIR(ctx) {
  var url = 'data/ir/twin-reverb-cabinet.wav';
  fetch(url).then(function(r) { return r.arrayBuffer(); })
    .then(function(buf) { return ctx.decodeAudioData(buf); })
    .then(function(decoded) {
      if (_epw_cabinetNode) {
        _epw_cabinetNode.buffer = decoded;
      }
    })
    .catch(function() { /* keep synthetic IR */ });
}

// ========================================
// SPRING REVERB IR (synthetic fallback)
// ========================================

function _epwCreateSpringReverbIR(ctx) {
  // Simplified 2-spring allpass cascade IR (fallback before worklet loads)
  var sr = ctx.sampleRate;
  var len = Math.floor(sr * 2.5);
  var buf = ctx.createBuffer(2, len, sr);
  var configs = [
    { delay: 0.066, decay: 2.0, fc: 4300 },
    { delay: 0.082, decay: 2.2, fc: 3800 },
  ];
  for (var ch = 0; ch < 2; ch++) {
    var d = buf.getChannelData(ch);
    var cfg = configs[ch];
    var delaySamples = Math.floor(cfg.delay * sr);
    // Simple exponential + early echoes
    for (var i = 0; i < len; i++) {
      var t = i / sr;
      var env = Math.exp(-t * 3.0 / cfg.decay);
      // Chirp approximation (allpass dispersion)
      var chirpFreq = cfg.fc * Math.sqrt(Math.max(0.01, 1 - t / cfg.decay));
      d[i] = env * 0.15 * Math.sin(2 * Math.PI * chirpFreq * t);
      // Add sparse echoes
      if (i > delaySamples && i % delaySamples < 3) {
        d[i] += env * 0.3;
      }
    }
  }
  return buf;
}

function _epwLoadSpringReverbWorklet(ctx) {
  if (!ctx.audioWorklet || _epw_springWorklet) return;
  ctx.audioWorklet.addModule('spring-reverb-processor.js?v=' + (window.APP_VERSION || Date.now()))
    .then(function() {
      var workletNode = new AudioWorkletNode(ctx, 'spring-reverb-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      // Hot-swap
      if (_epw_splitter && _epw_springReverb && _epw_v4aGain) {
        _epw_splitter.disconnect(_epw_springReverb, 1);
        _epw_springReverb.disconnect(_epw_v4aGain);
        _epw_splitter.connect(workletNode, 1);
        workletNode.connect(_epw_v4aGain);
        _epw_springReverb = workletNode;
        _epw_springWorklet = true;
      }
    })
    .catch(function() { /* keep ConvolverNode fallback */ });
}

// ========================================
// INIT
// ========================================

function epianoWorkletInit(ctx, masterDest) {
  if (_epw_initialized) return Promise.resolve();

  var processorUrl = 'epiano-worklet-processor.js?v=' + (window.APP_VERSION || Date.now());
  return ctx.audioWorklet.addModule(processorUrl).then(function() {
    // Create worklet node (stereo output: ch0=main, ch1=reverb send)
    _epw_node = new AudioWorkletNode(ctx, 'epiano-worklet-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    // Split stereo output
    _epw_splitter = ctx.createChannelSplitter(2);
    _epw_node.connect(_epw_splitter);

    // --- Cabinet (end of chain) ---
    _epw_cabinetNode = ctx.createConvolver();
    _epw_cabinetNode.buffer = _epwCreateCabinetIR(ctx);
    _epw_cabinetGain = ctx.createGain();
    _epw_cabinetGain.gain.setValueAtTime(6.0, 0);
    _epw_cabinetNode.connect(_epw_cabinetGain);
    _epw_cabinetGain.connect(masterDest);
    _epwLoadRealCabinetIR(ctx);

    // --- Shared poweramp (6L6, oversample='2x') ---
    _epw_powerMakeup = ctx.createGain();
    _epw_powerMakeup.gain.setValueAtTime(2.0, 0);
    _epw_powerMakeup.connect(_epw_cabinetNode);

    _epw_powerWS = ctx.createWaveShaper();
    _epw_powerWS.oversample = '2x';
    _epw_powerWS.curve = computePowerampLUT_6L6(); // from epiano-engine.js (global)
    // Normalize to unity center gain (same as old engine)
    var _paCurve = _epw_powerWS.curve;
    var _paCenter = Math.floor(_paCurve.length / 2);
    var _paDx = 2.0 / _paCurve.length;
    var _paSlope = (_paCurve[_paCenter + 1] - _paCurve[_paCenter - 1]) / (2 * _paDx);
    if (_paSlope > 1.0) {
      for (var _pi = 0; _pi < _paCurve.length; _pi++) _paCurve[_pi] /= _paSlope;
    }
    _epw_powerWS.connect(_epw_powerMakeup);

    _epw_powerDrive = ctx.createGain();
    _epw_powerDrive.gain.setValueAtTime(1.0, 0); // EpState.powerampDrive
    _epw_powerDrive.connect(_epw_powerWS);

    // --- V4B bloom (12AX7, unity-gain normalized) ---
    // Dry + wet sum here → nonlinear mixing = "bloom"
    _epw_v4bMakeup = ctx.createGain();
    _epw_v4bMakeup.gain.setValueAtTime(1.5, 0);
    _epw_v4bMakeup.connect(_epw_powerDrive);

    _epw_v4bWS = ctx.createWaveShaper();
    var _v4bCurve = computePreampLUT_12AX7(); // from epiano-engine.js (global)
    var _v4bCenter = Math.floor(_v4bCurve.length / 2);
    var _v4bDx = 2.0 / _v4bCurve.length;
    var _v4bSlope = (_v4bCurve[_v4bCenter + 1] - _v4bCurve[_v4bCenter - 1]) / (2 * _v4bDx);
    if (_v4bSlope > 1.0) {
      for (var _vi = 0; _vi < _v4bCurve.length; _vi++) _v4bCurve[_vi] /= _v4bSlope;
    }
    _epw_v4bWS.curve = _v4bCurve;
    _epw_v4bWS.oversample = 'none';
    _epw_v4bWS.connect(_epw_v4bMakeup);

    // --- Dry+wet summing point → V4B ---
    _epw_dryWetSum = ctx.createGain();
    _epw_dryWetSum.gain.setValueAtTime(1.0, 0);
    _epw_dryWetSum.connect(_epw_v4bWS);

    // AMP path: ch0 (dry from worklet, post-harpLPF) → dryWetSum → V4B → poweramp → cabinet
    _epw_splitter.connect(_epw_dryWetSum, 0);

    // DI direct path: ch0 → directGain → masterDest (bypasses entire amp chain)
    _epw_directGain = ctx.createGain();
    _epw_directGain.gain.setValueAtTime(0, 0); // off by default (amp mode)
    _epw_splitter.connect(_epw_directGain, 0);
    _epw_directGain.connect(masterDest);

    // --- Reverb send (ch1): → spring reverb → V4A → pot → V4B (bloom!) ---
    _epw_springReverb = ctx.createConvolver();
    _epw_springReverb.buffer = _epwCreateSpringReverbIR(ctx);

    _epw_v4aGain = ctx.createGain();
    _epw_v4aGain.gain.setValueAtTime(5.0, 0);
    _epw_springReverb.connect(_epw_v4aGain);

    _epw_reverbPot = ctx.createGain();
    _epw_reverbPot.gain.setValueAtTime(EpwState.springReverbMix, 0);
    _epw_v4aGain.connect(_epw_reverbPot);

    // Wet → V4B (same node as dry — bloom from nonlinear mixing!)
    _epw_reverbPot.connect(_epw_dryWetSum);

    // ch1 → spring reverb
    _epw_splitter.connect(_epw_springReverb, 1);

    // Load AudioWorklet spring reverb in background
    _epwLoadSpringReverbWorklet(ctx);

    _epw_initialized = true;

    // Send initial parameters
    _epwSendParams();
  });
}

// ========================================
// PARAMETER UPDATES
// ========================================

function _epwSendParams() {
  if (!_epw_node) return;
  // EpState is SSOT (set by audio.js UI + saved preferences). Read directly — no EpwState copy.
  var preset = EP_AMP_PRESETS[EpState.preset] || EP_AMP_PRESETS['Rhodes Stage + Twin'];
  var isDI = !preset.useCabinet;
  _epw_node.port.postMessage({
    type: 'params',
    pickupSymmetry: EpState.pickupSymmetry,
    pickupDistance: EpState.pickupDistance,
    preampGain: EpState.preampGain,
    tsBass: EpState.tonestackBass,
    tsMid: EpState.tonestackMid,
    tsTreble: EpState.tonestackTreble,
    brightSwitch: EpState.brightSwitch,
    powerampDrive: EpState.powerampDrive,
    volumePot: 0.5,
    springReverbMix: EpState.springReverbMix,
    springDwell: EpState.springDwell,
    use2ndPreamp: preset.preampType === '12AX7' && EpState.use2ndPreamp,
    useTonestack: !!preset.useTonestack,
    useCabinet: !!preset.useCabinet,
    useSpringReverb: !!preset.useSpringReverb,
    preampType: preset.preampType || null,
    pickupType: preset.pickupType || 'rhodes',
    puModel: EpwState.puModel || 'cylinder',
    whirlEnabled: EpwState.whirlEnabled !== false,
  });
  // Switch main-thread routing: DI=direct, amp=V4B→poweramp→cabinet
  if (_epw_cabinetGain) _epw_cabinetGain.gain.setValueAtTime(isDI ? 0 : 6.0, 0);
  if (_epw_directGain) _epw_directGain.gain.setValueAtTime(isDI ? 1.0 : 0, 0);
  if (_epw_dryWetSum) _epw_dryWetSum.gain.setValueAtTime(isDI ? 0 : 1.0, 0);
}

function epianoWorkletUpdateParams(params) {
  // Send updated params to worklet. EpState is SSOT (already updated by audio.js).
  _epwSendParams();
  // Update main-thread reverb pot
  if (params.springReverbMix !== undefined && _epw_reverbPot) {
    _epw_reverbPot.gain.setValueAtTime(params.springReverbMix, 0);
  }
}

// ========================================
// NOTE ON / OFF
// ========================================

function epianoWorkletNoteOn(ctx, midi, velocity, masterDest) {
  if (!_epw_initialized) {
    epianoWorkletInit(ctx, masterDest).then(function() {
      epianoWorkletNoteOn(ctx, midi, velocity, masterDest);
    });
    return { cancel: function() {} };
  }

  // Sync all params from EpState (SSOT) on every noteOn.
  // EpState is updated by audio.js UI + saved preferences.
  _epwSendParams();

  _epw_node.port.postMessage({
    type: 'noteOn',
    midi: midi,
    velocity: velocity,
  });

  // Return cancel function (for noteOff / damper)
  var _cancelled = false;
  return {
    cancel: function() {
      if (_cancelled) return;
      _cancelled = true;
      if (_epw_node) {
        _epw_node.port.postMessage({ type: 'noteOff', midi: midi });
      }
    },
  };
}

function epianoWorkletNoteOff(midi) {
  if (_epw_node) {
    _epw_node.port.postMessage({ type: 'noteOff', midi: midi });
  }
}

function epianoWorkletAllNotesOff() {
  if (_epw_node) {
    _epw_node.port.postMessage({ type: 'allNotesOff' });
  }
}
