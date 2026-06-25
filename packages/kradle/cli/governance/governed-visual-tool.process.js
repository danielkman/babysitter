/**
 * @process governance/governed-visual-tool
 * @description Deterministic babysitter process governing one consequential
 *   visual tool call (draw_canvas / share_surface / send_video_metadata).
 *   resolveTarget → policyCheck → optional owner approval breakpoint →
 *   emitSocketCommand. On deny or approval-reject it returns {status:'denied'}
 *   and NEVER emits a socket command. Must be deterministic across replay:
 *   it branches only on effect results / breakpoint results; all ids and values
 *   enter via inputs or effect results.
 * @inputs { action, payload, meetingRef, roomId, socketPath, context?, correlationId? }
 * @outputs { status: 'approved'|'denied', socketPath?, command?, reason?, response? }
 * @reference docs/research/voice-governance-bridge-spec.md §6, §8A
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

// resolveTarget: pure shaping/validation of the requested target. Host-executed.
const resolveTarget = defineTask('governed-visual.resolve-target', (args, taskCtx) => ({
  kind: 'governed-visual.resolve-target',
  title: `Resolve target for ${args.action}`,
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
  metadata: { action: args.action },
}));

// policyCheck: the host runs the PolicyEngine and returns {decision,reason,breakpointId}.
const policyCheck = defineTask('governed-visual.policy-check', (args, taskCtx) => ({
  kind: 'governed-visual.policy-check',
  title: `Policy check for ${args.action}`,
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
  metadata: { action: args.action },
}));

// emitSocketCommand: the host returns the {socketPath, command} the sidecar consumes.
const emitSocketCommand = defineTask('governed-visual.emit-socket-command', (args, taskCtx) => ({
  kind: 'governed-visual.emit-socket-command',
  title: `Emit socket command for ${args.action}`,
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
  metadata: { action: args.action },
}));

export async function process(inputs, ctx) {
  const action = inputs.action;
  const payload = inputs.payload || {};

  const target = await ctx.task(resolveTarget, {
    action,
    payload,
    meetingRef: inputs.meetingRef,
    roomId: inputs.roomId,
    socketPath: inputs.socketPath,
  });

  const policy = await ctx.task(policyCheck, {
    action,
    payload,
    context: inputs.context || {},
  });

  if (policy.decision === 'deny') {
    return { status: 'denied', reason: policy.reason };
  }

  if (policy.decision === 'require-approval') {
    const ok = await ctx.breakpoint(
      {
        title: `Approve ${action} in ${inputs.meetingRef}?`,
        action,
        target,
        correlationId: inputs.correlationId,
      },
      {
        breakpointId: policy.breakpointId,
        expert: 'owner',
        tags: ['approval-gate', 'media-governance', `meeting:${inputs.meetingRef}`],
      },
    );
    if (!ok.approved) {
      return { status: 'denied', reason: 'approval-rejected', response: ok.response };
    }
  }

  const emitted = await ctx.task(emitSocketCommand, {
    action,
    payload,
    socketPath: target.socketPath || inputs.socketPath,
  });

  return { status: 'approved', socketPath: emitted.socketPath, command: emitted.command };
}
