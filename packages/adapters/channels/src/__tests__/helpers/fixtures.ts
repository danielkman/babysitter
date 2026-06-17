// Shared fixture builders for GitHub / Jira API payloads. Kept tiny: each helper
// returns a plain object shaped like the real upstream response so backend tests
// can assert on `payload.*` dot-paths (filters) and emitted meta.

/**
 * A GitHub issue-comment object (as returned by
 * GET /repos/{o}/{r}/issues/comments).
 */
export function ghComment(overrides: any = {}): any {
  const id = overrides.id ?? 1001;
  const issueNumber = overrides.issueNumber ?? 42;
  return {
    id,
    body: overrides.body ?? 'please take a look',
    user: { login: overrides.author ?? 'bob' },
    updated_at: overrides.updated_at ?? '2026-06-16T10:00:00Z',
    created_at: overrides.created_at ?? '2026-06-16T10:00:00Z',
    html_url: `https://github.com/octo/app/issues/${issueNumber}#issuecomment-${id}`,
    issue_url: `https://api.github.com/repos/octo/app/issues/${issueNumber}`,
    ...overrides.extra
  };
}

/** A GitHub issue object (parent of a comment, or an opened issue). */
export function ghIssue(overrides: any = {}): any {
  const number = overrides.number ?? 42;
  return {
    id: overrides.id ?? 5001,
    number,
    title: overrides.title ?? 'Something is broken',
    body: overrides.body ?? 'repro steps inside',
    state: overrides.state ?? 'open',
    user: { login: overrides.author ?? 'carol' },
    assignee: overrides.assignee === null ? null : { login: overrides.assignee ?? 'alice' },
    labels: (overrides.labels ?? ['bug']).map((name: any) =>
      typeof name === 'string' ? { name } : name
    ),
    created_at: overrides.created_at ?? '2026-06-16T09:00:00Z',
    updated_at: overrides.updated_at ?? '2026-06-16T09:30:00Z',
    html_url: `https://github.com/octo/app/issues/${number}`,
    ...overrides.extra
  };
}

/** A Jira issue object (one element of POST /rest/api/3/search `issues`). */
export function jiraIssue(overrides: any = {}): any {
  const key = overrides.key ?? 'BUG-7';
  return {
    id: overrides.id ?? '10007',
    key,
    fields: {
      summary: overrides.summary ?? 'App crash on launch',
      labels: overrides.labels ?? ['needs-triage'],
      created: overrides.created ?? '2026-06-16T08:15:00.000+0000',
      updated: overrides.updated ?? '2026-06-16T08:20:00.000+0000',
      project: { key: overrides.project ?? 'BUG' },
      assignee: overrides.assignee
        ? { emailAddress: overrides.assignee }
        : null,
      ...overrides.fields
    },
    ...overrides.extra
  };
}
