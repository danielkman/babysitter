import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentWorkspaceController, createResource } from '../src/index.js';

function makeWorkspace(name, repository, ownership, phase = 'Active', extra = {}) {
  const workspace = createResource('AgentWorkspace', { name, namespace: 'krate-org-default' }, {
    organizationRef: 'default',
    repository,
    workspacePath: `/workspaces/${repository}/main-${Date.now()}`,
    ownership,
    ...extra
  });
  workspace.status = { phase, createdAt: new Date().toISOString(), boundSessions: [], ...extra.status };
  return workspace;
}

function makeRuntime(name, workspaceRef, status = 'provisioning') {
  const runtime = createResource('AgentWorkspaceRuntime', { name, namespace: 'krate-org-default' }, {
    organizationRef: 'default',
    workspaceRef,
    status
  });
  runtime.status = { phase: 'Provisioning', createdAt: new Date().toISOString() };
  return runtime;
}

test('provisionWorkspace creates AgentWorkspace + AgentWorkspaceRuntime', () => {
  const controller = createAgentWorkspaceController();
  const result = controller.provisionWorkspace({
    repository: 'my-repo',
    ref: 'abc123',
    branch: 'feature-1',
    dispatchRun: 'run-1',
    namespace: 'krate-org-default',
    organizationRef: 'default'
  });

  assert.equal(result.error, false, 'Should succeed');
  assert.ok(result.workspace, 'Should return a workspace resource');
  assert.equal(result.workspace.kind, 'AgentWorkspace');
  assert.equal(result.workspace.spec.repository, 'my-repo');
  assert.equal(result.workspace.spec.ownership, 'run-1');
  assert.ok(result.workspace.spec.workspacePath.includes('my-repo'), 'workspacePath should contain repository');
  assert.ok(result.workspace.spec.workspacePath.includes('feature-1'), 'workspacePath should contain branch');
  assert.equal(result.workspace.status.phase, 'Active');
  assert.ok(Array.isArray(result.workspace.status.boundSessions), 'boundSessions should be an array');

  assert.ok(result.runtime, 'Should return a runtime resource');
  assert.equal(result.runtime.kind, 'AgentWorkspaceRuntime');
  assert.equal(result.runtime.spec.workspaceRef, result.workspace.metadata.name);
  assert.equal(result.runtime.spec.status, 'provisioning');
  assert.equal(result.runtime.status.phase, 'Provisioning');
});

test('archiveWorkspace sets phase=Archived', () => {
  const controller = createAgentWorkspaceController();
  const existing = makeWorkspace('ws-1', 'my-repo', 'run-1', 'Active');
  const result = controller.archiveWorkspace({
    workspaceName: 'ws-1',
    reason: 'Run completed',
    resources: { AgentWorkspace: [existing] }
  });

  assert.equal(result.error, false, 'Should succeed');
  assert.equal(result.workspace.status.phase, 'Archived');
  assert.ok(result.workspace.status.archivedAt, 'Should have archivedAt timestamp');
  assert.equal(result.workspace.status.archiveReason, 'Run completed');
});

test('recoverWorkspace sets phase=Active', () => {
  const controller = createAgentWorkspaceController();
  const archived = makeWorkspace('ws-2', 'my-repo', 'run-1', 'Archived', {
    status: { archivedAt: new Date().toISOString(), archiveReason: 'Cleanup' }
  });
  const result = controller.recoverWorkspace({
    workspaceName: 'ws-2',
    resources: { AgentWorkspace: [archived] }
  });

  assert.equal(result.error, false, 'Should succeed');
  assert.equal(result.workspace.status.phase, 'Active');
  assert.equal(result.workspace.status.archivedAt, undefined, 'archivedAt should be cleared');
  assert.equal(result.workspace.status.archiveReason, undefined, 'archiveReason should be cleared');
});

test('bindSession adds session to boundSessions', () => {
  const controller = createAgentWorkspaceController();
  const existing = makeWorkspace('ws-3', 'my-repo', 'run-2', 'Active');
  const result = controller.bindSession({
    workspaceName: 'ws-3',
    sessionRef: 'session-1',
    agent: 'code-agent',
    namespace: 'krate-org-default',
    organizationRef: 'default',
    resources: { AgentWorkspace: [existing] }
  });

  assert.equal(result.error, false, 'Should succeed');
  assert.ok(result.workspace, 'Should return updated workspace');
  assert.equal(result.workspace.status.boundSessions.length, 1, 'Should have one bound session');
  assert.equal(result.workspace.status.boundSessions[0].sessionRef, 'session-1');
  assert.equal(result.workspace.status.boundSessions[0].agent, 'code-agent');
  assert.ok(result.workspace.status.boundSessions[0].boundAt, 'Should have boundAt timestamp');
});

