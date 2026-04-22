#!/usr/bin/env node
'use strict';

const path = require('path');
const shared = require('./install-shared');

const PACKAGE_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  let cloudAgent = false;
  let workspace = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--cloud-agent') {
      cloudAgent = true;
      continue;
    }
    if (arg === '--workspace') {
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        workspace = path.resolve(next);
        i += 1;
      } else {
        workspace = process.cwd();
      }
    }
  }

  return { cloudAgent, workspace };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.cloudAgent) {
    const workspaceRoot = parsed.workspace || process.cwd();
    console.log(`[${shared.PLUGIN_NAME}] Installing cloud-agent support into ${workspaceRoot}`);

    try {
      const activeProcessLibrary = shared.runCli(PACKAGE_ROOT, [
        'process-library:active',
        '--json',
      ], { stdio: 'pipe' });
      if (activeProcessLibrary.status !== 0) {
        shared.ensureGlobalProcessLibrary(PACKAGE_ROOT);
      }
      shared.installCloudAgentSurface(PACKAGE_ROOT, workspaceRoot);
      console.log(`[${shared.PLUGIN_NAME}] Cloud-agent installation complete!`);
    } catch (err) {
      console.error(`[${shared.PLUGIN_NAME}] Failed to install cloud-agent support: ${err.message}`);
      process.exitCode = 1;
    }
    return;
  }

  const pluginRoot = shared.getHomePluginRoot();
  const marketplacePath = shared.getHomeMarketplacePath();

  console.log(`[${shared.PLUGIN_NAME}] Installing plugin to ${pluginRoot}`);

  try {
    shared.copyPluginBundle(PACKAGE_ROOT, pluginRoot);
    shared.ensureMarketplaceEntry(marketplacePath, pluginRoot);
    shared.runPostInstall && shared.runPostInstall(pluginRoot);
    console.log(`[${shared.PLUGIN_NAME}] Installation complete!`);
    console.log(`[${shared.PLUGIN_NAME}] Restart your IDE/CLI to pick up the plugin.`);
  } catch (err) {
    console.error(`[${shared.PLUGIN_NAME}] Failed to install: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
