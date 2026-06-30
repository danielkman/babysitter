// Declarative filter engine (SPEC §4, DESIGN §1).
//
// A filter `spec` is either a leaf clause `{ field, op, value, ignoreCase? }` or
// a combinator `{ all: [...] } | { any: [...] } | { not: clause }`. Matching is
// performed against a dot-path payload. The cardinal rule (AC-9/AC-10): an
// unknown op, a bad/missing dot-path, or a malformed regex yields NO MATCH and
// NEVER throws — a misconfigured filter must not be able to crash a poll.

import type { FilterLeaf, FilterSpec } from './types.js';

/**
 * Resolve a dot-path (e.g. "issue.assignee.login") against an object. Returns
 * `undefined` for any missing segment or when traversing into a primitive.
 */
function getPath(obj: unknown, path: string): unknown {
  if (obj == null || typeof path !== 'string') return undefined;
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur == null || (typeof cur !== 'object' && typeof cur !== 'function')) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Build a RegExp, returning `null` if the pattern is invalid. */
function safeRegExp(pattern: string, flags: string): RegExp | null {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

/**
 * Evaluate a single leaf clause.
 */
function matchLeaf(clause: FilterLeaf, payload: unknown): boolean {
  const { field, op, value, ignoreCase } = clause;
  if (typeof field !== 'string' || typeof op !== 'string') return false;

  const actual = getPath(payload, field);

  switch (op) {
    case 'eq':
      return actual === value;
    case 'ne':
      return actual !== value;
    case 'in':
      return Array.isArray(value) && value.includes(actual);
    case 'nin':
      return Array.isArray(value) && !value.includes(actual);
    case 'includes':
      // The FIELD is an array that must contain `value`.
      return Array.isArray(actual) && actual.includes(value);
    case 'contains': {
      // The FIELD is a string that must contain the substring `value`.
      if (typeof actual !== 'string' || typeof value !== 'string') return false;
      return ignoreCase
        ? actual.toLowerCase().includes(value.toLowerCase())
        : actual.includes(value);
    }
    case 'regex': {
      if (typeof actual !== 'string' || typeof value !== 'string') return false;
      const re = safeRegExp(value, ignoreCase ? 'i' : '');
      return re ? re.test(actual) : false;
    }
    case 'exists': {
      const present = actual !== undefined && actual !== null;
      // value:true asserts presence; value:false asserts absence.
      return value === false ? !present : present;
    }
    case 'gt':
      return typeof actual === 'number' && typeof value === 'number' && actual > value;
    case 'gte':
      return typeof actual === 'number' && typeof value === 'number' && actual >= value;
    case 'lt':
      return typeof actual === 'number' && typeof value === 'number' && actual < value;
    case 'lte':
      return typeof actual === 'number' && typeof value === 'number' && actual <= value;
    default:
      // Unknown operator => no match (never throw).
      return false;
  }
}

/**
 * Evaluate a filter spec (leaf or combinator) against a payload.
 */
export function filterMatch(spec: unknown, payload: unknown): boolean {
  // An empty / missing filter matches everything (no gate configured).
  if (spec == null) return true;
  if (typeof spec !== 'object') return false;

  const s = spec as Record<string, unknown>;

  if (Array.isArray(s.all)) {
    return s.all.every((sub) => filterMatch(sub, payload));
  }
  if (Array.isArray(s.any)) {
    return s.any.some((sub) => filterMatch(sub, payload));
  }
  if ('not' in s) {
    return !filterMatch(s.not, payload);
  }

  // Leaf clause. An object with no field/op (e.g. `{}`) is treated as "no gate".
  if (!('field' in s) && !('op' in s)) return true;

  return matchLeaf(s as FilterLeaf, payload);
}

/**
 * Compile a filter spec into a reusable predicate `(payload) => boolean`.
 */
export function compileFilter(
  spec: FilterSpec | null | undefined
): (payload: unknown) => boolean {
  return (payload: unknown) => filterMatch(spec, payload);
}
