import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export const BABYSITTER_PLUGIN_NAME = 'babysitter';

export const BABYSITTER_MARKETPLACE_MANIFEST_PATHS = [
  '.claude-plugin/marketplace.json',
  '.cursor-plugin/marketplace.json',
  '.agents/plugins/marketplace.json',
  '.github/plugin/marketplace.json',
];

/** Branches that map 1:1 to an external-plugin-repo branch / codex --ref. */
export const PUBLISH_CHANNEL_BRANCHES = new Set(['develop', 'staging', 'main']);

/**
 * Resolve the publish channel branch the marketplace manifests should point their
 * external-repo `source.ref` / `source.branch` at. The external plugin repos
 * (`babysitter-codex` / `babysitter-claude` / `babysitter-cursor`) are synced
 * per-branch by `scripts/sync-external-plugin-repos.mjs`, so the manifest must
 * point at the SAME branch that published the channel — otherwise the documented
 * install resolves stale content (issue #960).
 *
 * Precedence: explicit option → GITHUB_REF_NAME → `git branch --show-current` →
 * `develop` (the external-repo default branch). Any branch outside the publish
 * channel set falls back to `develop`.
 */
export function resolvePublishChannelBranch(options = {}) {
  const explicit = options.channelBranch;
  if (explicit && PUBLISH_CHANNEL_BRANCHES.has(explicit)) {
    return explicit;
  }
  const env = options.env ?? process.env;
  const fromEnv = env.GITHUB_REF_NAME;
  if (fromEnv && PUBLISH_CHANNEL_BRANCHES.has(fromEnv)) {
    return fromEnv;
  }
  const root = options.root ? resolve(options.root) : process.cwd();
  const result = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' });
  const current = result.status === 0 ? result.stdout.trim() : '';
  if (current && PUBLISH_CHANNEL_BRANCHES.has(current)) {
    return current;
  }
  return 'develop';
}

export function syncBabysitterMarketplaceManifestVersions(version, options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const pluginName = options.pluginName ?? BABYSITTER_PLUGIN_NAME;
  const manifestPaths = options.manifestPaths ?? BABYSITTER_MARKETPLACE_MANIFEST_PATHS;
  const channelBranch = resolvePublishChannelBranch({ ...options, root });
  const changedPaths = [];

  for (const relativePath of manifestPaths) {
    const fullPath = join(root, relativePath);
    if (!existsSync(fullPath)) {
      continue;
    }

    const manifest = JSON.parse(readFileSync(fullPath, 'utf8'));
    const versionChanged = syncMarketplacePluginEntryVersion(manifest, pluginName, version);
    const refChanged = syncMarketplacePluginEntryRef(manifest, pluginName, channelBranch);
    if (versionChanged || refChanged) {
      writeFileSync(fullPath, `${JSON.stringify(manifest, null, 2)}\n`);
      changedPaths.push(relativePath);
    }
  }

  return changedPaths;
}

/**
 * Point each external-repo-backed plugin entry's `source` at the channel branch.
 * Handles both source shapes used by the committed manifests:
 *   - codex: `{ source: 'git-subdir', url, path, ref }`     -> updates `ref`
 *   - claude/cursor: `{ source: 'url', url, branch }`        -> updates `branch`
 *
 * Local/relative sources (`'./'`, `{ source: 'local', path: './' }`) — used by
 * the generated external repos themselves — are left untouched; they have no
 * ref/branch to sync.
 */
export function syncMarketplacePluginEntryRef(manifest, pluginName, channelBranch) {
  let changed = false;

  for (const entry of findMarketplacePluginEntries(manifest, pluginName)) {
    const source = entry.source;
    if (!source || typeof source !== 'object') {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(source, 'ref') && source.ref !== channelBranch) {
      source.ref = channelBranch;
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(source, 'branch') && source.branch !== channelBranch) {
      source.branch = channelBranch;
      changed = true;
    }
  }

  return changed;
}

export function syncMarketplacePluginEntryVersion(manifest, pluginName, version) {
  let changed = false;

  for (const entry of findMarketplacePluginEntries(manifest, pluginName)) {
    if (entry.version !== version) {
      entry.version = version;
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(entry, 'latestVersion') && entry.latestVersion !== version) {
      entry.latestVersion = version;
      changed = true;
    }
    if (Array.isArray(entry.versions) && !entry.versions.includes(version)) {
      entry.versions = [version, ...entry.versions.filter((existingVersion) => existingVersion !== version)];
      changed = true;
    }
  }

  return changed;
}

export function findMarketplacePluginEntries(manifest, pluginName) {
  const plugins = manifest?.plugins;
  if (Array.isArray(plugins)) {
    return plugins.filter((entry) => entry && typeof entry === 'object' && entry.name === pluginName);
  }
  if (plugins && typeof plugins === 'object') {
    const entry = plugins[pluginName];
    return entry && typeof entry === 'object' ? [entry] : [];
  }
  return [];
}
