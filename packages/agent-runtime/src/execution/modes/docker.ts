/**
 * DockerExecutor — constructs `docker run` commands and spawns them
 * via child_process.
 *
 * This is a structural stub: it correctly assembles the Docker CLI
 * invocation from DockerExecutionConfig, but the host must have Docker
 * installed and the daemon running for it to work at runtime.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type {
  ExecutionHandle,
  DockerExecutionConfig,
} from "../types";
import type { Executor } from "./local";

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface DockerProcess {
  handle: MutableHandle;
  process: ChildProcess;
  config: DockerExecutionConfig;
}

interface MutableHandle {
  readonly id: string;
  readonly mode: "docker";
  status: "running" | "stopped" | "failed";
}

// ---------------------------------------------------------------------------
// DockerExecutor
// ---------------------------------------------------------------------------

export class DockerExecutor implements Executor<DockerExecutionConfig> {
  private readonly processes = new Map<string, DockerProcess>();

  async spawn(
    command: string,
    args: string[],
    config: DockerExecutionConfig,
  ): Promise<ExecutionHandle> {
    const id = randomUUID();

    const dockerArgs = this._buildDockerArgs(id, command, args, config);
    const child = spawn("docker", dockerArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const handle: MutableHandle = {
      id,
      mode: "docker",
      status: "running",
    };

    const entry: DockerProcess = { handle, process: child, config };
    this.processes.set(id, entry);

    child.on("exit", (code) => {
      handle.status = code === 0 ? "stopped" : "failed";
    });
    child.on("error", () => {
      handle.status = "failed";
    });

    return this._toPublicHandle(entry);
  }

  async attach(id: string): Promise<ExecutionHandle | undefined> {
    const entry = this.processes.get(id);
    if (!entry) return undefined;
    return this._toPublicHandle(entry);
  }

  list(): ExecutionHandle[] {
    return [...this.processes.values()].map((e) => this._toPublicHandle(e));
  }

  async destroy(id: string): Promise<void> {
    const entry = this.processes.get(id);
    if (!entry) return;

    // Attempt `docker stop` on the container (uses the handle id as name).
    const child = entry.process;
    if (!child.killed && child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (!child.killed && child.exitCode === null) {
            child.kill("SIGKILL");
          }
          resolve();
        }, 5_000);
        child.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    entry.handle.status = "stopped";
    this.processes.delete(id);
  }

  // ---------- Helpers -------------------------------------------------------

  /** Build the full `docker run` argument list. */
  _buildDockerArgs(
    id: string,
    command: string,
    args: string[],
    config: DockerExecutionConfig,
  ): string[] {
    const dockerArgs: string[] = ["run", "--rm", "--name", `babysitter-${id.slice(0, 8)}`];

    // Volume mounts.
    if (config.volumes) {
      for (const vol of config.volumes) {
        dockerArgs.push("-v", vol);
      }
    }

    // Network.
    if (config.network) {
      dockerArgs.push("--network", config.network);
    }

    // Environment variables.
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        dockerArgs.push("-e", `${key}=${value}`);
      }
    }

    // Image.
    dockerArgs.push(config.image);

    // Command and arguments.
    dockerArgs.push(command, ...args);

    return dockerArgs;
  }

  private _toPublicHandle(entry: DockerProcess): ExecutionHandle {
    const self = this;
    return {
      get id() {
        return entry.handle.id;
      },
      get mode() {
        return entry.handle.mode;
      },
      get status() {
        return entry.handle.status;
      },
      async attach() {
        if (entry.process.stdout) {
          entry.process.stdout.pipe(process.stdout, { end: false });
        }
        if (entry.process.stderr) {
          entry.process.stderr.pipe(process.stderr, { end: false });
        }
      },
      async destroy() {
        await self.destroy(entry.handle.id);
      },
    };
  }
}
