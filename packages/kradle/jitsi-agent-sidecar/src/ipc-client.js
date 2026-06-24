import net from 'node:net';
import { EventEmitter } from 'node:events';

const INBOUND_EVENT_TYPES = new Set([
  'connected',
  'transcript',
  'participant_joined',
  'participant_left',
  'disconnected',
  'chat',
]);

/**
 * Reusable in-process client for the Jitsi agent sidecar NDJSON Unix-socket IPC.
 * Mirrors bin/graceful-leave.mjs connect/write, generalized into a request/response
 * client with an inbound-event stream. No silent fallback: connect errors and timeouts
 * surface to the caller, and the socketPath must be explicitly resolvable.
 */
export function createAgentIpcClient({
  socketPath = process.env.JITSI_AGENT_SOCKET || process.env.AGENT_SOCKET_PATH,
  connectTimeoutMs = 1500,
} = {}) {
  if (!socketPath) {
    throw new Error('createAgentIpcClient requires a socketPath (no default socket path)');
  }

  const events = new EventEmitter();
  let socket = null;
  let buffer = '';
  // Pending command sends keyed by action, in FIFO order per action.
  const pending = new Map();

  function rejectAllPending(err) {
    for (const queue of pending.values()) {
      for (const entry of queue) {
        clearTimeout(entry.timer);
        entry.reject(err);
      }
    }
    pending.clear();
  }

  function handleMessage(message) {
    if (!message || typeof message !== 'object') return;
    const { type } = message;
    if (type === 'command_result' || type === 'error') {
      const action = message.action;
      const queue = action != null ? pending.get(action) : undefined;
      const entry = queue && queue.length ? queue.shift() : undefined;
      if (entry) {
        clearTimeout(entry.timer);
        if (queue.length === 0 && action != null) pending.delete(action);
        if (type === 'error') {
          const err = new Error(message.message || `IPC error for action: ${action}`);
          err.ipc = message;
          entry.reject(err);
        } else {
          entry.resolve(message);
        }
        return;
      }
      // An error with no action (e.g. malformed line) cannot be correlated; surface it.
      if (type === 'error') events.emit('error', Object.assign(new Error(message.message || 'IPC error'), { ipc: message }));
      return;
    }
    // Inbound event channel.
    events.emit('event', message);
    if (typeof type === 'string' && INBOUND_EVENT_TYPES.has(type)) {
      events.emit(type, message);
    }
  }

  function consume(chunk) {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      handleMessage(message);
    }
  }

  return {
    socketPath,
    events,

    connect() {
      return new Promise((resolve, reject) => {
        socket = net.createConnection(socketPath);
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          socket.destroy();
          reject(new Error(`IPC connect timed out after ${connectTimeoutMs}ms: ${socketPath}`));
        }, connectTimeoutMs);

        socket.once('connect', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        });
        socket.once('error', (err) => {
          if (settled) {
            // Post-connect error: never swallow.
            rejectAllPending(err);
            events.emit('error', err);
            return;
          }
          settled = true;
          clearTimeout(timer);
          reject(err);
        });
        socket.on('data', consume);
        socket.on('close', () => {
          rejectAllPending(new Error('IPC socket closed'));
          events.emit('close');
        });
      });
    },

    send(command, { timeoutMs = 5000 } = {}) {
      return new Promise((resolve, reject) => {
        if (!socket || socket.destroyed) {
          reject(new Error('IPC client is not connected'));
          return;
        }
        if (!command || typeof command.action !== 'string') {
          reject(new Error('send(command) requires an action string'));
          return;
        }
        const action = command.action;
        const timer = setTimeout(() => {
          const queue = pending.get(action);
          if (queue) {
            const idx = queue.indexOf(entry);
            if (idx !== -1) queue.splice(idx, 1);
            if (queue.length === 0) pending.delete(action);
          }
          reject(new Error(`IPC send timed out after ${timeoutMs}ms for action: ${action}`));
        }, timeoutMs);
        const entry = { resolve, reject, timer };
        let queue = pending.get(action);
        if (!queue) {
          queue = [];
          pending.set(action, queue);
        }
        queue.push(entry);
        socket.write(`${JSON.stringify(command)}\n`);
      });
    },

    onEvent(cb) {
      events.on('event', cb);
      return () => events.off('event', cb);
    },

    close() {
      return new Promise((resolve) => {
        if (!socket || socket.destroyed) {
          resolve();
          return;
        }
        socket.once('close', () => resolve());
        socket.end();
      });
    },
  };
}
