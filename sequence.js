// ========================================
// SEQUENCE MODE — Record & Playback (Phase 4)
// ========================================
// Records pad hits as tick events, plays back via PadDawEngine.
// Live sound: WebAudioFont (audio.js noteOn). Playback: PadDawEngine.

var SEQ_PPQ = 960; // Must match engine.js PPQ

// --- noteOn intercept for recording ---
var _origNoteOnSeq = noteOn;
noteOn = function(midi, velocity, poly, _retries) {
  // Always play sound via WebAudioFont
  _origNoteOnSeq(midi, velocity, poly, _retries);
  // Record if in sequence recording mode
  if (SequenceState.recording) {
    onPadHitDuringRecord(midi, velocity || 0.8);
  }
};

// --- Recording ---

function onPadHitDuringRecord(midi, velocity) {
  var now = performance.now();
  var elapsedMs = now - SequenceState.recordStartTime;
  // ms → tick: tick = elapsed / 60000 * bpm * PPQ
  var rawTick = Math.round(elapsedMs / 60000 * SequenceState.bpm * SEQ_PPQ);

  // Clamp to loop length
  var maxTick = SequenceState.loopBars * 4 * SEQ_PPQ;
  if (rawTick >= maxTick) rawTick = rawTick % maxTick;

  var playTick = SequenceState.quantize > 0
    ? quantizeTick(rawTick, SequenceState.quantize)
    : rawTick;

  var pitchRatio = Math.pow(2, (midi - 60) / 12);

  SequenceState.events.push({
    rawTick: rawTick,
    tick: playTick,
    track: SequenceState.currentTrack,
    midiNote: midi,
    sampleIndex: 0, // single test tone, Phase 4
    velocity: velocity,
    pitchRatio: pitchRatio
  });

  updateSequenceEventCount();
}

function quantizeTick(rawTick, grid) {
  if (grid === 0) return rawTick;
  return Math.round(rawTick / grid) * grid;
}

function recomputeQuantize() {
  var grid = SequenceState.quantize;
  for (var i = 0; i < SequenceState.events.length; i++) {
    SequenceState.events[i].tick = grid > 0
      ? quantizeTick(SequenceState.events[i].rawTick, grid)
      : SequenceState.events[i].rawTick;
  }
}

// --- Transport controls ---

function toggleRecord() {
  if (SequenceState.recording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function startRecording() {
  // Ensure PadDawEngine is ready
  if (!PadDawEngine.ready && window.DawBridge) {
    DawBridge.init();
  }
  SequenceState.recording = true;
  SequenceState.recordStartTime = performance.now();
  updateSequenceUI();
  updateSequenceRecordingVisual(true);
}

function stopRecording() {
  SequenceState.recording = false;
  updateSequenceUI();
  updateSequenceRecordingVisual(false);
}

function togglePlayback() {
  if (SequenceState.playing) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  if (SequenceState.events.length === 0) return;
  if (!PadDawEngine.ready) {
    console.warn('[Sequence] PadDawEngine not ready');
    return;
  }

  // Stop recording if active
  if (SequenceState.recording) stopRecording();

  // Convert events to PadDawEngine format
  var tickEvents = SequenceState.events.map(function(ev) {
    return {
      tick: ev.tick,
      track: ev.track,
      sampleIndex: ev.sampleIndex,
      velocity: ev.velocity,
      pitchRatio: ev.pitchRatio
    };
  });

  PadDawEngine.onPlaybackEnd = function() {
    // Loop: playSequence handles looping via loopEndSample
  };

  PadDawEngine.playSequence(tickEvents, SequenceState.bpm, SequenceState.loopBars);
  SequenceState.playing = true;
  updateSequenceUI();
}

function stopPlayback() {
  PadDawEngine.stop();
  SequenceState.playing = false;
  updateSequenceUI();
}

function stopAll() {
  if (SequenceState.recording) stopRecording();
  if (SequenceState.playing) stopPlayback();
}

function clearSequence() {
  stopAll();
  SequenceState.events = [];
  updateSequenceEventCount();
  updateSequenceUI();
}

// --- Settings ---

function setBpm(val) {
  var v = parseInt(val);
  if (v >= 40 && v <= 300) {
    SequenceState.bpm = v;
    // If playing, restart with new BPM
    if (SequenceState.playing) {
      stopPlayback();
      startPlayback();
    }
  }
}

function setLoopBars(val) {
  SequenceState.loopBars = parseInt(val);
  if (SequenceState.playing) {
    stopPlayback();
    startPlayback();
  }
}

function setCurrentTrack(val) {
  SequenceState.currentTrack = parseInt(val);
}

function setQuantize(val) {
  SequenceState.quantize = parseInt(val);
  recomputeQuantize();
  // If playing, restart to apply new quantize
  if (SequenceState.playing) {
    stopPlayback();
    startPlayback();
  }
}

// --- UI updates ---

function updateSequenceUI() {
  var recBtn = document.getElementById('seq-record');
  var playBtn = document.getElementById('seq-play');
  if (recBtn) {
    recBtn.classList.toggle('active', SequenceState.recording);
    recBtn.style.color = SequenceState.recording ? '#ff4444' : '';
  }
  if (playBtn) {
    playBtn.classList.toggle('active', SequenceState.playing);
    playBtn.style.color = SequenceState.playing ? '#44ff44' : '';
  }
  updateSequenceEventCount();
}

function updateSequenceEventCount() {
  var el = document.getElementById('seq-event-count');
  if (el) el.textContent = 'Events: ' + SequenceState.events.length;
}

function updateSequenceRecordingVisual(recording) {
  var padArea = document.querySelector('.pad-area');
  if (padArea) {
    padArea.classList.toggle('seq-recording', recording);
  }
}
