// PAD DAW Bridge — connects 64PE to PadDawEngine
// Loaded AFTER audio.js and engine.js. Does NOT modify audio.js.
// Phase 4: Always available (no ?daw=1 gate). Sequence mode uses PadDawEngine for playback.
// Live pad sound stays on WebAudioFont (audio.js noteOn). Recording intercept is in sequence.js.

(function() {
  var DawBridge = {
    _initStarted: false,
    _initDone: false,

    init: function() {
      if (this._initStarted) return;
      this._initStarted = true;

      var self = this;

      PadDawEngine.init('audio-engine/worklet-processor.js').then(function() {
        // Load a single base test tone at C4 (261.63 Hz)
        var baseTone = PadDawEngine.generateTestTone(261.63, 1.0);
        PadDawEngine.loadSamples([baseTone]);
        self._initDone = true;
        console.log('[DAW Bridge] PadDawEngine ready (' +
          (PadDawEngine.useSAB ? 'SharedArrayBuffer' : 'MessagePort') + ')');
      }).catch(function(e) {
        console.warn('[DAW Bridge] PadDawEngine init failed:', e);
      });
    }
  };

  // Lazy init on first audio context resume (user gesture)
  if (typeof audioCtx !== 'undefined') {
    if (audioCtx.state === 'running') {
      DawBridge.init();
    } else {
      audioCtx.addEventListener('statechange', function _onState() {
        if (audioCtx.state === 'running') {
          audioCtx.removeEventListener('statechange', _onState);
          DawBridge.init();
        }
      });
    }
  }

  // Expose for debugging and sequence.js access
  window.DawBridge = DawBridge;
})();
