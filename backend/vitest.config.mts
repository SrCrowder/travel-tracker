import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Each file gets its own module registry, so each one can point the app at
    // its own throwaway database through env vars before importing it
    isolate: true,
    pool: 'forks',
    // Image/video processing is CPU-bound; on a busy machine the default 5 s is too tight
    testTimeout: 30_000,
  },
});
