/**
 * @process processes/shared/communication/handoff-conventions
 * @description Post an explicit handoff message when transferring work between agents/humans.
 * @inputs { workSummary: string, nextActor: string, whereStateLives: string, condition?: string }
 * @outputs { success: boolean, handoffMessage: string }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

const composeHandoffTask = defineTask(
  'handoff.compose',
  async ({ workSummary, nextActor, whereStateLives, condition }, ctx) => {
    return ctx.agent({
      title: 'Compose explicit handoff message',
      prompt: [
        'Compose a single handoff message covering:',
        '- What was done',
        '- What is pending',
        '- Where state lives (branch, PR, run directory, etc.)',
        '- What the next actor needs to decide',
        condition ? `- The handoff condition: ${condition}` : '',
        '',
        `Work summary: ${workSummary}`,
        `Next actor: ${nextActor}`,
        `Where state lives: ${whereStateLives}`,
        '',
        'Do not hand off silently. Ambiguous handoffs are indistinguishable from abandoned work.',
        'Return JSON: { handoffMessage: string }.',
      ].filter(Boolean).join('\n'),
    });
  },
  { kind: 'agent', title: 'Compose handoff', labels: ['communication', 'handoff'] },
);

export async function process(inputs, ctx) {
  const { workSummary, nextActor, whereStateLives, condition } = inputs;
  const result = await ctx.task(composeHandoffTask, { workSummary, nextActor, whereStateLives, condition });
  return { success: true, handoffMessage: result.handoffMessage };
}
