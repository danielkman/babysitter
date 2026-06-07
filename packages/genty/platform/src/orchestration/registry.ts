/**
 * Provider registry for orchestration abstractions.
 *
 * Each provider type is stored in a named map. Callers can register
 * multiple implementations and retrieve them by name. When no name is
 * supplied, the first registered provider is returned.
 *
 * If no provider has been registered for a requested type, the getter
 * throws immediately -- there are no fallbacks.
 */

import type {
  OrchestrationProvider,
  JournalProvider,
  GovernanceProvider,
  ExternalAgentProvider,
  SessionProvider,
  ProcessDefinitionProvider,
} from "./interfaces";

// ── Public interface ────────────────────────────────────────────────────

export interface OrchestrationRegistry {
  registerOrchestration(name: string, provider: OrchestrationProvider): void;
  registerJournal(name: string, provider: JournalProvider): void;
  registerGovernance(name: string, provider: GovernanceProvider): void;
  registerAgentDiscovery(name: string, provider: ExternalAgentProvider): void;
  registerSession(name: string, provider: SessionProvider): void;
  registerProcessDefinition(name: string, provider: ProcessDefinitionProvider): void;

  getOrchestration(name?: string): OrchestrationProvider;
  getJournal(name?: string): JournalProvider;
  getGovernance(name?: string): GovernanceProvider;
  getAgentDiscovery(name?: string): ExternalAgentProvider;
  getSession(name?: string): SessionProvider;
  getProcessDefinition(name?: string): ProcessDefinitionProvider;

  /** Names of all registered orchestration providers. */
  listProviders(): string[];
}

// ── Implementation ──────────────────────────────────────────────────────

/**
 * Typed helper that manages a single provider-type map and exposes
 * register / get semantics with insertion-order first-wins.
 */
class ProviderMap<T> {
  private readonly providers = new Map<string, T>();
  private readonly label: string;

  constructor(label: string) {
    this.label = label;
  }

  register(name: string, provider: T): void {
    this.providers.set(name, provider);
  }

  get(name?: string): T {
    if (name !== undefined) {
      const p = this.providers.get(name);
      if (!p) {
        throw new Error(
          `No ${this.label} provider registered with name "${name}". ` +
            `Registered: [${[...this.providers.keys()].join(", ")}]`,
        );
      }
      return p;
    }

    // Return the first registered provider.
    const first = this.providers.values().next();
    if (first.done) {
      throw new Error(
        `No ${this.label} provider registered. ` +
          `Call registry.register${capitalize(this.label)}() before accessing it.`,
      );
    }
    return first.value;
  }

  names(): string[] {
    return [...this.providers.keys()];
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Create a new, empty orchestration registry. */
export function createOrchestrationRegistry(): OrchestrationRegistry {
  const orchestration = new ProviderMap<OrchestrationProvider>("orchestration");
  const journal = new ProviderMap<JournalProvider>("journal");
  const governance = new ProviderMap<GovernanceProvider>("governance");
  const agentDiscovery = new ProviderMap<ExternalAgentProvider>("agentDiscovery");
  const session = new ProviderMap<SessionProvider>("session");
  const processDefinition = new ProviderMap<ProcessDefinitionProvider>("processDefinition");

  return {
    registerOrchestration: (n, p) => orchestration.register(n, p),
    registerJournal: (n, p) => journal.register(n, p),
    registerGovernance: (n, p) => governance.register(n, p),
    registerAgentDiscovery: (n, p) => agentDiscovery.register(n, p),
    registerSession: (n, p) => session.register(n, p),
    registerProcessDefinition: (n, p) => processDefinition.register(n, p),

    getOrchestration: (n) => orchestration.get(n),
    getJournal: (n) => journal.get(n),
    getGovernance: (n) => governance.get(n),
    getAgentDiscovery: (n) => agentDiscovery.get(n),
    getSession: (n) => session.get(n),
    getProcessDefinition: (n) => processDefinition.get(n),

    listProviders: () => orchestration.names(),
  };
}
