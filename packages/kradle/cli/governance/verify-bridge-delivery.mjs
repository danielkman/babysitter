/**
 * SDK-driven verify for the voice-adapter bridge-delivery layer (G13 §3.2/§3.3).
 *
 * Starts the bridge HTTP server on an ephemeral loopback port and drives REAL
 * HTTP requests through it: the MCP transport over handleMessage, fast-tool
 * synchronous pass-through, governed async delivery (immediate
 * {correlationId,filler,status:'waiting-approval'}), poll + SSE terminal
 * delivery, the OWNER approve/deny channel resolving the real G13 breakpoint,
 * the policy hard-deny (no run), and the command-never-before-approval invariant.
 *
 * The SDK resolves transitively via run-driver.js from root node_modules. Run
 * from repo root: `node packages/kradle/cli/governance/verify-bridge-delivery.mjs`.
 *
 * @reference docs/research/voice-governance-bridge-spec.md §3.2, §3.3
 */

import assert from 'node:assert/strict';
import http from 'node:http';

import { createBridgeHttpServer } from './mcp-http-server.js';

let failures = 0;
const log = (state, name, detail) => {
  if (state === 'FAIL') failures += 1;
  process.stdout.write(`[verify-bridge-delivery] ${state} ${name}${detail ? ` — ${detail}` : ''}\n`);
};

// --- tiny HTTP helpers -------------------------------------------------------

function request(base, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, base);
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': payload.length } : {}),
        },
      },
      (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          let json;
          try {
            json = buf ? JSON.parse(buf) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, json, raw: buf });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function rpc(base, method, params, id = 1) {
  return request(base, 'POST', '/mcp', { jsonrpc: '2.0', id, method, params });
}

function callTool(base, name, args, id = 1) {
  return rpc(base, 'tools/call', { name, arguments: args }, id);
}

/**
 * Open an SSE listener against GET /mcp/events. Collects parsed events and
 * exposes waitFor(predicate) -> Promise<event>.
 */
function openSse(base) {
  const events = [];
  const waiters = [];
  const u = new URL('/mcp/events', base);
  const req = http.request(
    { hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET' },
    (res) => {
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of frame.split('\n')) {
            if (line.startsWith('data: ')) {
              const event = JSON.parse(line.slice('data: '.length));
              events.push(event);
              for (const w of waiters.splice(0)) w(event);
            }
          }
        }
      });
    },
  );
  req.end();
  return {
    events,
    waitFor(pred) {
      const existing = events.find(pred);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve) => {
        const handler = (event) => {
          if (pred(event)) resolve(event);
          else waiters.push(handler);
        };
        waiters.push(handler);
      });
    },
    close() {
      req.destroy();
    },
  };
}

const FAST_CONTEXT = {
  roomId: 'daily-room',
  socketPath: '/tmp/jitsi-agent.sock',
  role: 'agent',
  capabilities: { chat: 'readwrite', screenshare: 'share', video: 'publish', audio: 'publish' },
  governedTools: ['draw_canvas', 'share_surface', 'send_video_metadata'],
};

