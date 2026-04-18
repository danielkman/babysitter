#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');

const packages = [
  'packages/hooks-proxy/core',
  'packages/hooks-proxy/cli',
  'packages/hooks-proxy/adapter-claude',
  'packages/hooks-proxy/adapter-codex',
  'packages/hooks-proxy/adapter-gemini',
  'packages/hooks-proxy/adapter-copilot',
  'packages/hooks-proxy/adapter-cursor',
  'packages/hooks-proxy/adapter-pi',
  'packages/hooks-proxy/adapter-oh-my-pi',
  'packages/hooks-proxy/adapter-opencode',
  'packages/hooks-proxy/adapter-openclaw',
];

const mode = process.argv[2] || 'build';

for (const pkg of packages) {
  const dir = path.resolve(__dirname, '..', pkg);
  if (mode === 'lint' && !['packages/hooks-proxy/core', 'packages/hooks-proxy/cli'].includes(pkg)) continue;
  const cmd = mode === 'test' ? 'npx vitest run' : mode === 'lint' ? 'npx eslint "src/**/*.ts" --max-warnings=0' : 'npx tsc -p tsconfig.json';
  console.log(`\n=== ${pkg} (${mode}) ===`);
  try {
    execSync(cmd, { cwd: dir, stdio: 'inherit' });
  } catch {
    process.exit(1);
  }
}
