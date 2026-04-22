#!/usr/bin/env node
'use strict';

var path = require('path');
var shared = require('../bin/install-shared');

var workspace = process.cwd();
for (var i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--workspace' && process.argv[i + 1]) {
    workspace = path.resolve(process.argv[i + 1]);
  }
}

var src = process.env.PLUGIN_PACKAGE_ROOT || path.resolve(__dirname, '..');
var pluginRoot = path.join(workspace, '.agents', 'plugins', shared.PLUGIN_NAME);
var marketplacePath = path.join(workspace, '.agents', 'plugins', 'marketplace.json');
var codexHome = path.join(workspace, '.codex');
var codexConfigPath = path.join(codexHome, 'config.toml');
var teamDir = path.join(workspace, '.a5c', 'team');

console.log('[babysitter] Team install to ' + pluginRoot);

var processLibraryState = shared.ensureGlobalProcessLibrary(src);
shared.copyPluginBundle(src, pluginRoot);
shared.ensureMarketplaceEntry(marketplacePath, pluginRoot);
shared.mergeCodexConfigFile(codexConfigPath);
shared.installCodexSurface(src, codexHome);
shared.warnWindowsHooks();
shared.runPostInstall(pluginRoot);

shared.writeJson(path.join(teamDir, 'install.json'), {
  packageRoot: src,
  workspaceRoot: workspace,
  pluginRoot: pluginRoot,
  marketplacePath: marketplacePath,
  codexConfigPath: codexConfigPath,
  processLibraryCloneDir: (processLibraryState.defaultSpec && processLibraryState.defaultSpec.cloneDir)
    || (processLibraryState.binding && processLibraryState.binding.dir),
  processLibraryStateFile: processLibraryState.stateFile
    || path.join(shared.getGlobalStateDir(), 'active', 'process-library.json'),
});
shared.writeJson(path.join(teamDir, 'profile.json'), {
  pluginRoot: pluginRoot,
  marketplacePath: marketplacePath,
  codexConfigPath: codexConfigPath,
  processLibraryLookupCommand: 'babysitter process-library:active --json',
});

console.log('[team-install] complete');
