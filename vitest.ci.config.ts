import { defineConfig } from 'vitest/config';

// CI gate: no secrets and no paid model calls, so every run is free and
// deterministic. Live-model tests stay in the default local `npm test`
// and in the manual live-tests workflow, which supplies real keys.
export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      'dist/**',
      '**/.worktrees/**',
      'tests/meta/live.test.ts',
      'tests/meta/baseten-smoke.test.ts',
      'tests/api/live-interpret.test.ts',
    ],
    testTimeout: 90000,
  },
});
