/**
 * SDK-driven verify for the G13 governed visual-tool process + driver.
 *
 * Imports @a5c-ai/babysitter-sdk from root node_modules (VERIFY-TIME import,
 * not a declared cli dependency) and drives governed-visual-tool.process.js
 * through run-driver.js for four cases:
 *   (a) approve            -> {status:'approved', socketPath, command:{action,...payload}}
 *   (b) policy hard-deny    -> {status:'denied'} with NO command
 *   (c) breakpoint reject   -> {status:'denied', reason:'approval-rejected'} with NO command
 *   (d) replay/determinism  -> same inputs+resolutions twice => identical outcome
 *
 * Prints PASS/FAIL per case and a final state line; exits non-zero on any failure.
 *
 * @reference docs/research/voice-governance-bridge-spec.md §3.3, §6
 */

import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { evaluateVisualPolicy } from '../src/policy-engine.js';
import { driveGovernedTool } from './run-driver.js';

let failures = 0;
const log = (state, name, detail) => {
  if (state === 'FAIL') failures += 1;
  process.stdout.write(`[verify-governed-visual] ${state} ${name}${detail ? ` — ${detail}` : ''}\n`);
};

/**
 * Read the args a task effect was invoked with. Inputs are inlined into
 * task.json (`inputs`) for small payloads, or spilled to `inputsRef`.
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
 * policyCheck via the PolicyEngine, emitSocketCommand). Dispatches on the
 * taskDef kind discovered from the run dir.
 */
function makeExecuteResolver(runDir) {
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

async function drive(runsDir, runId, inputs, approveDecision) {
  const resolvers = {
    execute: makeExecuteResolver(path.join(runsDir, runId)),
    approve: async () => approveDecision,
  };
  return driveGovernedTool({ runsDir, runId, inputs, resolvers });
}

async function main() {
  const runsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'governed-visual-verify-'));
  try {
    const baseInputs = {
      action: 'share_surface',
      payload: { surface: 'browser', url: 'https://slides.example/deck' },
      meetingRef: 'daily-room',
      roomId: 'daily-room',
      socketPath: '/tmp/jitsi-agent.sock',
      context: {},
      correlationId: 'corr-fixed-1',
    };

    // (a) approve
    {
      const out = await drive(runsDir, 'case-approve', baseInputs, { approved: true, response: 'ok' });
      assert.ok(out.ok, `run not ok: ${JSON.stringify(out)}`);
      assert.equal(out.value.status, 'approved', 'expected approved status');
      assert.equal(out.value.socketPath, '/tmp/jitsi-agent.sock');
      assert.deepEqual(out.value.command, { action: 'share_surface', surface: 'browser', url: 'https://slides.example/deck' });
      log('PASS', 'approve', `command=${JSON.stringify(out.value.command)}`);
    }

    // (b) policy hard-deny (denied surface) — NO command present
    {
      const denyInputs = { ...baseInputs, payload: { surface: 'system' }, correlationId: 'corr-deny' };
      const out = await drive(runsDir, 'case-deny', denyInputs, { approved: true });
      assert.ok(out.ok, `run not ok: ${JSON.stringify(out)}`);
      assert.equal(out.value.status, 'denied', 'expected denied status');
      assert.equal(out.value.reason, 'surface-not-allowed');
      assert.ok(!('command' in out.value), 'hard-deny must not carry a command');
      log('PASS', 'policy-hard-deny', `reason=${out.value.reason}`);
    }

    // (c) breakpoint reject — NO command present
    {
      const out = await drive(runsDir, 'case-reject', { ...baseInputs, correlationId: 'corr-reject' }, { approved: false, response: 'no' });
      assert.ok(out.ok, `run not ok: ${JSON.stringify(out)}`);
      assert.equal(out.value.status, 'denied', 'expected denied status');
      assert.equal(out.value.reason, 'approval-rejected');
      assert.ok(!('command' in out.value), 'breakpoint-reject must not carry a command');
      log('PASS', 'breakpoint-reject', `reason=${out.value.reason}`);
    }

    // (d) replay/determinism — same inputs + resolutions twice => identical outcome
    {
      const out1 = await drive(runsDir, 'case-replay-1', baseInputs, { approved: true, response: 'ok' });
      const out2 = await drive(runsDir, 'case-replay-2', baseInputs, { approved: true, response: 'ok' });
      assert.deepEqual(out1.value, out2.value, 'replay outcomes must be identical');
      log('PASS', 'replay-determinism', `outcome=${JSON.stringify(out1.value)}`);
    }
  } catch (err) {
    log('FAIL', 'verify', err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) process.stderr.write(err.stack + '\n');
  } finally {
    await fs.rm(runsDir, { recursive: true, force: true }).catch(() => {});
  }

  const state = failures === 0 ? 'pass' : 'fail';
  process.stdout.write(`[verify-governed-visual] FINAL state=${state} failures=${failures}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
