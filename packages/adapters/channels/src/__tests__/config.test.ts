import { describe, it, expect } from 'vitest';
import { loadConfig, registry, defineBackend, MemoryStateStore } from '../index.js';

// SPEC §5 config.js: loadConfig(yamlStringOrPath, { env }) -> { config, errors }.
// NEVER throws on invalid input; collects actionable errors instead (AC-3).
// ${ENV} interpolation reads the provided env (default process.env).

const baseEnv = {
  GITHUB_TOKEN: 'ghp_test',
  JIRA_EMAIL: 'me@example.test',
  JIRA_TOKEN: 'jira_test'
};

function ghYaml(extra = '') {
  return `
server:
  name: mcp-channels
state:
  dir: ./.state
  maxSeenPerSource: 500
defaults:
  pollIntervalSeconds: 60
sources:
  - id: gh-comments
    backend: github
    pollIntervalSeconds: 30
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { repo: "octo/app", events: [issue_comment] }
    filter:
      all:
        - { field: "issue.assignee.login", op: eq, value: "alice" }
${extra}`;
}

describe('loadConfig — valid config (AC-3)', () => {
  it('AC-3: parses a valid GitHub source with zero errors', () => {
    const { config, errors } = loadConfig(ghYaml(), { env: baseEnv });
    expect(errors).toEqual([]);
    expect(config.server.name).toBe('mcp-channels');
    expect(Array.isArray(config.sources)).toBe(true);
    expect(config.sources).toHaveLength(1);
    expect(config.sources[0].id).toBe('gh-comments');
    expect(config.sources[0].backend).toBe('github');
  });

  it('AC-3: applies defaults — per-source pollIntervalSeconds falls back to defaults', () => {
    const yaml = `
server:
  name: mcp-channels
defaults:
  pollIntervalSeconds: 45
sources:
  - id: gh
    backend: github
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { repo: "octo/app", events: [issue_comment] }
`;
    const { config, errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors).toEqual([]);
    expect(config.sources[0].pollIntervalSeconds).toBe(45);
  });

  it('AC-3: never throws even on completely malformed YAML — returns errors', () => {
    let result;
    expect(() => {
      result = loadConfig(':::not yaml::: [unbalanced', { env: baseEnv });
    }).not.toThrow();
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('loadConfig — ${ENV} interpolation (AC-3)', () => {
  it('AC-3: interpolates ${ENV} from the provided env map', () => {
    const { config, errors } = loadConfig(ghYaml(), { env: baseEnv });
    expect(errors).toEqual([]);
    expect(config.sources[0].auth.token).toBe('ghp_test');
  });

  it('AC-3: a missing required ${ENV} becomes a validation error (not a crash)', () => {
    // No GITHUB_TOKEN in env -> the ${GITHUB_TOKEN} placeholder is unresolved.
    const { errors } = loadConfig(ghYaml(), { env: {} });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toMatch(/GITHUB_TOKEN/);
  });
});

describe('loadConfig — structural edge cases (AC-3)', () => {
  it('a non-mapping top-level document is an error', () => {
    const { errors } = loadConfig('just a scalar string', { env: baseEnv });
    expect(errors.join('\n')).toMatch(/YAML mapping|server.*sources/i);
  });

  it('sources that is not an array is an error', () => {
    const yaml = `
server: { name: mcp-channels }
sources: "oops not a list"
`;
    const { errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors.join('\n')).toMatch(/sources must be an array/i);
  });

  it('a source missing a backend is an error', () => {
    const yaml = `
server: { name: mcp-channels }
sources:
  - id: nobackend
    auth: { token: "x" }
    config: {}
`;
    const { errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors.join('\n')).toMatch(/a `backend` is required|backend.*required/i);
  });

  it('a backend.validateConfig that THROWS is captured as an error (not a crash)', () => {
    registry.register(
      'throwing-validate',
      defineBackend({
        type: 'throwing-validate',
        validateConfig() {
          throw new Error('kaboom');
        },
        async poll() {
          return { events: [], state: {} };
        },
        async reply() {
          return { ok: true };
        }
      })
    );
    const yaml = `
server: { name: mcp-channels }
sources:
  - id: tv
    backend: throwing-validate
    auth: { token: "x" }
    config: {}
`;
    let result;
    expect(() => {
      result = loadConfig(yaml, { env: baseEnv });
    }).not.toThrow();
    expect(result.errors.join('\n')).toMatch(/validateConfig threw.*kaboom/i);
  });
});

describe('loadConfig — backend validation (AC-3)', () => {
  it('AC-3: an unknown backend type is an error', () => {
    const yaml = `
server: { name: mcp-channels }
sources:
  - id: weird
    backend: doesnotexist
    auth: { token: "x" }
    config: {}
`;
    const { errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toMatch(/doesnotexist|unknown backend/i);
  });

  it('AC-3: a backend.validateConfig failure surfaces as a config error', () => {
    // Register a backend whose validateConfig rejects the source, then reference
    // it by type. config.js MUST aggregate validateConfig() problems.
    registry.register(
      'needs-endpoint',
      defineBackend({
        type: 'needs-endpoint',
        validateConfig(source) {
          return source?.config?.endpoint ? [] : ['needs-endpoint: config.endpoint is required'];
        },
        async poll() {
          return { events: [], state: {} };
        },
        async reply() {
          return { ok: true };
        }
      })
    );

    const yaml = `
server: { name: mcp-channels }
sources:
  - id: ne
    backend: needs-endpoint
    auth: { token: "x" }
    config: {}
`;
    const { errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors.join('\n')).toMatch(/needs-endpoint: config\.endpoint is required/);
  });

  it('AC-3: a backend.validateConfig that passes yields no error', () => {
    registry.register(
      'ok-backend',
      defineBackend({
        type: 'ok-backend',
        validateConfig() {
          return [];
        },
        async poll() {
          return { events: [], state: {} };
        },
        async reply() {
          return { ok: true };
        }
      })
    );
    const yaml = `
server: { name: mcp-channels }
sources:
  - id: okk
    backend: ok-backend
    auth: { token: "x" }
    config: { endpoint: "https://x.test" }
`;
    const { errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors).toEqual([]);
  });
});

describe('loadConfig — built-in backend validateConfig surfaces at load (AC-3)', () => {
  it('AC-3: a github source missing config.repo yields a clear error', () => {
    const yaml = `
server: { name: mcp-channels }
sources:
  - id: gh
    backend: github
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { events: [issue_comment] }
`;
    const { errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toMatch(/repo.*owner\/name|config\.repo/i);
  });

  it('AC-3: a github source with a non "owner/name" repo is rejected', () => {
    const yaml = `
server: { name: mcp-channels }
sources:
  - id: gh
    backend: github
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { repo: "not-a-repo", events: [issue_comment] }
`;
    const { errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors.join('\n')).toMatch(/owner\/name/i);
  });

  it('AC-3: a github source missing auth.token is rejected', () => {
    const yaml = `
server: { name: mcp-channels }
sources:
  - id: gh
    backend: github
    auth: {}
    config: { repo: "octo/app", events: [issue_comment] }
`;
    const { errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors.join('\n')).toMatch(/auth\.token/i);
  });

  it('AC-3: a jira source missing config.project yields a clear error', () => {
    const yaml = `
server: { name: mcp-channels }
sources:
  - id: jira
    backend: jira
    auth: { baseUrl: "https://x.atlassian.net", email: "\${JIRA_EMAIL}", token: "\${JIRA_TOKEN}" }
    config: { events: [issue_created] }
`;
    const { errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toMatch(/config\.project/i);
  });

  it('AC-3: a jira source missing auth (baseUrl/email/token) yields clear errors', () => {
    const yaml = `
server: { name: mcp-channels }
sources:
  - id: jira
    backend: jira
    auth: {}
    config: { project: "BUG", events: [issue_created] }
`;
    const { errors } = loadConfig(yaml, { env: baseEnv });
    const joined = errors.join('\n');
    expect(joined).toMatch(/auth\.baseUrl/i);
    expect(joined).toMatch(/auth\.email/i);
    expect(joined).toMatch(/auth\.token/i);
  });

  it('AC-3: a jira project key with JQL-injection characters is rejected', () => {
    const yaml = `
server: { name: mcp-channels }
sources:
  - id: jira
    backend: jira
    auth: { baseUrl: "https://x.atlassian.net", email: "\${JIRA_EMAIL}", token: "\${JIRA_TOKEN}" }
    config: { project: 'BUG" OR project = "SECRET', events: [issue_created] }
`;
    const { errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors.join('\n')).toMatch(/\[A-Za-z0-9_\]\+|project must match/i);
  });

  it('AC-3: a valid jira source passes with zero errors', () => {
    const yaml = `
server: { name: mcp-channels }
sources:
  - id: jira
    backend: jira
    auth: { baseUrl: "https://x.atlassian.net", email: "\${JIRA_EMAIL}", token: "\${JIRA_TOKEN}" }
    config: { project: "BUG", events: [issue_created] }
`;
    const { errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors).toEqual([]);
  });
});

describe('loadConfig — state.maxSeenPerSource default (SPEC §5)', () => {
  it('defaults state.maxSeenPerSource to 1000 when the YAML omits it', () => {
    const yaml = `
server: { name: mcp-channels }
state:
  dir: ./.state
sources:
  - id: gh
    backend: github
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { repo: "octo/app", events: [issue_comment] }
`;
    const { config, errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors).toEqual([]);
    // Without this default the FIFO seen-bound would silently become UNBOUNDED.
    expect(config.state.maxSeenPerSource).toBe(1000);
  });

  it('an explicit YAML state.maxSeenPerSource still wins over the default', () => {
    const { config } = loadConfig(ghYaml(), { env: baseEnv }); // ghYaml sets 500
    expect(config.state.maxSeenPerSource).toBe(500);
  });

  it('the FIFO seen-bound actually holds when the key is omitted (bound, not unbounded)', async () => {
    const yaml = `
server: { name: mcp-channels }
sources:
  - id: gh
    backend: github
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { repo: "octo/app", events: [issue_comment] }
`;
    const { config } = loadConfig(yaml, { env: baseEnv });
    // Feed the resolved default into a store and push 1500 ids: the bound must clamp.
    const store = new MemoryStateStore({ maxSeenPerSource: config.state.maxSeenPerSource });
    const ids = Array.from({ length: 1500 }, (_, i) => `id-${i}`);
    await store.set('gh', { cursor: 'c', seen: ids });
    const got = store.get('gh');
    expect(got.seen).toHaveLength(1000); // clamped, NOT 1500 (would be unbounded)
    // The most-recent 1000 are retained (FIFO drops the oldest).
    expect(got.seen[0]).toBe('id-500');
    expect(got.seen[got.seen.length - 1]).toBe('id-1499');
  });
});

describe('loadConfig — filter shape validation (AC-3)', () => {
  it('AC-3: a filter clause with an unknown op is reported', () => {
    const yaml = ghYaml(`    filter:
      all:
        - { field: "issue.assignee.login", op: bogusop, value: "alice" }`).replace(
      // remove the original (valid) filter block to avoid two `filter:` keys
      /    filter:\n      all:\n        - \{ field: "issue\.assignee\.login", op: eq, value: "alice" \}\n/,
      ''
    );
    const { errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toMatch(/bogusop|filter|op/i);
  });

  it('AC-3: a filter clause missing a field is reported', () => {
    const yaml = `
server: { name: mcp-channels }
sources:
  - id: gh
    backend: github
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { repo: "octo/app", events: [issue_comment] }
    filter:
      all:
        - { op: eq, value: "alice" }
`;
    const { errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toMatch(/field|filter/i);
  });
});

// SPEC §10 / DESIGN §7.5 — the spawner configuration additions. All keys are
// OPTIONAL and additive: an absent key preserves today's behavior (the existing
// config tests above already prove that — none of them set onEvent/spawn).
describe('loadConfig — server.replySecret (AC-21 / §7.5)', () => {
  it('parses server.replySecret as a string onto config.server.replySecret', () => {
    const yaml = `
server:
  name: mcp-channels
  replySecret: "literal-secret"
sources:
  - id: gh
    backend: github
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { repo: "octo/app", events: [issue_comment] }
`;
    const { config, errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors).toEqual([]);
    expect(config.server.replySecret).toBe('literal-secret');
  });

  it('interpolates ${MCP_CHANNELS_REPLY_SECRET} into server.replySecret', () => {
    const yaml = `
server:
  name: mcp-channels
  replySecret: "\${MCP_CHANNELS_REPLY_SECRET}"
sources:
  - id: gh
    backend: github
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { repo: "octo/app", events: [issue_comment] }
`;
    const env = { ...baseEnv, MCP_CHANNELS_REPLY_SECRET: 'env-secret-123' };
    const { config, errors } = loadConfig(yaml, { env });
    expect(errors).toEqual([]);
    expect(config.server.replySecret).toBe('env-secret-123');
  });

  it('omits replySecret when not configured (per-process random key path)', () => {
    const { config } = loadConfig(ghYaml(), { env: baseEnv });
    // No server.replySecret in ghYaml -> not set (falsy), so the runtime uses the
    // per-process random key exactly as today.
    expect(config.server.replySecret).toBeFalsy();
  });
});

describe('loadConfig — global spawn defaults (§7.5)', () => {
  it('normalizes a global spawn block with documented defaults', () => {
    const yaml = `
server: { name: mcp-channels }
spawn:
  agent: claude-code
  mode: headless
  approvalMode: yolo
  selfMcpName: mcp-channels
  maxConcurrent: 4
sources:
  - id: gh
    backend: github
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { repo: "octo/app", events: [issue_comment] }
`;
    const { config, errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors).toEqual([]);
    expect(config.spawn).toBeTruthy();
    expect(config.spawn.agent).toBe('claude-code');
    expect(config.spawn.mode).toBe('headless');
    expect(config.spawn.approvalMode).toBe('yolo');
    expect(config.spawn.selfMcpName).toBe('mcp-channels');
    expect(config.spawn.maxConcurrent).toBe(4);
  });

  it('applies defaults (mode=headless, approvalMode=yolo, selfMcpName=mcp-channels, maxConcurrent=4) when keys are omitted', () => {
    const yaml = `
server: { name: mcp-channels }
spawn:
  agent: claude-code
sources:
  - id: gh
    backend: github
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { repo: "octo/app", events: [issue_comment] }
`;
    const { config, errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors).toEqual([]);
    expect(config.spawn.mode).toBe('headless');
    expect(config.spawn.approvalMode).toBe('yolo');
    expect(config.spawn.selfMcpName).toBe('mcp-channels');
    expect(config.spawn.maxConcurrent).toBe(4);
  });

  it('rejects an invalid global spawn.mode with a clear error', () => {
    const yaml = `
server: { name: mcp-channels }
spawn:
  mode: sideways
sources:
  - id: gh
    backend: github
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { repo: "octo/app", events: [issue_comment] }
`;
    const { errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toMatch(/mode|headless|interactive/i);
  });

  it('rejects an invalid approvalMode and a non-positive maxConcurrent', () => {
    const yaml = `
server: { name: mcp-channels }
spawn:
  approvalMode: whatever
  maxConcurrent: 0
sources:
  - id: gh
    backend: github
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { repo: "octo/app", events: [issue_comment] }
`;
    const { errors } = loadConfig(yaml, { env: baseEnv });
    const joined = errors.join('\n');
    expect(joined).toMatch(/approvalMode|yolo|prompt|deny/i);
    expect(joined).toMatch(/maxConcurrent/i);
  });

  it('rejects an invalid selfMcpName (must match the adapters identifier regex)', () => {
    const yaml = `
server: { name: mcp-channels }
spawn:
  selfMcpName: "has spaces!"
sources:
  - id: gh
    backend: github
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { repo: "octo/app", events: [issue_comment] }
`;
    const { errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors.join('\n')).toMatch(/selfMcpName|[A-Za-z0-9_-]/);
  });
});

describe('loadConfig — per-source onEvent + spawn merge (§7.5)', () => {
  it('defaults source.onEvent to "emit" when omitted (existing configs never spawn)', () => {
    const { config, errors } = loadConfig(ghYaml(), { env: baseEnv });
    expect(errors).toEqual([]);
    expect(config.sources[0].onEvent).toBe('emit');
  });

  it('accepts onEvent: spawn / both and keeps the value on the normalized source', () => {
    const yaml = `
server: { name: mcp-channels }
sources:
  - id: gh-spawn
    backend: github
    onEvent: spawn
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { repo: "octo/app", events: [issue_opened] }
  - id: gh-both
    backend: github
    onEvent: both
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { repo: "octo/app", events: [issue_opened] }
`;
    const { config, errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors).toEqual([]);
    expect(config.sources[0].onEvent).toBe('spawn');
    expect(config.sources[1].onEvent).toBe('both');
  });

  it('an invalid onEvent value is a clear validation error (not a crash)', () => {
    const yaml = `
server: { name: mcp-channels }
sources:
  - id: gh
    backend: github
    onEvent: explode
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { repo: "octo/app", events: [issue_opened] }
`;
    let result;
    expect(() => {
      result = loadConfig(yaml, { env: baseEnv });
    }).not.toThrow();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.join('\n')).toMatch(/onEvent|emit|spawn|both/i);
  });

  it('merges per-source spawn OVER the global spawn (per-source wins; inherits the rest)', () => {
    const yaml = `
server: { name: mcp-channels }
spawn:
  agent: claude-code
  mode: headless
  approvalMode: yolo
  selfMcpName: mcp-channels
  maxConcurrent: 4
  model: claude-sonnet-default
sources:
  - id: gh
    backend: github
    onEvent: spawn
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { repo: "octo/app", events: [issue_opened] }
    spawn:
      model: claude-opus-4-8
      cwd: "."
`;
    const { config, errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors).toEqual([]);
    const eff = config.sources[0].spawn;
    // Overridden by the source:
    expect(eff.model).toBe('claude-opus-4-8');
    expect(eff.cwd).toBe('.');
    // Inherited from the global block:
    expect(eff.agent).toBe('claude-code');
    expect(eff.mode).toBe('headless');
    expect(eff.approvalMode).toBe('yolo');
    expect(eff.selfMcpName).toBe('mcp-channels');
    expect(eff.maxConcurrent).toBe(4);
  });

  it('an invalid per-source effective mode is rejected', () => {
    const yaml = `
server: { name: mcp-channels }
spawn:
  mode: headless
sources:
  - id: gh
    backend: github
    onEvent: spawn
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { repo: "octo/app", events: [issue_opened] }
    spawn:
      mode: nope
`;
    const { errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors.join('\n')).toMatch(/mode|headless|interactive/i);
  });

  it('a non-string promptTemplate is rejected', () => {
    const yaml = `
server: { name: mcp-channels }
sources:
  - id: gh
    backend: github
    onEvent: spawn
    auth: { token: "\${GITHUB_TOKEN}" }
    config: { repo: "octo/app", events: [issue_opened] }
    spawn:
      promptTemplate: [not, a, string]
`;
    const { errors } = loadConfig(yaml, { env: baseEnv });
    expect(errors.join('\n')).toMatch(/promptTemplate/i);
  });
});
