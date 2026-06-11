/**
 * MockBackend implementing `CommanderBackend` over the in-memory deterministic
 * kanban simulation (SPEC §7 as amended by SPEC-V3). v2 swaps this for a real
 * `@a5c-ai/adapters-gateway` WS+REST transport without touching UI code.
 *
 * Protocol-frame surface (`send()` routing):
 *   - `hook.decision` (with the sim-local `optionId` extension) resolves
 *     SPEC-V3 §V3-5 inquiries;
 *   - `session.message` steers/aborts ACTIVE agents (`/abort`, `/stop`);
 *   - `session.start` is RETIRED under V3 (agents are never created
 *     manually) and answers with an `unsupported_in_v3` error frame.
 *
 * KNOWN v1-PROTOCOL GAP (raise upstream): gateway protocol v1 has no board
 * verbs, so `moveCard` / `setYolo` / `createTask` ride a sim-local client
 * command channel exposed on the sim API (`backend.sim.moveCard(...)`, plus
 * the typed pass-throughs below). When the protocol grows board frames these
 * become `send()` cases and the UI does not change.
 *
 * The wrapped `Simulation` is exposed as `.sim` so the UI phase can publish
 * the SPEC §9 test-hooks API:
 *   window.__commander = {
 *     sim: { pause, resume, tick, seed, moveCard, setYolo, createTask },
 *     store, version,
 *   }
 */

import type {
  AgentSummary,
  ClientFrame,
  RunEntry,
  ServerFrame,
  SessionEntry,
} from '../../contracts/gateway-protocol';
import type { CommanderTask } from '../../contracts/kradle-resources';
import type { CommanderBackend } from '../types';
import { seedFromSearch } from './prng';
import type { ColumnId } from './simulation';
import { Simulation, TICK_MS } from './simulation';
import type { TaskKind } from './scenario';

export const DEFAULT_SEED = 42;

export interface MockBackendOptions {
  seed?: number;
  /** Auto-tick interval once connected. Default: 250ms (SPEC §7). */
  tickIntervalMs?: number;
  /** Start the auto-tick loop on connect(). Default: true. Tests pass false. */
  autoStart?: boolean;
}

export class MockBackend implements CommanderBackend {
  readonly sim: Simulation;
  private readonly tickIntervalMs: number;
  private readonly autoStart: boolean;
  private connected = false;

  constructor(options: MockBackendOptions = {}) {
    this.sim = new Simulation({ seed: options.seed ?? DEFAULT_SEED });
    this.tickIntervalMs = options.tickIntervalMs ?? TICK_MS;
    this.autoStart = options.autoStart ?? true;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    this.connected = true;
    // Mirror the gateway handshake: a hello frame greets the client.
    this.sim.handleClientFrame({ type: 'auth', token: 'mock-token' });
    if (this.autoStart) {
      this.sim.start(this.tickIntervalMs);
    }
    await Promise.resolve();
  }

  disconnect(): void {
    this.connected = false;
    this.sim.stop();
  }

  send(frame: ClientFrame): void {
    this.sim.handleClientFrame(frame);
  }

  onFrame(cb: (frame: ServerFrame) => void): () => void {
    return this.sim.onFrame(cb);
  }

  // --- board verbs (sim-local channel — see module header for the v1 gap) ---

  moveCard(taskId: string, column: ColumnId): boolean {
    return this.sim.moveCard(taskId, column);
  }

  setYolo(taskId: string, on: boolean): boolean {
    return this.sim.setYolo(taskId, on);
  }

  createTask(input: { taskKind: TaskKind; title?: string; parentId?: string; workspaceId?: string }):
    | string
    | null {
    return this.sim.createTask(input);
  }

  // --- REST mirrors ----------------------------------------------------------

  listAgents(): Promise<AgentSummary[]> {
    return Promise.resolve(this.sim.listAgents());
  }

  listSessions(): Promise<SessionEntry[]> {
    return Promise.resolve(this.sim.listSessions());
  }

  listRuns(): Promise<RunEntry[]> {
    return Promise.resolve(this.sim.listRuns());
  }

  listTasks(): Promise<CommanderTask[]> {
    return Promise.resolve(this.sim.listTasks());
  }
}

/**
 * Create a MockBackend seeded from a query string (`?seed=`, default 42) —
 * the SPEC §7 boot path: `createMockBackendFromSearch(window.location.search)`.
 */
export function createMockBackendFromSearch(
  search: string,
  options: Omit<MockBackendOptions, 'seed'> = {},
): MockBackend {
  return new MockBackend({ ...options, seed: seedFromSearch(search, DEFAULT_SEED) });
}
