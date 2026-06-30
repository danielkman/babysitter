import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registry, defineBackend } from '../index.js';

// Resolve fixtures relative to THIS test file so paths are stable regardless of
// process.cwd() (package dir vs repo root).
const HERE = dirname(fileURLToPath(import.meta.url)); // -> .../src/__tests__
const PKG_ROOT = resolve(HERE, '../../'); // -> package root (where examples/ lives)
import { fakeHttp, urlIncludes } from './helpers/fake-http.js';
import { ghComment, ghIssue } from './helpers/fixtures.js';

// SPEC §6 R2 registry.js + defineBackend.
//   AC-3: registry.register(type, backend) / registry.get(type); built-ins
//         github + jira are pre-registered; an invalid backend (missing
//         poll/reply) fails with a clear message.
//   AC-4: registry.load(path, baseDir) dynamically imports a custom JS backend.

describe('registry — built-ins (AC-3)', () => {
  it('AC-3: github and jira are pre-registered', () => {
    const gh = registry.get('github');
    const jira = registry.get('jira');
    expect(gh).toBeTruthy();
    expect(typeof gh.poll).toBe('function');
    expect(typeof gh.reply).toBe('function');
    expect(jira).toBeTruthy();
    expect(typeof jira.poll).toBe('function');
    expect(typeof jira.reply).toBe('function');
  });

  it('AC-3: get() of an unknown type returns undefined/null (not a throw)', () => {
    expect(() => registry.get('nope-not-real')).not.toThrow();
    expect(registry.get('nope-not-real')).toBeFalsy();
  });

  it('the registered github backend IS the real built-in (poll hits the real GitHub URL) (finding §15)', async () => {
    const gh = registry.get('github');
    const comment = ghComment({ id: 1, issueNumber: 42 });
    const issue = ghIssue({ number: 42, assignee: 'alice' });
    const http = fakeHttp([
      { match: urlIncludes('/repos/octo/app/issues/comments'), response: { status: 200, body: [comment] } },
      {
        match: (url, opts) =>
          (opts.method || 'GET').toUpperCase() === 'GET' &&
          /\/repos\/octo\/app\/issues\/\d+($|\?)/.test(String(url)),
        response: { status: 200, body: issue }
      }
    ]);

    const result = await gh.poll({
      source: { id: 'gh', backend: 'github', auth: { token: 't' }, config: { repo: 'octo/app', events: ['issue_comment'] } },
      state: { cursor: null, seen: [] },
      http,
      log: () => {},
      now: new Date('2026-06-16T12:00:00Z')
    });

    // The real backend ran: it produced a github-shaped event and actually issued
    // the GitHub REST request through the injected http.
    expect(result.events).toHaveLength(1);
    expect(result.events[0].meta.repo).toBe('octo/app');
    expect(http.calls.some((c) => c.url.includes('/repos/octo/app/issues/comments'))).toBe(true);
  });

  it('the registered built-in EXPOSES the real validateConfig directly (finding §2)', () => {
    const gh = registry.get('github');
    expect(typeof gh.validateConfig).toBe('function');
    // A bad repo is reported by the REAL github.validateConfig (no wrapper indirection).
    const problems = gh.validateConfig({ id: 'x', config: { repo: 'bad', events: ['issue_comment'] }, auth: { token: 't' } });
    expect(problems.join('\n')).toMatch(/owner\/name/i);
    // A good config yields no problems.
    expect(gh.validateConfig({ id: 'x', config: { repo: 'octo/app', events: ['issue_comment'] }, auth: { token: 't' } })).toEqual([]);
  });
});

describe('registry — register + get (AC-3)', () => {
  it('AC-3: register(type, backend) then get(type) returns the same backend', () => {
    const backend = defineBackend({
      type: 'reg-test',
      async poll() {
        return { events: [], state: {} };
      },
      async reply() {
        return { ok: true };
      }
    });
    registry.register('reg-test', backend);
    expect(registry.get('reg-test')).toBe(backend);
  });
});

describe('registry — load custom backend (AC-4)', () => {
  it('AC-4: load() dynamically imports examples/custom-backend.js and exposes hooks', async () => {
    const backend = await registry.load('./examples/custom-backend.js', PKG_ROOT);
    expect(backend).toBeTruthy();
    expect(backend.type).toBe('example-custom');
    expect(typeof backend.poll).toBe('function');
    expect(typeof backend.reply).toBe('function');
    expect(typeof backend.validateConfig).toBe('function');
  });

  it('AC-4: load() resolves the path relative to baseDir', async () => {
    const baseDir = resolve(PKG_ROOT, 'examples');
    const backend = await registry.load('./custom-backend.js', baseDir);
    expect(backend.type).toBe('example-custom');
  });
});

describe('defineBackend — validates the hook interface (AC-3)', () => {
  it('AC-3: returns the object unchanged when poll + reply are present', () => {
    const obj = {
      type: 'ok',
      async poll() {
        return { events: [], state: {} };
      },
      async reply() {
        return { ok: true };
      }
    };
    expect(defineBackend(obj)).toBe(obj);
  });

  it('AC-3: throws a clear error when poll is missing', () => {
    expect(() =>
      defineBackend({
        type: 'broken',
        async reply() {
          return { ok: true };
        }
      })
    ).toThrow(/poll/i);
  });

  it('AC-3: throws a clear error when reply is missing', () => {
    expect(() =>
      defineBackend({
        type: 'broken',
        async poll() {
          return { events: [], state: {} };
        }
      })
    ).toThrow(/reply/i);
  });
});
