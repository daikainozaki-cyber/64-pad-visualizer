/**
 * Audio Engine Invariant Tests (AUDIO_SPEC.md §6)
 *
 * Design: 哲学駆動型開発 Principle #9 "Test at boundaries — fix invariants, not values"
 * Layer 2: App Invariants — mathematical guarantees of the audio engine.
 *
 * Each test maps to a specific invariant in AUDIO_SPEC.md §6.
 * Bug-driven growth: new bugs → add invariant to SPEC → add test here.
 *
 * Usage:
 *   npx playwright test tests/audio-invariants.spec.js
 *   BASE_URL=https://murinaikurashi.com/apps/64-pad npx playwright test
 */

const { test, expect } = require('@playwright/test');
const { activateAudio, measureRMS } = require('./helpers/audio-measure');

test.describe('Audio Engine Invariants (AUDIO_SPEC.md §6)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await page.waitForLoadState('networkidle');
    await activateAudio(page);
    // Unmute and set volume for testing
    await page.evaluate(() => {
      _soundMuted = false;
      masterGain.gain.setValueAtTime(0.6, audioCtx.currentTime);
    });
    // Wait for WebAudioFont presets to decode
    await page.waitForTimeout(2000);
  });

  // SPEC §6.1: masterGain.gain === 0 ==> RMS === 0
  test('1. Audio Silence Guarantee — Vol=0 produces absolute silence', async ({ page }) => {
    await page.evaluate(() => {
      masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
    });
    await page.evaluate(() => noteOn(60, 100));
    const rms = await measureRMS(page, 1000);
    await page.evaluate(() => noteOffAll());

    expect(rms).toBeLessThan(0.001);
  });

  // SPEC §6.2: after noteOffAll() → activeVoices.size === 0, no playing sources
  test('2. Voice Cleanup After noteOffAll — no zombie voices', async ({ page }) => {
    await page.evaluate(() => noteOn(60, 100));
    await page.evaluate(() => noteOn(64, 100));
    await page.evaluate(() => noteOn(67, 100));
    await page.waitForTimeout(500);

    await page.evaluate(() => noteOffAll());
    await page.waitForTimeout(300);

    const result = await page.evaluate(() => {
      const a = audioCtx.createAnalyser();
      a.fftSize = 2048;
      masterGain.connect(a);
      const d = new Float32Array(a.frequencyBinCount);
      a.getFloatTimeDomainData(d);
      let s = 0;
      for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      masterGain.disconnect(a);
      return {
        activeVoicesSize: activeVoices.size,
        rms: Math.sqrt(s / d.length),
      };
    });

    expect(result.activeVoicesSize).toBe(0);
    expect(result.rms).toBeLessThan(0.001);
  });

  // SPEC §6.3: after selectSound() → only selected preset produces sound
  test('3. Engine Isolation After Preset Switch — no cross-preset bleed', async ({ page }) => {
    // Play with default preset, measure
    await page.evaluate(() => noteOn(60, 100));
    await page.waitForTimeout(1000);
    const rms1 = await measureRMS(page, 300);
    await page.evaluate(() => noteOffAll());
    await page.waitForTimeout(300);

    // Switch to organ
    await page.evaluate(() => selectSound('organ', 'Drawbar Organ'));
    await page.waitForTimeout(200);

    // Verify silence after switch (no zombie from previous preset)
    const silenceAfterSwitch = await measureRMS(page, 300);

    // Play with organ, verify sound
    await page.evaluate(() => noteOn(60, 100));
    await page.waitForTimeout(500);
    const rms2 = await measureRMS(page, 300);
    await page.evaluate(() => noteOffAll());

    expect(silenceAfterSwitch).toBeLessThan(0.01);
    expect(rms1).toBeGreaterThan(0.01);
    expect(rms2).toBeGreaterThan(0.01);
    // Different presets → different timbre → different RMS
    expect(Math.abs(rms1 - rms2)).toBeGreaterThan(0.001);
  });

  // SPEC §6.4: _soundMuted === true ==> noteOn() returns without creating voice
  test('4. Mute Blocks All Sound — noteOn creates nothing when muted', async ({ page }) => {
    const result = await page.evaluate(() => {
      _soundMuted = true;
      const sizeBefore = activeVoices.size;
      noteOn(60, 100);
      const sizeAfter = activeVoices.size;
      return { sizeBefore, sizeAfter, grew: sizeAfter > sizeBefore };
    });

    expect(result.grew).toBe(false);
    await page.evaluate(() => { _soundMuted = false; });
  });

  // SPEC §6.5: autoFilterEnabled === false ==> transparent (lowpass @ 20kHz)
  test('5. Auto-Filter Off = Transparent — no spectral coloring when disabled', async ({ page }) => {
    const result = await page.evaluate(() => ({
      enabled: typeof autoFilterEnabled !== 'undefined' ? autoFilterEnabled : false,
      type1: autoFilter.type,
      freq1: autoFilter.frequency.value,
      type2: autoFilter2.type,
      freq2: autoFilter2.frequency.value,
    }));

    if (!result.enabled) {
      expect(result.type1).toBe('lowpass');
      expect(result.freq1).toBeGreaterThanOrEqual(19000);
      expect(result.type2).toBe('lowpass');
      expect(result.freq2).toBeGreaterThanOrEqual(19000);
    }
  });

  // SPEC §6.6: saturationDrive === 0 ==> bypass (no WaveShaperNode)
  test('6. Saturation Bypass When Drive=0 — zero overhead', async ({ page }) => {
    const result = await page.evaluate(() => ({
      drive: typeof saturationDrive !== 'undefined' ? saturationDrive : 0,
      hasSaturationFn: typeof _createVoiceSaturation === 'function',
    }));

    if (result.drive === 0 && result.hasSaturationFn) {
      const bypass = await page.evaluate(() => {
        const sat = _createVoiceSaturation();
        const isBypass = sat.input === masterGain && sat.cleanup === null;
        return isBypass;
      });
      expect(bypass).toBe(true);
    }
  });

  // SPEC §6.7: noteOn(midi) while active → old voice cancelled, size unchanged
  test('7. Voice Re-trigger Kills Previous — same MIDI note replaces', async ({ page }) => {
    await page.evaluate(() => noteOffAll());
    await page.evaluate(() => noteOn(60, 100));
    // Wait for async retry to complete (preset decode may need time)
    await page.waitForTimeout(500);
    const sizeAfterFirst = await page.evaluate(() => activeVoices.size);

    await page.evaluate(() => noteOn(60, 100)); // re-trigger same note
    await page.waitForTimeout(200);
    const sizeAfterSecond = await page.evaluate(() => activeVoices.size);

    await page.evaluate(() => noteOffAll());

    expect(sizeAfterFirst).toBe(1);
    expect(sizeAfterSecond).toBe(1);
  });

  // SPEC §6 (implicit): Effects produce measurable signal change
  test('8. Effects produce measurable signal change', async ({ page }) => {
    await page.evaluate(() => noteOn(60, 100));
    await page.waitForTimeout(500);
    const dryRMS = await measureRMS(page, 500);

    // Enable phaser
    await page.evaluate(() => {
      if (typeof togglePhaser === 'function') togglePhaser(true);
    });
    await page.waitForTimeout(500);
    const phaserRMS = await measureRMS(page, 500);

    // Disable phaser, enable reverb
    await page.evaluate(() => {
      if (typeof togglePhaser === 'function') togglePhaser(false);
      if (typeof toggleReverb === 'function') toggleReverb(true);
    });
    await page.waitForTimeout(500);
    const reverbRMS = await measureRMS(page, 500);

    await page.evaluate(() => {
      if (typeof toggleReverb === 'function') toggleReverb(false);
      noteOffAll();
    });

    expect(dryRMS).toBeGreaterThan(0.01);
    expect(Math.abs(phaserRMS - dryRMS) / dryRMS).toBeGreaterThan(0.05);
    expect(Math.abs(reverbRMS - dryRMS) / dryRMS).toBeGreaterThan(0.05);
  });
});
