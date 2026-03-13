// PAD DAW Phase 2 — Test Sequence Data
// Tick-based patterns for testing the scheduler.
// PPQ = 24. 1 bar (4/4) = 96 ticks.
// Returns arrays of {tick, sampleIndex, velocity, pitchRatio}.

var SequenceTestData = {

  // 4-on-the-floor kick: 4 quarter notes in 1 bar
  fourOnFloor: function(sampleIdx) {
    sampleIdx = sampleIdx || 0;
    return [
      { tick: 0,  sampleIndex: sampleIdx, velocity: 0.9, pitchRatio: 1.0 },
      { tick: 24, sampleIndex: sampleIdx, velocity: 0.9, pitchRatio: 1.0 },
      { tick: 48, sampleIndex: sampleIdx, velocity: 0.9, pitchRatio: 1.0 },
      { tick: 72, sampleIndex: sampleIdx, velocity: 0.9, pitchRatio: 1.0 }
    ];
  },

  // 16th note hi-hat: 16 events per bar, accented on beats
  sixteenthHat: function(sampleIdx) {
    sampleIdx = sampleIdx || 0;
    var events = [];
    for (var i = 0; i < 16; i++) {
      var tick = i * 6; // 6 ticks = 16th note
      var onBeat = (i % 4 === 0);
      events.push({
        tick: tick,
        sampleIndex: sampleIdx,
        velocity: onBeat ? 0.9 : 0.4,
        pitchRatio: 1.0
      });
    }
    return events;
  },

  // C major scale ascending: C4 D4 E4 F4 G4 A4 B4 C5 (8th notes)
  scaleRun: function(sampleIdx) {
    sampleIdx = sampleIdx || 0;
    var semitones = [0, 2, 4, 5, 7, 9, 11, 12];
    var events = [];
    for (var i = 0; i < semitones.length; i++) {
      events.push({
        tick: i * 12, // 12 ticks = 8th note
        sampleIndex: sampleIdx,
        velocity: 0.7,
        pitchRatio: Math.pow(2, semitones[i] / 12)
      });
    }
    return events;
  },

  // Combined: kick + hat simultaneously
  combined: function(kickIdx, hatIdx) {
    kickIdx = kickIdx || 0;
    hatIdx = hatIdx || 0;
    var kick = this.fourOnFloor(kickIdx);
    var hat = this.sixteenthHat(hatIdx);
    return kick.concat(hat);
  }
};
