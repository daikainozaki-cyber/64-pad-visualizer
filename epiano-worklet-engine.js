// ========================================
// E-PIANO WORKLET ENGINE (Main Thread)
// ========================================
// Manages AudioWorkletNode for e-piano DSP.
// Signal flow:
//   EpianoWorkletNode ch0 → masterDest (V4B/poweramp/cabinet all inside worklet)
//
// All DSP runs in epiano-worklet-processor.js. This file handles:
//   - AudioWorklet registration and node creation
//   - noteOn/noteOff via MessagePort
//   - Parameter updates via MessagePort

// --- State ---
var _epw_node = null;          // AudioWorkletNode
var _epw_initialized = false;
var _epw_initPromise = null;  // Promise cache to prevent concurrent init race
// V4B, poweramp, cabinet all run inside worklet now (sample-by-sample)

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
  beamDecayR: 0,       // 0=per-key curve (default). >0=global override for calibration
};

// ========================================
// INIT
// ========================================

function epianoWorkletInit(ctx, masterDest) {
  if (_epw_initialized) return Promise.resolve();
  if (_epw_initPromise) return _epw_initPromise;  // in-flight init — return existing promise

  var processorUrl = 'epiano-worklet-processor.js?v=' + (window.APP_VERSION || Date.now());
  _epw_initPromise = ctx.audioWorklet.addModule(processorUrl).then(function() {
    // Create worklet node (mono output: all DSP inside worklet)
    // V4B, poweramp, cabinet now run sample-by-sample in the worklet.
    // Eliminates 128-sample block jitter at nonlinear stages (framework §3).
    _epw_node = new AudioWorkletNode(ctx, 'epiano-worklet-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],  // Stereo: Suitcase tremolo uses L/R
    });

    // ch0 → masterDest (worklet output is already fully processed)
    _epw_node.connect(masterDest);

    // Debug: forward worklet gain measurements to main-thread console
    _epw_node.port.onmessage = function(e) {
      if (e.data && e.data.type === 'debug') {
        console.log('[GAIN] V2Bin=' + (e.data.v2bIn||0).toFixed(4) + ' V2Bout=' + e.data.v2b.toFixed(4) + ' dry=' + e.data.dry.toFixed(4) + ' V4Bin=' + e.data.v4bIn.toFixed(4));
      }
    };

    _epw_initialized = true;

    // Send initial parameters (also handles routing)
    _epwSendParams();

    // --- Load FDTD attack tables (Phase 5: progressive enhancement) ---
    // Non-blocking: if fetch fails, pure modal synthesis continues.
    _epwLoadFDTDTables();
  });
  return _epw_initPromise;
}

function _epwLoadFDTDTables() {
  if (!_epw_node) return;
  var basePath = 'data/fdtd/';
  Promise.all([
    fetch(basePath + 'attack_tables.bin?v=' + (window.APP_VERSION || Date.now())).then(function(r) {
      if (!r.ok) throw new Error('FDTD tables not found');
      return r.arrayBuffer();
    }),
    fetch(basePath + 'manifest.json?v=' + (window.APP_VERSION || Date.now())).then(function(r) {
      return r.json();
    })
  ]).then(function(results) {
    var attackData = results[0];
    var manifest = results[1];
    console.log('[EP-Engine] FDTD tables fetched: ' + (attackData.byteLength / 1e6).toFixed(1) + 'MB');
    // Transfer to worklet (zero-copy via Transferable)
    _epw_node.port.postMessage({
      type: 'fdtdTables',
      attackData: attackData,
      manifest: manifest
    }, [attackData]);
  }).catch(function(err) {
    console.log('[EP-Engine] FDTD tables not available (pure modal): ' + err.message);
  });
}

// ========================================
// PARAMETER UPDATES
// ========================================

function _epwSendParams() {
  if (!_epw_node) return;
  // EpState is SSOT (set by audio.js UI + saved preferences). Read directly — no EpwState copy.
  var preset = EP_AMP_PRESETS[EpState.preset] || EP_AMP_PRESETS['Rhodes Stage + Twin'];
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
    ampType: preset.powerampType === 'GeTr' ? 'suitcase'
           : preset.useCabinet ? 'twin' : 'di',
    useSpringReverb: !!preset.useSpringReverb,
    preampType: preset.preampType || null,
    pickupType: preset.pickupType || 'rhodes',
    puModel: EpwState.puModel || 'cylinder',
    whirlEnabled: EpwState.whirlEnabled !== false,
    beamDecayR: EpState.beamDecayR || 1.0,
    attackNoise: EpState.attackNoise !== undefined ? EpState.attackNoise : 0.5,
    releaseNoise: EpState.releaseNoise !== undefined ? EpState.releaseNoise : (EpState.attackNoise !== undefined ? EpState.attackNoise : 0.5),
    releaseRing: EpState.releaseRing !== undefined ? EpState.releaseRing : (EpState.attackNoise !== undefined ? EpState.attackNoise : 0.5),
    tineRadiation: EpState.tineRadiation !== undefined ? EpState.tineRadiation : 0,
    rhodesLevel: EpState.rhodesLevel !== undefined ? EpState.rhodesLevel : 1.0,
    v1aGain: EpState.v1aGain,
    v2bGain: EpState.v2bGain,
    v4bGain: EpState.v4bGain,
    powerGain: EpState.powerGain,
    cabinetGain: EpState.cabinetGain,
    cabHPFFreq: EpState.cabHPFFreq,
    cabPeakFreq: EpState.cabPeakFreq,
    cabLPFFreq: EpState.cabLPFFreq,
    tremoloOn: EpState.tremoloOn || false,
    tremoloFreq: EpState.tremoloFreq || 4.5,
    tremoloDepth: EpState.tremoloDepth || 0,
  });
  // V4B/poweramp/cabinet now in worklet — no main-thread routing needed
}

function epianoWorkletUpdateParams(params) {
  // Merge amp chain params into EpState (SSOT) before sending
  if (params) {
    var ampKeys = ['v1aGain','v2bGain','v4bGain','powerGain','powerampDrive','cabinetGain','cabHPFFreq','cabPeakFreq','cabLPFFreq'];
    for (var k = 0; k < ampKeys.length; k++) {
      if (params[ampKeys[k]] !== undefined) EpState[ampKeys[k]] = params[ampKeys[k]];
    }
  }
  _epwSendParams();
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

function epianoWorkletSetSustain(on) {
  if (_epw_node) {
    _epw_node.port.postMessage({ type: 'sustain', on: !!on });
  }
}
