import test from 'node:test';
import assert from 'node:assert/strict';
import * as sdk from '../src/index.js';

test('SDK exports createKrateApiController', () => {
  assert.equal(typeof sdk.createKrateApiController, 'function');
});

test('SDK exports KRATE_API_CONTROLLER_BOUNDARY', () => {
  assert.ok(sdk.KRATE_API_CONTROLLER_BOUNDARY);
  assert.equal(sdk.KRATE_API_CONTROLLER_BOUNDARY.role, 'krate-api-controller');
});

test('SDK exports fetchControllerUiModel', () => {
  assert.equal(typeof sdk.fetchControllerUiModel, 'function');
});

test('SDK exports clearSnapshotCache', () => {
  assert.equal(typeof sdk.clearSnapshotCache, 'function');
});

test('SDK exports createControllerUiModel', () => {
  assert.equal(typeof sdk.createControllerUiModel, 'function');
});

test('SDK exports auth functions', () => {
  assert.equal(typeof sdk.createAuthProviderConfig, 'function');
  assert.equal(typeof sdk.listEnabledAuthProviders, 'function');
  assert.equal(typeof sdk.buildAuthorizationRedirect, 'function');
  assert.equal(typeof sdk.exchangeOAuthCodeForProfile, 'function');
  assert.equal(typeof sdk.parseSessionCookie, 'function');
  assert.equal(typeof sdk.createSessionCookie, 'function');
  assert.equal(typeof sdk.registerLoginProfile, 'function');
  assert.equal(typeof sdk.mapLoginProfileToKrateIdentity, 'function');
  assert.equal(typeof sdk.profileFromDelegatedHeaders, 'function');
  assert.equal(typeof sdk.createInviteResource, 'function');
  assert.equal(typeof sdk.createTeamResource, 'function');
});

test('SDK exports mapOidcIdentity', () => {
  assert.equal(typeof sdk.mapOidcIdentity, 'function');
});

test('SDK exports resource model', () => {
  assert.equal(typeof sdk.createResource, 'function');
  assert.ok(sdk.CONFIG_KINDS instanceof Set);
  assert.ok(sdk.AGGREGATED_KINDS instanceof Set);
  assert.equal(typeof sdk.clone, 'function');
  assert.equal(typeof sdk.resourceToYaml, 'function');
});

test('SDK exports findResourceDefinition', () => {
  assert.equal(typeof sdk.findResourceDefinition, 'function');
});

test('SDK exports orgNamespaceName', () => {
  assert.equal(sdk.orgNamespaceName('my-org'), 'krate-org-my-org');
});

test('SDK exports normalizeOrgSlug', () => {
  assert.equal(typeof sdk.normalizeOrgSlug, 'function');
});

test('createResource creates valid resource', () => {
  const r = sdk.createResource('Repository', { name: 'test', namespace: 'ns' }, { organizationRef: 'org', visibility: 'internal' });
  assert.equal(r.kind, 'Repository');
  assert.equal(r.metadata.name, 'test');
  assert.equal(r.metadata.namespace, 'ns');
  assert.equal(r.spec.organizationRef, 'org');
});
