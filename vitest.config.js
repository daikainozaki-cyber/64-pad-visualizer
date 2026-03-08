import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/unit/helpers/setup.js'],
    include: ['tests/unit/**/*.test.js'],
    exclude: ['pad-core/**', 'node_modules/**'],
  },
});
