/**
 * @process specializations/collaboration/a5c-personas/validator
 * @description Multi-dimensional PR validator (a5c validator-agent persona). Reviews code
 *   quality, architecture, tests, security, UX, and business impact; files non-blocking
 *   findings under docs/validation/<prNumber>/<priority>/<category>/NN-title.md (the
 *   deferred-debt filesystem convention); returns blockers separately.
 * @inputs { pr: object, prDiff: string }
 * @outputs { success: boolean, approved: boolean, blockers: string[], deferredFindings: string[] }
 *
 * Source: a5c-ai/registry/prompts/development/validator-agent.prompt.md
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

const reviewTask = defineTask(
  'validator.multi-dim-review',
  async ({ pr, prDiff }, ctx) => {
    return ctx.agent({
      title: `Validator: multi-dim review of PR #${pr?.number ?? '?'}`,
      prompt: [
        'You are the validator-agent. Perform a thorough, multi-dimensional review of this PR.',
        'Dimensions to cover: code quality, functionality, architecture, QA/testing, security, product/UX, business impact.',
        '',
        'Classification:',
        '- BLOCKING: showstopper/critical issues that must be fixed before merge (bugs, security holes, broken tests, arch violations).',
        '- NON-BLOCKING (deferred debt): high/medium/low follow-ups that should not gate merge.',
        '',
        'For each non-blocking finding, write a file at:',
        '  docs/validation/<prNumber>/<priority>/<category>/NN-title.md',
        'where priority ∈ {high, medium, low}, category describes the concern (e.g. tests, security, arch, ux),',
        'and NN is a zero-padded sequence within that priority+category folder.',
        'Cap concurrent new files at 5 — prioritise the most valuable findings.',
        '',
        'For trivial issues (typos, lint), fix them directly on the PR branch instead of filing a finding.',
        'For complex issues needing another persona, mention the relevant @agent in a NEW comment (not an edit).',
        '',
        `PR metadata: ${JSON.stringify(pr ?? {}, null, 2)}`,
        `Diff (may be truncated):\n${(prDiff ?? '').slice(0, 60000)}`,
        '',
        'Return JSON: { approved: boolean, blockers: string[], deferredFindings: string[], summary: string }.',
      ].join('\n'),
    });
  },
  { kind: 'agent', title: 'Validator multi-dim review', labels: ['a5c', 'validator', 'review'] },
);

const approveTask = defineTask(
  'validator.approve-or-request-changes',
  async ({ pr, blockers }, ctx) => {
    return ctx.agent({
      title: `Validator: post verdict on PR #${pr?.number ?? '?'}`,
      prompt: [
        'You are the validator-agent. Post the verdict for this PR.',
        blockers?.length
          ? `There are ${blockers.length} blocker(s). Request changes; list blockers concisely; @developer-agent to address.`
          : 'No blockers. Approve the PR. Link any deferred-debt findings under docs/validation/.',
        'Use a NEW comment so the mention triggers the next agent.',
        `Blockers: ${JSON.stringify(blockers ?? [])}`,
      ].join('\n'),
    });
  },
  { kind: 'agent', title: 'Validator verdict', labels: ['a5c', 'validator'] },
);

export async function process(inputs, ctx) {
  const { pr = {}, prDiff = '' } = inputs ?? {};
  const review = await ctx.task(reviewTask, { pr, prDiff });
  const blockers = Array.isArray(review?.blockers) ? review.blockers : [];
  await ctx.task(approveTask, { pr, blockers });
  return {
    success: true,
    approved: blockers.length === 0 && review?.approved !== false,
    blockers,
    deferredFindings: Array.isArray(review?.deferredFindings) ? review.deferredFindings : [],
  };
}