async function main() {
  const bridge = createBridgeHttpServer({ controller: {} });
  const { url: base } = await bridge.listen(0);
  const sse = openSse(base);

  try {
    // (1) initialize + tools/list over POST /mcp.
    {
      const init = await rpc(base, 'initialize', {});
      assert.equal(init.status, 200);
      assert.equal(init.json.result.serverInfo.name, 'kradle', 'serverInfo.name');
      const tools = await rpc(base, 'tools/list', {}, 2);
      const names = tools.json.result.tools.map((t) => t.name);
      assert.ok(names.includes('kradle_share_surface'), 'tools/list includes kradle_share_surface');
      assert.ok(names.includes('kradle_send_chat_message'), 'tools/list includes kradle_send_chat_message');
      log('PASS', 'initialize+tools-list', `tools=${names.length}`);
    }

    // (2) FAST tool — synchronous {socketPath, command}, no correlationId, no run.
    {
      const res = await callTool(base, 'kradle_send_chat_message', {
        text: 'hello room',
        meetingContext: FAST_CONTEXT,
      }, 10);
      assert.equal(res.status, 200);
      // Fast tool is an UNCHANGED MCP result: the structured value is JSON text
      // inside result.content[0].text (mcp-server.js:307-310).
      const result = JSON.parse(res.json.result.content[0].text);
      assert.equal(result.socketPath, '/tmp/jitsi-agent.sock', 'fast socketPath');
      assert.deepEqual(result.command, { action: 'send_chat', text: 'hello room' }, 'fast command');
      assert.ok(!('correlationId' in result), 'fast tool has no correlationId');
      assert.ok(!('governed' in result), 'fast tool is not governed');
      log('PASS', 'fast-tool-synchronous', `command=${JSON.stringify(result.command)}`);
    }

    // (3) GOVERNED approve — immediate waiting-approval; command ABSENT until approve.
    let approveCorr;
    {
      const res = await callTool(base, 'kradle_share_surface', {
        surface: 'browser',
        url: 'https://slides.example/deck',
        nonce: 'approve-case',
        meetingContext: FAST_CONTEXT,
      }, 20);
      assert.equal(res.status, 200);
      const result = res.json.result;
      assert.equal(result.status, 'waiting-approval', 'governed returns waiting-approval');
      assert.ok(typeof result.correlationId === 'string' && result.correlationId.length > 0, 'has correlationId');
      assert.ok(typeof result.filler === 'string' && result.filler.length > 0, 'has filler');
      assert.ok(!('command' in result), 'waiting-approval carries NO command');
      approveCorr = result.correlationId;

      // poll shows waiting + command ABSENT (no outcome).
      const poll1 = await request(base, 'GET', `/governance/${approveCorr}`);
      assert.equal(poll1.status, 200);
      assert.equal(poll1.json.status, 'waiting-approval', 'poll status waiting');
      assert.ok(!('outcome' in poll1.json), 'poll outcome ABSENT while waiting');
      assert.ok(!JSON.stringify(poll1.json).includes('"command"'), 'no command in waiting poll');

      // approve via OWNER channel.
      const approve = await request(base, 'POST', `/governance/${approveCorr}/approve`, { response: 'ok' });
      assert.equal(approve.status, 200, 'approve accepted');

      // SSE delivers terminal approved + command.
      const sseEvent = await sse.waitFor((e) => e.correlationId === approveCorr && e.status === 'approved');
      assert.deepEqual(sseEvent.command, { action: 'share_surface', surface: 'browser', url: 'https://slides.example/deck' }, 'SSE command');

      // poll now delivers approved + command.
      let pollFinal = await request(base, 'GET', `/governance/${approveCorr}`);
      // tolerate a microtask gap between settle's subscriber notify and the poll
      for (let i = 0; i < 50 && pollFinal.json.status !== 'approved'; i += 1) {
        await new Promise((r) => setImmediate(r));
        pollFinal = await request(base, 'GET', `/governance/${approveCorr}`);
      }
      assert.equal(pollFinal.json.status, 'approved', 'poll status approved');
      assert.deepEqual(pollFinal.json.outcome.command, { action: 'share_surface', surface: 'browser', url: 'https://slides.example/deck' }, 'poll command');
      log('PASS', 'governed-approve', `corr=${approveCorr} command delivered post-approve`);
    }

    // (4) GOVERNED deny — second call, different nonce => different corr; deny => no command.
    let denyCorr;
    {
      const res = await callTool(base, 'kradle_share_surface', {
        surface: 'browser',
        url: 'https://slides.example/other',
        nonce: 'deny-case',
        meetingContext: FAST_CONTEXT,
      }, 30);
      const result = res.json.result;
      assert.equal(result.status, 'waiting-approval', 'second governed waiting');
      denyCorr = result.correlationId;
      assert.notEqual(denyCorr, approveCorr, 'distinct correlationId per nonce');

      const deny = await request(base, 'POST', `/governance/${denyCorr}/deny`, { reason: 'no' });
      assert.equal(deny.status, 200, 'deny accepted');

      const sseEvent = await sse.waitFor((e) => e.correlationId === denyCorr && e.status === 'denied');
      assert.ok(!('command' in sseEvent), 'denied SSE has NO command');

      let pollFinal = await request(base, 'GET', `/governance/${denyCorr}`);
      for (let i = 0; i < 50 && pollFinal.json.status !== 'denied'; i += 1) {
        await new Promise((r) => setImmediate(r));
        pollFinal = await request(base, 'GET', `/governance/${denyCorr}`);
      }
      assert.equal(pollFinal.json.status, 'denied', 'poll status denied');
      assert.ok(!JSON.stringify(pollFinal.json).includes('"command"'), 'no command in denied poll');
      log('PASS', 'governed-deny', `corr=${denyCorr} reason=${sseEvent.reason}`);
    }

    // (5) POLICY hard-deny — surface:'system' => immediate denied, NO run registered (404 poll).
    {
      const res = await callTool(base, 'kradle_share_surface', {
        surface: 'system',
        nonce: 'hard-deny',
        meetingContext: FAST_CONTEXT,
      }, 40);
      assert.equal(res.status, 200);
      const result = res.json.result;
      assert.equal(result.denied, true, 'hard-deny denied:true');
      assert.equal(result.reason, 'surface-not-allowed', 'hard-deny reason');
      assert.ok(!('command' in result), 'hard-deny carries no command');

      const poll = await request(base, 'GET', `/governance/${result.correlationId}`);
      assert.equal(poll.status, 404, 'hard-deny correlationId is 404 (no run)');
      log('PASS', 'policy-hard-deny', `reason=${result.reason} poll=404`);
    }

    // (6) RACE invariant — command never appeared in any SSE/poll before its approve.
    {
      // Across cases 3/4 only the approved corr ever yielded a command, and it
      // arrived only AFTER the approve POST (asserted inline above). The deny
      // corr never yielded a command in any SSE event.
      const denyHadCommand = sse.events.some((e) => e.correlationId === denyCorr && 'command' in e);
      assert.ok(!denyHadCommand, 'denied corr never emitted a command');
      const approveCommandEvents = sse.events.filter((e) => e.correlationId === approveCorr && 'command' in e);
      assert.equal(approveCommandEvents.length, 1, 'approved corr emitted exactly one command, post-approve');
      log('PASS', 'race-invariant', 'command never before approve');
    }
  } catch (err) {
    log('FAIL', 'verify', err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) process.stderr.write(err.stack + '\n');
  } finally {
    sse.close();
    await bridge.close();
  }

  const state = failures === 0 ? 'pass' : 'fail';
  process.stdout.write(`[verify-bridge-delivery] FINAL state=${state} failures=${failures}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
