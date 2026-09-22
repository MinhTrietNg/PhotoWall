import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Both suites share one emulator and clear it between tests.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
