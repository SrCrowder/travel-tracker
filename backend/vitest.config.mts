import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Each file gets its own module registry, so each one can point the app at
    // its own throwaway database through env vars before importing it
    isolate: true,
    pool: 'forks',
  },
});
