import { describe, it, expect } from 'vitest';
import { compileFilter, filterMatch } from '../index.js';

// SPEC §4 filter engine: dot-path matcher with leaf ops
//   eq, ne, in, nin, includes, contains, regex, exists, gt, gte, lt, lte
// and combinators all/any/not. contains/regex honor ignoreCase.
// Unknown op or bad path => NO MATCH, never throws (AC-9, AC-10).

const payload = {
  issue: { assignee: { login: 'alice' }, number: 42 },
  user: { login: 'bob' },
  fields: {
    summary: 'App CRASH on launch',
    labels: ['needs-triage', 'sev1'],
    priority: 3
  },
  body: 'Please see https://example.test/crash for details'
};

describe('filter.js — leaf operators (AC-9)', () => {
  it('AC-9: eq matches on a deep dot-path and ne is its inverse', () => {
    expect(filterMatch({ field: 'issue.assignee.login', op: 'eq', value: 'alice' }, payload)).toBe(true);
    expect(filterMatch({ field: 'issue.assignee.login', op: 'eq', value: 'carol' }, payload)).toBe(false);
    expect(filterMatch({ field: 'issue.assignee.login', op: 'ne', value: 'carol' }, payload)).toBe(true);
    expect(filterMatch({ field: 'issue.assignee.login', op: 'ne', value: 'alice' }, payload)).toBe(false);
  });

  it('AC-9: in / nin test membership of the field value in a list', () => {
    expect(filterMatch({ field: 'fields.priority', op: 'in', value: [1, 2, 3] }, payload)).toBe(true);
    expect(filterMatch({ field: 'fields.priority', op: 'in', value: [1, 2] }, payload)).toBe(false);
    expect(filterMatch({ field: 'fields.priority', op: 'nin', value: [1, 2] }, payload)).toBe(true);
    expect(filterMatch({ field: 'fields.priority', op: 'nin', value: [1, 2, 3] }, payload)).toBe(false);
  });

  it('AC-9: includes tests that an ARRAY field contains the value', () => {
    expect(filterMatch({ field: 'fields.labels', op: 'includes', value: 'needs-triage' }, payload)).toBe(true);
    expect(filterMatch({ field: 'fields.labels', op: 'includes', value: 'wontfix' }, payload)).toBe(false);
  });

  it('AC-9: contains tests a substring of a STRING field', () => {
    expect(filterMatch({ field: 'fields.summary', op: 'contains', value: 'CRASH' }, payload)).toBe(true);
    expect(filterMatch({ field: 'fields.summary', op: 'contains', value: 'reboot' }, payload)).toBe(false);
  });

  it('AC-9: contains honors ignoreCase', () => {
    expect(filterMatch({ field: 'fields.summary', op: 'contains', value: 'crash' }, payload)).toBe(false);
    expect(
      filterMatch({ field: 'fields.summary', op: 'contains', value: 'crash', ignoreCase: true }, payload)
    ).toBe(true);
  });

  it('AC-9: regex matches a STRING field, and honors ignoreCase', () => {
    // Substring AND regex on the SAME payload field (fields.summary).
    expect(filterMatch({ field: 'fields.summary', op: 'regex', value: 'CRASH\\s+on' }, payload)).toBe(true);
    expect(filterMatch({ field: 'fields.summary', op: 'regex', value: '^crash' }, payload)).toBe(false);
    expect(
      filterMatch({ field: 'fields.summary', op: 'regex', value: 'crash', ignoreCase: true }, payload)
    ).toBe(true);
    // A regex against a different field (body) confirms path resolution.
    expect(filterMatch({ field: 'body', op: 'regex', value: 'https?://\\S+crash' }, payload)).toBe(true);
  });

  it('AC-9: exists checks presence of the path (truthy/defined)', () => {
    expect(filterMatch({ field: 'issue.assignee.login', op: 'exists', value: true }, payload)).toBe(true);
    expect(filterMatch({ field: 'issue.assignee.nope', op: 'exists', value: true }, payload)).toBe(false);
    // exists:false asserts ABSENCE.
    expect(filterMatch({ field: 'issue.assignee.nope', op: 'exists', value: false }, payload)).toBe(true);
    expect(filterMatch({ field: 'issue.assignee.login', op: 'exists', value: false }, payload)).toBe(false);
  });

  it('AC-9: numeric comparisons gt/gte/lt/lte', () => {
    expect(filterMatch({ field: 'issue.number', op: 'gt', value: 41 }, payload)).toBe(true);
    expect(filterMatch({ field: 'issue.number', op: 'gt', value: 42 }, payload)).toBe(false);
    expect(filterMatch({ field: 'issue.number', op: 'gte', value: 42 }, payload)).toBe(true);
    expect(filterMatch({ field: 'issue.number', op: 'lt', value: 43 }, payload)).toBe(true);
    expect(filterMatch({ field: 'issue.number', op: 'lt', value: 42 }, payload)).toBe(false);
    expect(filterMatch({ field: 'issue.number', op: 'lte', value: 42 }, payload)).toBe(true);
  });
});

