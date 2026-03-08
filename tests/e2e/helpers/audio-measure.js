/**
 * Audio Measurement Helpers (Portable — reusable for 64PE / PADDAW)
 *
 * Layer 2 support for audio invariant testing.
 * Provides RMS measurement and audio activation utilities.
 *
 * Design:
 *   - Silent failure detection: "no error + no sound" is the hardest bug to catch
 *   - Quantitative verification: RMS thresholds, not subjective listening
 *   - AUDIO_SPEC.md §6: All invariants tested via measurable signals
 */

/**
 * Activate AudioContext via user gesture simulation.
 * Browsers require user interaction before AudioContext can run.
 *
 * @param {import('@playwright/test').Page} page
 */
async function activateAudio(page) {
  // Wait for audio system to initialize
  await page.waitForFunction(() => typeof audioCtx !== 'undefined', { timeout: 10000 });

  // Dismiss audio-start-overlay if present (blocks all clicks until dismissed)
  // Fresh browser = no localStorage → overlay always appears
  try {
    const overlay = page.locator('#audio-start-overlay.active');
    await overlay.waitFor({ state: 'visible', timeout: 5000 });
    await overlay.click();
    await page.waitForTimeout(500);
  } catch (_) {
    // Overlay might not appear if localStorage has settings
  }

  // Expand Sound panel if collapsed (sound-details defaults to display:none)
  await page.evaluate(() => {
    const details = document.getElementById('sound-details');
    if (details && details.style.display === 'none') {
      details.style.display = '';
    }
  });

  // Click the mute button to trigger user gesture and resume AudioContext
  const muteBtn = page.locator('#sound-mute-btn');
  await muteBtn.click({ timeout: 5000 });

  // Ensure AudioContext is running
  const state = await page.evaluate(() => audioCtx.state);
  if (state !== 'running') {
    await muteBtn.click();
  }
  await page.evaluate(() => {
    if (audioCtx.state === 'suspended') return audioCtx.resume();
  });
}

/**
 * Measure RMS level at masterGain output.
 * Connects a temporary AnalyserNode, samples after durationMs, returns RMS.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [durationMs=500] - How long to wait before sampling
 * @returns {Promise<number>} RMS value (0 = silence, >0.01 = audible signal)
 */
async function measureRMS(page, durationMs = 500) {
  return page.evaluate((ms) => {
    return new Promise((resolve) => {
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      masterGain.connect(analyser);
      setTimeout(() => {
        const data = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        masterGain.disconnect(analyser);
        resolve(Math.sqrt(sum / data.length));
      }, ms);
    });
  }, durationMs);
}

/**
 * Play a MIDI note, measure RMS, then stop.
 * Convenience wrapper for the common pattern: noteOn → measure → noteOff.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} midi - MIDI note number (e.g., 60 = C4)
 * @param {number} velocity - Velocity 0-127
 * @param {number} [durationMs=500] - Sustain + measurement time
 * @returns {Promise<number>} RMS during sustain
 */
async function playAndMeasure(page, midi, velocity, durationMs = 500) {
  await page.evaluate(
    ({ m, v }) => noteOn(m, v),
    { m: midi, v: velocity }
  );
  await page.waitForTimeout(Math.max(200, durationMs - 300));
  const rms = await measureRMS(page, 300);
  await page.evaluate((m) => noteOff(m), midi);
  return rms;
}

module.exports = { activateAudio, measureRMS, playAndMeasure };
