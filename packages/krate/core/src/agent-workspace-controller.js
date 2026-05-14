import { createResource, clone } from './resource-model.js';

export const AGENT_WORKSPACE_CONTROLLER_BOUNDARY = {
  role: 'agent-workspace-controller',
  scope: 'Git worktree provisioning, lifecycle management, session/work-item linking',
  owns: ['workspace creation', 'worktree lifecycle', 'session binding', 'work-item linking'],
  delegatesTo: ['resource-model'],
  mustNotOwn: ['git operations', 'Agent Mux sessions', 'secret values']
};

export function createAgentWorkspaceController() {
  return {
    role: 'agent-workspace-controller',

    provisionWorkspace({ repository, ref, branch, dispatchRun, policy, namespace = 'default', organizationRef = 'default' }) {
      if (!repository) {
        return { error: true, reason: 'missing-repository', message: 'repository is required' };
      }
      if (!dispatchRun) {
        return { error: true, reason: 'missing-dispatch-run', message: 'dispatchRun is required' };
      }

      const branchName = branch || 'main';
      const workspacePath = `/workspaces/${repository}/${branchName}-${Date.now()}`;
      const workspaceName = `ws-${repository}-${branchName}-${Date.now()}`;

      const workspace = createResource('KrateWorkspace', { name: workspaceName, namespace }, {
        organizationRef,
        repository,
        workspacePath,
        ownership: dispatchRun,
        ref: ref || undefined,
        branch: branchName,
        policy: policy || undefined
      });
      workspace.status = { phase: 'Active', createdAt: new Date().toISOString(), boundSessions: [] };

      const runtimeName = `rt-${workspaceName}`;
      const runtime = createResource('KrateWorkspaceRuntime', { name: runtimeName, namespace }, {
        organizationRef,
        workspaceRef: workspaceName,
        status: 'provisioning'
      });
      runtime.status = { phase: 'Provisioning', createdAt: new Date().toISOString() };

      return { error: false, workspace, runtime };
    },

    archiveWorkspace({ workspaceName, reason, resources = {} }) {
      if (!workspaceName) {
        return { error: true, reason: 'missing-workspace-name', message: 'workspaceName is required' };
      }

      const workspaces = resources.KrateWorkspace || [];
      const workspace = workspaces.find((w) => w.metadata?.name === workspaceName);
      if (!workspace) {
        return { error: true, reason: 'not-found', message: `KrateWorkspace not found: ${workspaceName}` };
      }

      const now = new Date().toISOString();
      const updated = clone(workspace);
      updated.status = {
        ...updated.status,
        phase: 'Archived',
        archivedAt: now,
        archiveReason: reason || 'No reason provided'
      };

      return { error: false, workspace: updated };
    },

    recoverWorkspace({ workspaceName, resources = {} }) {
      if (!workspaceName) {
        return { error: true, reason: 'missing-workspace-name', message: 'workspaceName is required' };
      }

      const workspaces = resources.KrateWorkspace || [];
      const workspace = workspaces.find((w) => w.metadata?.name === workspaceName);
      if (!workspace) {
        return { error: true, reason: 'not-found', message: `KrateWorkspace not found: ${workspaceName}` };
      }

      if (workspace.status?.phase !== 'Archived') {
        return { error: true, reason: 'not-archived', message: `KrateWorkspace ${workspaceName} is not archived (current phase: ${workspace.status?.phase || 'Unknown'})` };
      }

      const updated = clone(workspace);
      updated.status = {
        ...updated.status,
        phase: 'Active',
        archivedAt: undefined,
        archiveReason: undefined
      };

      return { error: false, workspace: updated };
    },

    bindSession({ workspaceName, sessionRef, agent, namespace = 'default', organizationRef = 'default', resources = {} }) {
      if (!workspaceName) {
        return { error: true, reason: 'missing-workspace-name', message: 'workspaceName is required' };
      }
      if (!sessionRef) {
        return { error: true, reason: 'missing-session-ref', message: 'sessionRef is required' };
      }

      const workspaces = resources.KrateWorkspace || [];
      const workspace = workspaces.find((w) => w.metadata?.name === workspaceName);
      if (!workspace) {
        return { error: true, reason: 'not-found', message: `KrateWorkspace not found: ${workspaceName}` };
      }

      const updated = clone(workspace);
      if (!updated.status) updated.status = {};
      if (!Array.isArray(updated.status.boundSessions)) updated.status.boundSessions = [];
      updated.status.boundSessions.push({
        sessionRef,
        agent: agent || undefined,
        boundAt: new Date().toISOString()
      });

      return { error: false, workspace: updated };
    },

    linkWorkItem({ workspaceName, workItemRef, workItemKind, namespace = 'default', organizationRef = 'default' }) {
      if (!workspaceName) {
        return { error: true, reason: 'missing-workspace-name', message: 'workspaceName is required' };
      }
      if (!workItemRef) {
        return { error: true, reason: 'missing-work-item-ref', message: 'workItemRef is required' };
      }

      const linkName = `wiwl-${workspaceName}-${workItemRef}-${Date.now()}`;
      const link = createResource('WorkItemWorkspaceLink', { name: linkName, namespace }, {
        organizationRef,
        workItemRef,
        workItemKind: workItemKind || 'Issue',
        workspace: workspaceName
      });
      link.status = { phase: 'Active', createdAt: new Date().toISOString() };

      return { error: false, link };
    },

    linkWorkItemToSession({ workItemRef, workItemKind, sessionRef, namespace = 'default', organizationRef = 'default' }) {
      if (!workItemRef) {
        return { error: true, reason: 'missing-work-item-ref', message: 'workItemRef is required' };
      }
      if (!sessionRef) {
        return { error: true, reason: 'missing-session-ref', message: 'sessionRef is required' };
      }

      const linkName = `wisl-${sessionRef}-${workItemRef}-${Date.now()}`;
      const link = createResource('WorkItemSessionLink', { name: linkName, namespace }, {
        organizationRef,
        workItemRef,
        workItemKind: workItemKind || 'Issue',
        agentSession: sessionRef
      });
      link.status = { phase: 'Active', createdAt: new Date().toISOString() };

      return { error: false, link };
    },

    getWorkspaceStatus({ workspaceName, resources = {} }) {
      if (!workspaceName) {
        return { error: true, reason: 'missing-workspace-name', message: 'workspaceName is required' };
      }

      const workspaces = resources.KrateWorkspace || [];
      const workspace = workspaces.find((w) => w.metadata?.name === workspaceName);
      if (!workspace) {
        return { error: true, reason: 'not-found', message: `KrateWorkspace not found: ${workspaceName}` };
      }

      const runtimes = resources.KrateWorkspaceRuntime || [];
      const runtime = runtimes.find((r) => r.spec?.workspaceRef === workspaceName) || null;

      const sessions = (workspace.status?.boundSessions || []).map((binding) => {
        const allSessions = resources.AgentSession || [];
        const session = allSessions.find((s) => s.metadata?.name === binding.sessionRef);
        return session ? clone(session) : { ref: binding.sessionRef, boundAt: binding.boundAt };
      });

      const workspaceLinks = (resources.WorkItemWorkspaceLink || []).filter(
        (link) => link.spec?.workspace === workspaceName
      );
      const workItems = workspaceLinks.map(clone);

      return {
        error: false,
        workspace: clone(workspace),
        runtime: runtime ? clone(runtime) : null,
        sessions,
        workItems
      };
    },

    listWorkspacesForRepo({ repository, resources = {} }) {
      const workspaces = resources.KrateWorkspace || [];
      return workspaces.filter((w) => w.spec?.repository === repository).map(clone);
    },

    listWorkspacesForRun({ dispatchRun, resources = {} }) {
      const workspaces = resources.KrateWorkspace || [];
      return workspaces.filter((w) => w.spec?.ownership === dispatchRun).map(clone);
    }
  };
}
