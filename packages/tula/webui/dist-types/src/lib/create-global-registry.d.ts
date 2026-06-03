/**
 * Generic globalThis registry factory.
 *
 * Provides type-safe, HMR-resilient accessors for global state.  Each caller
 * supplies its own registry-map interface and namespace key so multiple
 * registries (kanban, observer, etc.) can coexist without collision.
 *
 * This is the **canonical** implementation.  The observer-dashboard package
 * mirrors this file — keep them in sync or extract to a shared package when a
 * suitable one exists.
 */
/**
 * Create a set of typed accessors for a `globalThis`-backed registry.
 *
 * @typeParam TMap - Interface mapping string keys to their concrete types.
 * @param namespaceKey - The key on `globalThis` used to store the registry
 *                       (e.g. `"__kanban_registry__"` or `"__observer_registry__"`).
 */
export declare function createGlobalRegistry<TMap extends object>(namespaceKey: string): {
    /**
     * Return an HMR-safe global value, lazily initialising it via `factory`
     * on first access.
     */
    getGlobal<K extends keyof TMap & string>(key: K, factory: () => TMap[K]): TMap[K];
    /** Clear a single key from the global registry. */
    clearGlobal<K extends keyof TMap & string>(key: K): void;
    /** Clear the entire global registry. */
    clearAllGlobals(): void;
};
