import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');

describe('Sound engine integrity', () => {
  it('audio layer contains WebAudioFont engine + noteOn/noteOff', () => {
    // Phase 0.1 split audio.js into focused modules. This check now spans
    // the whole audio layer: noteOn/noteOff live in audio-voice.js, the
    // WebAudioFont lifecycle lives in audio.js.
    const audioJs = readFileSync(resolve(ROOT, 'audio.js'), 'utf-8');
    const audioVoice = readFileSync(resolve(ROOT, 'audio-voice.js'), 'utf-8');
    const combined = audioJs + '\n' + audioVoice;
    expect(combined.length).toBeGreaterThan(10000);
    expect(audioJs).toContain('WebAudioFontPlayer');
    expect(audioVoice).toContain('function noteOn');
    expect(audioVoice).toContain('function noteOff');
    expect(audioJs).toContain('audioCtx');
    // no-op stub detection
    expect(audioVoice).not.toMatch(/function noteOn\s*\([^)]*\)\s*\{\s*\}/);
    expect(audioVoice).not.toMatch(/function noteOff\s*\([^)]*\)\s*\{\s*\}/);
  });

  it('jrhodes3c-samples.js exists (>1MB) — kept for MRC/DAW reuse', () => {
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
    const files = ['audio.js', 'audio-master.js', 'audio-effects.js',
                   'audio-reverb.js', 'audio-sampler.js', 'audio-engines.js',
                   'audio-persistence.js', 'audio-overlay.js', 'audio-voice.js',
                   'render.js', 'builder.js', 'data.js',
                   'theory.js', 'tasty-stock.js', 'staff.js', 'instruments.js',
                   'circle-ui.js', 'parent-scales-ui.js', 'play-controls.js',
                   'plain.js', 'perform.js', 'main.js'];
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
