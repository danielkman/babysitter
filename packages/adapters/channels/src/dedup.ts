// Shared dedup helper (SPEC §5.3, DESIGN §5).
//
// `deriveNew` is the single chokepoint for "drop what we've already emitted".
// Backends and the core both lean on it so "at most once" holds even when a
// polling window overlaps the previous one (an inclusive `since`, a
// minute-granularity JQL `>=`, …). Backends only choose the id derivation
// (`idOf`) and any cursor post-filter; this function owns the seen-set logic.

/**
 * FIFO-prune a seen array to at most `max` entries (newest retained), but NEVER
 * drop an id in `keep` — the boundary bucket. A naive count-based FIFO can evict
 * an id whose timestamp still sits at/after the cursor (re-returned by the next
 * inclusive `since`/`>=` query) → a duplicate emit. Retaining the boundary bucket
 * makes the bound "soft": if `keep` alone exceeds `max`, all kept ids survive
 * (the cursor guarantees the window stays small in practice) (SPEC §5.3,
 * finding §3).
 */
export function boundSeen(
  seen: string[],
  { max, keep }: { max?: number; keep?: Iterable<string> } = {}
): string[] {
  const arr = Array.isArray(seen) ? seen : [];
  if (typeof max !== 'number' || !Number.isFinite(max) || arr.length <= max) {
    return [...arr];
  }
  const keepSet = keep ? new Set(keep) : null;
  if (!keepSet || keepSet.size === 0) {
    // Plain FIFO: keep the most-recent `max` ids.
    return arr.slice(arr.length - max);
  }

  // Walk newest→oldest, taking ids until we hit `max`, but ALWAYS taking a
  // boundary id even past the budget. Preserve original order in the result.
  const retainIdx = new Set<number>();
  let budget = max;
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const id = arr[i];
    if (keepSet.has(id)) {
      retainIdx.add(i); // boundary id: always retained
    } else if (budget > 0) {
      retainIdx.add(i);
      budget -= 1;
    }
  }
  const out: string[] = [];
  for (let i = 0; i < arr.length; i += 1) {
    if (retainIdx.has(i)) out.push(arr[i]);
  }
  return out;
}

/**
 * `fresh`: items whose id is not already in `seen` (deduped within the batch);
 * `seen`: the union (prior seen + fresh ids), bounded by `max` (boundary-safe).
 */
export function deriveNew<T>(
  items: T[],
  {
    idOf,
    seen = [],
    max,
    keep
  }: {
    idOf: (item: T) => string;
    seen?: string[];
    max?: number;
    keep?: Iterable<string>;
  }
): { fresh: T[]; seen: string[] } {
  const known = new Set(seen);
  const fresh: T[] = [];
  const freshIds: string[] = [];

  for (const item of Array.isArray(items) ? items : []) {
    const id = idOf(item);
    if (known.has(id)) continue;
    // Mark immediately so a duplicate id within this same batch is fresh once.
    known.add(id);
    fresh.push(item);
    freshIds.push(id);
  }

  const nextSeen = boundSeen([...seen, ...freshIds], { max, keep });
  return { fresh, seen: nextSeen };
}
