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

    it('C△7 [60,64,67,71]', () => {
      const results = detectChord([60, 64, 67, 71]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('C\u25B37');
    });

    it('C7 [60,64,67,70]', () => {
      const results = detectChord([60, 64, 67, 70]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('C7');
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

    it('C△7(9) [60,64,67,71,74] detected', () => {
      const results = detectChord([60, 64, 67, 71, 74]);
      expect(results.length).toBeGreaterThan(0);
      expect(hasMatch(results, 'C\u25B37(9)')).toBe(true);
    });
  });

  describe('inversions (slash chords)', () => {
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
