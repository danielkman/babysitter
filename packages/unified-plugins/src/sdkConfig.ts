// SDK configuration resolver — extracts SDK package names from manifest
// with defaults for the babysitter SDK ecosystem

import type { A5cPluginManifest } from './types.js';

export interface SdkConfig {
  package: string;
  cli: string;
  proxyPackage: string;
  scope: string;
}

const DEFAULTS: SdkConfig = {
  package: '@a5c-ai/babysitter-sdk',
  cli: 'babysitter',
  proxyPackage: '@a5c-ai/hooks-proxy-cli',
  scope: '@a5c-ai',
};

export function resolveSdkConfig(manifest: A5cPluginManifest): SdkConfig {
  const sdk = manifest.sdk || {};
  return {
    package: sdk.package || DEFAULTS.package,
    cli: sdk.cli || DEFAULTS.cli,
    proxyPackage: sdk.proxyPackage || DEFAULTS.proxyPackage,
    scope: sdk.scope || DEFAULTS.scope,
  };
}
