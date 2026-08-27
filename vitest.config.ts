import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: true,
    // Each integration file owns an isolated PGlite/WASM database. Bound concurrency so the full
    // suite remains deterministic on development and CI machines with modest available memory.
    maxWorkers: 2,
  },
});
