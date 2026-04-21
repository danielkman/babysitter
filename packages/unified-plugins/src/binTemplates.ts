// CLI bin script templates for targets with npm distribution
import { resolveSdkConfig } from './sdkConfig.js';

import type { A5cPluginManifest, TargetProfile } from './types.js';

function getExt(targetProfile: TargetProfile): string {
  return (targetProfile.name === 'pi' || targetProfile.name === 'oh-my-pi' || targetProfile.name === 'openclaw') ? '.cjs' : '.js';
}

function getNpmPkg(manifest: A5cPluginManifest, targetProfile: TargetProfile): string {
  const override = manifest.targets?.[targetProfile.name]?.npmPackageName;
  if (typeof override === 'string') return override;
  if (targetProfile.npmPackageName) return targetProfile.npmPackageName;
  const sdk = resolveSdkConfig(manifest);
  return `${sdk.scope}/${manifest.name}-${targetProfile.name}`;
}

function getCliName(manifest: A5cPluginManifest, targetProfile: TargetProfile): string {
  const pkg = getNpmPkg(manifest, targetProfile);
  return pkg.split('/').pop() || `${manifest.name}-${targetProfile.name}`;
}

export function generateCliBinScript(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const cliName = getCliName(manifest, targetProfile);
  const ext = getExt(targetProfile);

  return `#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const PACKAGE_ROOT = path.resolve(__dirname, '..');

function printUsage() {
  console.error([
    'Usage:',
    '  ${cliName} install [--global]',
    '  ${cliName} install --workspace [path]',
    '  ${cliName} uninstall',
  ].join('\\n'));
}

function parseInstallArgs(argv) {
  let scope = 'global';
  let workspace = null;
  const passthrough = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--global') {
      scope = 'global';
      continue;
    }
    if (arg === '--workspace') {
      scope = 'workspace';
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        workspace = path.resolve(next);
        i += 1;
      } else {
        workspace = process.cwd();
      }
      continue;
    }
    passthrough.push(arg);
  }

  return { scope, workspace, passthrough };
}

function runNodeScript(scriptPath, args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  process.exitCode = result.status ?? 1;
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printUsage();
    process.exitCode = command ? 0 : 1;
    return;
  }

  if (command === 'install') {
    const parsed = parseInstallArgs(rest);
    if (parsed.scope === 'workspace') {
      const args = [];
      if (parsed.workspace) {
        args.push('--workspace', parsed.workspace);
      }
      args.push(...parsed.passthrough);
      runNodeScript(
        path.join(PACKAGE_ROOT, 'scripts', 'team-install${ext}'),
        args,
        { PLUGIN_PACKAGE_ROOT: PACKAGE_ROOT },
      );
      return;
    }
    runNodeScript(path.join(PACKAGE_ROOT, 'bin', 'install${ext}'), parsed.passthrough);
    return;
  }

  if (command === 'uninstall') {
    runNodeScript(path.join(PACKAGE_ROOT, 'bin', 'uninstall${ext}'), rest);
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main();
`;
}

export function generateInstallScript(
  _manifest: A5cPluginManifest,
  _targetProfile: TargetProfile
): string {
  return `#!/usr/bin/env node
'use strict';

const path = require('path');
const shared = require('./install-shared');

const PACKAGE_ROOT = path.resolve(__dirname, '..');

function main() {
  const pluginRoot = shared.getHomePluginRoot();
  const marketplacePath = shared.getHomeMarketplacePath();

  console.log(\`[\${shared.PLUGIN_NAME}] Installing plugin to \${pluginRoot}\`);

  try {
    shared.copyPluginBundle(PACKAGE_ROOT, pluginRoot);
    shared.ensureMarketplaceEntry(marketplacePath, pluginRoot);
    shared.runPostInstall && shared.runPostInstall(pluginRoot);
    console.log(\`[\${shared.PLUGIN_NAME}] Installation complete!\`);
    console.log(\`[\${shared.PLUGIN_NAME}] Restart your IDE/CLI to pick up the plugin.\`);
  } catch (err) {
    console.error(\`[\${shared.PLUGIN_NAME}] Failed to install: \${err.message}\`);
    process.exitCode = 1;
  }
}

main();
`;
}

function generateGeminiInstallScript(manifest: A5cPluginManifest): string {
  const cliName = getNpmPkg(manifest, { name: 'gemini' } as TargetProfile).split('/').pop() || 'plugin-gemini';
  return `#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const PACKAGE_ROOT = path.resolve(__dirname, '..');

function main() {
  console.log('[${cliName}] Installing extension...');
  const result = spawnSync('gemini', ['extensions', 'install', PACKAGE_ROOT], {
    stdio: 'inherit', timeout: 60000
  });
  if (result.status === 0) {
    console.log('[${cliName}] Extension installed via Gemini CLI.');
  } else {
    const linkResult = spawnSync('gemini', ['extensions', 'link', PACKAGE_ROOT], {
      stdio: 'inherit', timeout: 60000
    });
    if (linkResult.status === 0) {
      console.log('[${cliName}] Extension linked via Gemini CLI.');
    } else {
      console.error('[${cliName}] Gemini CLI not available. Install manually: gemini extensions install ' + PACKAGE_ROOT);
    }
  }
}

main();
`;
}

export function generateUninstallScript(
  _manifest: A5cPluginManifest,
  _targetProfile: TargetProfile
): string {
  return `#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const shared = require('./install-shared');

function main() {
  const pluginRoot = shared.getHomePluginRoot();

  if (!fs.existsSync(pluginRoot)) {
    console.log(\`[\${shared.PLUGIN_NAME}] Plugin not installed at \${pluginRoot}\`);
    return;
  }

  try {
    fs.rmSync(pluginRoot, { recursive: true, force: true });
    console.log(\`[\${shared.PLUGIN_NAME}] Uninstalled from \${pluginRoot}\`);
  } catch (err) {
    console.error(\`[\${shared.PLUGIN_NAME}] Failed to uninstall: \${err.message}\`);
    process.exitCode = 1;
  }
}

main();
`;
}

export { generateGeminiInstallScript as _generateGeminiInstallScript };
