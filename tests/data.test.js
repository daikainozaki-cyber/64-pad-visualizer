import { describe, it, expect } from 'vitest';

// All constants available via globalThis (setup.js)

describe('SCALES', () => {
  it('contains 31 scales', () => {
    expect(SCALES).toHaveLength(31);
  });

  it('each scale has valid pcs (0-11, sorted, no duplicates)', () => {
    SCALES.forEach((scale, idx) => {
      // All pcs in range
      scale.pcs.forEach(pc => {
        expect(pc).toBeGreaterThanOrEqual(0);
        expect(pc).toBeLessThan(12);
      });
      // Sorted
      for (let i = 1; i < scale.pcs.length; i++) {
        expect(scale.pcs[i]).toBeGreaterThan(scale.pcs[i - 1]);
      }
      // No duplicates (sorted + strictly increasing → guaranteed)
      expect(new Set(scale.pcs).size).toBe(scale.pcs.length);
    });
  });

  it('each scale has required properties', () => {
    SCALES.forEach(scale => {
      expect(scale).toHaveProperty('id');
      expect(scale).toHaveProperty('name');
      expect(scale).toHaveProperty('pcs');
      expect(scale).toHaveProperty('cn');
      expect(typeof scale.id).toBe('number');
      expect(typeof scale.name).toBe('string');
      expect(Array.isArray(scale.pcs)).toBe(true);
    });
  });

  it('all scales start with 0 (root)', () => {
    SCALES.forEach(scale => {
      expect(scale.pcs[0]).toBe(0);
    });
  });

  it('diatonic modes have 7 notes', () => {
    // First 7 scales (cat=○) are diatonic
    SCALES.filter(s => s.cat === '○').forEach(scale => {
      expect(scale.pcs).toHaveLength(7);
    });
  });
});

describe('BUILDER_QUALITIES', () => {
  it('is a 4x3 grid', () => {
    expect(BUILDER_QUALITIES).toHaveLength(4);
    BUILDER_QUALITIES.forEach(row => {
      expect(row).toHaveLength(3);
    });
  });

  it('each quality has name, label, and valid pcs', () => {
    BUILDER_QUALITIES.flat().forEach(q => {
      expect(q).toHaveProperty('name');
      expect(q).toHaveProperty('label');
      expect(q).toHaveProperty('pcs');
      expect(typeof q.name).toBe('string');
      expect(typeof q.label).toBe('string');
      // pcs are sorted and in range
      q.pcs.forEach(pc => {
        expect(pc).toBeGreaterThanOrEqual(0);
        expect(pc).toBeLessThan(12);
      });
      for (let i = 1; i < q.pcs.length; i++) {
        expect(q.pcs[i]).toBeGreaterThan(q.pcs[i - 1]);
      }
    });
  });

  it('all qualities start with root (0)', () => {
    BUILDER_QUALITIES.flat().forEach(q => {
      expect(q.pcs[0]).toBe(0);
    });
  });
});

describe('TENSION_ROWS', () => {
  it('non-null entries have label and mods', () => {
    TENSION_ROWS.flat().forEach(t => {
      if (t === null) return;
      expect(t).toHaveProperty('label');
      expect(t).toHaveProperty('mods');
      expect(typeof t.label).toBe('string');
      expect(typeof t.mods).toBe('object');
    });
  });

  it('mods.add values are valid pitch classes', () => {
    TENSION_ROWS.flat().forEach(t => {
      if (!t || !t.mods.add) return;
      t.mods.add.forEach(pc => {
        expect(pc).toBeGreaterThanOrEqual(0);
        expect(pc).toBeLessThan(12);
      });
    });
  });
});

describe('SCALE_AVAIL_TENSIONS', () => {
  it('covers all diatonic/HM/MM scales (indices 0-20)', () => {
    for (let i = 0; i <= 20; i++) {
      expect(SCALE_AVAIL_TENSIONS).toHaveProperty(String(i));
    }
  });

  it('avail and avoid contain valid tension names', () => {
    const validNames = new Set(Object.keys(TENSION_NAME_TO_PC));
    Object.values(SCALE_AVAIL_TENSIONS).forEach(sat => {
      if (sat.avail) {
        sat.avail.forEach(name => {
          expect(validNames.has(name)).toBe(true);
        });
      }
      if (sat.avoid) {
        sat.avoid.forEach(name => {
          expect(validNames.has(name)).toBe(true);
        });
      }
    });
  });
});

describe('DIATONIC_CHORD_DB', () => {
  it('has entries for all 12 pitch classes', () => {
    for (let pc = 0; pc < 12; pc++) {
      expect(DIATONIC_CHORD_DB[pc]).toBeDefined();
      expect(DIATONIC_CHORD_DB[pc].length).toBeGreaterThan(0);
    }
  });

  it('entries have required properties', () => {
    Object.values(DIATONIC_CHORD_DB).flat().forEach(entry => {
      expect(entry).toHaveProperty('parentKey');
      expect(entry).toHaveProperty('system');
      expect(entry).toHaveProperty('degreeNum');
      expect(entry).toHaveProperty('scaleName');
      expect(entry).toHaveProperty('scaleIdx');
      expect(entry).toHaveProperty('rootPC');
      expect(entry).toHaveProperty('quality');
    });
  });

  it('covers 3 systems + NM', () => {
    const systems = new Set();
    Object.values(DIATONIC_CHORD_DB).flat().forEach(e => systems.add(e.system));
    expect(systems.has('○')).toBe(true);   // Major
    expect(systems.has('■')).toBe(true);   // Harmonic Minor
    expect(systems.has('◆')).toBe(true);   // Melodic Minor
    expect(systems.has('NM')).toBe(true);  // Natural Minor
  });
});
