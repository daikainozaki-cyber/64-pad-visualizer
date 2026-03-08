/**
 * Deploy Invariant Tests (AUDIO_SPEC.md §5)
 *
 * Layer 1: Deploy Verification — ensures production serves correct, fresh code.
 * These tests catch the #1 cause of "phantom audio bugs": stale cache.
 *
 * Design:
 *   - Principle #14: Test on production URL, not just local
 *   - Principle #15: Blast radius — deploy errors affect ALL users
 *   - AUDIO_SPEC.md §5.3, §5.4: Zombie SW + Cloudflare cache patterns
 *
 * Portable: deploy-checks.js helpers work for any app behind Cloudflare.
 *
 * Usage:
 *   BASE_URL=https://murinaikurashi.com/apps/64-pad npx playwright test tests/deploy.spec.js
 */

const { test } = require('@playwright/test');
const {
  checkCacheHeaders,
  checkVersionConsistency,
  checkNoZombieSW,
} = require('./helpers/deploy-checks');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const isProduction = BASE_URL.includes('murinaikurashi.com');

test.describe('Deployment Invariants (AUDIO_SPEC.md §5)', () => {
  // SPEC §5.4: Cache-Control: no-cache prevents Cloudflare stale HTML
  // Only meaningful on production (local http-server has its own cache headers)
  test('9. Server cache headers — no CDN caching', async ({ request }) => {
    test.skip(!isProduction, 'Cache header test only runs against production');
    await checkCacheHeaders(request, `${BASE_URL}/index.html`);
    await checkCacheHeaders(request, `${BASE_URL}/sw.js`);
  });

  // SPEC §5.4: _AUDIO_BUILD matches SW CACHE_NAME suffix
  test('10. SW version consistency — no version mismatch', async ({ page }) => {
    await page.goto('./');
    await checkVersionConsistency(page);
  });

  // SPEC §5.3: register('sw.js') without ?v= query
  test('11. SW registration — no zombie registrations', async ({ page }) => {
    await page.goto('./');
    await page.waitForLoadState('networkidle');
    await checkNoZombieSW(page);
  });
});
