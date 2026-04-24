import { describe, expect, it } from 'vitest';

import {
  buildKanbanBacklogSnapshot,
  computeKanbanProjectMetrics,
  normalizeKanbanIssue,
  type KanbanIssue,
} from '../src/kanban.js';

function makeIssue(overrides: Partial<KanbanIssue> = {}): KanbanIssue {
  return {
    id: overrides.id ?? 'issue-1',
    projectId: overrides.projectId ?? 'project-1',
    key: overrides.key ?? 'KANBAN-1',
    title: overrides.title ?? 'Issue',
    status: overrides.status ?? 'backlog',
    priority: overrides.priority ?? 'medium',
    labels: overrides.labels ?? [],
    assignees: overrides.assignees ?? [],
    dependencies: overrides.dependencies ?? [],
    acceptanceCriteria: overrides.acceptanceCriteria ?? [],
    decomposition: overrides.decomposition ?? [],
    childIssueIds: overrides.childIssueIds ?? [],
    parentIssueId: overrides.parentIssueId,
    createdAt: overrides.createdAt ?? '2026-04-24T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-24T00:00:00.000Z',
    dispatch: overrides.dispatch ?? {
      readiness: 'ready',
      blockedReasons: [],
      runIds: [],
      sessionIds: [],
    },
    description: overrides.description,
    summary: overrides.summary,
    source: overrides.source,
  };
}

describe('normalizeKanbanIssue', () => {
  it('marks issues with incomplete decomposition as needing decomposition', () => {
    const issue = normalizeKanbanIssue(
      {
        ...makeIssue(),
        decomposition: [
          {
            id: 'decomp-1',
            title: 'Define child issues',
            kind: 'coordination',
            status: 'todo',
          },
        ],
      },
      new Map(),
    );

    expect(issue.dispatch.readiness).toBe('needs-decomposition');
    expect(issue.dispatch.blockedReasons).toContain('decomposition incomplete');
  });

  it('marks blocked-by dependencies as blocked until the dependency is done', () => {
    const dependency = makeIssue({ id: 'dep-1', key: 'KANBAN-0', status: 'in-progress' });
    const issue = normalizeKanbanIssue(
      {
        ...makeIssue(),
        dependencies: [{ issueId: dependency.id, type: 'blocked-by' }],
      },
      new Map([[dependency.id, dependency]]),
    );

    expect(issue.dispatch.readiness).toBe('blocked');
    expect(issue.dispatch.blockedReasons).toContain('waiting on dep-1');
  });
});

describe('computeKanbanProjectMetrics', () => {
  it('counts issues by readiness and in-progress state', () => {
    const issues = [
      makeIssue({ id: 'ready', dispatch: { readiness: 'ready', blockedReasons: [], runIds: [], sessionIds: [] } }),
      makeIssue({ id: 'blocked', dispatch: { readiness: 'blocked', blockedReasons: ['x'], runIds: [], sessionIds: [] } }),
      makeIssue({ id: 'dispatched', dispatch: { readiness: 'dispatched', blockedReasons: [], runIds: ['run-1'], sessionIds: [] }, status: 'in-progress' }),
      makeIssue({ id: 'done', status: 'done', dispatch: { readiness: 'completed', blockedReasons: [], runIds: [], sessionIds: [] } }),
      makeIssue({ id: 'decomp', dispatch: { readiness: 'needs-decomposition', blockedReasons: [], runIds: [], sessionIds: [] } }),
    ];

    expect(computeKanbanProjectMetrics(issues)).toEqual({
      totalIssues: 5,
      readyIssues: 1,
      blockedIssues: 1,
      dispatchedIssues: 1,
      completedIssues: 1,
      needsDecompositionIssues: 1,
      inProgressIssues: 1,
    });
  });
});

describe('buildKanbanBacklogSnapshot', () => {
  it('hydrates project issue ids and metrics from the issue list', () => {
    const snapshot = buildKanbanBacklogSnapshot({
      generatedAt: '2026-04-24T00:00:00.000Z',
      projects: [
        {
          id: 'project-1',
          key: 'KANBAN',
          name: 'Kanban',
          issueIds: [],
          labels: [],
          assignees: [],
          statuses: [],
        },
      ],
      issues: [
        {
          ...makeIssue({
            id: 'parent',
            key: 'KANBAN-1',
            childIssueIds: ['child'],
          }),
        },
        {
          ...makeIssue({
            id: 'child',
            key: 'KANBAN-1A',
            parentIssueId: 'parent',
            status: 'done',
          }),
        },
      ],
    });

    expect(snapshot.projects[0]?.issueIds).toEqual(['parent', 'child']);
    expect(snapshot.projects[0]?.metrics.totalIssues).toBe(2);
    expect(snapshot.issues.find((issue) => issue.id === 'parent')?.dispatch.readiness).toBe(
      'ready',
    );
  });
});
