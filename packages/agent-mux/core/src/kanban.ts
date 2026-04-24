export type KanbanPriority = 'critical' | 'high' | 'medium' | 'low';

export type KanbanIssueStatus =
  | 'backlog'
  | 'ready'
  | 'in-progress'
  | 'blocked'
  | 'review'
  | 'done';

export type KanbanDispatchReadiness =
  | 'needs-decomposition'
  | 'ready'
  | 'blocked'
  | 'dispatched'
  | 'completed';

export type KanbanDependencyType = 'blocks' | 'blocked-by' | 'related';

export type KanbanDecompositionStatus = 'todo' | 'ready' | 'done';

export type KanbanDecompositionKind =
  | 'research'
  | 'implementation'
  | 'validation'
  | 'coordination';

export interface KanbanLabel {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
  readonly description?: string;
}

export interface KanbanAssignee {
  readonly id: string;
  readonly displayName: string;
  readonly email?: string;
  readonly avatarUrl?: string;
}

export interface KanbanAcceptanceCriterion {
  readonly id: string;
  readonly title: string;
  readonly satisfied: boolean;
  readonly notes?: string;
}

export interface KanbanIssueDependency {
  readonly issueId: string;
  readonly type: KanbanDependencyType;
}

export interface KanbanDecompositionItem {
  readonly id: string;
  readonly title: string;
  readonly status: KanbanDecompositionStatus;
  readonly kind: KanbanDecompositionKind;
  readonly issueId?: string;
}

export interface KanbanIssueDispatchState {
  readonly readiness: KanbanDispatchReadiness;
  readonly blockedReasons: readonly string[];
  readonly runIds: readonly string[];
  readonly sessionIds: readonly string[];
  readonly lastDispatchedAt?: string;
}

export interface KanbanIssueSource {
  readonly kind: 'seed' | 'file' | 'run-derived';
  readonly path?: string;
  readonly externalId?: string;
}

export interface KanbanIssue {
  readonly id: string;
  readonly projectId: string;
  readonly key: string;
  readonly title: string;
  readonly summary?: string;
  readonly description?: string;
  readonly status: KanbanIssueStatus;
  readonly priority: KanbanPriority;
  readonly labels: readonly KanbanLabel[];
  readonly assignees: readonly KanbanAssignee[];
  readonly dependencies: readonly KanbanIssueDependency[];
  readonly acceptanceCriteria: readonly KanbanAcceptanceCriterion[];
  readonly decomposition: readonly KanbanDecompositionItem[];
  readonly childIssueIds: readonly string[];
  readonly parentIssueId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly dispatch: KanbanIssueDispatchState;
  readonly source?: KanbanIssueSource;
}

export interface KanbanStatusDefinition {
  readonly id: string;
  readonly name: string;
  readonly kind: 'backlog' | 'active' | 'done';
  readonly wipLimit?: number;
}

export interface KanbanProjectMetrics {
  readonly totalIssues: number;
  readonly readyIssues: number;
  readonly blockedIssues: number;
  readonly dispatchedIssues: number;
  readonly completedIssues: number;
  readonly needsDecompositionIssues: number;
  readonly inProgressIssues: number;
}

export interface LinkedRunSummary {
  readonly projectName: string;
  readonly totalRuns: number;
  readonly activeRuns: number;
  readonly completedRuns: number;
  readonly failedRuns: number;
  readonly staleRuns?: number;
  readonly latestUpdate: string;
}

export interface KanbanProject {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly issueIds: readonly string[];
  readonly labels: readonly KanbanLabel[];
  readonly assignees: readonly KanbanAssignee[];
  readonly statuses: readonly KanbanStatusDefinition[];
  readonly linkedRunProjectName?: string;
  readonly linkedRunSummary?: LinkedRunSummary;
  readonly metrics: KanbanProjectMetrics;
}

export interface KanbanBacklogSnapshot {
  readonly generatedAt: string;
  readonly projects: readonly KanbanProject[];
  readonly issues: readonly KanbanIssue[];
}

const DEFAULT_PROJECT_STATUSES: readonly KanbanStatusDefinition[] = [
  { id: 'backlog', name: 'Backlog', kind: 'backlog' },
  { id: 'ready', name: 'Ready', kind: 'backlog' },
  { id: 'in-progress', name: 'In Progress', kind: 'active', wipLimit: 3 },
  { id: 'review', name: 'Review', kind: 'active', wipLimit: 3 },
  { id: 'done', name: 'Done', kind: 'done' },
];

function uniqueById<T extends { readonly id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const normalized: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    normalized.push(item);
  }
  return normalized;
}

function resolveReadiness(
  issue: Omit<KanbanIssue, 'dispatch'> & { readonly dispatch?: Partial<KanbanIssueDispatchState> },
  issuesById: ReadonlyMap<string, KanbanIssue>,
): KanbanDispatchReadiness {
  if (issue.status === 'done') return 'completed';
  if ((issue.dispatch?.runIds?.length ?? 0) > 0 || (issue.dispatch?.sessionIds?.length ?? 0) > 0) {
    return 'dispatched';
  }
  if (issue.status === 'blocked') return 'blocked';

  const unresolvedDependencies = issue.dependencies.some((dependency) => {
    if (dependency.type !== 'blocked-by') return false;
    return issuesById.get(dependency.issueId)?.status !== 'done';
  });
  if (unresolvedDependencies) return 'blocked';

  const unresolvedChildren = issue.childIssueIds.some((childIssueId) => {
    return issuesById.get(childIssueId)?.status !== 'done';
  });
  if (unresolvedChildren) return 'needs-decomposition';

  const incompleteDecomposition = issue.decomposition.some(
    (item) => item.status !== 'done' && !item.issueId,
  );
  if (incompleteDecomposition) return 'needs-decomposition';

  return 'ready';
}

