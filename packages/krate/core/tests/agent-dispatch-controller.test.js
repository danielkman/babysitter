import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentDispatchController, createAgentMuxClient, createResource } from '../src/index.js';

function makeStack(name, spec = {}) {
  return createResource('AgentStack', { name, namespace: 'krate-org-default' }, {
    organizationRef: 'default',
    baseAgent: 'claude-code',
    adapter: 'anthropic',
    runtimeIdentity: { serviceAccountRef: 'sa-default' },
    ...spec
  });
}

function makeServiceAccount(name) {
  return createResource('AgentServiceAccount', { name, namespace: 'krate-org-default' }, {
    organizationRef: 'default',
    namespace: 'krate-org-default',
    serviceAccountName: name
  });
}

function makeRoleBinding(name, subject) {
  return createResource('AgentRoleBinding', { name, namespace: 'krate-org-default' }, {
    organizationRef: 'default',
    subject,
    roleRef: 'agent-developer',
    scope: 'namespace'
  });
}

function makeSecretGrant(name, subject, purpose) {
  return createResource('AgentSecretGrant', { name, namespace: 'krate-org-default' }, {
    organizationRef: 'default',
    subject,
    secretRef: 'secret-' + purpose,
    purpose
  });
}

function buildValidResources(stackName) {
  return {
    AgentStack: [makeStack(stackName)],
    AgentServiceAccount: [makeServiceAccount('sa-default')],
    AgentRoleBinding: [makeRoleBinding('rb-1', 'sa-default')],
    AgentSecretGrant: [makeSecretGrant('sg-model', 'sa-default', 'model-provider')]
  };
}

test('Successful dispatch with Agent Mux available', async () => {
  const muxClient = createAgentMuxClient({ gateway: 'http://localhost:9090', enabled: true });
  const resources = buildValidResources('dispatch-stack');
  const controller = createAgentDispatchController({ agentMuxClient: muxClient });

  const result = await controller.createManualDispatch({
    repository: 'test-repo',
    ref: 'main',
    agentStack: 'dispatch-stack',
    actor: 'test-user',
    namespace: 'krate-org-default',
    organizationRef: 'default',
    resources
  });

  assert.equal(result.error, false, 'Dispatch should succeed');
  assert.ok(result.run, 'Result should include run resource');
  assert.ok(result.attempt, 'Result should include attempt resource');
  assert.ok(result.contextBundle, 'Result should include contextBundle resource');
  assert.ok(result.permissionSnapshot, 'Result should include permissionSnapshot');
  assert.equal(result.run.kind, 'AgentDispatchRun');
  assert.equal(result.attempt.kind, 'AgentDispatchAttempt');
  assert.equal(result.run.status.phase, 'Running', 'Run phase should be Running when mux is available');
  assert.ok(result.attempt.status.agentMuxRunId, 'Attempt should have agentMuxRunId');
  assert.ok(result.attempt.status.agentMuxSessionId, 'Attempt should have agentMuxSessionId');
  assert.ok(result.attempt.status.startedAt, 'Attempt should have startedAt timestamp');
});

test('Dispatch with Agent Mux unavailable', async () => {
  const muxClient = createAgentMuxClient({ gateway: '', enabled: false });
  const resources = buildValidResources('dispatch-stack');
  const controller = createAgentDispatchController({ agentMuxClient: muxClient });

  const result = await controller.createManualDispatch({
    repository: 'test-repo',
    ref: 'main',
    agentStack: 'dispatch-stack',
    actor: 'test-user',
    namespace: 'krate-org-default',
    organizationRef: 'default',
    resources
  });

  assert.equal(result.error, false, 'Dispatch should still succeed (queued)');
  assert.equal(result.run.status.phase, 'Queued', 'Run phase should be Queued when mux is unavailable');
  assert.ok(result.run.status.conditions, 'Run should have conditions');
  const muxCondition = result.run.status.conditions.find(c => c.type === 'AgentMuxBound');
  assert.ok(muxCondition, 'Should have AgentMuxBound condition');
  assert.equal(muxCondition.status, 'False', 'AgentMuxBound should be False');
  assert.equal(muxCondition.reason, 'Unavailable');
});

test('Dispatch denied by permission review', async () => {
  const resources = {
    AgentStack: [makeStack('denied-stack', { runtimeIdentity: { serviceAccountRef: 'sa-missing' } })],
    // No service account, no role binding, no secret grant — permission review will deny
  };
  const controller = createAgentDispatchController();

  const result = await controller.createManualDispatch({
    repository: 'test-repo',
    ref: 'main',
    agentStack: 'denied-stack',
    actor: 'test-user',
    namespace: 'krate-org-default',
    organizationRef: 'default',
    resources
  });

  assert.equal(result.error, true, 'Dispatch should be denied');
  assert.equal(result.reason, 'permission-denied', 'Reason should be permission-denied');
  assert.ok(result.review, 'Result should include the review details');
  assert.equal(result.review.decision, 'denied');
});

test('Stack not found', async () => {
  const resources = buildValidResources('existing-stack');
  const controller = createAgentDispatchController();

  const result = await controller.createManualDispatch({
    repository: 'test-repo',
    ref: 'main',
    agentStack: 'nonexistent-stack',
    actor: 'test-user',
    namespace: 'krate-org-default',
    organizationRef: 'default',
    resources
  });

  assert.equal(result.error, true, 'Dispatch should fail');
  assert.equal(result.reason, 'stack-not-found', 'Reason should be stack-not-found');
  assert.ok(result.message.includes('nonexistent-stack'), 'Message should name the missing stack');
});

test('Context bundle referenced correctly', async () => {
  const muxClient = createAgentMuxClient({ gateway: '', enabled: false });
  const resources = buildValidResources('ref-stack');
  const controller = createAgentDispatchController({ agentMuxClient: muxClient });

  const result = await controller.createManualDispatch({
    repository: 'test-repo',
    ref: 'main',
    agentStack: 'ref-stack',
    actor: 'test-user',
    namespace: 'krate-org-default',
    organizationRef: 'default',
    resources
  });

  assert.equal(result.error, false, 'Dispatch should succeed');
  assert.ok(result.contextBundle.spec.digest, 'Context bundle should have a digest');
  assert.equal(
    result.attempt.spec.contextBundleDigest,
    result.contextBundle.spec.digest,
    'Attempt contextBundleDigest should match context bundle digest'
  );
  assert.equal(
    result.run.spec.contextBundleRef,
    result.contextBundle.metadata.name,
    'Run contextBundleRef should match context bundle name'
  );
});
