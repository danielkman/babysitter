/**
 * Dynamic adapter resolution.
 *
 * Attempts to load a harness adapter package by convention:
 *   @a5c-ai/hooks-proxy-adapter-<name>
 *
 * Each adapter package is expected to export:
 *   - createAdapter(): AdapterCapabilities
 *   - phase mappings (e.g. CLAUDE_PHASE_MAPPINGS / equivalent)
 *   - normalizer function
 *   - renderer function
 *   - session resolver
 */

import type { AdapterCapabilities, PhaseMapping } from '@a5c-ai/hooks-proxy-core';
import { detectHarness } from '@a5c-ai/hooks-proxy-core';

export interface LoadedAdapter {
  capabilities: AdapterCapabilities;
  phaseMappings: PhaseMapping[];
  /** Raw module exports for adapter-specific functions. */
  module: Record<string, unknown>;
}

/**
 * Attempt to load an adapter package by name.
 *
 * @param adapterName - Short adapter name (e.g. 'claude', 'codex', 'copilot').
 * @returns The loaded adapter with capabilities, phase mappings, and raw module.
 * @throws If the adapter package cannot be found or loaded.
 */
export function loadAdapter(adapterName: string): LoadedAdapter {
  // Auto-detection: probe env vars to determine the adapter
  if (adapterName === 'auto') {
    const detected = detectHarness();
    if (!detected) {
      process.stderr.write(
        '[hooks-proxy] auto-detection failed: no harness signals found in environment\n',
      );
      process.exit(1);
    }
    process.stderr.write(
      `[hooks-proxy] auto-detected adapter="${detected.adapter}" ` +
      `confidence=${detected.confidence} evidence=[${detected.evidence.join(', ')}]\n`,
    );
    adapterName = detected.adapter;
  }

  const packageName = `@a5c-ai/hooks-proxy-adapter-${adapterName}`;

  let mod: Record<string, unknown>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require(packageName) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `Failed to load adapter "${adapterName}" (package: ${packageName}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // Extract createAdapter function
  const createAdapterFn = mod['createAdapter'];
  if (typeof createAdapterFn !== 'function') {
    throw new Error(
      `Adapter package "${packageName}" does not export a createAdapter function`,
    );
  }

  const capabilities = createAdapterFn() as AdapterCapabilities;

  // Extract phase mappings -- convention: <ADAPTER>_PHASE_MAPPINGS or phaseMappings
  let phaseMappings: PhaseMapping[] = [];
  for (const key of Object.keys(mod)) {
    if (key.endsWith('_PHASE_MAPPINGS') || key === 'phaseMappings') {
      const candidate = mod[key];
      if (Array.isArray(candidate)) {
        phaseMappings = candidate as PhaseMapping[];
        break;
      }
    }
  }

  return { capabilities, phaseMappings, module: mod };
}

/**
 * List of known adapter names for discovery/doctor purposes.
 */
export const KNOWN_ADAPTERS = [
  'claude',
  'codex',
  'copilot',
  'cursor',
  'gemini',
  'oh-my-pi',
  'openclaw',
  'opencode',
  'pi',
] as const;
