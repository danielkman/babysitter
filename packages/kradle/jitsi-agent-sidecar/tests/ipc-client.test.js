import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { rm } from 'node:fs/promises';

import { createIpcServer } from '../src/ipc-server.js';
import { createJitsiSidecarRuntime } from '../src/runtime.js';
import { createAgentIpcClient } from '../src/ipc-client.js';

const sockets = [];

function socketPath(name) {
  const value = path.join(os.tmpdir(), `kradle-jitsi-${process.pid}-${Date.now()}-${name}.sock`);
  sockets.push(value);
  return value;
}

// Detect whether this platform can bind an AF_UNIX socket under os.tmpdir().
// On unsupported runners we skip rather than fall back to TCP (fallbacks forbidden).
async function afUnixSupported() {
  const probe = socketPath('probe');
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => {
      srv.close(() => resolve(false));
    });
    try {
      srv.listen(probe, () => {
        srv.close(() => rm(probe, { force: true }).then(() => resolve(true), () => resolve(true)));
      });
    } catch {
      resolve(false);
    }
  });
}

// Mock Jitsi client: records calls (shape mirrors tests/runtime.test.js adapter()),
// extended with the eight G8 methods. Captures onEvent from connect for chat synthesis.
function mockJitsi() {
  const calls = [];
  let lastConnect = null;
  return {
    calls,
    get lastConnect() { return lastConnect; },
    async connect(options = {}) {
      lastConnect = options;
      calls.push(['connect']);
      return { participants: [{ id: 'agent', name: 'Agent' }] };
    },
    async disconnect(reason) { calls.push(['disconnect', reason]); },
    async sendChat(text) { calls.push(['sendChat', text]); },
    async raiseHand() { calls.push(['raiseHand']); },
    async lowerHand() { calls.push(['lowerHand']); },
    async react(emoji) { calls.push(['react', emoji]); },
    async shareScreen(url) { calls.push(['shareScreen', url]); },
    async setExpression(expression, options) { calls.push(['setExpression', expression, options]); },
    async setPosture(posture) { calls.push(['setPosture', posture]); },
    async playGesture(gesture, options) { calls.push(['playGesture', gesture, options]); },
    async lookAt(target) { calls.push(['lookAt', target]); },
    async setView(view) { calls.push(['setView', view]); },
    async drawCanvas(ops) { calls.push(['drawCanvas', ops]); },
    async startScreenshare(options) { calls.push(['startScreenshare', options]); },
    async sendVideoMetadata(metadata) { calls.push(['sendVideoMetadata', metadata]); },
  };
}

describe('agent IPC client over real NDJSON Unix socket', async () => {
  const supported = await afUnixSupported();

  it('rejects construction without a socket path (no default, no fallback)', () => {
    const saved = { a: process.env.JITSI_AGENT_SOCKET, b: process.env.AGENT_SOCKET_PATH };
    delete process.env.JITSI_AGENT_SOCKET;
    delete process.env.AGENT_SOCKET_PATH;
    try {
      assert.throws(() => createAgentIpcClient({}), /socketPath/i);
    } finally {
      if (saved.a !== undefined) process.env.JITSI_AGENT_SOCKET = saved.a;
      if (saved.b !== undefined) process.env.AGENT_SOCKET_PATH = saved.b;
    }
  });

  it('dispatches G8 actions + send_chat and round-trips an inbound chat event', { skip: supported ? false : 'AF_UNIX not bindable under os.tmpdir() on this platform' }, async () => {
    const sp = socketPath('client');
    const jitsi = mockJitsi();
    let server;
    const runtime = createJitsiSidecarRuntime({
      config: { roomUrl: 'https://meet.example.test/standup', jwt: 'jwt', roomId: 'standup', participantName: 'Agent' },
      jitsi,
      broadcast: (event) => server.broadcast(event),
    });
    server = createIpcServer({ socketPath: sp, runtime });
    await server.start();

    const client = createAgentIpcClient({ socketPath: sp });
    const inbound = [];
    client.onEvent((event) => inbound.push(event));
    await client.connect();

    try {
      const commands = [
        { action: 'send_chat', text: 'summary posted' },
        { action: 'set_expression', expression: 'smile', intensity: 0.8 },
        { action: 'set_posture', posture: 'lean_in' },
        { action: 'play_gesture', gesture: 'wave', loop: false },
        { action: 'look_at', target: 'camera' },
        { action: 'set_view', view: 'closeup' },
        { action: 'draw_canvas', ops: [{ type: 'rect' }] },
        { action: 'start_screenshare', source: 'tab', url: 'https://kradle.example/run' },
        { action: 'send_video_metadata', metadata: { fps: 30 } },
      ];
      for (const cmd of commands) {
        const result = await client.send(cmd);
        assert.equal(result.type, 'command_result');
        assert.equal(result.action, cmd.action);
        assert.equal(result.ok, true);
      }

      assert.deepEqual(jitsi.calls, [
        ['sendChat', 'summary posted'],
        ['setExpression', 'smile', { intensity: 0.8 }],
        ['setPosture', 'lean_in'],
        ['playGesture', 'wave', { loop: false }],
        ['lookAt', 'camera'],
        ['setView', 'closeup'],
        ['drawCanvas', [{ type: 'rect' }]],
        ['startScreenshare', { source: 'tab', url: 'https://kradle.example/run' }],
        ['sendVideoMetadata', { fps: 30 }],
      ]);

      // Synthesize an inbound chat through the real runtime → broadcast → socket → client.onEvent.
      runtime.handleJitsiEvent({ type: 'chat', sender: 'bob', text: 'hi' });
      await waitFor(() => inbound.some((e) => e.type === 'chat'));
      const chat = inbound.find((e) => e.type === 'chat');
      assert.equal(chat.sender, 'bob');
      assert.equal(chat.text, 'hi');
      assert.ok(chat.timestamp);

      // Error path: an unsupported action rejects via {type:'error'}.
      await assert.rejects(client.send({ action: 'not_supported' }), /unsupported action/i);
    } finally {
      await client.close();
      await server.stop();
    }
  });

  after(async () => {
    await Promise.all(sockets.splice(0).map((sp) => rm(sp, { force: true })));
  });
});

function waitFor(predicate) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > 1000) {
        clearInterval(timer);
        reject(new Error('timed out waiting for inbound event'));
      }
    }, 10);
  });
}
