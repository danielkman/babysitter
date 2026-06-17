/**
 * Unit tests for the marketplace-manifest channel-ref sync (issue #960, part B).
 *
 * The published documented install was broken because the main-repo marketplace
 * manifests pointed each external plugin repo's `source.ref` / `source.branch`
 * at a hardcoded `main`, while the channel-current plugin content lives on the
 * matching channel branch (staging/develop). `plugin-marketplace-version-sync`
 * now syncs BOTH the plugin entry `version` AND the external-repo source ref to
 * the publish channel branch, so the documented install resolves channel-current
 * content. These tests lock that behavior in.
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  resolvePublishChannelBranch,
  syncBabysitterMarketplaceManifestVersions,
  syncMarketplacePluginEntryRef,
} from '../../../../scripts/plugin-marketplace-version-sync.mjs';

describe('resolvePublishChannelBranch', () => {
  it('honors an explicit channel branch in the publish channel set', () => {
    expect(resolvePublishChannelBranch({ channelBranch: 'staging', env: {} })).toBe('staging');
    expect(resolvePublishChannelBranch({ channelBranch: 'main', env: {} })).toBe('main');
    expect(resolvePublishChannelBranch({ channelBranch: 'develop', env: {} })).toBe('develop');
  });

  it('derives from GITHUB_REF_NAME when no explicit branch is given', () => {
    expect(resolvePublishChannelBranch({ env: { GITHUB_REF_NAME: 'staging' } })).toBe('staging');
    expect(resolvePublishChannelBranch({ env: { GITHUB_REF_NAME: 'main' } })).toBe('main');
  });

  it('falls back to develop for branches outside the publish channel set (no git channel branch)', () => {
    // Point root at a non-git temp dir so the `git branch --show-current` fallback
    // yields nothing and the develop default applies.
    const nonGitRoot = mkdtempSync(join(tmpdir(), 'mp-ref-nogit-'));
    try {
      expect(resolvePublishChannelBranch({ env: { GITHUB_REF_NAME: 'some-feature' }, root: nonGitRoot })).toBe('develop');
      expect(resolvePublishChannelBranch({ channelBranch: 'some-feature', env: {}, root: nonGitRoot })).toBe('develop');
    } finally {
      rmSync(nonGitRoot, { recursive: true, force: true });
    }
  });
});

describe('syncMarketplacePluginEntryRef', () => {
  it('updates a codex-style git-subdir source ref', () => {
    const manifest = {
      plugins: [
        { name: 'babysitter', source: { source: 'git-subdir', url: 'x', path: '.', ref: 'main' } },
      ],
    };
    expect(syncMarketplacePluginEntryRef(manifest, 'babysitter', 'staging')).toBe(true);
    expect(manifest.plugins[0].source.ref).toBe('staging');
  });

  it('updates a claude/cursor-style url source branch', () => {
    const manifest = {
      plugins: [{ name: 'babysitter', source: { source: 'url', url: 'x', branch: 'main' } }],
    };
    expect(syncMarketplacePluginEntryRef(manifest, 'babysitter', 'staging')).toBe(true);
    expect(manifest.plugins[0].source.branch).toBe('staging');
  });

  it('is a no-op for already-current refs', () => {
    const manifest = {
      plugins: [{ name: 'babysitter', source: { source: 'url', url: 'x', branch: 'staging' } }],
    };
    expect(syncMarketplacePluginEntryRef(manifest, 'babysitter', 'staging')).toBe(false);
  });

  it('leaves local/relative sources untouched (no ref/branch to sync)', () => {
    const localStr = { plugins: [{ name: 'babysitter', source: './' }] };
    expect(syncMarketplacePluginEntryRef(localStr, 'babysitter', 'staging')).toBe(false);
    const localObj = { plugins: [{ name: 'babysitter', source: { source: 'local', path: './' } }] };
    expect(syncMarketplacePluginEntryRef(localObj, 'babysitter', 'staging')).toBe(false);
    expect(localObj.plugins[0].source).toEqual({ source: 'local', path: './' });
  });

  it('does not touch entries for other plugins', () => {
    const manifest = {
      plugins: [{ name: 'other', source: { source: 'url', url: 'x', branch: 'main' } }],
    };
    expect(syncMarketplacePluginEntryRef(manifest, 'babysitter', 'staging')).toBe(false);
    expect(manifest.plugins[0].source.branch).toBe('main');
  });
});

describe('syncBabysitterMarketplaceManifestVersions — version + channel ref', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mp-ref-sync-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const write = (rel: string, data: unknown) => {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`);
  };
  const read = (rel: string) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

  it('syncs both version and external source ref to the channel branch', () => {
    write('.agents/plugins/marketplace.json', {
      name: 'babysitter',
      plugins: [
        {
          name: 'babysitter',
          version: '5.0.1-staging.old',
          source: { source: 'git-subdir', url: 'https://github.com/a5c-ai/babysitter-codex.git', path: '.', ref: 'main' },
        },
      ],
    });
    write('.claude-plugin/marketplace.json', {
      name: 'babysitter',
      plugins: [
        {
          name: 'babysitter',
          version: '5.0.1-staging.old',
          source: { source: 'url', url: 'https://github.com/a5c-ai/babysitter-claude.git', branch: 'main' },
        },
      ],
    });

    const changed = syncBabysitterMarketplaceManifestVersions('5.1.1-staging.new', {
      root,
      channelBranch: 'staging',
    });

    expect(changed.sort()).toEqual(['.agents/plugins/marketplace.json', '.claude-plugin/marketplace.json']);

    const codex = read('.agents/plugins/marketplace.json');
    expect(codex.plugins[0].version).toBe('5.1.1-staging.new');
    expect(codex.plugins[0].source.ref).toBe('staging');

    const claude = read('.claude-plugin/marketplace.json');
    expect(claude.plugins[0].version).toBe('5.1.1-staging.new');
    expect(claude.plugins[0].source.branch).toBe('staging');
  });

  it('points the ref at main for the latest channel', () => {
    write('.agents/plugins/marketplace.json', {
      name: 'babysitter',
      plugins: [
        {
          name: 'babysitter',
          version: '5.1.0',
          source: { source: 'git-subdir', url: 'x', path: '.', ref: 'staging' },
        },
      ],
    });

    syncBabysitterMarketplaceManifestVersions('5.1.0', { root, channelBranch: 'main' });

    expect(read('.agents/plugins/marketplace.json').plugins[0].source.ref).toBe('main');
  });

  it('reports a change when only the ref drifts (version already current)', () => {
    write('.agents/plugins/marketplace.json', {
      name: 'babysitter',
      plugins: [
        {
          name: 'babysitter',
          version: '5.1.1-staging.new',
          source: { source: 'git-subdir', url: 'x', path: '.', ref: 'main' },
        },
      ],
    });

    const changed = syncBabysitterMarketplaceManifestVersions('5.1.1-staging.new', {
      root,
      channelBranch: 'staging',
    });
    expect(changed).toEqual(['.agents/plugins/marketplace.json']);
    expect(read('.agents/plugins/marketplace.json').plugins[0].source.ref).toBe('staging');
  });
});
