import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/adapters/*/src/**/*.test.{ts,tsx}',
      'packages/adapters/*/tests/**/*.test.{ts,tsx}',
      'packages/adapters/tests/**/*.test.{ts,tsx}',
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/adapters/*/src/**/*.ts'],
      exclude: [
        'packages/adapters/*/src/**/*.test.ts',
        '**/index.ts',
      ],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
});
