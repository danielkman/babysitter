// Generator for install-shared.js — the shared install infrastructure
// Produces the common utility functions with target-specific values
// populated from the manifest and target profile.

import * as fs from 'fs';
import * as path from 'path';
import type { A5cPluginManifest, TargetProfile } from './types.js';

function getHomeDirCode(targetProfile: TargetProfile): string {
  switch (targetProfile.name) {
    case 'codex': return `path.join(os.homedir(), '.codex')`;
    case 'cursor': return `path.join(os.homedir(), '.cursor')`;
    case 'github-copilot': return `path.join(os.homedir(), '.copilot')`;
    case 'opencode': return `path.join(os.homedir(), '.opencode')`;
    case 'openclaw': return `path.join(os.homedir(), '.openclaw')`;
    default: return `path.join(os.homedir(), '.a5c')`;
  }
}

function getPluginsDirCode(targetProfile: TargetProfile): string {
  switch (targetProfile.name) {
    case 'codex': return `path.join(os.homedir(), '.agents', 'plugins')`;
    default: return `path.join(getHarnessHome(), 'plugins')`;
  }
}

function getMarketplacePathCode(targetProfile: TargetProfile): string {
  switch (targetProfile.name) {
    case 'codex': return `path.join(os.homedir(), '.agents', 'plugins', 'marketplace.json')`;
    default: return `path.join(getHarnessHome(), 'plugins', 'marketplace.json')`;
  }
}

