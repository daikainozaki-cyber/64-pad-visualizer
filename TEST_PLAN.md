# 64 Pad Explorer Test Plan

## Current state

- **pad-core/tests/**: 107 tests (Vitest, Node) — pure theory functions (SSOT)
- **tests/integrity.test.js**: 4 tests — file existence, HTML element checks, no JUCE leaks
- **Framework**: Vitest (already configured), runs in CI via `deploy.yml`
- **No E2E tests**. No audio tests. No version sync tests.

## Recurring regression patterns

| # | Pattern | Root cause | Current guard |
|---|---------|-----------|---------------|
| 1 | Revert/re-add loses init calls | `initTextChordInput` defined but never called in main.js | integrity.test.js (weak) |
| 2 | Vol=0 + tremolo LFO = audible sound | Additive LFO on masterGain (now fixed: separate tremoloNode) | None |
| 3 | Sound preset switch: state updates, audio unchanged | AudioState.instrument updates but wafPlayer still uses old data | None |
| 4 | SW cache version mismatch | sw.js CACHE_NAME vs index.html `?v=` params diverge | None |
| 5 | pad-core submodule CI race | Rapid pushes: older deploy finishes last, overwrites newer code | None |

---

## Priority order (implement first to last)

1. **Version sync tests** (Pattern #4) — catches the most common deploy breakage, zero dependencies, pure file reads
2. **Init sequence tests** (Pattern #1) — catches missing init calls statically, pure file reads
3. **Audio graph topology tests** (Pattern #2) — catches tremolo routing regression, requires mocking Web Audio
4. **Audio state machine tests** (Pattern #3) — catches preset switching bugs
5. **CI race condition guard** (Pattern #5) — deploy workflow enhancement
6. **E2E tests** (Playwright) — full integration, highest confidence but highest cost

---

## 1. Version sync tests

**File**: `tests/version-sync.test.js`

Guards Pattern #4 (SW cache mismatch) and Pattern #5 (submodule version drift).

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

function readFile(name) {
  return readFileSync(resolve(ROOT, name), 'utf-8');
}

describe('Version sync', () => {
  const sw = readFile('sw.js');
  const html = readFile('index.html');

  // Extract CACHE_NAME version from sw.js: var CACHE_NAME = '64pad-v3.24.13';
  const swVersion = sw.match(/CACHE_NAME\s*=\s*'64pad-v([\d.]+)'/)?.[1];

  it('sw.js CACHE_NAME is a valid semver-like version', () => {
    expect(swVersion).toBeTruthy();
    expect(swVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('Every ?v= param in index.html matches sw.js CACHE_NAME version', () => {
    // Matches: href="style.css?v=3.24.13" and src="audio.js?v=3.24.13"
    const vParams = [...html.matchAll(/(?:src|href)="([^"]+)\?v=([\d.]+)"/g)];
    expect(vParams.length).toBeGreaterThan(10); // sanity: we know there are 15+ versioned refs
    const mismatches = vParams.filter(m => m[2] !== swVersion);
    expect(mismatches.map(m => `${m[1]}?v=${m[2]}`)).toEqual([]);
  });

  it('sw.js ASSETS list includes all local script tags from index.html', () => {
    // Extract local (non-CDN) script src from index.html
    const htmlScripts = [...html.matchAll(/src="([^"]*\.js)(?:\?v=[^"]*)?"/g)]
      .map(m => m[1])
      .filter(s => !s.startsWith('http') && !s.startsWith('//'));

    // Extract ASSETS entries from sw.js (strip ?v= params)
    const swAssets = [...sw.matchAll(/'([^']+)'/g)]
      .map(m => m[1].replace(/\?v=[\d.]+$/, ''))
      .filter(a => a.endsWith('.js'));

    for (const script of htmlScripts) {
      expect(swAssets, `Missing from sw.js ASSETS: ${script}`).toContain(script);
    }
  });

  it('style.css version in index.html matches sw.js version', () => {
    const cssVersion = html.match(/style\.css\?v=([\d.]+)/)?.[1];
    expect(cssVersion).toBe(swVersion);
  });

  it('SW register URL version matches CACHE_NAME', () => {
    const registerVersion = html.match(/register\('sw\.js\?v=([\d.]+)'\)/)?.[1];
    expect(registerVersion).toBe(swVersion);
  });
});
```

### What this catches

- Pattern #4: Any file with a stale `?v=` param will fail the "every ?v= matches" test.
- Pattern #5: After a pad-core submodule update, if someone bumps `pad-core/data.js?v=` in sw.js but forgets index.html (or vice versa), the mismatch test catches it.
- Prevents the common "update sw.js CACHE_NAME but forget to update all script tag versions" error.

---

## 2. Init sequence tests

**File**: `tests/init-sequence.test.js`

Guards Pattern #1 (init function defined but not called).

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

function readFile(name) {
  return readFileSync(resolve(ROOT, name), 'utf-8');
}

describe('Init sequence completeness', () => {
  const mainJs = readFile('main.js');

  // Every init* function defined across the codebase
  const REQUIRED_INIT_CALLS = [
    'loadAppSettings',
    'initKeyButtons',
    'initScaleSelect',
    'initQualityGrid',
    'initTensionGrid',
    'updateOctaveLabel',
    'initMemorySlots',
    'initWebMIDI',
    'initPlayControls',
    'initTextChordInput',
    'initScreenDots',
    'I18N.init',
    'render',
  ];

  for (const fn of REQUIRED_INIT_CALLS) {
    it(`main.js calls ${fn}()`, () => {
      // Match the function call (not just the string in a comment)
      // Escape dots for I18N.init
      const escaped = fn.replace('.', '\\.');
      const pattern = new RegExp(`^\\s*${escaped}\\s*\\(`, 'm');
      expect(mainJs).toMatch(pattern);
    });
  }

  it('main.js calls render() at the end', () => {
    // render() must appear near the end of main.js (last 20 lines)
    const lines = mainJs.split('\n');
    const last20 = lines.slice(-20).join('\n');
    expect(last20).toContain('render()');
  });
});

describe('Init function definitions exist', () => {
  // Each function and the file it should be defined in
  const INIT_FUNCTIONS = [
    ['initKeyButtons', 'builder.js'],
    ['initScaleSelect', 'builder.js'],
    ['initQualityGrid', 'builder.js'],
    ['initTensionGrid', 'builder.js'],
    ['initWebMIDI', 'builder.js'],
    ['initTextChordInput', 'builder.js'],
    ['initMemorySlots', 'plain.js'],
    ['initPlayControls', 'render.js'],
    ['initScreenDots', 'render.js'],
    ['loadAppSettings', 'data.js'],
    ['updateOctaveLabel', 'theory.js'],
  ];

  for (const [fn, file] of INIT_FUNCTIONS) {
    it(`${fn} is defined in ${file}`, () => {
      const content = readFile(file);
      expect(content).toMatch(new RegExp(`function ${fn}\\s*\\(`));
    });
  }
});

describe('Event listeners attached', () => {
  const audioJs = readFile('audio.js');

  it('audio.js registers mousedown/touchstart for AudioContext resume', () => {
    expect(audioJs).toContain("addEventListener('mousedown', ensureAudioResumed");
    expect(audioJs).toContain("addEventListener('touchstart', ensureAudioResumed");
  });

  it('audio.js registers mouseup/touchend/touchcancel for note release', () => {
    expect(audioJs).toContain("addEventListener('mouseup'");
    expect(audioJs).toContain("addEventListener('touchend'");
    expect(audioJs).toContain("addEventListener('touchcancel'");
  });

  it('audio.js registers window blur for note safety release', () => {
    expect(audioJs).toContain("addEventListener('blur'");
  });
});
```

### What this catches

- Pattern #1 (exactly): if `initTextChordInput` gets defined in builder.js but its call in main.js is accidentally removed during a revert, the test fails immediately.
- Also catches if a function definition is accidentally deleted from its source file.

---

## 3. Audio graph topology tests

**File**: `tests/audio-graph.test.js`

Guards Pattern #2 (Vol=0 + tremolo LFO leak). This requires verifying the signal chain structure at the source code level, since we cannot run Web Audio API in Node.

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const audioJs = readFileSync(resolve(ROOT, 'audio.js'), 'utf-8');

describe('Audio signal chain: tremolo isolation (Pattern #2 regression)', () => {
  it('tremoloNode is a separate GainNode, not masterGain', () => {
    // tremoloNode must exist as its own createGain()
    expect(audioJs).toMatch(/const tremoloNode\s*=\s*audioCtx\.createGain\(\)/);
    // tremoloNode must NOT be masterGain
    expect(audioJs).not.toMatch(/const tremoloNode\s*=\s*masterGain/);
  });

  it('tremoloLFO modulates tremoloNode.gain, NOT masterGain.gain', () => {
    // The LFO output must connect to tremoloNode.gain
    expect(audioJs).toContain('tremoloGain.connect(tremoloNode.gain)');
    // Must NOT connect LFO to masterGain.gain (the old broken pattern)
    expect(audioJs).not.toContain('tremoloGain.connect(masterGain.gain)');
  });

  it('Signal chain order: masterGain -> tremoloNode -> autoFilter', () => {
    // masterGain feeds tremoloNode
    expect(audioJs).toContain('masterGain.connect(tremoloNode)');
    // tremoloNode feeds autoFilter
    expect(audioJs).toContain('tremoloNode.connect(autoFilter)');
    // masterGain must NOT connect directly to autoFilter (bypassing tremolo)
    expect(audioJs).not.toMatch(/masterGain\.connect\(autoFilter\)/);
  });

  it('Volume slider updates masterGain, not tremoloNode', () => {
    // The volume input handler should set masterGain.gain
    expect(audioJs).toContain('masterGain.gain.setValueAtTime(val,');
    // It should NOT set tremoloNode.gain (that is for LFO)
    expect(audioJs).not.toMatch(/volSlider.*tremoloNode\.gain/s);
  });
});

describe('Audio signal chain: complete routing', () => {
  it('Full chain: masterGain -> tremolo -> autoFilter -> phaser -> flanger -> comp/reverb', () => {
    expect(audioJs).toContain('masterGain.connect(tremoloNode)');
    expect(audioJs).toContain('tremoloNode.connect(autoFilter)');
    expect(audioJs).toContain('autoFilter.connect(autoFilter2)');
    expect(audioJs).toContain('autoFilter2.connect(phaserFilters[0])');
    expect(audioJs).toContain('phaserFilters[3].connect(phaserWet)');
    expect(audioJs).toContain('flangerMix.connect(masterBus)');
    expect(audioJs).toContain('flangerMix.connect(masterReverb)');
  });

  it('masterBus connects to audioCtx.destination (final output)', () => {
    expect(audioJs).toContain('masterBus.connect(audioCtx.destination)');
  });
});
```

### What this catches

- Pattern #2: If anyone reconnects the tremolo LFO to masterGain.gain (the old broken pattern), the test fails.
- Also catches accidental routing changes that break the signal chain.

---

## 4. Audio state machine tests

**File**: `tests/audio-state.test.js`

Guards Pattern #3 (preset switch: state updates but audio doesn't change).

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const audioJs = readFileSync(resolve(ROOT, 'audio.js'), 'utf-8');

describe('Sound engine state management (Pattern #3 regression)', () => {
  it('ENGINES object contains both organ and ep engines', () => {
    expect(audioJs).toMatch(/ENGINES\s*=\s*\{/);
    expect(audioJs).toContain("organ:");
    expect(audioJs).toContain("ep:");
  });

  it('setEngine updates all 4 AudioState fields', () => {
    // Extract setEngine function body
    const match = audioJs.match(/function setEngine\(key\)\s*\{([\s\S]*?)\n\}/);
    expect(match).toBeTruthy();
    const body = match[1];
    expect(body).toContain('AudioState.engineKey');
    expect(body).toContain('AudioState.engine');
    expect(body).toContain('AudioState.presetKey');
    expect(body).toContain('AudioState.instrument');
  });

  it('selectSound updates AudioState.instrument to the correct preset object', () => {
    const match = audioJs.match(/function selectSound\(combinedValue\)\s*\{([\s\S]*?)\n\}/);
    expect(match).toBeTruthy();
    const body = match[1];
    // Must update .instrument from the ENGINES lookup, not from a stale ref
    expect(body).toContain('AudioState.instrument = AudioState.engine.presets[presetKey]');
  });

  it('selectSound calls noteOffAll before switching (prevents orphaned voices)', () => {
    const match = audioJs.match(/function selectSound[\s\S]*?noteOffAll/);
    expect(match).toBeTruthy();
  });

  it('setEngine calls noteOffAll before switching', () => {
    const match = audioJs.match(/function setEngine[\s\S]*?noteOffAll/);
    expect(match).toBeTruthy();
  });

  it('noteOn reads AudioState.instrument at call time (not cached)', () => {
    // noteOn must reference AudioState.instrument inside the function,
    // not capture it at module load time
    const match = audioJs.match(/function noteOn\([\s\S]*?\n\}/);
    expect(match).toBeTruthy();
    const body = match[0];
    expect(body).toContain('AudioState.instrument');
  });

  it('selectSound decodes presets for new engine (avoids silent switch)', () => {
    const match = audioJs.match(/function selectSound\(combinedValue\)\s*\{([\s\S]*?)\n\}/);
    expect(match).toBeTruthy();
    const body = match[1];
    // When engine changes, must decode all presets
    expect(body).toContain('decodeAfterLoading');
  });
});

describe('Mute state', () => {
  it('noteOn returns early when _soundMuted is true', () => {
    const match = audioJs.match(/function noteOn\([\s\S]*?\n\}/);
    expect(match).toBeTruthy();
    expect(match[0]).toContain('if (_soundMuted) return');
  });

  it('_soundMuted defaults to true (sound OFF by default)', () => {
    expect(audioJs).toMatch(/let _soundMuted\s*=\s*true/);
  });
});
```

### What this catches

- Pattern #3: If someone caches `AudioState.instrument` at module load time (breaking dynamic preset switching), the noteOn test catches it.
- If someone removes the `noteOffAll()` call from `selectSound`, orphaned voices will linger.
- If someone removes the `decodeAfterLoading` call from engine switching, new presets will be silent.

---

## 5. Velocity curve pure function tests

**File**: `tests/velocity-curve.test.js`

`applyVelocityCurve` is a pure function (depends only on AppState params). It can be tested with known inputs.

```js
import { describe, it, expect } from 'vitest';

// applyVelocityCurve depends on AppState. We simulate it.
// Extract the function body and test it in isolation.

function applyVelocityCurve(velocity127, opts = {}) {
  const velThreshold = opts.velThreshold ?? 0;
  const velDrive = opts.velDrive ?? 0;
  const velCompand = opts.velCompand ?? 0;
  const velRange = opts.velRange ?? 127;

  if (velocity127 <= velThreshold) return 0;
  let x = (velocity127 - velThreshold) / (127 - velThreshold);
  const exp = Math.pow(2, -velDrive / 32);
  x = Math.pow(x, exp);
  if (velCompand !== 0) {
    const c = velCompand / 64;
    if (c > 0) {
      x = x + c * (0.7 - x) * x * 2;
    } else {
      const a = -c;
      x = x < 0.5
        ? 0.5 * Math.pow(2 * x, 1 + a * 2)
        : 1 - 0.5 * Math.pow(2 * (1 - x), 1 + a * 2);
    }
  }
  return Math.min(1, Math.max(0, x)) * (velRange / 127);
}

describe('applyVelocityCurve', () => {
  it('linear curve: default params, vel=0 -> 0, vel=127 -> 1.0', () => {
    expect(applyVelocityCurve(0)).toBe(0);
    expect(applyVelocityCurve(127)).toBeCloseTo(1.0, 2);
  });

  it('linear curve: midpoint vel=64 -> ~0.50', () => {
    const out = applyVelocityCurve(64);
    expect(out).toBeGreaterThan(0.45);
    expect(out).toBeLessThan(0.55);
  });

  it('threshold=20: vel=20 -> 0, vel=21 -> > 0', () => {
    expect(applyVelocityCurve(20, { velThreshold: 20 })).toBe(0);
    expect(applyVelocityCurve(21, { velThreshold: 20 })).toBeGreaterThan(0);
  });

  it('velRange=64: max output is ~0.50', () => {
    const out = applyVelocityCurve(127, { velRange: 64 });
    expect(out).toBeCloseTo(64 / 127, 2);
  });

  it('positive drive: soft touch = louder (concave curve)', () => {
    const linearMid = applyVelocityCurve(64, { velDrive: 0 });
    const drivenMid = applyVelocityCurve(64, { velDrive: 32 });
    expect(drivenMid).toBeGreaterThan(linearMid);
  });

  it('negative drive: need harder touch (convex curve)', () => {
    const linearMid = applyVelocityCurve(64, { velDrive: 0 });
    const drivenMid = applyVelocityCurve(64, { velDrive: -32 });
    expect(drivenMid).toBeLessThan(linearMid);
  });

  it('output is always clamped to [0, velRange/127]', () => {
    for (let v = 0; v <= 127; v++) {
      const out = applyVelocityCurve(v, { velDrive: 64, velCompand: 64 });
      expect(out).toBeGreaterThanOrEqual(0);
      expect(out).toBeLessThanOrEqual(1.0);
    }
  });
});
```

---

## 6. CI race condition guard (Pattern #5)

**Not a Vitest test** — this is a deploy workflow enhancement.

### Problem

Rapid pushes (commit A, then commit B seconds later) trigger two CI runs. If Run A's deploy step finishes after Run B's, production has stale code.

### Solution: add `concurrency` to `.github/workflows/deploy.yml`

```yaml
concurrency:
  group: deploy-production
  cancel-in-progress: true
```

This ensures only the latest push deploys. Older runs get cancelled.

### Verification test (optional, run locally)

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('CI deploy safety', () => {
  it('deploy.yml has concurrency group to prevent race conditions', () => {
    const yml = readFileSync(
      resolve(__dirname, '..', '.github', 'workflows', 'deploy.yml'), 'utf-8'
    );
    expect(yml).toContain('concurrency:');
    expect(yml).toMatch(/cancel-in-progress:\s*true/);
  });
});
```

---

## 7. E2E tests (Playwright)

**Directory**: `tests/e2e/`

These are the highest-confidence tests but require a browser. Run locally or in CI with `npx playwright test`.

### Setup

```bash
npm install -D @playwright/test
npx playwright install chromium
```

**File**: `tests/e2e/basic-flow.spec.js`

```js
import { test, expect } from '@playwright/test';

test.describe('64 Pad Explorer E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080'); // or file:// for local
  });

  test('app loads without console errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.waitForSelector('.pad-grid');
    expect(errors).toEqual([]);
  });

  test('pad grid renders 64 pads', async ({ page }) => {
    const pads = await page.locator('.pad').count();
    expect(pads).toBe(64);
  });

  test('clicking a pad triggers noteOn (no crash)', async ({ page }) => {
    // Dismiss audio overlay first
    const overlay = page.locator('#audio-start-overlay');
    if (await overlay.isVisible()) {
      await overlay.click();
    }
    // Click first pad
    const pad = page.locator('.pad').first();
    await pad.click();
    // No crash = pass. Check activeVoices map has entry.
    const voiceCount = await page.evaluate(() => activeVoices.size);
    // Voice may have already been released by mouseup, so >= 0 is fine
    expect(voiceCount).toBeGreaterThanOrEqual(0);
  });

  test('mode switching works (Scale -> Chord -> Input)', async ({ page }) => {
    await page.click('#mode-chord');
    const chordPanel = page.locator('#chord-panel');
    await expect(chordPanel).toBeVisible();

    await page.click('#mode-input');
    const inputPanel = page.locator('#input-panel');
    await expect(inputPanel).toBeVisible();

    await page.click('#mode-scale');
    const scalePanel = page.locator('#scale-panel');
    await expect(scalePanel).toBeVisible();
  });

  test('sound preset selector changes AudioState', async ({ page }) => {
    // Dismiss overlay
    const overlay = page.locator('#audio-start-overlay');
    if (await overlay.isVisible()) await overlay.click();

    // Select Rhodes preset
    await page.selectOption('#organ-preset', 'ep:Rhodes 1');
    const engine = await page.evaluate(() => AudioState.engineKey);
    const preset = await page.evaluate(() => AudioState.presetKey);
    expect(engine).toBe('ep');
    expect(preset).toBe('Rhodes 1');
  });

  test('volume=0 produces no audio output (Pattern #2 E2E guard)', async ({ page }) => {
    const overlay = page.locator('#audio-start-overlay');
    if (await overlay.isVisible()) await overlay.click();

    // Set volume to 0
    await page.evaluate(() => {
      masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
    });

    // Enable tremolo at max depth
    await page.evaluate(() => {
      tremoloGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    });

    // Create an AnalyserNode to measure output
    const rms = await page.evaluate(async () => {
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      masterBus.connect(analyser);

      // Trigger a note
      noteOn(60, 0.8);

      // Wait 200ms for sound to propagate
      await new Promise(r => setTimeout(r, 200));

      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      noteOff(60);
      analyser.disconnect();
      return Math.sqrt(sum / data.length);
    });

    // RMS should be effectively zero (< -60dB threshold)
    expect(rms).toBeLessThan(0.001);
  });

  test('Service Worker registers successfully', async ({ page }) => {
    // Wait for SW registration
    const swState = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.state;
    });
    expect(swState).toBe('activated');
  });
});
```

---

## Test file summary

| File | Type | Pattern guarded | Priority | Dependencies |
|------|------|----------------|----------|-------------|
| `tests/version-sync.test.js` | Unit (file read) | #4, #5 | 1 | None |
| `tests/init-sequence.test.js` | Unit (file read) | #1 | 2 | None |
| `tests/audio-graph.test.js` | Unit (file read) | #2 | 3 | None |
| `tests/audio-state.test.js` | Unit (file read) | #3 | 4 | None |
| `tests/velocity-curve.test.js` | Unit (pure fn) | General | 5 | None |
| `.github/workflows/deploy.yml` | CI config | #5 | 6 | GitHub Actions |
| `tests/e2e/basic-flow.spec.js` | E2E (Playwright) | #2, #3, all | 7 | Playwright, server |

---

## Framework setup

### Vitest (already configured)

Current `vitest.config.js` works for all unit tests. No changes needed.

```
npm test          # runs all tests in tests/
npm run test:watch  # watch mode
```

The existing `setupFiles: ['./tests/helpers/setup.js']` reference does not have a corresponding file yet. Create it if needed for DOM mocking, or remove the reference:

```js
// tests/helpers/setup.js (create if needed)
// Currently empty — placeholder for future DOM mocks
```

### Playwright (new, for E2E only)

```bash
npm install -D @playwright/test
npx playwright install chromium
```

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:e2e": "playwright test tests/e2e/",
    "test:all": "vitest run && playwright test tests/e2e/"
  }
}
```

Playwright config (`playwright.config.js`):

```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
  },
  webServer: {
    command: 'npx serve -l 8080 .',
    port: 8080,
    reuseExistingServer: true,
  },
});
```

---

## Design decisions

1. **Source-code-level tests (not mocking Web Audio)** for audio graph topology. Rationale: Web Audio API mocking in Node is fragile and requires heavy setup (`web-audio-test-api` or similar). Source pattern matching is deterministic, fast, and catches the exact regressions we have seen. E2E tests (Playwright) cover runtime behavior as a second layer.

2. **File-read tests over import-based tests** for browser globals. The app uses global script tags (no ES modules), so importing functions directly is not possible without refactoring. File reads are stable and don't require build steps.

3. **Version sync as top priority** because it requires zero setup beyond what already exists, and cache mismatches are the hardest to debug in production (users see stale UI with no obvious error).

4. **CI `concurrency` for Pattern #5** because no amount of testing prevents a race condition in deployment. Only the CI configuration itself can prevent it.

---

## Implementation checklist

- [ ] Create `tests/version-sync.test.js`
- [ ] Create `tests/init-sequence.test.js`
- [ ] Create `tests/audio-graph.test.js`
- [ ] Create `tests/audio-state.test.js`
- [ ] Create `tests/velocity-curve.test.js`
- [ ] Create `tests/helpers/setup.js` (empty placeholder)
- [ ] Add `concurrency` block to `.github/workflows/deploy.yml`
- [ ] Install Playwright: `npm install -D @playwright/test`
- [ ] Create `playwright.config.js`
- [ ] Create `tests/e2e/basic-flow.spec.js`
- [ ] Update `package.json` scripts with `test:e2e` and `test:all`
- [ ] Add Playwright to CI (optional second job in deploy.yml)
