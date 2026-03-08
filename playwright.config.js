// @ts-check
const { defineConfig } = require('@playwright/test');

/**
 * Playwright config for 64 Pad Explorer E2E tests
 *
 * Design: 哲学駆動型開発 Principle #14 "Verify before acting"
 * - Production-verifiable via BASE_URL env var
 * - Chromium only (Web Audio API support required)
 */
module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',
  timeout: 30_000, // Preset decode can take time
  retries: 0,
  use: {
    // Ensure trailing slash so page.goto('./') resolves correctly
    baseURL: (process.env.BASE_URL || 'http://localhost:8080').replace(/\/?$/, '/'),
    // Headless by default; set HEADED=1 for debugging
    headless: process.env.HEADED !== '1',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        // Allow autoplay for Web Audio
        launchOptions: {
          args: ['--autoplay-policy=no-user-gesture-required'],
        },
      },
    },
  ],
});
