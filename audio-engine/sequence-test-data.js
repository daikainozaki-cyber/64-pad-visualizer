// PAD DAW Phase 2+3 — Test Sequence Data
// Tick-based patterns for testing the scheduler.
// PPQ = 960. 1 bar (4/4) = 3840 ticks.
// Returns arrays of {tick, sampleIndex, velocity, pitchRatio, track}.

var SequenceTestData = {

  // 4-on-the-floor kick: 4 quarter notes in 1 bar
  fourOnFloor: function(sampleIdx, track) {
    sampleIdx = sampleIdx || 0;
    track = track || 0;
    return [
      { tick: 0,    sampleIndex: sampleIdx, velocity: 0.9, pitchRatio: 1.0, track: track },
      { tick: 960,  sampleIndex: sampleIdx, velocity: 0.9, pitchRatio: 1.0, track: track },
      { tick: 1920, sampleIndex: sampleIdx, velocity: 0.9, pitchRatio: 1.0, track: track },
      { tick: 2880, sampleIndex: sampleIdx, velocity: 0.9, pitchRatio: 1.0, track: track }
    ];
  },

  // 16th note hi-hat: 16 events per bar, accented on beats
  sixteenthHat: function(sampleIdx, track) {
    sampleIdx = sampleIdx || 0;
    track = track || 0;
    var events = [];
    for (var i = 0; i < 16; i++) {
      var tick = i * 240; // 240 ticks = 16th note
      var onBeat = (i % 4 === 0);
      events.push({
        tick: tick,
        sampleIndex: sampleIdx,
        velocity: onBeat ? 0.9 : 0.4,
        pitchRatio: 1.0,
        track: track
      });
    }
    return events;
  },

  // C major scale ascending: C4 D4 E4 F4 G4 A4 B4 C5 (8th notes)
  scaleRun: function(sampleIdx, track) {
    sampleIdx = sampleIdx || 0;
    track = track || 0;
    var semitones = [0, 2, 4, 5, 7, 9, 11, 12];
    var events = [];
    for (var i = 0; i < semitones.length; i++) {
      events.push({
        tick: i * 480, // 480 ticks = 8th note
        sampleIndex: sampleIdx,
        velocity: 0.7,
        pitchRatio: Math.pow(2, semitones[i] / 12),
        track: track
      });
    }
    return events;
  },

  // Combined: kick (track 0) + hat (track 1) — separate tracks for mixer testing
  combined: function(kickIdx, hatIdx) {
    kickIdx = kickIdx || 0;
    hatIdx = hatIdx || 0;
    var kick = this.fourOnFloor(kickIdx, 0);
    var hat = this.sixteenthHat(hatIdx, 1);
    return kick.concat(hat);
  }
};
