/**
 * Factory for obtaining an AmuxClient instance.
 *
 * @agent-mux/core is a direct dependency — always available.
 */

import type { AmuxClient } from "./amuxTypes";

let cachedClient: AmuxClient | null = null;

/**
 * Get or create the singleton AmuxClient.
 */
export async function getAmuxClient(): Promise<AmuxClient> {
  if (cachedClient) return cachedClient;

  // Direct import — @a5c-ai/agent-mux is a real dependency
  const { createClient } = await import("@a5c-ai/agent-mux");
  const client = createClient({
    stream: true,
    debug: false,
  });
  cachedClient = client as unknown as AmuxClient;
  return cachedClient;
}

/**
 * Check whether agent-mux client can be created.
 */
export async function isAmuxAvailable(): Promise<boolean> {
  try {
    await getAmuxClient();
    return true;
  } catch {
    return false;
  }
}

/**
 * Reset the cached client. For testing.
 * @internal
 */
export function _resetAmuxClientCache(): void {
  cachedClient = null;
}
