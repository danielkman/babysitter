// Backend hook interface + the `defineBackend` identity helper (SPEC §4,
// DESIGN §2). A backend is a plain module exporting a `Backend` object. The
// framework never imports a real HTTP client into a backend — all network access
// goes through the injected `http` so tests can supply a fake.

import type { Backend } from './types.js';

/**
 * Identity helper that gives custom-backend authors editor support (the
 * `Backend` type) and asserts the required hooks are present, turning a missing
 * hook into a clear authoring-time error rather than a confusing poll-time crash.
 */
export function defineBackend<T extends Partial<Backend>>(backend: T): T {
  if (!backend || typeof backend !== 'object') {
    throw new Error('defineBackend: expected a backend object');
  }
  if (typeof backend.poll !== 'function') {
    throw new Error('defineBackend: backend is missing a required `poll(ctx)` function');
  }
  if (typeof backend.reply !== 'function') {
    throw new Error('defineBackend: backend is missing a required `reply(args)` function');
  }
  return backend;
}