describe('filter.js — combinators (AC-10)', () => {
  it('AC-10: all requires every sub-clause (AND)', () => {
    const spec = {
      all: [
        { field: 'issue.assignee.login', op: 'eq', value: 'alice' },
        { field: 'fields.labels', op: 'includes', value: 'needs-triage' }
      ]
    };
    expect(filterMatch(spec, payload)).toBe(true);
    const spec2 = {
      all: [
        { field: 'issue.assignee.login', op: 'eq', value: 'alice' },
        { field: 'fields.labels', op: 'includes', value: 'wontfix' }
      ]
    };
    expect(filterMatch(spec2, payload)).toBe(false);
  });

  it('AC-10: any requires at least one sub-clause (OR)', () => {
    const spec = {
      any: [
        { field: 'issue.assignee.login', op: 'eq', value: 'nobody' },
        { field: 'fields.labels', op: 'includes', value: 'sev1' }
      ]
    };
    expect(filterMatch(spec, payload)).toBe(true);
    const spec2 = {
      any: [
        { field: 'issue.assignee.login', op: 'eq', value: 'nobody' },
        { field: 'fields.labels', op: 'includes', value: 'wontfix' }
      ]
    };
    expect(filterMatch(spec2, payload)).toBe(false);
  });

  it('AC-10: not negates its sub-clause', () => {
    expect(filterMatch({ not: { field: 'user.login', op: 'eq', value: 'bob' } }, payload)).toBe(false);
    expect(filterMatch({ not: { field: 'user.login', op: 'eq', value: 'alice' } }, payload)).toBe(true);
  });

  it('AC-10: combinators nest (all of any/not)', () => {
    const spec = {
      all: [
        { any: [{ field: 'user.login', op: 'eq', value: 'bob' }, { field: 'user.login', op: 'eq', value: 'x' }] },
        { not: { field: 'fields.labels', op: 'includes', value: 'wontfix' } }
      ]
    };
    expect(filterMatch(spec, payload)).toBe(true);
  });

  it('AC-10: an empty/undefined filter matches everything (no gate configured)', () => {
    expect(filterMatch(undefined, payload)).toBe(true);
    expect(filterMatch({}, payload)).toBe(true);
  });
});

describe('filter.js — robustness: bad path / unknown op never throws (AC-9)', () => {
  it('AC-9: a bad/missing dot-path yields no match, no throw', () => {
    expect(() =>
      filterMatch({ field: 'a.b.c.d.e', op: 'eq', value: 'x' }, payload)
    ).not.toThrow();
    expect(filterMatch({ field: 'a.b.c.d.e', op: 'eq', value: 'x' }, payload)).toBe(false);
    // Resolving INTO a primitive (string has no `.foo`) must not throw.
    expect(filterMatch({ field: 'body.deeper.value', op: 'eq', value: 'x' }, payload)).toBe(false);
  });

  it('AC-9: an unknown operator yields no match, no throw', () => {
    expect(() =>
      filterMatch({ field: 'user.login', op: 'startsWith', value: 'b' }, payload)
    ).not.toThrow();
    expect(filterMatch({ field: 'user.login', op: 'startsWith', value: 'b' }, payload)).toBe(false);
  });

  it('AC-9: a malformed regex value yields no match, no throw', () => {
    expect(() =>
      filterMatch({ field: 'fields.summary', op: 'regex', value: '([' }, payload)
    ).not.toThrow();
    expect(filterMatch({ field: 'fields.summary', op: 'regex', value: '([' }, payload)).toBe(false);
  });

  it('AC-9: contains/includes against a wrong-typed field => no match, no throw', () => {
    // contains on a non-string field, includes on a non-array field.
    expect(filterMatch({ field: 'issue.number', op: 'contains', value: '4' }, payload)).toBe(false);
    expect(filterMatch({ field: 'fields.summary', op: 'includes', value: 'CRASH' }, payload)).toBe(false);
  });
});

describe('filter.js — compileFilter returns a reusable predicate', () => {
  it('compileFilter(spec) returns a function equivalent to filterMatch', () => {
    const spec = { field: 'issue.assignee.login', op: 'eq', value: 'alice' };
    const pred = compileFilter(spec);
    expect(typeof pred).toBe('function');
    expect(pred(payload)).toBe(true);
    expect(pred({ issue: { assignee: { login: 'carol' } } })).toBe(false);
  });

  it('compileFilter handles a missing payload safely', () => {
    const pred = compileFilter({ field: 'a.b', op: 'eq', value: 1 });
    expect(() => pred(undefined)).not.toThrow();
    expect(pred(undefined)).toBe(false);
  });
});
