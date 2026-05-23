import type { ToolDescriptor, ToolServer } from './types.js';

/**
 * In-memory registry of tool descriptors, indexed by tool name.
 *
 * Tools are optionally scoped to a server.  The registry never reaches
 * out to the network — callers are responsible for populating it from
 * whatever discovery mechanism they use (MCP enumeration, plugin
 * manifests, built-in definitions, etc.).
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDescriptor>();
  private readonly servers = new Map<string, ToolServer>();

  /* ------------------------------------------------------------------ */
  /*  Tool-level operations                                              */
  /* ------------------------------------------------------------------ */

  /** Register (or replace) a single tool descriptor. */
  register(tool: ToolDescriptor): void {
    this.tools.set(tool.name, tool);
  }

  /** Register every tool in the supplied array. */
  registerAll(tools: ToolDescriptor[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /** Remove a tool by name.  Returns `true` if it existed. */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /** Look up a single tool by exact name. */
  get(name: string): ToolDescriptor | undefined {
    return this.tools.get(name);
  }

  /** Return every registered tool descriptor. */
  list(): ToolDescriptor[] {
    return [...this.tools.values()];
  }

  /** Return tools that belong to a specific server id. */
  listByServer(serverId: string): ToolDescriptor[] {
    return [...this.tools.values()].filter((t) => t.server === serverId);
  }

  /** Check whether a tool is registered. */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Number of registered tools. */
  get size(): number {
    return this.tools.size;
  }

  /* ------------------------------------------------------------------ */
  /*  Server-level operations                                            */
  /* ------------------------------------------------------------------ */

  /** Register a server and all of its tools in one shot. */
  registerServer(server: ToolServer): void {
    this.servers.set(server.id, server);
    for (const tool of server.tools) {
      // Ensure every tool carries the server association.
      this.register({ ...tool, server: server.id });
    }
  }

  /** Remove a server and optionally all of its associated tools. */
  unregisterServer(serverId: string, removeTools = true): boolean {
    if (removeTools) {
      for (const tool of this.listByServer(serverId)) {
        this.tools.delete(tool.name);
      }
    }
    return this.servers.delete(serverId);
  }

  /** Look up a server by id. */
  getServer(serverId: string): ToolServer | undefined {
    return this.servers.get(serverId);
  }

  /** Return all registered servers. */
  listServers(): ToolServer[] {
    return [...this.servers.values()];
  }

  /** Remove everything. */
  clear(): void {
    this.tools.clear();
    this.servers.clear();
  }
}
