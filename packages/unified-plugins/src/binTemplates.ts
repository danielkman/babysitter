// CLI bin script templates for targets without marketplace distribution

import type { A5cPluginManifest, TargetProfile } from './types.js';

export function generateCliBinScript(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const cliName = `${manifest.name}-${targetProfile.name}`;

  return `#!/usr/bin/env node
'use strict';

var path = require('path');
var spawnSync = require('child_process').spawnSync;
var PACKAGE_ROOT = path.resolve(__dirname, '..');

function printUsage() {
  console.error('Usage:\\n  ${cliName} install [--global]\\n  ${cliName} install --workspace [path]\\n  ${cliName} uninstall');
}

function runNodeScript(scriptPath, args, extraEnv) {
  var result = spawnSync(process.execPath, [scriptPath].concat(args), {
    cwd: process.cwd(), stdio: 'inherit',
    env: Object.assign({}, process.env, extraEnv || {}),
  });
  process.exitCode = result.status || 1;
}

function main() {
  var args = process.argv.slice(2);
  var command = args[0];
  var rest = args.slice(1);

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exitCode = command ? 0 : 1;
    return;
  }

  if (command === 'install') {
    var scope = 'global';
    var workspace = null;
    for (var i = 0; i < rest.length; i++) {
      if (rest[i] === '--global') scope = 'global';
      else if (rest[i] === '--workspace') {
        scope = 'workspace';
        if (rest[i + 1] && !rest[i + 1].startsWith('-')) { workspace = path.resolve(rest[++i]); }
        else { workspace = process.cwd(); }
      }
    }
    if (scope === 'workspace') {
      var wsArgs = workspace ? ['--workspace', workspace] : [];
      runNodeScript(path.join(PACKAGE_ROOT, 'scripts', 'team-install.js'), wsArgs, { PLUGIN_PACKAGE_ROOT: PACKAGE_ROOT });
    } else {
      runNodeScript(path.join(PACKAGE_ROOT, 'bin', 'install.js'), []);
    }
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
  _manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  if (targetProfile.name === 'gemini') {
    return generateGeminiInstallScript();
  }
  return `#!/usr/bin/env node
'use strict';

var path = require('path');
var shared = require('./install-shared');
var PACKAGE_ROOT = path.resolve(__dirname, '..');

function main() {
  var pluginHome = shared.getPluginHome('global');
  var marketplacePath = shared.getMarketplacePath();

  console.log('[' + shared.PLUGIN_NAME + '] Installing to ' + pluginHome);
  shared.copyDir(PACKAGE_ROOT, pluginHome);
  shared.ensureMarketplaceEntry(marketplacePath, pluginHome);
  shared.runPostInstall(pluginHome);
  console.log('[' + shared.PLUGIN_NAME + '] Installation complete!');
  console.log('[' + shared.PLUGIN_NAME + '] Restart your IDE/CLI to pick up the plugin.');
}

main();
`;
}

function generateGeminiInstallScript(): string {
  return `#!/usr/bin/env node
'use strict';

var path = require('path');
var spawnSync = require('child_process').spawnSync;
var PACKAGE_ROOT = path.resolve(__dirname, '..');

function main() {
  console.log('[babysitter-gemini] Installing extension...');

  // Try gemini extensions install first
  var result = spawnSync('gemini', ['extensions', 'install', PACKAGE_ROOT], {
    stdio: 'inherit', timeout: 60000
  });

  if (result.status === 0) {
    console.log('[babysitter-gemini] Extension installed via Gemini CLI.');
  } else {
    // Fallback: link directly
    var linkResult = spawnSync('gemini', ['extensions', 'link', PACKAGE_ROOT], {
      stdio: 'inherit', timeout: 60000
    });
    if (linkResult.status === 0) {
      console.log('[babysitter-gemini] Extension linked via Gemini CLI.');
    } else {
      console.error('[babysitter-gemini] Gemini CLI not available. Install manually: gemini extensions install ' + PACKAGE_ROOT);
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

var fs = require('fs');
var shared = require('./install-shared');

function main() {
  var pluginHome = shared.getPluginHome('global');

  if (!fs.existsSync(pluginHome)) {
    console.log('[' + shared.PLUGIN_NAME + '] Not installed at ' + pluginHome);
    return;
  }

  fs.rmSync(pluginHome, { recursive: true, force: true });
  console.log('[' + shared.PLUGIN_NAME + '] Uninstalled from ' + pluginHome);
}

main();
`;
}
