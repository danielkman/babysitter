import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { verifyKanbanRelease } from '../../../scripts/verify-release.mjs';

const baseManifest = {
  name: '@a5c-ai/kanban',
  private: false,
  publishConfig: {
    access: 'public',
  },
  bin: {
    kanban: './dist/cli.js',
  },
  scripts: {
    build: 'npm run build --workspace=@a5c-ai/agent-mux-observability && npm run build --workspace=@a5c-ai/agent-mux-core && npm run build --workspace=@a5c-ai/agent-mux-ui && next build',
    prepublishOnly: 'npm run build && npm run build:cli && npm run verify:release',
  },
};

const basePackEntries = [
  { path: 'package.json' },
  { path: 'README.md' },
  { path: 'LICENSE' },
  { path: 'next.config.mjs' },
  { path: 'postcss.config.mjs' },
  { path: 'tsconfig.json' },
  { path: 'src/cli.ts' },
  { path: 'dist/cli.js' },
  { path: '.next/BUILD_ID' },
  { path: '.next/package.json' },
  { path: '.next/server/app.js' },
  { path: '.next/static/chunks/app.js' },
];

function withPackageRoot(run: (packageRoot: string) => void): void {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-release-'));
  fs.mkdirSync(path.join(packageRoot, 'dist'), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, '.next', 'server'), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, '.next', 'static'), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'dist', 'cli.js'), 'cli');
  fs.writeFileSync(path.join(packageRoot, '.next', 'BUILD_ID'), 'build-id');
  fs.writeFileSync(path.join(packageRoot, '.next', 'package.json'), '{"type":"commonjs"}');

  try {
    run(packageRoot);
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
}

describe('verifyKanbanRelease', () => {
  it('accepts the expected kanban release contract', () => {
    withPackageRoot((packageRoot) => {
      expect(() =>
        verifyKanbanRelease({
          packageRoot,
          manifest: baseManifest,
          packEntries: basePackEntries,
        })
      ).not.toThrow();
    });
  });

  it('fails when prepublishOnly stops enforcing the package-local verifier', () => {
    withPackageRoot((packageRoot) => {
      expect(() =>
        verifyKanbanRelease({
          packageRoot,
          manifest: {
            ...baseManifest,
            scripts: {
              ...baseManifest.scripts,
              prepublishOnly: 'npm run build',
            },
          },
          packEntries: basePackEntries,
        })
      ).toThrow(/prepublishOnly/);
    });
  });

  it('fails when build regresses to the monorepo-wide helper', () => {
    withPackageRoot((packageRoot) => {
      expect(() =>
        verifyKanbanRelease({
          packageRoot,
          manifest: {
            ...baseManifest,
            scripts: {
              ...baseManifest.scripts,
              build: 'node ../../scripts/agent-mux-build.cjs build && next build',
            },
          },
          packEntries: basePackEntries,
        })
      ).toThrow(/build must stay scoped/);
    });
  });

  it('fails when packed next build output is missing', () => {
    withPackageRoot((packageRoot) => {
      expect(() =>
        verifyKanbanRelease({
          packageRoot,
          manifest: baseManifest,
          packEntries: basePackEntries.filter((entry) => entry.path !== '.next/BUILD_ID'),
        })
      ).toThrow(/\.next\/BUILD_ID/);
    });
  });

  it('accepts npm pack entries that still include the tarball package prefix', () => {
    withPackageRoot((packageRoot) => {
      expect(() =>
        verifyKanbanRelease({
          packageRoot,
          manifest: baseManifest,
          packEntries: basePackEntries.map((entry) => ({ path: `package/${entry.path}` })),
        })
      ).not.toThrow();
    });
  });
});
