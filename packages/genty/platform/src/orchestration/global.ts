/**
 * Global singleton for the orchestration provider registry.
 *
 * Modules that need a provider at call time use getGlobalRegistry() rather
 * than accepting the registry as an explicit argument.  Test code can swap
 * the instance with setGlobalRegistry() or tear it down with
 * resetGlobalRegistry().
 */

import { createOrchestrationRegistry } from "./registry";
import type { OrchestrationRegistry } from "./registry";
import type { JournalEvent } from "../types";

let _registry: OrchestrationRegistry | undefined;

export function getGlobalRegistry(): OrchestrationRegistry {
  if (!_registry) {
    _registry = createOrchestrationRegistry();
  }
  return _registry;
}

export function setGlobalRegistry(registry: OrchestrationRegistry): void {
  _registry = registry;
}

export function resetGlobalRegistry(): void {
  _registry = undefined;
}

/**
 * Load journal events from the global registry's journal provider,
 * cast to the full JournalEvent type used by platform code.
 *
 * The provider interface declares RunEvent[] (narrow), but concrete
 * implementations return the full JournalEvent shape with seq, ulid,
 * recordedAt, etc.  This helper centralises the assertion.
 */
export async function loadJournalEvents(runDir: string): Promise<JournalEvent[]> {
  try {
    const events = await getGlobalRegistry().getJournal().loadEvents(runDir);
    return events as unknown as JournalEvent[];
  } catch {
    // Fall back to reading journal files directly from disk when no provider
    // is registered (e.g. CLI api commands, tests, standalone tools).
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const journalDir = path.join(runDir, "journal");
    const files = await fs.readdir(journalDir).catch(() => [] as string[]);
    const jsonFiles = files.filter(f => f.endsWith(".json")).sort();
    const events: JournalEvent[] = [];
    for (const file of jsonFiles) {
      const content = await fs.readFile(path.join(journalDir, file), "utf8");
      const parsed = JSON.parse(content);
      const seqMatch = file.match(/^(\d+)\./);
      events.push({
        seq: seqMatch ? parseInt(seqMatch[1], 10) : events.length + 1,
        ulid: file.replace(/^\d+\./, "").replace(/\.json$/, ""),
        ...parsed,
      } as JournalEvent);
    }
    return events;
  }
}

/**
 * Append a journal event through the global registry's journal provider.
 */
export async function appendJournalEvent(
  runDir: string,
  eventType: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await getGlobalRegistry().getJournal().appendEvent(runDir, {
      type: eventType,
      timestamp: new Date().toISOString(),
      data,
    });
  } catch {
    // Fall back to writing journal files directly when no provider is registered.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const crypto = await import("node:crypto");
    const journalDir = path.join(runDir, "journal");
    await fs.mkdir(journalDir, { recursive: true });
    const files = await fs.readdir(journalDir).catch(() => [] as string[]);
    const nextSeq = files.filter(f => f.endsWith(".json")).length + 1;
    const seqStr = nextSeq.toString().padStart(6, "0");
    const ulid = crypto.randomUUID().replace(/-/g, "").slice(0, 26).toUpperCase();
    const event = {
      type: eventType,
      recordedAt: new Date().toISOString(),
      data,
      checksum: crypto.createHash("sha256").update(eventType).digest("hex"),
    };
    await fs.writeFile(
      path.join(journalDir, `${seqStr}.${ulid}.json`),
      JSON.stringify(event, null, 2),
    );
  }
}
