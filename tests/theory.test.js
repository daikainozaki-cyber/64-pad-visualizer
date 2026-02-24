import { describe, it, expect } from 'vitest';

// All functions available via globalThis (setup.js)

describe('pitchClass', () => {
  it('returns 0-11 for standard MIDI range', () => {
    expect(pitchClass(60)).toBe(0);  // C4
    expect(pitchClass(61)).toBe(1);  // C#4
    expect(pitchClass(72)).toBe(0);  // C5
    expect(pitchClass(36)).toBe(0);  // C1
  });

  it('handles modular arithmetic correctly', () => {
    for (let midi = 0; midi < 128; midi++) {
      const pc = pitchClass(midi);
      expect(pc).toBeGreaterThanOrEqual(0);
      expect(pc).toBeLessThan(12);
    }
  });

  it('handles negative values via double-mod', () => {
    // pitchClass uses ((midi % 12) + 12) % 12
    expect(pitchClass(-1)).toBe(11);
    expect(pitchClass(-12)).toBe(0);
  });
});

describe('noteName', () => {
  it('maps MIDI to correct note+octave', () => {
    expect(noteName(60)).toBe('C3');   // MIDI 60 = C3 (floor(60/12)-2=3)
    expect(noteName(36)).toBe('C1');
    expect(noteName(69)).toBe('A3');
    expect(noteName(127)).toBe('G8');
  });

  it('uses sharp notation', () => {
    expect(noteName(61)).toBe('C#3');
    expect(noteName(63)).toBe('D#3');
  });
});

describe('baseMidi', () => {
  it('returns BASE_MIDI at default octaveShift', () => {
    AppState.octaveShift = 0;
    expect(baseMidi()).toBe(BASE_MIDI);
  });

  it('shifts by 12 per octave', () => {
    AppState.octaveShift = 1;
    expect(baseMidi()).toBe(BASE_MIDI + 12);
    AppState.octaveShift = -1;
    expect(baseMidi()).toBe(BASE_MIDI - 12);
    AppState.octaveShift = 0; // reset
  });
});

describe('midiNote', () => {
  it('computes MIDI from row/col', () => {
    AppState.octaveShift = 0;
    // row=0,col=0 → baseMidi + 0*5 + 0*1 = 36
    expect(midiNote(0, 0)).toBe(36);
    // row=1,col=0 → 36 + 5 = 41
    expect(midiNote(1, 0)).toBe(41);
    // row=0,col=1 → 36 + 1 = 37
    expect(midiNote(0, 1)).toBe(37);
  });
});

describe('calcVoicingOffsets', () => {
  it('preserves pitch class set through inversions', () => {
    const pcs = [0, 4, 7]; // major triad
    for (let inv = 0; inv <= 2; inv++) {
      const { voiced } = calcVoicingOffsets(pcs, inv, null);
      const resultPCS = new Set(voiced.map(v => ((v % 12) + 12) % 12));
      expect(resultPCS).toEqual(new Set([0, 4, 7]));
    }
  });

  it('preserves pitch class set through Drop2', () => {
    const pcs = [0, 4, 7, 11]; // Maj7
    const { voiced } = calcVoicingOffsets(pcs, 0, 'drop2');
    const resultPCS = new Set(voiced.map(v => ((v % 12) + 12) % 12));
    expect(resultPCS).toEqual(new Set([0, 4, 7, 11]));
  });

  it('preserves pitch class set through Drop3', () => {
    const pcs = [0, 4, 7, 11]; // Maj7
    const { voiced } = calcVoicingOffsets(pcs, 0, 'drop3');
    const resultPCS = new Set(voiced.map(v => ((v % 12) + 12) % 12));
    expect(resultPCS).toEqual(new Set([0, 4, 7, 11]));
  });

  it('returns offsets relative to lowest note', () => {
    const pcs = [0, 4, 7];
    const { offsets } = calcVoicingOffsets(pcs, 0, null);
    expect(offsets[0]).toBe(0); // lowest is always 0
  });

  it('1st inversion moves root up an octave', () => {
    const pcs = [0, 4, 7];
    const { voiced } = calcVoicingOffsets(pcs, 1, null);
    // After 1st inversion: [4, 7, 12] (0 moved to 12)
    expect(voiced).toEqual([4, 7, 12]);
  });
});

describe('getBassCase', () => {
  it('identifies chord tone bass', () => {
    // E (pc=4) as bass of C major (pcs=[0,4,7])
    const result = getBassCase(4, 0, [0, 4, 7]);
    expect(result.isChordTone).toBe(true);
    expect(result.inversionIndex).toBeGreaterThanOrEqual(0);
  });

  it('identifies non-chord tone bass', () => {
    // D (pc=2) as bass of C major (pcs=[0,4,7])
    const result = getBassCase(2, 0, [0, 4, 7]);
    expect(result.isChordTone).toBe(false);
    expect(result.inversionIndex).toBeNull();
  });
});

