import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

const REQUIRED_PACKED_PATHS = [
  'package.json',
  'README.md',
  'LICENSE',
  'specs/task-tags-spec.md',
  'specs/dispatch-context-labels-spec.md',
  'specs/dispatch-context-labels-subtasks.md',
  'next.config.mjs',
  'postcss.config.mjs',
  'tsconfig.json',
  'src/cli.ts',
  'src/mcp/cli.ts',
  'dist/cli.js',
  'dist/mcp-server.js',
  '.next/BUILD_ID',
  '.next/package.json',
];

const REQUIRED_PACKED_PREFIXES = ['.next/server/', '.next/static/'];

const REQUIRED_BUILD_PATHS = [
  'dist/cli.js',
  'dist/mcp-server.js',
  '.next/BUILD_ID',
  '.next/package.json',
];

const REQUIRED_BUILD_DIRECTORIES = [
  '.next/server',
  '.next/static',
];

const REQUIRED_README_SPEC_LINKS = [
  './specs/task-tags-spec.md',
  './specs/dispatch-context-labels-spec.md',
  './specs/dispatch-context-labels-subtasks.md',
];

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function readStringRecord(value) {
  return isRecord(value) ? value : {};
}

function normalizePackPath(value) {
  return typeof value === 'string' ? value.replace(/^package\//, '') : '';
}

export function verifyKanbanRelease({ packageRoot, manifest, packEntries }) {
  const scripts = readStringRecord(manifest.scripts);
  const bin = readStringRecord(manifest.bin);
  const packedPaths = new Set(packEntries.map((entry) => normalizePackPath(entry.path)));
  const readme = fs.readFileSync(path.join(packageRoot, 'README.md'), 'utf8');

  expect(manifest.name === '@a5c-ai/kanban', 'packages/kanban/package.json name must stay @a5c-ai/kanban');
  expect(manifest.private === false, 'packages/kanban/package.json private must stay false');
  expect(
    manifest.publishConfig?.access === 'public',
    'packages/kanban/package.json publishConfig.access must stay public'
  );
  expect(bin.kanban === './dist/cli.js', 'packages/kanban/package.json bin.kanban must point to ./dist/cli.js');
  expect(
    bin['kanban-mcp-server'] === './dist/mcp-server.js',
    'packages/kanban/package.json bin.kanban-mcp-server must point to ./dist/mcp-server.js'
  );
  expect(
    scripts.build === 'npm run build --workspace=@a5c-ai/agent-catalog && npm run build --workspace=@a5c-ai/agent-mux-observability && npm run build --workspace=@a5c-ai/agent-mux-core && npm run build --workspace=@a5c-ai/agent-mux-ui && next build',
    'packages/kanban/package.json build must stay scoped to kanban and the workspace dependency chain required by agent-mux'
  );
  expect(
    typeof scripts['build:cli'] === 'string' &&
      scripts['build:cli'].includes("outfile:'dist/cli.js'") &&
      scripts['build:cli'].includes("outfile:'dist/mcp-server.js'"),
    'packages/kanban/package.json build:cli must build both the kanban CLI and the kanban MCP server binaries'
  );
  expect(
    scripts.prepublishOnly === 'npm run build && npm run build:cli && npm run verify:release',
    'packages/kanban/package.json prepublishOnly must build the package and run verify:release'
  );
  expect(
    typeof scripts['test:dispatch-context-labels'] === 'string' &&
      scripts['test:dispatch-context-labels'].includes('dispatch-context-label-service.test.ts') &&
      scripts['test:dispatch-context-labels'].includes('release-verification.test.ts'),
    'packages/kanban/package.json test:dispatch-context-labels must enforce storage, UI, and release-surface verification'
  );

  for (const relativePath of REQUIRED_BUILD_PATHS) {
    const absolutePath = path.join(packageRoot, relativePath);
    expect(fs.existsSync(absolutePath), `required build artifact is missing: ${relativePath}`);
  }

  for (const relativePath of REQUIRED_BUILD_DIRECTORIES) {
    const absolutePath = path.join(packageRoot, relativePath);
    expect(
      fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory(),
      `required build directory is missing: ${relativePath}`
    );
  }

  for (const packedPath of REQUIRED_PACKED_PATHS) {
    expect(packedPaths.has(packedPath), `npm pack output is missing ${packedPath}`);
  }

  for (const packedPrefix of REQUIRED_PACKED_PREFIXES) {
    const hasMatch = packEntries.some((entry) => normalizePackPath(entry.path).startsWith(packedPrefix));
    expect(hasMatch, `npm pack output is missing files under ${packedPrefix}`);
  }

  for (const specLink of REQUIRED_README_SPEC_LINKS) {
    expect(readme.includes(specLink), `packages/kanban/README.md must keep linking ${specLink}`);
  }
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const packOutput = execFileSync('npm', ['pack', '--json', '--dry-run'], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
  const [packResult] = JSON.parse(packOutput);
  const packEntries = Array.isArray(packResult?.files) ? packResult.files : [];

  verifyKanbanRelease({
    packageRoot,
    manifest,
    packEntries,
  });

  console.log('kanban release verification passed');
}

if (process.argv[1] === __filename) {
  main();
}
