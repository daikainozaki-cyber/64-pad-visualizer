import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/helpers/setup.js'],
    exclude: ['pad-core/**', 'node_modules/**'],
  },
});
