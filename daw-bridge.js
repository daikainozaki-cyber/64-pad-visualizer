// PAD DAW Bridge — connects 64PE's noteOn to PadDawEngine
// Loaded AFTER audio.js and engine.js. Does NOT modify audio.js.
// Gate: only active when URL has ?daw=1 parameter.

(function() {
  // Gate: opt-in via URL parameter
  if (new URLSearchParams(window.location.search).get('daw') !== '1') return;

  var DawBridge = {
    enabled: false,
    _origNoteOn: null,
    _initStarted: false,

    // Map MIDI note -> sampleIndex (0-63 for 64 pads)
    // Phase 1: single test tone per MIDI note, pitchRatio adjusts frequency
    _baseMidi: 36, // C2 = pad 0 on Launchpad layout
    _baseSampleIdx: 0,

    init: function() {
      if (this._initStarted) return;
      this._initStarted = true;

      var self = this;

      // Wrap global noteOn
      if (typeof noteOn === 'function') {
        this._origNoteOn = noteOn;

        noteOn = function(midi, velocity, poly, _retries) {
          if (self.enabled && PadDawEngine.ready) {
            // Route to DAW engine with pitch ratio
            // Use single base sample, adjust pitch via ratio
            var pitchRatio = Math.pow(2, (midi - 60) / 12); // A4=440Hz reference at MIDI 60
            PadDawEngine.noteOn(0, velocity || 0.8, pitchRatio);
          } else {
            // Fallback to WebAudioFont
            self._origNoteOn(midi, velocity, poly, _retries);
          }
        };
      }

      // Lazy init PadDawEngine on first audio resume
      PadDawEngine.init('audio-engine/worklet-processor.js').then(function() {
        // Load a single base test tone at C4 (261.63 Hz)
        var baseTone = PadDawEngine.generateTestTone(261.63, 1.0);
        PadDawEngine.loadSamples([baseTone]);
        self.enabled = true;
        console.log('[DAW Bridge] PadDawEngine ready (' +
          (PadDawEngine.useSAB ? 'SharedArrayBuffer' : 'MessagePort') + ')');
      }).catch(function(e) {
        console.warn('[DAW Bridge] PadDawEngine init failed, using WebAudioFont fallback:', e);
      });
    }
  };

  // Start init when audio context resumes (user gesture)
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

  // Expose for debugging
  window.DawBridge = DawBridge;
})();
