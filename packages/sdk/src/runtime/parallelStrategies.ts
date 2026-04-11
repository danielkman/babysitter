/**
 * GAP-PAR-009: Parallel Effect Execution Strategies.
 *
 * Strategy patterns applied to resolved parallel effect results:
 * all-or-nothing, best-effort, first-success, quorum.
 *
 * These strategies are post-resolution concerns — they apply AFTER
 * effects resolve, deciding what to return or throw. The replay
 * engine's ParallelPendingError contract is unaffected.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParallelStrategyName =
  | "all-or-nothing"
  | "best-effort"
  | "first-success"
  | "quorum";

export interface ParallelStrategyOptions {
  /** Fraction of results that must succeed for quorum (0-1). Default: 0.5. */
  quorumThreshold?: number;
}

export interface ParallelStrategyResult<T> {
  results: T[];
  errors: Array<{ index: number; error: unknown }>;
  strategy: ParallelStrategyName;
  totalCount: number;
  successCount: number;
}

// ---------------------------------------------------------------------------
// Strategy implementations
// ---------------------------------------------------------------------------

function allOrNothing<T>(
  results: T[],
  errors: Array<{ index: number; error: unknown }>,
): ParallelStrategyResult<T> {
  if (errors.length > 0) {
    const first = errors[0].error;
    throw first instanceof Error ? first : new Error(String(first));
  }
  return {
    results,
    errors: [],
    strategy: "all-or-nothing",
    totalCount: results.length,
    successCount: results.length,
  };
}

function bestEffort<T>(
  results: T[],
  errors: Array<{ index: number; error: unknown }>,
): ParallelStrategyResult<T> {
  const errorIndices = new Set(errors.map((e) => e.index));
  const successCount = results.filter(
    (_, i) => !errorIndices.has(i),
  ).length;

  return {
    results,
    errors,
    strategy: "best-effort",
    totalCount: results.length,
    successCount,
  };
}

function firstSuccess<T>(
  results: T[],
  errors: Array<{ index: number; error: unknown }>,
): ParallelStrategyResult<T> {
  const errorIndices = new Set(errors.map((e) => e.index));

  for (let i = 0; i < results.length; i++) {
    if (!errorIndices.has(i) && results[i] !== undefined) {
      return {
        results: [results[i]],
        errors,
        strategy: "first-success",
        totalCount: results.length,
        successCount: 1,
      };
    }
  }

  // All failed
  const allErrors = errors.map((e) =>
    e.error instanceof Error ? e.error : new Error(String(e.error)),
  );
  throw allErrors.length > 0
    ? allErrors[0]
    : new Error("All parallel effects failed");
}

function quorum<T>(
  results: T[],
  errors: Array<{ index: number; error: unknown }>,
  options?: ParallelStrategyOptions,
): ParallelStrategyResult<T> {
  const threshold = options?.quorumThreshold ?? 0.5;
  const errorIndices = new Set(errors.map((e) => e.index));
  const successCount = results.filter(
    (_, i) => !errorIndices.has(i),
  ).length;

  const required = results.length === 0
    ? 1  // empty input cannot satisfy quorum
    : Math.ceil(results.length * threshold);

  if (successCount < required) {
    throw new Error(
      `Quorum not met: ${successCount}/${results.length} succeeded, need ${required} (threshold: ${threshold})`,
    );
  }

  return {
    results,
    errors,
    strategy: "quorum",
    totalCount: results.length,
    successCount,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply a parallel execution strategy to resolved effect results.
 *
 * @param strategy - The strategy to apply
 * @param results - Array of resolved results (undefined for failed entries)
 * @param errors - Array of error records with index references
 * @param options - Strategy-specific options (e.g., quorumThreshold)
 */
export function applyStrategy<T>(
  strategy: ParallelStrategyName,
  results: T[],
  errors: Array<{ index: number; error: unknown }>,
  options?: ParallelStrategyOptions,
): ParallelStrategyResult<T> {
  switch (strategy) {
    case "all-or-nothing":
      return allOrNothing(results, errors);
    case "best-effort":
      return bestEffort(results, errors);
    case "first-success":
      return firstSuccess(results, errors);
    case "quorum":
      return quorum(results, errors, options);
    default: {
      const _exhaustive: never = strategy;
      throw new TypeError(`Unknown parallel strategy: ${String(_exhaustive)}`);
    }
  }
}
