// Backend registry (SPEC §3/§6 R2, DESIGN §1).
//
// Maps a backend `type` -> backend module. Built-ins `github` and `jira` are
// pre-registered as the REAL backend modules (statically imported), so a single
// module instance is shared everywhere: `registry.get('github')` returns the same
// object that `import github from './backends/github.js'` yields.
//
// Custom backends referenced from YAML by relative path are loaded on demand via
// `registry.load(path, baseDir)` (dynamic import, resolved against the config dir).

import { pathToFileURL } from 'node:url';
import { resolve, isAbsolute } from 'node:path';
import { defineBackend } from './backend.js';
import githubBackend from './backends/github.js';
import jiraBackend from './backends/jira.js';
import webhookBackend from './backends/webhook.js';
import type { Backend } from './types.js';

/** Built-in backend type -> backend module. */
const BUILTINS: Record<string, Backend> = {
  github: githubBackend,
  jira: jiraBackend,
  webhook: webhookBackend
};

class Registry {
  _map: Map<string, Backend>;

  constructor() {
    this._map = new Map();
    for (const [type, backend] of Object.entries(BUILTINS)) {
      this._map.set(type, backend);
    }
  }

  /**
   * Register a backend programmatically.
   */
  register(type: string, backend: Backend): Backend {
    this._map.set(type, backend);
    return backend;
  }

  /**
   * Look up a backend by type. Returns `undefined` for an unknown type (never
   * throws).
   */
  get(type: string): Backend | undefined {
    return this._map.get(type);
  }

  /**
   * Dynamically import a custom backend referenced by (relative) path, resolving
   * it against `baseDir`. Validates the module exposes the hook interface.
   */
  async load(path: string, baseDir: string): Promise<Backend> {
    const abs = isAbsolute(path) ? path : resolve(baseDir || process.cwd(), path);
    const mod = (await import(pathToFileURL(abs).href)) as { default?: Backend } & Partial<Backend>;
    const backend = (mod.default ?? mod) as Partial<Backend>;
    // Validate it really is a backend (throws a clear error if not).
    return defineBackend(backend) as Backend;
  }
}

/** The shared registry instance (built-ins pre-registered). */
export const registry = new Registry();
export { Registry };
