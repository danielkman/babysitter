import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

const REQUIRED_PACKED_PATHS = [
  'package/package.json',
  'package/README.md',
  'package/LICENSE',
  'package/next.config.mjs',
  'package/postcss.config.mjs',
  'package/tsconfig.json',
  'package/src/cli.ts',
  'package/dist/cli.js',
  'package/.next/BUILD_ID',
  'package/.next/package.json',
];

const REQUIRED_PACKED_PREFIXES = [
  'package/.next/server/',
  'package/.next/static/',
];

const REQUIRED_BUILD_PATHS = [
  'dist/cli.js',
  '.next/BUILD_ID',
  '.next/package.json',
];

const REQUIRED_BUILD_DIRECTORIES = [
  '.next/server',
  '.next/static',
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

export function verifyKanbanRelease({ packageRoot, manifest, packEntries }) {
  const scripts = readStringRecord(manifest.scripts);
  const bin = readStringRecord(manifest.bin);
  const packedPaths = new Set(packEntries.map((entry) => entry.path));

  expect(manifest.name === '@a5c-ai/kanban', 'packages/kanban/package.json name must stay @a5c-ai/kanban');
  expect(manifest.private === false, 'packages/kanban/package.json private must stay false');
  expect(
    manifest.publishConfig?.access === 'public',
    'packages/kanban/package.json publishConfig.access must stay public'
  );
  expect(bin.kanban === './dist/cli.js', 'packages/kanban/package.json bin.kanban must point to ./dist/cli.js');
  expect(
    scripts.build === 'npm run build --workspace=@a5c-ai/agent-mux-observability && npm run build --workspace=@a5c-ai/agent-mux-core && npm run build --workspace=@a5c-ai/agent-mux-ui && next build',
    'packages/kanban/package.json build must stay scoped to kanban and its direct workspace dependencies'
  );
  expect(
    scripts.prepublishOnly === 'npm run build && npm run build:cli && npm run verify:release',
    'packages/kanban/package.json prepublishOnly must build the package and run verify:release'
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
    const hasMatch = packEntries.some((entry) => entry.path.startsWith(packedPrefix));
    expect(hasMatch, `npm pack output is missing files under ${packedPrefix}`);
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
