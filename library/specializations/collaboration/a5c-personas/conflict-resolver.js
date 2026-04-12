/**
 * @process specializations/collaboration/a5c-personas/conflict-resolver
 * @description Merge-conflict resolver (a5c conflict-resolver-agent persona). Works
 *   directly on the existing PR branch (never creates a new branch/PR). First checks
 *   whether upstream already covers the PR's intent — if so, closes the PR instead of
 *   resolving.
 * @inputs { pr: object }
 * @outputs { success: boolean, outcome: "resolved"|"closed-upstream-covers"|"escalated", summary: string }
 *
 * Source: a5c-ai/registry/prompts/development/conflict-resolver-agent.prompt.md
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

const upstreamCoverTask = defineTask(
  'conflict-resolver.upstream-already-covers',
  async ({ pr }, ctx) => {
    return ctx.agent({
      title: `Check if upstream already covers PR #${pr?.number ?? '?'}`,
      prompt: [
        'You are the conflict-resolver-agent. Before attempting a merge-conflict resolution, determine whether the',
        'PR is still needed: compare the PR branch\'s intent against the current base branch (which has advanced).',
        'If the base branch already contains equivalent changes (feature landed via another PR, or design supersedes),',
        'DO NOT resolve — instead close the PR with a comment linking the superseding change.',
        `PR: ${JSON.stringify(pr ?? {}, null, 2)}`,
        'Return JSON: { upstreamCovers: boolean, evidence: string, closePr: boolean }.',
      ].join('\n'),
    });
  },
  { kind: 'agent', title: 'Upstream-already-covers check', labels: ['a5c', 'conflict-resolver'] },
);

const resolveOnBranchTask = defineTask(
  'conflict-resolver.resolve-on-pr-branch',
  async ({ pr }, ctx) => {
    return ctx.agent({
      title: `Resolve merge conflicts on PR #${pr?.number ?? '?'} branch`,
      prompt: [
        'You are the conflict-resolver-agent. Resolve merge conflicts DIRECTLY on the existing PR branch.',
        'NEVER create a new branch. NEVER open a new PR. Commit and push to the existing PR head.',
        '',
        'Process:',
        '1. Fetch base + PR branch; identify all conflicting files.',
        '2. Research related issues, docs, and dependencies for each conflict to understand both sides\' intent.',
        '3. Resolve while preserving the functionality of BOTH conflicting changes where possible.',
        '4. Favour completeness and established project patterns; avoid dropping either side\'s work silently.',
        '5. Handle each category: simple line overlaps, structural (function/class) modifications, logic conflicts,',
        '   dependency version incompatibilities.',
        '6. Verify locally: build, tests, smoke functionality.',
        '7. Commit with a clear message; push to the PR branch; update the PR description explaining the resolution.',
        '',
        'If the decision requires maintainer input, escalate by @-mentioning the repo owner in a new comment.',
        `PR: ${JSON.stringify(pr ?? {}, null, 2)}`,
        'Return JSON: { resolved: boolean, escalated: boolean, summary: string }.',
      ].join('\n'),
    });
  },
  { kind: 'agent', title: 'Resolve conflicts on PR branch', labels: ['a5c', 'conflict-resolver'] },
);

export async function process(inputs, ctx) {
  const { pr = {} } = inputs ?? {};
  const cover = await ctx.task(upstreamCoverTask, { pr });
  if (cover?.upstreamCovers && cover?.closePr) {
    return {
      success: true,
      outcome: 'closed-upstream-covers',
      summary: cover.evidence ?? 'Upstream already covers PR intent; PR closed.',
    };
  }
  const resolve = await ctx.task(resolveOnBranchTask, { pr });
  return {
    success: resolve?.resolved === true,
    outcome: resolve?.escalated ? 'escalated' : resolve?.resolved ? 'resolved' : 'escalated',
    summary: resolve?.summary ?? '',
  };
}
