import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveRunStatus,
  reconcileRunStatus,
  createAgentRunStatusReconciler,
  createControllerUiModel,
  createResource,
} from '../src/index.js';

describe('deriveRunStatus', () => {
  it('maps each lifecycle phase to the right board column + progress', () => {
    assert.deepEqual(deriveRunStatus({}, { phase: 'Pending' }), {
      phase: 'Pending', boardColumn: 'backlog', progress: 0,
    });
    assert.deepEqual(deriveRunStatus({}, { phase: 'Running' }), {
      phase: 'Running', boardColumn: 'do', progress: 0.5,
    });
    assert.deepEqual(deriveRunStatus({}, { phase: 'AwaitingApproval' }), {
      phase: 'AwaitingApproval', boardColumn: 'human-review', progress: 0.5,
    });
    assert.deepEqual(deriveRunStatus({}, { phase: 'Completed' }), {
      phase: 'Completed', boardColumn: 'approved', progress: 1,
    });
  });

  it('canonicalizes lowercase + synonym phases', () => {
    assert.equal(deriveRunStatus({}, { phase: 'queued' }).boardColumn, 'backlog');
    assert.equal(deriveRunStatus({}, { phase: 'waiting-for-approval' }).phase, 'AwaitingApproval');
    assert.equal(deriveRunStatus({}, { phase: 'succeeded' }).phase, 'Completed');
    assert.equal(deriveRunStatus({}, { phase: 'failed' }).boardColumn, 'backlog');
  });

  it('derives phase from terminal events when status.phase is absent', () => {
    assert.equal(deriveRunStatus({}, {}, [{ type: 'started' }]).phase, 'Running');
    assert.equal(
      deriveRunStatus({}, {}, [{ type: 'started' }, { type: 'completion' }]).phase,
      'Completed',
    );
    assert.equal(deriveRunStatus({}, {}, [{ type: 'approval-required' }]).phase, 'AwaitingApproval');
  });

  it('defaults to Pending/backlog with no signals', () => {
    assert.deepEqual(deriveRunStatus({}, {}, []), {
      phase: 'Pending', boardColumn: 'backlog', progress: 0,
    });
  });
});

describe('reconcileRunStatus', () => {
  it('fills board fields without overwriting an existing phase (idempotent)', () => {
    const run = createResource('AgentDispatchRun', { name: 'r', namespace: 'kradle-org-x' }, {
      organizationRef: 'x', repository: 'repo', agentStack: 'stack', taskKind: 'diagnostic',
    });
    run.status = { phase: 'Running' };
    reconcileRunStatus(run);
    assert.equal(run.status.phase, 'Running');
    assert.equal(run.status.boardColumn, 'do');
    assert.equal(run.status.progress, 0.5);
    // Idempotent.
    const before = JSON.stringify(run.status);
    reconcileRunStatus(run);
    assert.equal(JSON.stringify(run.status), before);
  });

  it('honors explicit spec.boardColumn / spec.progress overrides', () => {
    const run = createResource('AgentDispatchRun', { name: 'r', namespace: 'kradle-org-x' }, {
      organizationRef: 'x', repository: 'repo', agentStack: 'stack', taskKind: 'diagnostic',
      boardColumn: 'merged', progress: 0.9,
    });
    run.status = { phase: 'Running' };
    reconcileRunStatus(run);
    assert.equal(run.status.boardColumn, 'merged');
    assert.equal(run.status.progress, 0.9);
  });

  it('controller reconciles every run in a resources map', () => {
    const mk = (name, phase) => {
      const r = createResource('AgentDispatchRun', { name, namespace: 'kradle-org-x' }, {
        organizationRef: 'x', repository: 'repo', agentStack: 'stack', taskKind: 'diagnostic',
      });
      r.status = { phase };
      return r;
    };
    const reconciler = createAgentRunStatusReconciler();
    const runs = reconciler.reconcile({
      AgentDispatchRun: [mk('a', 'Pending'), mk('b', 'AwaitingApproval'), mk('c', 'Completed')],
    });
    assert.deepEqual(runs.map((r) => r.status.boardColumn), ['backlog', 'human-review', 'approved']);
  });
});

describe('controller-ui surfaces reconciled board fields', () => {
  it('populates status.boardColumn on AgentDispatchRun items', () => {
    const run = createResource('AgentDispatchRun', { name: 'verify-run-running', namespace: 'kradle-org-commander-verify' }, {
      organizationRef: 'commander-verify', repository: 'babysitter', agentStack: 'stack', taskKind: 'diagnostic',
    });
    run.status = { phase: 'Running' };
    const model = createControllerUiModel({
      source: 'kubernetes',
      namespace: 'kradle-system',
      kubectl: { available: true, context: 'test', errors: [] },
      resources: { AgentDispatchRun: [run] },
      crds: [], events: [], permissions: [], storage: {}, commands: [],
    }, { organization: 'commander-verify' });
    const item = model.agents.runs.items.find((r) => r.metadata.name === 'verify-run-running');
    assert.ok(item, 'run is surfaced for the requested org');
    assert.equal(item.status.boardColumn, 'do');
    assert.equal(item.status.progress, 0.5);
  });
});