export function generateInstallShared(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile,
  sourceDir?: string
): string {
  const pluginName = manifest.name;
  const authorName = typeof manifest.author === 'string' ? manifest.author : manifest.author.name;
  const homeDirCode = getHomeDirCode(targetProfile);
  const pluginsDirCode = getPluginsDirCode(targetProfile);
  const marketplacePathCode = getMarketplacePathCode(targetProfile);

  // Check for per-harness surface file
  let surfaceCode = '';
  if (sourceDir) {
    // Look for per-harness install-shared surface in extraFiles
    const override = manifest.targets?.[targetProfile.name];
    const isEsm = targetProfile.name === 'pi' || targetProfile.name === 'oh-my-pi' || targetProfile.name === 'openclaw';
    const ext = isEsm ? '.cjs' : '.js';
    const surfaceRef = override?.extraFiles?.[`bin/install-shared${ext}`];
    if (typeof surfaceRef === 'string' && surfaceRef.startsWith('file:')) {
      const surfacePath = path.join(sourceDir, surfaceRef.slice(5));
      if (fs.existsSync(surfacePath)) {
        surfaceCode = fs.readFileSync(surfacePath, 'utf-8');
      }
    }
  }

  const base = `'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PLUGIN_NAME = ${JSON.stringify(pluginName)};
const PLUGIN_CATEGORY = 'Coding';

function getUserHome() {
  return os.homedir();
}

function getGlobalStateDir() {
  return process.env.BABYSITTER_GLOBAL_STATE_DIR || path.join(getUserHome(), '.a5c');
}

function getHarnessHome() {
  return ${homeDirCode};
}

function getHomePluginRoot(scope) {
  if (scope === 'workspace') return path.join(process.cwd(), '.a5c', 'plugins', PLUGIN_NAME);
  return path.join(${pluginsDirCode}, PLUGIN_NAME);
}

function getHomeMarketplacePath() {
  return ${marketplacePathCode};
}

function writeFileIfChanged(filePath, contents) {
  try {
    const existing = fs.readFileSync(filePath, 'utf8');
    if (existing === contents) return false;
  } catch {}
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  return true;
}

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function copyPluginBundle(packageRoot, pluginRoot) {
  const bundleEntries = fs.readdirSync(packageRoot).filter(
    e => !['node_modules', '.git', 'test', 'dist'].includes(e)
  );
  fs.mkdirSync(pluginRoot, { recursive: true });
  for (const entry of bundleEntries) {
    const src = path.join(packageRoot, entry);
    const dest = path.join(pluginRoot, entry);
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      copyRecursive(src, dest);
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\\n');
}

function ensureExecutable(filePath) {
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {}
}

function normalizeMarketplaceSourcePath(source, marketplacePath) {
  if (typeof source === 'string') {
    return path.relative(path.dirname(marketplacePath), source).replace(/\\\\/g, '/');
  }
  return source;
}

function ensureMarketplaceEntry(marketplacePath, pluginRoot) {
  let marketplace = readJson(marketplacePath) || {
    name: ${JSON.stringify(authorName)},
    plugins: [],
  };
  if (!Array.isArray(marketplace.plugins)) marketplace.plugins = [];
  const idx = marketplace.plugins.findIndex(p => p.name === PLUGIN_NAME);
  const relSource = './' + normalizeMarketplaceSourcePath(pluginRoot, marketplacePath);
  const entry = {
    name: PLUGIN_NAME,
    source: relSource,
    description: ${JSON.stringify(manifest.description)},
    version: ${JSON.stringify(manifest.version)},
    author: { name: ${JSON.stringify(authorName)} },
  };
  if (idx >= 0) marketplace.plugins[idx] = entry;
  else marketplace.plugins.push(entry);
  writeJson(marketplacePath, marketplace);
}

function removeMarketplaceEntry(marketplacePath) {
  const marketplace = readJson(marketplacePath);
  if (!marketplace || !Array.isArray(marketplace.plugins)) return;
  marketplace.plugins = marketplace.plugins.filter(p => p.name !== PLUGIN_NAME);
  writeJson(marketplacePath, marketplace);
}

function resolveBabysitterCommand(packageRoot) {
  try {
    const result = spawnSync('babysitter', ['--version'], { stdio: 'pipe', timeout: 10000 });
    if (result.status === 0) return 'babysitter';
  } catch {}
  const versionsPath = path.join(packageRoot, 'versions.json');
  const versions = readJson(versionsPath) || {};
  const ver = versions.sdkVersion || 'latest';
  return \`npx -y @a5c-ai/babysitter-sdk@\${ver}\`;
}

function runBabysitterCli(packageRoot, cliArgs, options = {}) {
  const cmd = resolveBabysitterCommand(packageRoot);
  const parts = cmd.split(' ');
  const result = spawnSync(parts[0], [...parts.slice(1), ...cliArgs], {
    stdio: options.stdio || 'inherit',
    timeout: options.timeout || 120000,
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...options.env },
  });
  return result;
}

function ensureGlobalProcessLibrary(packageRoot) {
  const stateDir = getGlobalStateDir();
  const activeFile = path.join(stateDir, 'active', 'process-library.json');
  let active = readJson(activeFile);
  if (active && active.binding && active.binding.dir) {
    return active;
  }
  const defaultSpec = readJson(path.join(stateDir, 'process-library-defaults.json'));
  const cloneDir = defaultSpec && defaultSpec.cloneDir
    ? defaultSpec.cloneDir
    : path.join(stateDir, 'process-library', 'babysitter-repo');
  runBabysitterCli(packageRoot, [
    'process-library:clone',
    '--dir', cloneDir,
    '--state-dir', stateDir,
    '--json',
  ], { stdio: 'pipe' });
  runBabysitterCli(packageRoot, [
    'process-library:use',
    '--dir', cloneDir,
    '--state-dir', stateDir,
    '--json',
  ], { stdio: 'pipe' });
  active = readJson(activeFile);
  return {
    binding: active && active.binding ? active.binding : { dir: cloneDir },
    defaultSpec: defaultSpec || { cloneDir },
    stateFile: activeFile,
  };
}

function warnWindowsHooks() {
  if (process.platform === 'win32') {
    console.warn('[' + PLUGIN_NAME + '] Windows detected — shell hooks (.sh) require Git Bash or WSL.');
  }
}

function runPostInstall(pluginRoot) {
  const postInstall = path.join(pluginRoot, 'scripts', 'post-install.js');
  if (fs.existsSync(postInstall)) {
    spawnSync(process.execPath, [postInstall], {
      cwd: pluginRoot, stdio: 'inherit',
      env: { ...process.env, PLUGIN_ROOT: pluginRoot },
    });
  }
}
`;

  const exports = `
module.exports = {
  PLUGIN_NAME,
  PLUGIN_CATEGORY,
  getUserHome,
  getGlobalStateDir,
  getHarnessHome,
  getHomePluginRoot,
  getHomeMarketplacePath,
  writeFileIfChanged,
  copyRecursive,
  copyPluginBundle,
  readJson,
  writeJson,
  ensureExecutable,
  normalizeMarketplaceSourcePath,
  ensureMarketplaceEntry,
  removeMarketplaceEntry,
  resolveBabysitterCommand,
  runBabysitterCli,
  ensureGlobalProcessLibrary,
  warnWindowsHooks,
  runPostInstall,
};
`;

  if (surfaceCode) {
    return base + '\n// --- Target-specific surface ---\n\n' + surfaceCode + '\n' + exports;
  }

  return base + exports;
}