describe('applyOnChordBass', () => {
  it('inserts bass note below voiced intervals', () => {
    // Voiced: [0, 4, 7] (root position C major intervals)
    // Bass: E (pc=4), root=C (pc=0) → bassIv=4
    // Already has 4 as lowest? No, lowest is 0. bassIv=4, lowestPC=0 → different
    const result = applyOnChordBass([0, 4, 7], 0, 4);
    // Bass E should be below 0, so bassVal starts at 4, goes below 0 → -8
    expect(result[0]).toBeLessThan(0);
    // All original notes should be present
    expect(result).toContain(0);
    expect(result).toContain(4);
    expect(result).toContain(7);
  });

  it('returns unchanged if lowest is already bass', () => {
    // voiced=[4, 7, 12], rootPC=0, bassPC=4 → lowestPC = ((4%12)+12)%12 = 4 = bassIv
    const result = applyOnChordBass([4, 7, 12], 0, 4);
    expect(result).toEqual([4, 7, 12]);
  });
});

describe('getShellIntervals', () => {
  it('returns R-3-7 for 137 shell (Maj7)', () => {
    const result = getShellIntervals([0, 4, 7, 11], '137', 0, null);
    expect(result).toContain(0);   // root
    expect(result).toContain(4);   // M3
    expect(result).toContain(11);  // M7
    expect(result).toHaveLength(3);
  });

  it('returns R-7-3(+12) for 173 shell (Maj7)', () => {
    const result = getShellIntervals([0, 4, 7, 11], '173', 0, null);
    expect(result).toContain(0);   // root
    expect(result).toContain(11);  // M7
    expect(result).toContain(16);  // M3 + 12
    expect(result).toHaveLength(3);
  });

  it('returns null if no 3rd found', () => {
    // sus4 chord: [0, 5, 7] — no 3rd
    const result = getShellIntervals([0, 5, 7], '137', 0, null);
    expect(result).toBeNull();
  });

  it('returns null if no 7th found', () => {
    // Major triad: [0, 4, 7] — no 7th
    const result = getShellIntervals([0, 4, 7], '137', 0, null);
    expect(result).toBeNull();
  });

  it('uses 6th as 7th for 6th chords', () => {
    // 6th chord: [0, 4, 7, 9] — 9 treated as 7th (no 10 or 11)
    const result = getShellIntervals([0, 4, 7, 9], '137', 0, null);
    expect(result).not.toBeNull();
    expect(result).toContain(9);
  });

  it('includes compound intervals from fullPCS', () => {
    // Maj7(9): fullPCS has 14 (= 2+12, compound 9th)
    const result = getShellIntervals([0, 4, 7, 11], '137', 0, [0, 4, 7, 11, 14]);
    expect(result).toContain(14);
  });
});

describe('applyTension', () => {
  it('sus4 replaces 3rd with 4th', () => {
    const result = applyTension([0, 4, 7], { replace3: 5 });
    expect(result).toContain(5);
    expect(result).not.toContain(4);
    expect(result).not.toContain(3);
  });

  it('aug replaces 5th with #5', () => {
    const result = applyTension([0, 4, 7], { sharp5: true });
    expect(result).toContain(8);
    expect(result).not.toContain(7);
  });

  it('b5 replaces 5th with b5', () => {
    const result = applyTension([0, 4, 7, 10], { flat5: true });
    expect(result).toContain(6);
    expect(result).not.toContain(7);
  });

  it('add tensions as compound intervals (+12)', () => {
    const result = applyTension([0, 4, 7, 10], { add: [2] }); // add 9
    expect(result).toContain(14); // 2 + 12 = 14
  });

  it('does not duplicate existing pitch classes', () => {
    // If 2 (mod 12) already exists, don't add again
    const result = applyTension([0, 2, 4, 7], { add: [2] });
    const count2 = result.filter(p => p % 12 === 2).length;
    expect(count2).toBe(1);
  });
});

