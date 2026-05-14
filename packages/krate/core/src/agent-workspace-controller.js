import { createResource, clone } from './resource-model.js';

export const AGENT_WORKSPACE_CONTROLLER_BOUNDARY = {
  role: 'agent-workspace-controller',
  scope: 'Volume-backed git workspace provisioning with PVC lifecycle, git ops, runner mount, and reuse',
  owns: ['workspace creation', 'PVC manifest generation', 'git command specs', 'mount specs', 'workspace reuse'],
  delegatesTo: ['resource-model'],
  mustNotOwn: ['git execution', 'Kubernetes API calls', 'secret values']
};

export function createAgentWorkspaceController() {
  return {
    role: 'agent-workspace-controller',

    // --- Volume lifecycle ---

    createWorkspace({ name, organizationRef, repository, volumeSpec = {}, branch, namespace = 'default' }) {
      if (!organizationRef) {
        return { error: true, reason: 'missing-org', message: 'organizationRef is required' };
      }
      if (!repository) {
        return { error: true, reason: 'missing-repository', message: 'repository is required' };
      }

      const workspaceName = name || `ws-${repository.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}-${Date.now()}`;
      const pvcName = `krate-ws-${workspaceName}`;
      const storageClassName = volumeSpec.storageClassName || 'standard';
      const capacity = volumeSpec.capacity || '10Gi';
      const accessModes = volumeSpec.accessModes || ['ReadWriteOnce'];

      const workspace = createResource('KrateWorkspace', { name: workspaceName, namespace }, {
        organizationRef,
        repository,
        volumeSpec: {
          storageClassName,
          capacity,
          accessModes,
        },
        branch: branch || 'main',
        pvcName,
      });
      workspace.status = {
        phase: 'Pending',
        volumeStatus: 'Pending',
        createdAt: new Date().toISOString(),
      };

      const pvcManifest = {
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: {
          name: pvcName,
          namespace,
          labels: {
            'krate.a5c.ai/workspace': workspaceName,
            'krate.a5c.ai/org': organizationRef,
          },
        },
        spec: {
          storageClassName,
          accessModes,
          resources: {
            requests: { storage: capacity },
          },
        },
      };

      return { error: false, workspace, pvcManifest };
    },

    deleteWorkspace({ name, namespace = 'default', resources = {} }) {
      if (!name) {
        return { error: true, reason: 'missing-name', message: 'workspace name is required' };
      }

      const workspaces = resources.KrateWorkspace || [];
      const workspace = workspaces.find((w) => w.metadata?.name === name);
      if (!workspace) {
        return { error: true, reason: 'not-found', message: `KrateWorkspace not found: ${name}` };
      }

      const pvcName = workspace.spec?.pvcName || `krate-ws-${name}`;
      const updated = clone(workspace);
      updated.status = {
        ...updated.status,
        phase: 'Terminating',
        terminatingAt: new Date().toISOString(),
      };

      const pvcDeleteManifest = {
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: {
          name: pvcName,
          namespace: workspace.metadata?.namespace || namespace,
        },
        action: 'delete',
      };

      return { error: false, workspace: updated, pvcDeleteManifest };
    },

    getWorkspaceStatus({ name, resources = {} }) {
      if (!name) {
        return { error: true, reason: 'missing-name', message: 'workspace name is required' };
      }

      const workspaces = resources.KrateWorkspace || [];
      const workspace = workspaces.find((w) => w.metadata?.name === name);
      if (!workspace) {
        return { error: true, reason: 'not-found', message: `KrateWorkspace not found: ${name}` };
      }

      return {
        error: false,
        name,
        volumeStatus: workspace.status?.volumeStatus || 'Pending',
        phase: workspace.status?.phase || 'Pending',
        repository: workspace.spec?.repository,
        branch: workspace.spec?.branch,
        runRef: workspace.status?.runRef || null,
        pvcName: workspace.spec?.pvcName,
        capacity: workspace.spec?.volumeSpec?.capacity,
      };
    },

    // --- Git operations (intent-based) ---

    initializeWorkspace({ workspace, mountPath = '/workspace' }) {
      if (!workspace) {
        return { error: true, reason: 'missing-workspace', message: 'workspace resource is required' };
      }

      const repoUrl = workspace.spec?.repository || '';
      const isSsh = repoUrl.startsWith('git@') || repoUrl.includes('ssh://');

      const env = {};
      if (isSsh) {
        env.GIT_SSH_COMMAND = 'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null';
      }

      return {
        error: false,
        commandSpec: {
          command: 'git',
          args: ['clone', repoUrl, mountPath],
          env,
        },
      };
    },

    checkoutBranch({ workspace, branch }) {
      if (!workspace) {
        return { error: true, reason: 'missing-workspace', message: 'workspace resource is required' };
      }
      if (!branch) {
        return { error: true, reason: 'missing-branch', message: 'branch is required' };
      }

      return {
        error: false,
        commandSpec: {
          command: 'git',
          args: ['checkout', branch],
          cwd: '/workspace',
        },
      };
    },

    syncWorkspace({ workspace }) {
      if (!workspace) {
        return { error: true, reason: 'missing-workspace', message: 'workspace resource is required' };
      }

      const branch = workspace.spec?.branch || 'main';

      return {
        error: false,
        commandSpecs: [
          {
            command: 'git',
            args: ['fetch', 'origin'],
            cwd: '/workspace',
          },
          {
            command: 'git',
            args: ['reset', '--hard', `origin/${branch}`],
            cwd: '/workspace',
          },
        ],
      };
    },

    // --- Runner mount spec ---

    getMountSpec({ workspace }) {
      if (!workspace) {
        return { error: true, reason: 'missing-workspace', message: 'workspace resource is required' };
      }

      const pvcName = workspace.spec?.pvcName || `krate-ws-${workspace.metadata?.name}`;

      return {
        error: false,
        volume: {
          name: 'workspace',
          persistentVolumeClaim: { claimName: pvcName },
        },
        volumeMount: {
          name: 'workspace',
          mountPath: '/workspace',
        },
      };
    },

    // --- Workspace reuse ---

    findReusableWorkspace({ organizationRef, repository, branch, resources = {} }) {
      const workspaces = resources.KrateWorkspace || [];
      const match = workspaces.find((w) =>
        w.spec?.organizationRef === organizationRef &&
        w.spec?.repository === repository &&
        (w.spec?.branch || 'main') === (branch || 'main') &&
        w.status?.phase === 'Ready'
      );

      return match ? clone(match) : null;
    },

    claimWorkspace({ name, runRef, resources = {} }) {
      if (!name) {
        return { error: true, reason: 'missing-name', message: 'workspace name is required' };
      }
      if (!runRef) {
        return { error: true, reason: 'missing-run-ref', message: 'runRef is required' };
      }

      const workspaces = resources.KrateWorkspace || [];
      const workspace = workspaces.find((w) => w.metadata?.name === name);
      if (!workspace) {
        return { error: true, reason: 'not-found', message: `KrateWorkspace not found: ${name}` };
      }

      if (workspace.status?.phase === 'InUse') {
        return { error: true, reason: 'already-in-use', message: `KrateWorkspace ${name} is already in use by ${workspace.status.runRef}` };
      }

      const updated = clone(workspace);
      updated.status = {
        ...updated.status,
        phase: 'InUse',
        runRef,
        claimedAt: new Date().toISOString(),
      };

      return { error: false, workspace: updated };
    },

    releaseWorkspace({ name, resources = {} }) {
      if (!name) {
        return { error: true, reason: 'missing-name', message: 'workspace name is required' };
      }

      const workspaces = resources.KrateWorkspace || [];
      const workspace = workspaces.find((w) => w.metadata?.name === name);
      if (!workspace) {
        return { error: true, reason: 'not-found', message: `KrateWorkspace not found: ${name}` };
      }

      if (workspace.status?.phase !== 'InUse') {
        return { error: true, reason: 'not-in-use', message: `KrateWorkspace ${name} is not in use (current phase: ${workspace.status?.phase || 'Unknown'})` };
      }

      const updated = clone(workspace);
      updated.status = {
        ...updated.status,
        phase: 'Ready',
        runRef: undefined,
        claimedAt: undefined,
        releasedAt: new Date().toISOString(),
      };

      return { error: false, workspace: updated };
    },

    // --- Legacy compat helpers ---

    provisionWorkspace({ repository, ref, branch, dispatchRun, policy, namespace = 'default', organizationRef = 'default' }) {
      if (!repository) {
        return { error: true, reason: 'missing-repository', message: 'repository is required' };
      }
      if (!dispatchRun) {
        return { error: true, reason: 'missing-dispatch-run', message: 'dispatchRun is required' };
      }

      const result = this.createWorkspace({
        organizationRef,
        repository,
        branch: branch || 'main',
        namespace,
        volumeSpec: {},
      });

      if (result.error) return result;

      // Mark as InUse with the dispatch run
      result.workspace.status.phase = 'InUse';
      result.workspace.status.runRef = dispatchRun;
      result.workspace.status.volumeStatus = 'Bound';

      const runtimeName = `rt-${result.workspace.metadata.name}`;
      const runtime = createResource('KrateWorkspaceRuntime', { name: runtimeName, namespace }, {
        organizationRef,
        workspaceRef: result.workspace.metadata.name,
        status: 'provisioning'
      });
      runtime.status = { phase: 'Provisioning', createdAt: new Date().toISOString() };

      return { error: false, workspace: result.workspace, runtime, pvcManifest: result.pvcManifest };
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

    listWorkspacesForRepo({ repository, resources = {} }) {
      const workspaces = resources.KrateWorkspace || [];
      return workspaces.filter((w) => w.spec?.repository === repository).map(clone);
    },

    listWorkspacesForRun({ dispatchRun, resources = {} }) {
      const workspaces = resources.KrateWorkspace || [];
      return workspaces.filter((w) => w.status?.runRef === dispatchRun).map(clone);
    }
  };
}
