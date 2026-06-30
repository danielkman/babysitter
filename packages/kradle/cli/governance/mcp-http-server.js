/**
 * HTTP/SSE transport for the Kradle MCP server + async governance delivery (G13).
 *
 * Wraps the EXISTING createMcpServer().handleMessage (zero new MCP logic) with a
 * node:http transport so a realtime worker can connect with one line
 * (`MCPServerHTTP(url=".../mcp")`). Fast tools stay synchronous; governed tools
 * return immediately with {correlationId, filler, status:'waiting-approval'} and
 * the terminal outcome is delivered out-of-band via poll + SSE. The governed run
 * is driven by the REUSED G13 core (driveGovernedTool over
 * governed-visual-tool.process.js); the OWNER approve/deny channel resolves the
 * real breakpoint via the async-delivery registry.
 *
 * node:http / node:crypto / node:fs / node:os / node:path only at runtime; the
 * SDK is pulled transitively by run-driver.js (resolved from root node_modules,
 * bridge-time only).
 *
 * @reference docs/research/voice-governance-bridge-spec.md §3, §3.2, §3.3
 */

import http from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createMcpServer } from '../src/mcp-server.js';
import { evaluateVisualPolicy } from '../src/policy-engine.js';
import { driveGovernedTool } from './run-driver.js';
import { createAsyncDelivery } from './async-delivery.js';

/**
 * Read the args a task effect was invoked with from the run dir. Inputs are
 * inlined into task.json (`inputs`) for small payloads, or spilled to
 * `inputsRef`. Mirrors verify-governed-visual.mjs:35-44.
 */
async function readEffectArgs(runDir, action) {
  const taskPath = path.join(runDir, 'tasks', action.effectId, 'task.json');
  const taskDef = JSON.parse(await fs.readFile(taskPath, 'utf8'));
  if (taskDef.inputs !== undefined) return taskDef.inputs;
  if (taskDef.inputsRef) {
    const ref = path.isAbsolute(taskDef.inputsRef) ? taskDef.inputsRef : path.join(runDir, taskDef.inputsRef);
    return JSON.parse(await fs.readFile(ref, 'utf8'));
  }
  return {};
}

/**
 * Host execute resolver: runs the task bodies (resolveTarget shaping,
 * policyCheck via the PolicyEngine, emitSocketCommand). Identical to
 * verify-governed-visual.mjs:51-75 — factored here so it is shared, not
 * duplicated.
 */
export function makeExecuteResolver(runDir) {
  return async (action) => {
    const kind = action.taskDef?.kind || '';
    const args = await readEffectArgs(runDir, action);
    if (kind === 'governed-visual.resolve-target') {
      return {
        action: args.action,
        payload: args.payload || {},
        meetingRef: args.meetingRef,
        roomId: args.roomId,
        socketPath: args.socketPath,
      };
    }
    if (kind === 'governed-visual.policy-check') {
      return evaluateVisualPolicy(args.action, args.payload || {}, args.context || {});
    }
    if (kind === 'governed-visual.emit-socket-command') {
      return {
        socketPath: args.socketPath,
        command: { action: args.action, ...(args.payload || {}) },
      };
    }
    throw new Error(`unexpected task kind in execute resolver: ${kind}`);
  };
}

function jsonrpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      buf += chunk;
    });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

/**
 * Parse the structured G13 descriptor back out of the MCP tools/call result.
 * The descriptor is JSON text inside result.content[0].text (mcp-server.js:307-310).
 * Returns null if the result is not a content-wrapped descriptor.
 */
function parseToolCallDescriptor(rpcResult) {
  const text = rpcResult?.result?.content?.[0]?.text;
  if (typeof text !== 'string') return null;
  return JSON.parse(text);
}

/**
 * Create the bridge HTTP server.
 * @param {object} [options]
 * @param {object} [options.controller] - Kradle API controller (DI for tests).
 * @param {object} [options.mcp] - injected mcp with handleMessage (defaults to createMcpServer({controller})).
 * @param {object} [options.delivery] - async-delivery registry (defaults to a fresh one).
 * @param {string} [options.runsDir] - dir the out-of-band governed runs are created under.
 * @returns {{ server: http.Server, listen: (port?: number) => Promise<{port:number,url:string}>, close: () => Promise<void>, url: string|null, delivery: object }}
 */