function resolveBlockedReasons(
  issue: Omit<KanbanIssue, 'dispatch'> & { readonly dispatch?: Partial<KanbanIssueDispatchState> },
  issuesById: ReadonlyMap<string, KanbanIssue>,
): string[] {
  const reasons = new Set<string>(issue.dispatch?.blockedReasons ?? []);

  for (const dependency of issue.dependencies) {
    if (dependency.type !== 'blocked-by') continue;
    const dependencyIssue = issuesById.get(dependency.issueId);
    if (!dependencyIssue || dependencyIssue.status !== 'done') {
      reasons.add(`waiting on ${dependency.issueId}`);
    }
  }

  if (issue.childIssueIds.some((childIssueId) => issuesById.get(childIssueId)?.status !== 'done')) {
    reasons.add('child issues still open');
  }

  if (issue.decomposition.some((item) => item.status !== 'done' && !item.issueId)) {
    reasons.add('decomposition incomplete');
  }

  return Array.from(reasons);
}

export function normalizeKanbanIssue(
  issue: Omit<KanbanIssue, 'dispatch'> & { readonly dispatch?: Partial<KanbanIssueDispatchState> },
  issuesById: ReadonlyMap<string, KanbanIssue>,
): KanbanIssue {
  const labels = uniqueById(issue.labels);
  const assignees = uniqueById(issue.assignees);
  const acceptanceCriteria = uniqueById(issue.acceptanceCriteria);
  const decomposition = uniqueById(issue.decomposition);
  const childIssueIds = Array.from(new Set(issue.childIssueIds));
  const readiness = resolveReadiness({ ...issue, childIssueIds, decomposition }, issuesById);
  const blockedReasons = resolveBlockedReasons({ ...issue, childIssueIds, decomposition }, issuesById);

  return {
    ...issue,
    labels,
    assignees,
    acceptanceCriteria,
    decomposition,
    childIssueIds,
    dispatch: {
      readiness,
      blockedReasons,
      runIds: Array.from(new Set(issue.dispatch?.runIds ?? [])),
      sessionIds: Array.from(new Set(issue.dispatch?.sessionIds ?? [])),
      lastDispatchedAt: issue.dispatch?.lastDispatchedAt,
    },
  };
}

export function computeKanbanProjectMetrics(issues: readonly KanbanIssue[]): KanbanProjectMetrics {
  let readyIssues = 0;
  let blockedIssues = 0;
  let dispatchedIssues = 0;
  let completedIssues = 0;
  let needsDecompositionIssues = 0;
  let inProgressIssues = 0;

  for (const issue of issues) {
    if (issue.status === 'in-progress' || issue.status === 'review') {
      inProgressIssues += 1;
    }
    switch (issue.dispatch.readiness) {
      case 'ready':
        readyIssues += 1;
        break;
      case 'blocked':
        blockedIssues += 1;
        break;
      case 'dispatched':
        dispatchedIssues += 1;
        break;
      case 'completed':
        completedIssues += 1;
        break;
      case 'needs-decomposition':
        needsDecompositionIssues += 1;
        break;
    }
  }

  return {
    totalIssues: issues.length,
    readyIssues,
    blockedIssues,
    dispatchedIssues,
    completedIssues,
    needsDecompositionIssues,
    inProgressIssues,
  };
}

export function buildKanbanBacklogSnapshot(input: {
  readonly generatedAt?: string;
  readonly projects: readonly Omit<KanbanProject, 'metrics'>[];
  readonly issues: readonly (Omit<KanbanIssue, 'dispatch'> & {
    readonly dispatch?: Partial<KanbanIssueDispatchState>;
  })[];
}): KanbanBacklogSnapshot {
  const issueSeedMap = new Map<string, KanbanIssue>();
  for (const issue of input.issues) {
    issueSeedMap.set(issue.id, {
      ...issue,
      dispatch: {
        readiness: 'ready',
        blockedReasons: [],
        runIds: [],
        sessionIds: [],
      },
    });
  }

  const normalizedIssues = input.issues.map((issue) => normalizeKanbanIssue(issue, issueSeedMap));
  const normalizedIssueMap = new Map(normalizedIssues.map((issue) => [issue.id, issue]));

  const projects = input.projects.map((project) => {
    const statuses = project.statuses.length > 0 ? project.statuses : DEFAULT_PROJECT_STATUSES;
    const issueIds = Array.from(
      new Set([
        ...project.issueIds,
        ...normalizedIssues
          .filter((issue) => issue.projectId === project.id)
          .map((issue) => issue.id),
      ]),
    );
    const projectIssues = issueIds
      .map((issueId) => normalizedIssueMap.get(issueId))
      .filter((issue): issue is KanbanIssue => Boolean(issue));

    return {
      ...project,
      labels: uniqueById(project.labels),
      assignees: uniqueById(project.assignees),
      statuses,
      issueIds,
      metrics: computeKanbanProjectMetrics(projectIssues),
    };
  });

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    projects,
    issues: normalizedIssues,
  };
}
