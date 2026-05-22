/**
 * Execution mode abstraction for Babysitter Agent Runtime.
 *
 * Defines how effects and sub-agents are spawned — locally, in Docker,
 * over SSH, or on Kubernetes. Interface-only stubs; implementations
 * will follow in issue #217.
 */

// ---------------------------------------------------------------------------
// Execution Mode
// ---------------------------------------------------------------------------

/** Supported execution environments. */
export type ExecutionMode = "local" | "docker" | "ssh" | "kubernetes";

// ---------------------------------------------------------------------------
// Per-Mode Config
// ---------------------------------------------------------------------------

/** Configuration for local (host-process) execution. */
export interface LocalExecutionConfig {
  readonly mode: "local";
  /** Working directory for spawned processes. */
  readonly cwd: string;
  /** Optional environment variable overrides. */
  readonly env?: Record<string, string>;
}

/** Configuration for Docker-based execution. */
export interface DockerExecutionConfig {
  readonly mode: "docker";
  /** Container image reference (e.g. "node:20-slim"). */
  readonly image: string;
  /** Volume mounts in "host:container" format. */
  readonly volumes?: string[];
  /** Docker network to attach to. */
  readonly network?: string;
  /** Optional environment variable overrides. */
  readonly env?: Record<string, string>;
}

/** Configuration for SSH-based remote execution. */
export interface SshExecutionConfig {
  readonly mode: "ssh";
  /** Remote hostname or IP address. */
  readonly host: string;
  /** SSH port; defaults to 22. */
  readonly port?: number;
  /** Remote user. */
  readonly user: string;
  /** Path to the private key file. */
  readonly keyPath?: string;
  /** Optional environment variable overrides. */
  readonly env?: Record<string, string>;
}

/** Configuration for Kubernetes pod-based execution. */
export interface KubernetesExecutionConfig {
  readonly mode: "kubernetes";
  /** Kubernetes namespace. */
  readonly namespace: string;
  /** Container image reference. */
  readonly image: string;
  /** Service account to run under. */
  readonly serviceAccount?: string;
  /** Resource requests/limits (e.g. `{ cpu: "500m", memory: "256Mi" }`). */
  readonly resources?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Discriminated Union
// ---------------------------------------------------------------------------

/**
 * Discriminated union of all execution config types.
 * Discriminant field is `mode`.
 */
export type ExecutionConfig =
  | LocalExecutionConfig
  | DockerExecutionConfig
  | SshExecutionConfig
  | KubernetesExecutionConfig;

// ---------------------------------------------------------------------------
// Handle
// ---------------------------------------------------------------------------

/** Handle to a running or completed execution. */
export interface ExecutionHandle {
  /** Unique identifier for this execution instance. */
  readonly id: string;
  /** The execution mode this handle was spawned with. */
  readonly mode: ExecutionMode;
  /** Current lifecycle status. */
  readonly status: "running" | "stopped" | "failed";
  /**
   * Attach to the execution's I/O streams (e.g. for log tailing).
   */
  attach(): Promise<void>;
  /**
   * Tear down the execution and release its resources.
   */
  destroy(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/** Abstraction over an execution backend. */
export interface ExecutionProvider {
  /**
   * Spawn a new execution from the given config.
   *
   * @param config - Discriminated execution configuration.
   * @returns A handle to the running execution.
   */
  spawn(config: ExecutionConfig): Promise<ExecutionHandle>;

  /**
   * Re-attach to a previously spawned execution.
   *
   * @param id - Execution identifier returned by a prior `spawn`.
   * @returns The handle, or undefined if not found.
   */
  attach(id: string): Promise<ExecutionHandle | undefined>;

  /**
   * List all known execution handles managed by this provider.
   */
  list(): Promise<ExecutionHandle[]>;

  /**
   * Destroy an execution by ID.
   *
   * @param id - Execution identifier.
   */
  destroy(id: string): Promise<void>;
}
