import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

describe('Sound engine integrity', () => {
  it('audio.js exists and contains WebAudioFont engine', () => {
    const content = readFileSync(resolve(ROOT, 'audio.js'), 'utf-8');
    expect(content.length).toBeGreaterThan(10000);
    expect(content).toContain('WebAudioFontPlayer');
    expect(content).toContain('function noteOn');
    expect(content).toContain('function noteOff');
    expect(content).toContain('audioCtx');
    // no-op stub detection
    expect(content).not.toMatch(/function noteOn\s*\([^)]*\)\s*\{\s*\}/);
    expect(content).not.toMatch(/function noteOff\s*\([^)]*\)\s*\{\s*\}/);
  });

  it('jrhodes3c-samples.js exists (>1MB)', () => {
    const p = resolve(ROOT, 'jrhodes3c-samples.js');
    expect(existsSync(p)).toBe(true);
    expect(statSync(p).size).toBeGreaterThan(1_000_000);
  });

  it('index.html contains sound controls', () => {
    const html = readFileSync(resolve(ROOT, 'index.html'), 'utf-8');
    expect(html).toContain('id="sound-controls"');
    expect(html).toContain('id="organ-preset"');
  });

  it('No Desktop/JUCE references in web code', () => {
    const files = ['audio.js', 'render.js', 'builder.js', 'data.js',
                   'theory.js', 'plain.js', 'perform.js', 'main.js'];
    for (const f of files) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      const content = readFileSync(p, 'utf-8');
      expect(content).not.toContain('__JUCE__');
      expect(content).not.toContain('_isDesktop');
      expect(content).not.toContain('_useNativeAudio');
    }
  });
});