test('linkWorkItem creates WorkItemWorkspaceLink', () => {
  const controller = createAgentWorkspaceController();
  const result = controller.linkWorkItem({
    workspaceName: 'ws-4',
    workItemRef: 'issue-42',
    workItemKind: 'Issue',
    namespace: 'krate-org-default',
    organizationRef: 'default'
  });

  assert.equal(result.error, false, 'Should succeed');
  assert.ok(result.link, 'Should return a link resource');
  assert.equal(result.link.kind, 'WorkItemWorkspaceLink');
  assert.equal(result.link.spec.workItemRef, 'issue-42');
  assert.equal(result.link.spec.workItemKind, 'Issue');
  assert.equal(result.link.spec.workspace, 'ws-4');
  assert.equal(result.link.spec.organizationRef, 'default');
});

test('linkWorkItemToSession creates WorkItemSessionLink', () => {
  const controller = createAgentWorkspaceController();
  const result = controller.linkWorkItemToSession({
    workItemRef: 'pr-10',
    workItemKind: 'PullRequest',
    sessionRef: 'session-5',
    namespace: 'krate-org-default',
    organizationRef: 'default'
  });

  assert.equal(result.error, false, 'Should succeed');
  assert.ok(result.link, 'Should return a link resource');
  assert.equal(result.link.kind, 'WorkItemSessionLink');
  assert.equal(result.link.spec.workItemRef, 'pr-10');
  assert.equal(result.link.spec.workItemKind, 'PullRequest');
  assert.equal(result.link.spec.agentSession, 'session-5');
  assert.equal(result.link.spec.organizationRef, 'default');
});

test('getWorkspaceStatus returns full bindings', () => {
  const controller = createAgentWorkspaceController();
  const ws = makeWorkspace('ws-5', 'my-repo', 'run-3', 'Active', {
    status: { boundSessions: [{ sessionRef: 'session-10', boundAt: new Date().toISOString() }] }
  });
  const rt = makeRuntime('rt-ws-5', 'ws-5', 'provisioning');
  const link = createResource('WorkItemWorkspaceLink', { name: 'link-1', namespace: 'krate-org-default' }, {
    organizationRef: 'default',
    workItemRef: 'issue-99',
    workspace: 'ws-5'
  });

  const result = controller.getWorkspaceStatus({
    workspaceName: 'ws-5',
    resources: {
      AgentWorkspace: [ws],
      AgentWorkspaceRuntime: [rt],
      AgentSession: [],
      WorkItemWorkspaceLink: [link]
    }
  });

  assert.equal(result.error, false, 'Should succeed');
  assert.ok(result.workspace, 'Should return workspace');
  assert.equal(result.workspace.metadata.name, 'ws-5');
  assert.ok(result.runtime, 'Should return runtime');
  assert.equal(result.runtime.spec.workspaceRef, 'ws-5');
  assert.equal(result.sessions.length, 1, 'Should return bound sessions');
  assert.equal(result.workItems.length, 1, 'Should return linked work items');
  assert.equal(result.workItems[0].spec.workItemRef, 'issue-99');
});

test('listWorkspacesForRepo filters by repository', () => {
  const controller = createAgentWorkspaceController();
  const ws1 = makeWorkspace('ws-a', 'repo-alpha', 'run-a');
  const ws2 = makeWorkspace('ws-b', 'repo-beta', 'run-b');
  const ws3 = makeWorkspace('ws-c', 'repo-alpha', 'run-c');

  const result = controller.listWorkspacesForRepo({
    repository: 'repo-alpha',
    resources: { AgentWorkspace: [ws1, ws2, ws3] }
  });

  assert.equal(result.length, 2, 'Should return workspaces for repo-alpha only');
  assert.ok(result.every((w) => w.spec.repository === 'repo-alpha'), 'All should belong to repo-alpha');
});

test('archiveWorkspace on nonexistent returns error', () => {
  const controller = createAgentWorkspaceController();
  const result = controller.archiveWorkspace({
    workspaceName: 'ws-nonexistent',
    reason: 'Cleanup',
    resources: { AgentWorkspace: [] }
  });

  assert.equal(result.error, true, 'Should fail');
  assert.equal(result.reason, 'not-found');
  assert.ok(result.message.includes('ws-nonexistent'), 'Message should mention the workspace name');
});

test('recoverWorkspace on non-archived returns error', () => {
  const controller = createAgentWorkspaceController();
  const active = makeWorkspace('ws-active', 'my-repo', 'run-x', 'Active');
  const result = controller.recoverWorkspace({
    workspaceName: 'ws-active',
    resources: { AgentWorkspace: [active] }
  });

  assert.equal(result.error, true, 'Should fail');
  assert.equal(result.reason, 'not-archived');
  assert.ok(result.message.includes('not archived'), 'Message should indicate not archived');
});
