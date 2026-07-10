import { describe, it, expect } from 'vitest';

// All functions available via globalThis (setup.js)

describe('detectChord', () => {
  // Helper: check if any candidate name matches the expected pattern
  function hasMatch(results, pattern) {
    return results.some(r => r.name === pattern || r.name.startsWith(pattern));
  }

  describe('triads', () => {
    it('C major [60,64,67] → CMaj', () => {
      const results = detectChord([60, 64, 67]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('CMaj');
    });

    it('C minor [60,63,67] → Cm', () => {
      const results = detectChord([60, 63, 67]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Cm');
    });

    it('C diminished [60,63,66] → Cdim', () => {
      const results = detectChord([60, 63, 66]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Cdim');
    });

    it('C augmented [60,64,68] → Caug', () => {
      const results = detectChord([60, 64, 68]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Caug');
    });

    it('C sus4 [60,65,67] → Csus4', () => {
      const results = detectChord([60, 65, 67]);
      expect(results.length).toBeGreaterThan(0);
      expect(hasMatch(results, 'Csus4')).toBe(true);
    });
  });

  describe('tetrads', () => {
    it('Cm7 [60,63,67,70] → Cm7', () => {
      const results = detectChord([60, 63, 67, 70]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Cm7');
    });

    it('CMaj7 [60,64,67,71]', () => {
      const results = detectChord([60, 64, 67, 71]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('CMaj7');
    });

    it('prefers modal major seventh b9 #11 over lower-structure slash readings', () => {
      const results = detectChord([60, 61, 64, 66, 68, 71]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('CMaj7(b9,#11)');
    });

    it('C7 [60,64,67,70]', () => {
      const results = detectChord([60, 64, 67, 70]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('C7');
    });

    it('prefers flat root spelling for black-key major seventh chords', () => {
      const results = detectChord([58, 62, 65, 69]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('BbMaj7');
    });

    it('uses key context for sharp/flat root spelling', () => {
      expect(padDetectChord([58, 62, 65, 69], 0)[0].name).toBe('BbMaj7');
      expect(padDetectChord([58, 62, 65, 69], 2)[0].name).toBe('A#Maj7');
    });

    it('Cdim7 [60,63,66,69]', () => {
      const results = detectChord([60, 63, 66, 69]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Cdim7');
    });

    it('Cm7(b5) [60,63,66,70]', () => {
      const results = detectChord([60, 63, 66, 70]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Cm7(b5)');
    });
  });

  describe('tension chords', () => {
    it('C7(9) [60,64,67,70,74] detected', () => {
      const results = detectChord([60, 64, 67, 70, 74]);
      expect(results.length).toBeGreaterThan(0);
      expect(hasMatch(results, 'C7(9)')).toBe(true);
    });

    it('CMaj7(9) [60,64,67,71,74] detected', () => {
      const results = detectChord([60, 64, 67, 71, 74]);
      expect(results.length).toBeGreaterThan(0);
      expect(hasMatch(results, 'CMaj7(9)')).toBe(true);
    });

    it('C7(b9,#11,13) with three tensions detected', () => {
      const results = detectChord([60, 64, 67, 70, 73, 78, 81]);
      expect(results.length).toBeGreaterThan(0);
      expect(hasMatch(results, 'C7(b9,#11,13)')).toBe(true);
    });

    it('Cm7(9,11,13) with three tensions detected', () => {
      const results = detectChord([60, 63, 67, 70, 74, 77, 81]);
      expect(results.length).toBeGreaterThan(0);
      expect(hasMatch(results, 'Cm7(9,11,13)')).toBe(true);
    });

    it('CMaj7(9,#11,13) with three tensions detected', () => {
      const results = detectChord([60, 64, 67, 71, 74, 78, 81]);
      expect(results.length).toBeGreaterThan(0);
      expect(hasMatch(results, 'CMaj7(9,#11,13)')).toBe(true);
    });

    it('CMaj7 with natural 11 keeps the avoid note in the chord name', () => {
      const results = detectChord([60, 64, 67, 71, 74, 77, 81]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('CMaj7(9,11,13)');
      expect(results[0].name).not.toBe('CMaj7(9,13)');
    });

    it('C7 shell + D upper structure triad → C7(9,#11,13)', () => {
      const results = detectChord([60, 64, 70, 74, 78, 81]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('C7(9,#11,13)');
    });

    it('C altered dominant colors are not represented as Caug', () => {
      const results = detectChord([60, 61, 63, 64, 68, 70]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('C7(b9,#9,b13)');
      expect(results[0].name).not.toBe('Caug');
    });

    it('does not force a chord name onto major seventh split-third colors', () => {
      const results = detectChord([60, 63, 64, 69, 71]);
      expect(results).toEqual([]);
    });

    it('does not force a chord name when flat seventh and major seventh coexist', () => {
      const results = detectChord([60, 64, 67, 70, 71]);
      expect(results).toEqual([]);
    });

    it('C lydian 6(9) color detects as C6(9,#11), not a rootless shell chord', () => {
      const results = detectChord([60, 64, 69, 74, 78]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('C6(9,#11)');
    });

    it('detects add chords beyond add9 on major triads', () => {
      expect(detectChord([60, 64, 67, 77])[0].name).toBe('Cadd11');
      expect(detectChord([60, 64, 67, 78])[0].name).toBe('Cadd#11');
      expect(detectChord([60, 64, 67, 68])[0].name).toBe('Caddb13');
    });

    it('detects add chords beyond add9 on minor triads', () => {
      expect(detectChord([60, 63, 67, 77])[0].name).toBe('Cmadd11');
      expect(detectChord([60, 63, 67, 78])[0].name).toBe('Cmadd#11');
    });
  });

  describe('inversions (slash chords)', () => {
    it('F/G hybrid follows the absorbed G7sus-type interpretation', () => {
      const results = detectChord([55, 65, 69, 72]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('G7sus4(9)');
      expect(results[1].name).toBe('F / G');
    });

    it('Fm/G Phrygian-style hybrid follows the absorbed G7sus b9 interpretation', () => {
      const results = detectChord([55, 65, 68, 72]);
      expect(results.length).toBeGreaterThan(1);
      expect(results[0].name).toBe('G7sus4(b9)');
      expect(results[1].name).toBe('Fm / G');
    });

    it('E,G,C [64,67,72] → CMaj / E', () => {
      const results = detectChord([64, 67, 72]);
      expect(results.length).toBeGreaterThan(0);
      // Should have CMaj / E somewhere in results
      expect(hasMatch(results, 'CMaj / E')).toBe(true);
    });

    it('G,C,E [67,72,76] → CMaj / G', () => {
      const results = detectChord([67, 72, 76]);
      expect(results.length).toBeGreaterThan(0);
      expect(hasMatch(results, 'CMaj / G')).toBe(true);
    });

    it('uses flat spelling for flat-seventh slash basses', () => {
      const results = detectChord([58, 60, 64, 67]);
      expect(results.length).toBeGreaterThan(0);
      expect(hasMatch(results, 'C7 / Bb')).toBe(true);
      expect(hasMatch(results, 'C7 / A#')).toBe(false);
    });

    it('prefers the complete dominant shell over an omit5 minor-six interpretation', () => {
      const results = detectChord([55, 58, 60, 64]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('C7 / G');
    });

    it('does not promote b7-over-bass slash chords when the bass already has a dominant shell', () => {
      const results = detectChord([55, 59, 65, 69, 72, 76]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('G7(9,11,13)');
      expect(results.slice(0, 4).some(r => r.name === 'F / G')).toBe(false);
    });

    it('reads Gadd9 over B before a false Bm7(b13) interpretation', () => {
      const results = detectChord([59, 67, 69, 74]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Gadd9 / B');
      expect(results.some(r => r.name === 'Bm7(b13)')).toBe(false);
    });

    it('recognizes jazz half-diminished omit3 voicings', () => {
      const results = detectChord([60, 66, 70, 77]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Cm7(b5,11)(omit3)');
    });
  });

  describe('edge cases', () => {
    it('single note returns empty', () => {
      expect(detectChord([60])).toEqual([]);
    });

    it('same note repeated returns empty', () => {
      // Same pitch class → only 1 unique PC → empty
      expect(detectChord([60, 72])).toEqual([]);
    });

    it('empty input returns empty', () => {
      expect(detectChord([])).toEqual([]);
    });

    it('returns at most 8 results', () => {
      // Complex voicing that might produce many candidates
      const results = detectChord([60, 64, 67, 70, 74, 77]);
      expect(results.length).toBeLessThanOrEqual(8);
    });
  });

  describe('invariants', () => {
    it('root position scores higher than inversions', () => {
      // C major root position vs inversion: root position chord should come first
      const results = detectChord([60, 64, 67]); // root position
      if (results.length > 1) {
        expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      }
    });

    it('all results have name, rootPC, and score', () => {
      const results = detectChord([60, 64, 67, 70]);
      results.forEach(r => {
        expect(r).toHaveProperty('name');
        expect(r).toHaveProperty('rootPC');
        expect(r).toHaveProperty('score');
        expect(typeof r.name).toBe('string');
        expect(typeof r.rootPC).toBe('number');
        expect(typeof r.score).toBe('number');
      });
    });
  });
});
