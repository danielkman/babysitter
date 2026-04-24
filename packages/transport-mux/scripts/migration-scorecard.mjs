import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function countFiles(relativeDir, suffix) {
  const absoluteDir = path.join(repoRoot, relativeDir);
  if (!existsSync(absoluteDir)) return 0;
  return readdirSync(absoluteDir).filter((entry) => entry.endsWith(suffix)).length;
}

function containsAll(doc, snippets) {
  return snippets.every((snippet) => doc.includes(snippet));
}

const migrationDoc = read('packages/transport-mux/migration.md');
const readmeDoc = read('packages/transport-mux/README.md');
const architectureDoc = read('packages/transport-mux/architecture.md');
const packageJson = JSON.parse(read('packages/transport-mux/package.json'));
const packageEntrypoint = read('packages/transport-mux/src/index.ts');
const launchCommand = read('packages/agent-mux/cli/src/commands/launch.ts');
const releaseWorkflow = read('.github/workflows/release.yml');
const stagingWorkflow = read('.github/workflows/staging-publish.yml');
const legacyPublishWorkflow = read('packages/agent-mux/meta/github/workflows/publish.yml');
const legacyProxyCiWorkflow = read('packages/agent-mux/meta/github/workflows/amux-proxy-ci.yml');

const legacyPythonTests = countFiles('packages/agent-mux/amux-proxy/tests', '.py');
const jsContractTests =
  countFiles('packages/transport-mux/tests', '.ts') +
  countFiles('packages/transport-mux/tests/transports', '.ts') +
  countFiles('packages/transport-mux/tests/e2e', '.ts');

const docsHonestyChecks = [
  {
    name: 'README marks transport-mux as the active runtime/release owner',
    ok: containsAll(readmeDoc, [
      'active runtime and release owner',
      'transport/proxy surface',
    ]),
  },
  {
    name: 'README archives legacy amux-proxy references explicitly',
    ok: containsAll(readmeDoc, [
      'Historical references still exist under `packages/agent-mux/amux-proxy`',
      'archival only',
    ]),
  },
  {
    name: 'migration.md says transport-mux owns the active runtime/release surface',
    ok: containsAll(migrationDoc, [
      'owns the active transport/proxy runtime and release surface in this repo',
      '`@a5c-ai/transport-mux`',
    ]),
  },
  {
    name: 'migration.md keeps legacy amux-proxy assets historical-only',
    ok: containsAll(migrationDoc, [
      'Historical archive: legacy Python tests under `packages/agent-mux/amux-proxy/tests` remain for reference only.',
      'historical reference material',
    ]),
  },
  {
    name: 'architecture.md places launch/runtime control in transport-mux',
    ok: containsAll(architectureDoc, [
      '`launch.ts` starts the `transport-mux` runtime',
      '`transport-mux` boots the protocol codec and provider adapter implied by that config.',
    ]),
  },
];

const docsHonestyFailures = docsHonestyChecks
  .filter((check) => !check.ok)
  .map((check) => check.name);

const scorecard = [
  {
    gate: 'Legacy Python contract truth is archived explicitly',
    status:
      legacyPythonTests === 0 ||
      migrationDoc.includes('Historical archive: legacy Python tests under `packages/agent-mux/amux-proxy/tests` remain for reference only.')
        ? 'green'
        : 'red',
    evidence: legacyPythonTests > 0
      ? `${legacyPythonTests} legacy Python tests remain, and migration.md marks them as historical-only reference material`
      : 'No legacy Python contract tests remain under packages/agent-mux/amux-proxy/tests',
    retireWhen: 'Legacy tests are either removed entirely or explicitly archived as non-operational reference material.',
  },
  {
    gate: 'JS transport-mux validation surface is explicit',
    status: packageJson.scripts['scorecard:migration'] && jsContractTests > 0 ? 'green' : 'red',
    evidence: packageJson.scripts['scorecard:migration']
      ? `scorecard:migration script is present and ${jsContractTests} JS test files exist under packages/transport-mux/tests`
      : 'scorecard:migration script is missing from packages/transport-mux/package.json',
    retireWhen: 'The package keeps publishing its own build/test/scorecard entrypoints as the active runtime owner.',
  },
  {
    gate: 'Launcher/runtime cutover is complete',
    status:
      launchCommand.includes('@a5c-ai/transport-mux') &&
      packageEntrypoint.includes("export * from './runtime.js';")
        ? 'green'
        : 'red',
    evidence:
      launchCommand.includes('@a5c-ai/transport-mux') &&
      packageEntrypoint.includes("export * from './runtime.js';")
        ? 'launch.ts imports transport-mux directly and the package entrypoint exports the runtime module'
        : 'launch.ts still bypasses the transport-mux runtime surface or the package entrypoint does not export it',
    retireWhen: 'launch.ts resolves into the runtime exported by packages/transport-mux instead of an independent proxy path.',
  },
  {
    gate: 'Docs describe the migration seam honestly',
    status: docsHonestyFailures.length === 0 ? 'green' : 'red',
    evidence:
      docsHonestyFailures.length === 0
        ? 'README.md, architecture.md, and migration.md agree that transport-mux is the active owner and legacy amux-proxy assets are archival only.'
        : `Docs drift detected: ${docsHonestyFailures.join('; ')}.`,
    retireWhen: 'Docs state one active owner for runtime, release, and binary truth while keeping legacy references explicitly archived.',
  },
  {
    gate: 'Publish and CI surfaces are converged',
    status:
      releaseWorkflow.includes('Publish transport-mux to npm') &&
      stagingWorkflow.includes('Publish transport-mux to npm (staging tag)') &&
      legacyPublishWorkflow.includes('Historical archive only')
        ? 'green'
        : 'red',
    evidence:
      'root release/staging workflows publish @a5c-ai/transport-mux, and the legacy publish workflow is archived as historical only.',
    retireWhen: 'transport-mux has explicit publish/CI ownership and the legacy publish path is removed or archived.',
  },
  {
    gate: 'Legacy binary/container ownership is retired or archived',
    status:
      readmeDoc.includes('ships the `amux-proxy` executable') &&
      legacyProxyCiWorkflow.includes('Historical archive only')
        ? 'green'
        : 'red',
    evidence:
      'transport-mux ships the active amux-proxy executable surface, and the legacy amux-proxy CI workflow is archived as historical only.',
    retireWhen: 'The amux-proxy binary/container path is owned by transport-mux or explicitly documented as historical only.',
  },
];

const allGreen = scorecard.every((item) => item.status === 'green');

console.log('# transport-mux migration scorecard');
console.log('');
console.log('| Gate | Status | Evidence | Retire when |');
console.log('| --- | --- | --- | --- |');
for (const item of scorecard) {
  console.log(`| ${item.gate} | ${item.status} | ${item.evidence} | ${item.retireWhen} |`);
}
console.log('');
console.log(`overallCutoverReady=${allGreen ? 'true' : 'false'}`);
