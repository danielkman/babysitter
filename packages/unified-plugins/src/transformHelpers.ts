// Helper functions for the transform stage
// Extracted to keep transform.ts under the max-lines limit

import type { A5cPluginManifest, TargetProfile } from './types.js';

export function generatePs1Wrapper(
  hookSlug: string,
  adapterName: string,
  _sourceScript: string
): string {
  return `# PowerShell hook wrapper — sets env vars and delegates to bash
$env:HOOK_TYPE = '${hookSlug}'
$env:ADAPTER_NAME = '${adapterName}'
$env:PLUGIN_ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

$input_data = [Console]::In.ReadToEnd()
$result = $input_data | & bash "$PSScriptRoot/../$($MyInvocation.MyCommand.Name -replace '\\.ps1$','.sh')" 2>$null
if ($LASTEXITCODE -eq 0 -and $result) {
  Write-Output $result
} else {
  Write-Output '{}'
}
`;
}

export function generateJsBridge(
  _name: string,
  shellScript: string,
  targetProfile: TargetProfile
): string {
  const pluginRootEnvVar = targetProfile.pluginRootEnvVarForExtension || 'PLUGIN_ROOT';
  return `#!/usr/bin/env node
"use strict";
var execSync = require("child_process").execSync;
var path = require("path");
var readFileSync = require("fs").readFileSync;

var PLUGIN_ROOT = process.env.${pluginRootEnvVar} || process.env.PLUGIN_ROOT || path.resolve(__dirname, "..");
var stdin = "";
try { stdin = readFileSync(0, "utf8"); } catch {}
try {
  var result = execSync("bash " + JSON.stringify(path.join(PLUGIN_ROOT, "${shellScript}")), {
    input: stdin,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30000,
    env: Object.assign({}, process.env, {
      HOOK_TYPE: process.env.HOOK_TYPE || "",
      ADAPTER_NAME: process.env.ADAPTER_NAME || "${targetProfile.adapterName}",
      PLUGIN_ROOT: PLUGIN_ROOT
    })
  });
  process.stdout.write(result);
} catch (e) {
  process.stdout.write("{}\\n");
}
`;
}

export function generateHarnessManifest(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const override = manifest.targets?.[targetProfile.name];
  const base: Record<string, unknown> = {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    license: manifest.license,
  };

  if (manifest.repository) base.repository = manifest.repository;
  if (manifest.keywords) base.keywords = manifest.keywords;

  if (override?.harnessManifest) {
    Object.assign(base, override.harnessManifest);
  }

  return JSON.stringify(base, null, 2);
}

export function generateInstallShared(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  let globalPluginDir: string;
  let marketplaceRelPath: string;
  switch (targetProfile.name) {
    case 'codex':
      globalPluginDir = `path.join(os.homedir(), '.agents', 'plugins', PLUGIN_NAME)`;
      marketplaceRelPath = `path.join(os.homedir(), '.agents', 'plugins', 'marketplace.json')`;
      break;
    case 'cursor':
      globalPluginDir = `path.join(os.homedir(), '.cursor', 'plugins', PLUGIN_NAME)`;
      marketplaceRelPath = `path.join(os.homedir(), '.cursor', 'plugins', 'marketplace.json')`;
      break;
    default:
      globalPluginDir = `path.join(os.homedir(), '.a5c', 'plugins', PLUGIN_NAME)`;
      marketplaceRelPath = `path.join(os.homedir(), '.a5c', 'plugins', 'marketplace.json')`;
      break;
  }

  const authorName = typeof manifest.author === 'string' ? manifest.author : manifest.author.name;

  return `#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');

var PLUGIN_NAME = ${JSON.stringify(manifest.name)};

function getPluginHome(scope) {
  if (scope === 'workspace') return path.join(process.cwd(), '.a5c', 'plugins', PLUGIN_NAME);
  return ${globalPluginDir};
}

function getMarketplacePath() {
  return ${marketplaceRelPath};
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  var entries = fs.readdirSync(src, { withFileTypes: true });
  for (var entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'test') continue;
    var srcPath = path.join(src, entry.name);
    var destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function ensureMarketplaceEntry(marketplacePath, pluginRoot) {
  var marketplace;
  if (fs.existsSync(marketplacePath)) {
    marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
  } else {
    marketplace = { name: ${JSON.stringify(authorName)}, plugins: [] };
  }
  if (!Array.isArray(marketplace.plugins)) marketplace.plugins = [];
  var idx = marketplace.plugins.findIndex(function(p) { return p.name === PLUGIN_NAME; });
  var entry = { name: PLUGIN_NAME, source: pluginRoot, description: ${JSON.stringify(manifest.description)}, version: ${JSON.stringify(manifest.version)} };
  if (idx >= 0) marketplace.plugins[idx] = entry;
  else marketplace.plugins.push(entry);
  fs.mkdirSync(path.dirname(marketplacePath), { recursive: true });
  fs.writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + '\\n');
}

function runPostInstall(pluginRoot) {
  var postInstall = path.join(pluginRoot, 'scripts', 'post-install.js');
  if (fs.existsSync(postInstall)) {
    require('child_process').spawnSync(process.execPath, [postInstall], {
      cwd: pluginRoot, stdio: 'inherit',
      env: Object.assign({}, process.env, { PLUGIN_ROOT: pluginRoot })
    });
  }
}

module.exports = { PLUGIN_NAME, getPluginHome, getMarketplacePath, copyDir, ensureMarketplaceEntry, runPostInstall };
`;
}

