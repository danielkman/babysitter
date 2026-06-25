/**
 * In-process run driver for governed visual tools (G13), SDK-side.
 *
 * Drives a babysitter run of governed-visual-tool.process.js to completion
 * using the REAL SDK primitives createRun / orchestrateIteration /
 * commitEffectResult. For each requested effect action it resolves the value IN
 * THE HOST (genty lesson: never make the LLM drive the sub-tool) — breakpoints
 * via resolvers.approve, task effects via resolvers.execute — then commits the
 * result and iterates until a terminal IterationResult.
 *
 * Imports @a5c-ai/babysitter-sdk resolved from root node_modules. This is a
 * VERIFY-TIME / bridge-time import only; the zero-dep kradle cli never imports
 * this file at runtime, so it is NOT a declared cli dependency.
 *
 * @reference docs/research/voice-governance-bridge-spec.md §3.3
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRun, orchestrateIteration, commitEffectResult } from '@a5c-ai/babysitter-sdk';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOVERNED_PROCESS_PATH = path.join(HERE, 'governed-visual-tool.process.js');

/**
 * @typedef {Object} GovernedResolvers
 * @property {(action: object) => any} execute - resolves a task effect in the host.
 * @property {(action: object) => any} approve - resolves a breakpoint in the host.
 */

/**
 * Drive the governed visual tool process to a terminal outcome.
 * @param {object} options
 * @param {string} options.runsDir - directory the run is created under.
 * @param {string} [options.runId] - optional explicit run id.
 * @param {object} options.inputs - process inputs ({action,payload,meetingRef,roomId,socketPath,context,correlationId}).
 * @param {GovernedResolvers} options.resolvers
 * @returns {Promise<{ok:boolean, value?:any, error?:any, halted?:string}>}
 */
export async function driveGovernedTool({ runsDir, runId, inputs, resolvers }) {
  if (!resolvers || typeof resolvers.execute !== 'function' || typeof resolvers.approve !== 'function') {
    throw new Error('driveGovernedTool requires resolvers.execute and resolvers.approve');
  }

  const { runDir } = await createRun({
    runsDir,
    runId,
    process: {
      processId: 'governed-visual-tool',
      importPath: GOVERNED_PROCESS_PATH,
      exportName: 'process',
    },
    inputs,
  });

  for (;;) {
    const it = await orchestrateIteration({ runDir });
    if (it.status === 'completed') return { ok: true, value: it.output };
    if (it.status === 'failed') return { ok: false, error: it.error };
    if (it.status === 'process-error') return { ok: false, error: it.error };
    if (it.status === 'halted') return { ok: false, halted: it.reason };
    if (it.status === 'waiting') {
      for (const action of it.nextActions) {
        const isBreakpoint = action.kind === 'breakpoint';
        const value = isBreakpoint
          ? await resolvers.approve(action)
          : await resolvers.execute(action);
        await commitEffectResult({
          runDir,
          effectId: action.effectId,
          invocationKey: action.invocationKey,
          result: { status: 'ok', value },
        });
      }
      continue;
    }
    // Unknown status — fail loud, no fallback.
    throw new Error(`unexpected IterationResult status: ${it.status}`);
  }
}

export { GOVERNED_PROCESS_PATH };
