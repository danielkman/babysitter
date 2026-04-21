// SDK configuration resolver — extracts SDK package names from manifest.
// No defaults here — the plugin manifest must provide sdk config,
// or the plugin.json parser provides defaults.

import type { A5cPluginManifest } from './types.js';

export interface SdkConfig {
  package: string;
  cli: string;
  proxyPackage: string;
  scope: string;
  envPrefix: string;
  stateDir: string;
}

export function resolveSdkConfig(manifest: A5cPluginManifest): SdkConfig {
  const sdk = manifest.sdk || {};
  const name = manifest.name || 'plugin';
  return {
    package: sdk.package || `${sdk.scope || '@' + name}/${name}-sdk`,
    cli: sdk.cli || name,
    proxyPackage: sdk.proxyPackage || `${sdk.scope || '@' + name}/hooks-proxy-cli`,
    scope: sdk.scope || `@${name}`,
    envPrefix: sdk.envPrefix || name.toUpperCase().replace(/-/g, '_'),
    stateDir: sdk.stateDir || `.${name}`,
  };
}