export function generateTeamInstall(
  manifest: A5cPluginManifest,
  _targetProfile: TargetProfile
): string {
  return `#!/usr/bin/env node
'use strict';

var path = require('path');
var shared = require('../bin/install-shared');

var workspace = process.cwd();
for (var i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--workspace' && process.argv[i + 1]) {
    workspace = path.resolve(process.argv[i + 1]);
  }
}

var dest = shared.getPluginHome('workspace');
console.log('[${manifest.name}] Team install to ' + dest);

var src = process.env.PLUGIN_PACKAGE_ROOT || path.resolve(__dirname, '..');
shared.copyDir(src, dest);
shared.runPostInstall(dest);
console.log('[${manifest.name}] Team install complete.');
`;
}

export function generateOpenClawNativeHooksSection(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): Record<string, string> {
  const hooks: Record<string, string> = {};

  if (manifest.hooks) {
    for (const [canonicalHook, handlerPath] of Object.entries(manifest.hooks)) {
      if (handlerPath === null) continue;

      const nativeHook = targetProfile.supportedHooks.get(canonicalHook);
      if (nativeHook) {
        hooks[nativeHook] = `extensions/hooks/${nativeHook.replace(/_/g, '-')}.ts`;
      }
    }
  }

  return hooks;
}

export function generateOpenCodeAccomplishSkill(
  manifest: A5cPluginManifest
): string | null {
  if (!manifest.skills || manifest.skills.length === 0) return null;

  const primarySkill = manifest.skills[0];

  return `---
name: ${manifest.name}
description: ${manifest.description}
command: /${primarySkill.name}
verified: true
---

# ${manifest.name}

${manifest.description}

(This is a specialized accomplish-mode variant for OpenCode's accomplish workflow.)
`;
}

export function generateGeminiPostinstall(): string {
  return `#!/usr/bin/env node
'use strict';
var path = require('path');
var spawnSync = require('child_process').spawnSync;
var fs = require('fs');

var PACKAGE_ROOT = path.resolve(__dirname, '..');
var extDir = path.join(require('os').homedir(), '.gemini', 'extensions', 'babysitter');

if (!process.env.npm_config_global) process.exit(0);
try { if (fs.lstatSync(extDir).isSymbolicLink()) process.exit(0); } catch {}

try {
  var result = spawnSync('gemini', ['extensions', 'install', PACKAGE_ROOT], { stdio: 'inherit', timeout: 60000 });
  if (result.status === 0) process.exit(0);
} catch {}

console.log('[babysitter-gemini] Gemini CLI not found. Run: babysitter-gemini install');
`;
}

export function generateGeminiPreuninstall(): string {
  return `#!/usr/bin/env node
'use strict';
var path = require('path');
var spawnSync = require('child_process').spawnSync;
var fs = require('fs');

var extDir = path.join(require('os').homedir(), '.gemini', 'extensions', 'babysitter');

try { if (!fs.existsSync(extDir) || fs.lstatSync(extDir).isSymbolicLink()) process.exit(0); } catch {}

try {
  spawnSync('gemini', ['extensions', 'uninstall', 'babysitter'], { stdio: 'inherit', timeout: 30000 });
} catch {
  try { fs.rmSync(extDir, { recursive: true, force: true }); } catch {}
}
`;
}
