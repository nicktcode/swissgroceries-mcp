import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['tests/**/*.test.ts'],
    exclude: process.env.RUN_LIVE === '1' ? [] : ['tests/smoke/**'],
    environment: 'node',
    testTimeout: 10000,
  },
});
