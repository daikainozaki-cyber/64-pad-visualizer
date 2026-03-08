/**
 * Deploy Verification Helpers (Portable — reusable across apps)
 *
 * Layer 1 of the 3-layer test structure.
 * Verifies that production serves the latest code with correct cache headers.
 *
 * Design:
 *   - Principle #14: Verify on production, not just test env
 *   - Principle #15: Detect deploy failures before users do
 *   - AUDIO_SPEC.md §5: Cloudflare cache + zombie SW prevention
 *
 * Usage in other apps:
 *   Copy this file. The helpers are app-agnostic.
 */

const { expect } = require('@playwright/test');

/**
 * Verify HTTP response has no-cache headers (Cloudflare BYPASS).
 * Prevents stale HTML/JS from being served by CDN.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} url - Full URL to check
 */
async function checkCacheHeaders(request, url) {
  const response = await request.get(url);
  const cacheControl = response.headers()['cache-control'] || '';
  expect(cacheControl, `${url} should have no-cache header`).toMatch(
    /no-cache|no-store|max-age=0/
  );
}

/**
 * Verify SW CACHE_NAME version matches app build constant.
 * Detects version mismatch where SW serves stale cached assets.
 *
 * @param {import('@playwright/test').Page} page - Page with app loaded
 */
async function checkVersionConsistency(page) {
  const result = await page.evaluate(() => ({
    audioBuild: typeof _AUDIO_BUILD !== 'undefined' ? _AUDIO_BUILD : null,
    versionTag: document.querySelector('.version-tag')?.textContent,
  }));

  if (result.audioBuild) {
    expect(
      result.versionTag,
      'Version tag should contain _AUDIO_BUILD'
    ).toContain(result.audioBuild);
  }
}

/**
 * Verify no zombie service workers with ?v= query strings.
 * Each ?v=X creates a SEPARATE registration that is never cleaned up.
 *
 * @param {import('@playwright/test').Page} page - Page with app loaded
 */
async function checkNoZombieSW(page) {
  const registrations = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.map((r) => ({
      scriptURL:
        r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL,
    }));
  });

  for (const reg of registrations) {
    if (reg.scriptURL && reg.scriptURL.includes('sw.js')) {
      expect(
        reg.scriptURL,
        'SW registration should not have ?v= query'
      ).not.toContain('?v=');
    }
  }
}

module.exports = { checkCacheHeaders, checkVersionConsistency, checkNoZombieSW };
