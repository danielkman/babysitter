import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { defineConfig } from 'vitest/config';

// Pin the project root to THIS config's directory so the relative `include`
// glob and CLI filter args resolve against the package — regardless of the
// process cwd. The monorepo gate (scripts/adapters-build.cjs) runs vitest with
// cwd = repo root, and vitest 4 otherwise treats cwd as the root, which would
// make `src/__tests__/**` (and the forwarded file filters) resolve against the
// repo root and find no tests.
const ROOT = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: ROOT,
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10000,
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts', 'src/types.ts', 'src/__tests__/**'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 90,
      },
    },
  },
});