export function createBridgeHttpServer(options = {}) {
  const controller = options.controller;
  const mcp = options.mcp || createMcpServer({ controller });
  const delivery = options.delivery || createAsyncDelivery();
  let runsDir = options.runsDir || null;
  let runsDirOwned = false;
  let url = null;

  async function ensureRunsDir() {
    if (runsDir) return runsDir;
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-delivery-runs-'));
    runsDirOwned = true;
    return runsDir;
  }

  /**
   * Start the governed run OUT-OF-BAND (NOT awaited on the request path). The
   * breakpoint blocks on delivery.awaitDecision(correlationId) until the OWNER
   * approve/deny route fires; on completion settle() carries the terminal
   * outcome (command on approve, reason on deny) to poll + SSE.
   */
  function startGovernedRun(correlationId, descriptor) {
    ensureRunsDir()
      .then((dir) => {
        const runDir = path.join(dir, correlationId);
        const inputs = {
          ...descriptor.inputs,
          socketPath: descriptor.socketPath,
          context: descriptor.context || {},
          correlationId,
        };
        const resolvers = {
          execute: makeExecuteResolver(runDir),
          approve: async () => delivery.awaitDecision(correlationId),
        };
        return driveGovernedTool({ runsDir: dir, runId: correlationId, inputs, resolvers });
      })
      .then((out) => {
        if (out && out.ok) {
          delivery.settle(correlationId, out.value);
        } else {
          const reason = out?.error?.message || out?.error || out?.halted || 'governed-run-failed';
          delivery.settle(correlationId, { status: 'denied', reason: String(reason) });
        }
      })
      .catch((err) => {
        delivery.settle(correlationId, { status: 'denied', reason: err?.message || String(err) });
      });
  }

  async function handleMcpPost(req, res) {
    const raw = await readBody(req);
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      // Parse error mirrors mcp-server.js:343.
      sendJson(res, 200, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }

    const rpcResult = await mcp.handleMessage(msg);

    // Notifications return null (notifications/initialized) — no body.
    if (rpcResult === null) {
      res.writeHead(204);
      res.end();
      return;
    }

    // Non-tools/call methods: transport pass-through, unchanged.
    if (msg.method !== 'tools/call') {
      sendJson(res, 200, rpcResult);
      return;
    }

    // tools/call: inspect the descriptor.
    let descriptor;
    try {
      descriptor = parseToolCallDescriptor(rpcResult);
    } catch {
      descriptor = null;
    }

    // Errored tool call (isError) or non-descriptor result — pass through.
    if (!descriptor || !descriptor.governed) {
      // Fast tool ({socketPath, command}) or any non-governed result: synchronous, unchanged.
      sendJson(res, 200, rpcResult);
      return;
    }

    // Governed hard-deny: no run registered, no command.
    if (descriptor.denied === true) {
      sendJson(res, 200, jsonrpcResult(msg.id, {
        governed: true,
        denied: true,
        tool: descriptor.tool,
        correlationId: descriptor.correlationId,
        reason: descriptor.reason,
      }));
      return;
    }

    // Governed approved-path: register, start the run out-of-band, return immediately.
    const correlationId = descriptor.correlationId;
    delivery.register(correlationId, { filler: descriptor.filler });
    startGovernedRun(correlationId, descriptor);
    sendJson(res, 200, jsonrpcResult(msg.id, {
      correlationId,
      filler: descriptor.filler,
      status: 'waiting-approval',
    }));
  }

  function handleEvents(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
    });
    // Flush headers immediately so the stream is open before any event.
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    const unsub = delivery.subscribe((event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    req.on('close', () => {
      unsub();
    });
  }

  function handleGovernancePoll(res, correlationId) {
    const snap = delivery.get(correlationId);
    if (snap === undefined) {
      sendJson(res, 404, { error: `unknown correlationId: ${correlationId}` });
      return;
    }
    // While waiting-approval, outcome is absent => command provably ABSENT.
    const body = { correlationId, status: snap.status, filler: snap.filler };
    if (snap.outcome !== undefined) body.outcome = snap.outcome;
    sendJson(res, 200, body);
  }

  async function handleApprove(req, res, correlationId) {
    const raw = await readBody(req);
    let parsed = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: 'invalid JSON body' });
        return;
      }
    }
    try {
      delivery.approve(correlationId, parsed.response);
    } catch (err) {
      sendJson(res, 404, { error: err.message });
      return;
    }
    sendJson(res, 200, { correlationId, accepted: 'approve' });
  }

  async function handleDeny(req, res, correlationId) {
    const raw = await readBody(req);
    let parsed = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: 'invalid JSON body' });
        return;
      }
    }
    try {
      delivery.deny(correlationId, parsed.reason);
    } catch (err) {
      sendJson(res, 404, { error: err.message });
      return;
    }
    sendJson(res, 200, { correlationId, accepted: 'deny' });
  }

  const server = http.createServer((req, res) => {
    // Strip query string; route on method + pathname.
    const pathname = (req.url || '').split('?')[0];

    Promise.resolve()
      .then(() => {
        if (req.method === 'POST' && pathname === '/mcp') {
          return handleMcpPost(req, res);
        }
        if (req.method === 'GET' && pathname === '/mcp/events') {
          return handleEvents(req, res);
        }
        if (pathname.startsWith('/governance/')) {
          const rest = pathname.slice('/governance/'.length);
          const segments = rest.split('/').filter(Boolean);
          const correlationId = segments[0];
          const sub = segments[1];
          if (!correlationId) {
            sendJson(res, 404, { error: 'missing correlationId' });
            return undefined;
          }
          if (req.method === 'GET' && sub === undefined) {
            handleGovernancePoll(res, correlationId);
            return undefined;
          }
          if (req.method === 'POST' && sub === 'approve') {
            return handleApprove(req, res, correlationId);
          }
          if (req.method === 'POST' && sub === 'deny') {
            return handleDeny(req, res, correlationId);
          }
        }
        sendJson(res, 404, { error: `no route: ${req.method} ${pathname}` });
        return undefined;
      })
      .catch((err) => {
        if (!res.headersSent) {
          sendJson(res, 500, { error: err?.message || String(err) });
        } else {
          try { res.end(); } catch { /* already closed */ }
        }
      });
  });

  function listen(port = 0) {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        const addr = server.address();
        const boundPort = typeof addr === 'object' && addr ? addr.port : port;
        url = `http://127.0.0.1:${boundPort}`;
        resolve({ port: boundPort, url });
      });
    });
  }

  async function close() {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    if (runsDirOwned && runsDir) {
      await fs.rm(runsDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  return {
    server,
    listen,
    close,
    delivery,
    get url() {
      return url;
    },
  };
}