describe('getDiatonicTetrads', () => {
  it('returns 7 tetrads for 7-note scales', () => {
    const cMajor = SCALES[0].pcs; // [0,2,4,5,7,9,11]
    const tetrads = getDiatonicTetrads(cMajor, 0); // Key = C
    expect(tetrads).toHaveLength(7);
  });

  it('returns empty for non-7-note scales', () => {
    const pentatonic = SCALES[21].pcs; // 5 notes
    expect(getDiatonicTetrads(pentatonic, 0)).toEqual([]);
  });

  it('C Major diatonic tetrads have correct qualities', () => {
    const tetrads = getDiatonicTetrads(SCALES[0].pcs, 0);
    // I=△7, ii=m7, iii=m7, IV=△7, V=7, vi=m7, vii=m7(b5)
    const names = tetrads.map(t => t.quality.name);
    expect(names[0]).toBe('\u25B37');     // C△7
    expect(names[1]).toBe('m7');          // Dm7
    expect(names[2]).toBe('m7');          // Em7
    expect(names[3]).toBe('\u25B37');     // F△7
    expect(names[4]).toBe('7');           // G7
    expect(names[5]).toBe('m7');          // Am7
    expect(names[6]).toBe('m7(b5)');      // Bm7(b5)
  });

  it('each tetrad has required properties', () => {
    const tetrads = getDiatonicTetrads(SCALES[0].pcs, 0);
    tetrads.forEach(t => {
      expect(t).toHaveProperty('rootPC');
      expect(t).toHaveProperty('pcs');
      expect(t).toHaveProperty('quality');
      expect(t).toHaveProperty('chordName');
      expect(t).toHaveProperty('degree');
      expect(t.rootPC).toBeGreaterThanOrEqual(0);
      expect(t.rootPC).toBeLessThan(12);
    });
  });

  it('C Major root PCs follow scale degrees', () => {
    const tetrads = getDiatonicTetrads(SCALES[0].pcs, 0);
    const rootPCs = tetrads.map(t => t.rootPC);
    expect(rootPCs).toEqual([0, 2, 4, 5, 7, 9, 11]); // C D E F G A B
  });
});

describe('findParentScales', () => {
  it('returns results for Dm7 (rootPC=2, intervals=0,3,7,10)', () => {
    AppState.scaleIdx = 0;
    AppState.key = 0;
    const results = findParentScales(2, new Set([0, 3, 7, 10]), 0);
    expect(results.length).toBeGreaterThan(0);
    // Should include Dorian
    const scaleNames = results.map(r => r.scaleName);
    expect(scaleNames).toContain('Dorian');
  });

  it('returns results for G7 (rootPC=7, intervals=0,4,7,10)', () => {
    const results = findParentScales(7, new Set([0, 4, 7, 10]), 0);
    expect(results.length).toBeGreaterThan(0);
    // Should include Mixolydian
    const scaleNames = results.map(r => r.scaleName);
    expect(scaleNames).toContain('Mixolydian');
  });

  it('strict matches come before omit5 matches', () => {
    const results = findParentScales(0, new Set([0, 4, 7, 10]), 0);
    const firstOmit5Idx = results.findIndex(r => r.omit5Match);
    if (firstOmit5Idx >= 0) {
      // All strict matches should come before omit5
      results.slice(0, firstOmit5Idx).forEach(r => {
        expect(r.omit5Match).toBe(false);
      });
    }
  });
});

describe('fifthsDistance', () => {
  it('adjacent keys on circle of fifths = 1', () => {
    expect(fifthsDistance(0, 7)).toBe(1);  // C to G
    expect(fifthsDistance(0, 5)).toBe(1);  // C to F
  });

  it('tritone = 6 (maximum distance)', () => {
    expect(fifthsDistance(0, 6)).toBe(6);  // C to F#
  });

  it('same key = 0', () => {
    expect(fifthsDistance(0, 0)).toBe(0);
    expect(fifthsDistance(7, 7)).toBe(0);
  });

  it('is symmetric', () => {
    for (let a = 0; a < 12; a++) {
      for (let b = 0; b < 12; b++) {
        expect(fifthsDistance(a, b)).toBe(fifthsDistance(b, a));
      }
    }
  });
});

describe('getParentMajorKey', () => {
  it('Ionian returns key as-is', () => {
    // Ionian (id=0, cat=○, num=1): parent = key - 0 = key
    expect(getParentMajorKey(0, 0)).toBe(0);  // C Ionian → C
    expect(getParentMajorKey(0, 2)).toBe(2);  // D Ionian → D
  });

  it('Dorian returns relative major', () => {
    // D Dorian → parent = C major
    expect(getParentMajorKey(1, 2)).toBe(0);  // D Dorian → C
  });

  it('handles Harmonic Minor modes', () => {
    // Harmonic Minor (id=7, cat=■, num=1)
    // A HM → parent = (A - 0 + 12) % 12 = 9 → relative major = (9+3)%12 = 0 = C
    expect(getParentMajorKey(7, 9)).toBe(0);
  });
});

describe('pcName', () => {
  it('returns sharp names for sharp keys', () => {
    AppState.scaleIdx = 0; // Ionian
    AppState.key = 0;      // C (parent=C, not in FLAT_MAJOR_KEYS)
    expect(pcName(0)).toBe('C');
    expect(pcName(1)).toBe('C#');
  });

  it('returns flat names for flat keys', () => {
    AppState.scaleIdx = 0;
    AppState.key = 5;      // F (parent=F, pc=5 is in FLAT_MAJOR_KEYS)
    expect(pcName(1)).toBe('Db');
    expect(pcName(3)).toBe('Eb');
  });
});
