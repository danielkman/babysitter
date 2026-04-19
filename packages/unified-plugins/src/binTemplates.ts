// CLI bin script templates for targets without marketplace distribution

import type { A5cPluginManifest, TargetProfile } from './types.js';

export function generateCliBinScript(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const _npmPkgName = targetProfile.npmPackageName || `@a5c-ai/${manifest.name}-${targetProfile.name}`;
  const cliName = `${manifest.name}-${targetProfile.name}`;

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
  var scope = 'global';
  var workspace = null;
  var passthrough = [];

  for (var i = 0; i < argv.length; i += 1) {
    var arg = argv[i];
    if (arg === '--global') {
      scope = 'global';
      continue;
    }
    if (arg === '--workspace') {
      scope = 'workspace';
      var next = argv[i + 1];
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

  return { scope: scope, workspace: workspace, passthrough: passthrough };
}

function runNodeScript(scriptPath, args, extraEnv) {
  var result = spawnSync(process.execPath, [scriptPath].concat(args), {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: Object.assign({}, process.env, extraEnv || {}),
  });
  process.exitCode = result.status || 1;
}

function main() {
  var args = process.argv.slice(2);
  var command = args[0];
  var rest = args.slice(1);

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printUsage();
    process.exitCode = command ? 0 : 1;
    return;
  }

  if (command === 'install') {
    var parsed = parseInstallArgs(rest);
    if (parsed.scope === 'workspace') {
      var wsArgs = [];
      if (parsed.workspace) {
        wsArgs.push('--workspace', parsed.workspace);
      }
      wsArgs = wsArgs.concat(parsed.passthrough);
      runNodeScript(
        path.join(PACKAGE_ROOT, 'scripts', 'team-install.js'),
        wsArgs,
        { PLUGIN_PACKAGE_ROOT: PACKAGE_ROOT }
      );
      return;
    }
    runNodeScript(path.join(PACKAGE_ROOT, 'bin', 'install.js'), parsed.passthrough);
    return;
  }

  if (command === 'uninstall') {
    runNodeScript(path.join(PACKAGE_ROOT, 'bin', 'uninstall.js'), rest);
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main();
`;
}

export function generateInstallScript(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const pluginName = manifest.name;

  return `#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const PACKAGE_ROOT = path.resolve(__dirname, '..');

function getPluginHome() {
  return path.join(os.homedir(), '.a5c', 'plugins', '${pluginName}');
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  var entries = fs.readdirSync(src, { withFileTypes: true });
  for (var entry of entries) {
    var srcPath = path.join(src, entry.name);
    var destPath = path.join(dest, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function main() {
  var pluginHome = getPluginHome();
  console.log('[${pluginName}] Installing plugin to ' + pluginHome);

  try {
    copyDir(PACKAGE_ROOT, pluginHome);
    console.log('[${pluginName}] Installation complete!');
    console.log('[${pluginName}] Restart your ${targetProfile.displayName} session to pick up the plugin.');
  } catch (err) {
    console.error('[${pluginName}] Failed to install: ' + err.message);
    process.exitCode = 1;
  }
}

main();
`;
}

export function generateUninstallScript(
  manifest: A5cPluginManifest,
  _targetProfile: TargetProfile
): string {
  const pluginName = manifest.name;

  return `#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

function getPluginHome() {
  return path.join(os.homedir(), '.a5c', 'plugins', '${pluginName}');
}

function main() {
  var pluginHome = getPluginHome();

  if (!fs.existsSync(pluginHome)) {
    console.log('[${pluginName}] Plugin not installed at ' + pluginHome);
    return;
  }

  try {
    fs.rmSync(pluginHome, { recursive: true, force: true });
    console.log('[${pluginName}] Uninstalled from ' + pluginHome);
  } catch (err) {
    console.error('[${pluginName}] Failed to uninstall: ' + err.message);
    process.exitCode = 1;
  }
}

main();
`;
}
