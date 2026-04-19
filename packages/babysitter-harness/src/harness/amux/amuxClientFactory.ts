/**
 * Factory for obtaining an AmuxClient instance.
 *
 * Uses dynamic import to load @agent-mux/core at runtime. If the package
 * is not installed, the factory returns null and callers should fall back
 * to direct CLI invocation via invoker.ts.
 *
 * @module harness/amux/amuxClientFactory
 */

import type { AmuxClient } from "./amuxTypes";

// ---------------------------------------------------------------------------
// Module specifier (variable to prevent tsc from resolving the optional dep)
// ---------------------------------------------------------------------------

const AMUX_CORE_MODULE = "@agent-mux/core";

// ---------------------------------------------------------------------------
// Cached client singleton
// ---------------------------------------------------------------------------

let cachedClient: AmuxClient | null | undefined;

/**
 * Attempt to create an AmuxClient by dynamically importing @agent-mux/core.
 *
 * Returns null when @agent-mux/core is not installed (optional peer dep).
 * The result is cached after the first successful or failed attempt.
 */
export async function getAmuxClient(): Promise<AmuxClient | null> {
  if (cachedClient !== undefined) return cachedClient;

  try {
    // Dynamic import -- only succeeds if @agent-mux/core is installed.
    // The module specifier is a variable so TypeScript does not attempt
    // static resolution of the optional peer dependency.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const amux = await (Function("specifier", "return import(specifier)")(AMUX_CORE_MODULE) as Promise<Record<string, unknown>>);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const client = new (amux.AgentMuxClient as { new(opts: Record<string, unknown>): unknown })({
      stream: true,
      debug: false,
    });
    cachedClient = client as AmuxClient;
    return cachedClient;
  } catch {
    // @agent-mux/core not installed -- return null
    cachedClient = null;
    return null;
  }
}

/**
 * Check whether agent-mux is available without retaining a reference
 * to the client.
 */
export async function isAmuxAvailable(): Promise<boolean> {
  return (await getAmuxClient()) !== null;
}

/**
 * Reset the cached client. Primarily useful for testing.
 * @internal
 */
export function _resetAmuxClientCache(): void {
  cachedClient = undefined;
}
