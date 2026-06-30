// State persistence (SPEC §3, DESIGN §1).
//
// Each source has state `{ cursor, seen[] }`. The cursor narrows the next API
// query to "since last time"; the seen-set is the correctness backstop that
// guarantees at-most-once across overlapping windows. `seen` is FIFO-bounded by
// `maxSeenPerSource` so state files stay small.
//
// Two implementations:
//   - StateStore: file-backed JSON, one file per source, written atomically
//     (temp file + rename) so a crash never leaves a half-written state file.
//   - MemoryStateStore: in-memory, for tests / ephemeral runs.

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { boundSeen } from './dedup.js';

export interface SourceState {
  cursor: unknown;
  seen: string[];
}

export interface StateSetArgs {
  cursor?: unknown;
  seen?: string[];
  keepSeen?: string[];
}

export interface StateStoreLike {
  get(id: string): SourceState;
  set(id: string, state: StateSetArgs): void | Promise<void>;
}

const DEFAULT_STATE = (): SourceState => ({ cursor: null, seen: [] });

/** Turn a source id into a filesystem-safe file name. */
function safeFileName(id: string): string {
  return `${String(id).replace(/[^A-Za-z0-9._-]/g, '_')}.json`;
}

/**
 * File-backed state store. One JSON file per source under `dir`.
 */
export class StateStore implements StateStoreLike {
  dir: string;
  maxSeenPerSource?: number;

  constructor({ dir, maxSeenPerSource }: { dir: string; maxSeenPerSource?: number } = {} as { dir: string; maxSeenPerSource?: number }) {
    if (!dir) throw new Error('StateStore requires a `dir`');
    this.dir = dir;
    this.maxSeenPerSource = maxSeenPerSource;
    mkdirSync(this.dir, { recursive: true });
  }

  _pathFor(id: string): string {
    return join(this.dir, safeFileName(id));
  }

  get(id: string): SourceState {
    const file = this._pathFor(id);
    if (!existsSync(file)) return DEFAULT_STATE();
    try {
      const raw = readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        cursor: parsed?.cursor ?? null,
        seen: Array.isArray(parsed?.seen) ? parsed.seen : []
      };
    } catch {
      // A corrupt/unreadable state file degrades to empty state rather than
      // crashing a poll; the cursor simply restarts.
      return DEFAULT_STATE();
    }
  }

  /**
   * Atomically persist state for a source (temp file + rename). `state.keepSeen`
   * (optional) lists boundary ids the FIFO prune must never drop (finding §3).
   */
  async set(id: string, state: StateSetArgs): Promise<void> {
    const next = {
      cursor: state?.cursor ?? null,
      seen: boundSeen(state?.seen as string[], { max: this.maxSeenPerSource, keep: state?.keepSeen })
    };
    const file = this._pathFor(id);
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, JSON.stringify(next), 'utf8');
    renameSync(tmp, file);
  }
}

/**
 * In-memory state store with the same contract (pluggable for tests).
 */
export class MemoryStateStore implements StateStoreLike {
  maxSeenPerSource?: number;
  _map: Map<string, SourceState>;

  constructor({ maxSeenPerSource }: { maxSeenPerSource?: number } = {}) {
    this.maxSeenPerSource = maxSeenPerSource;
    this._map = new Map();
  }

  get(id: string): SourceState {
    const v = this._map.get(id);
    if (!v) return DEFAULT_STATE();
    return { cursor: v.cursor, seen: [...v.seen] };
  }

  async set(id: string, state: StateSetArgs): Promise<void> {
    this._map.set(id, {
      cursor: state?.cursor ?? null,
      seen: boundSeen(state?.seen as string[], { max: this.maxSeenPerSource, keep: state?.keepSeen })
    });
  }
}
