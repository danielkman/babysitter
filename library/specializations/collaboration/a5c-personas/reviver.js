/**
 * @process specializations/collaboration/a5c-personas/reviver
 * @description Stuck-thread detector (a5c reviver-agent persona). Scans PRs then issues
 *   for idle > 60min threads, re-tags the next-responsible agent in a NEW comment, and
 *   safe-closes merged PRs or validator-superseded issues.
 * @inputs { idleThresholdMinutes?: number, scope?: "repo"|"single", target?: { type: "pr"|"issue", number: number } }
 * @outputs { success: boolean, actions: Array<object> }
 *
 * Source: a5c-ai/registry/prompts/development/reviver-agent.prompt.md
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

const scanAndReviveTask = defineTask(
  'reviver.scan-and-revive',
  async ({ idleThresholdMinutes, scope, target }, ctx) => {
    return ctx.agent({
      title: 'Reviver: scan stuck threads and re-tag next-responsible agent',
      prompt: [
        'You are the reviver-agent. Keep issues and PRs moving.',
        '',
        `Scope: ${scope === 'single' ? `single item ${JSON.stringify(target)}` : 'whole repo'}.`,
        `Idle threshold: ${idleThresholdMinutes} minutes since last activity (comment/commit/status/review).`,
        '',
        'Order: scan PRs first, then issues. For items idle beyond threshold, post ONE concise comment that:',
        '  - summarises the blocker in 1-2 bullets,',
        '  - tags the next-responsible AGENT (not a human user),',
        '  - politely asks for follow-up.',
        'Use a NEW comment (not an edit) so the mention triggers the agent.',
        '',
        'Next-responsible heuristics:',
        '  1. Most recent request in thread mentions an agent → tag that one.',
        '  2. Else → @developer-agent.',
        '  3. Else → infer from labels/title/body (docs → @documenter-agent, "build failing" → @build-fixer-agent).',
        '',
        'Special cases:',
        '  - PR with merge conflicts (mergeable_state=="dirty") → tag @fix-conflicts instead of the inferred agent.',
        '  - If PR+issue linked, comment only on the PR.',
        '  - If merged PR did not auto-close its linked issue, close the issue with a comment linking the PR.',
        '  - If validator approved a PR but it is not merged, merge it instead of reviving.',
        '  - If all PRs associated with an issue are merged, close the issue.',
        '  - Issues titled "[Validator]" older than a day at < high priority → close them.',
        '  - Never revive: closed items, items with an open PR (revive the PR instead), "low priority" PRs,',
        '    "build"+"bug" labelled PRs (close those instead).',
        '',
        'Priorities: issues labelled "a5c"; issues not opened by a5c-ai[bot]; draft PRs (above non-draft issues);',
        'lowest priority to [Validator] issues. Respect showstopper > critical > high > medium > low.',
        '',
        'Limits: up to 25 revive-comments per round; closes can exceed that. Do not create a journal PR/file for',
        'the revive process itself; do not post GitHub check statuses from this process.',
        '',
        'Return JSON: { actions: Array<{ kind: "comment"|"close"|"merge"|"skip", target: string, agentTagged?: string, note?: string }> }.',
      ].join('\n'),
    });
  },
  { kind: 'agent', title: 'Scan & revive', labels: ['a5c', 'reviver'] },
);

export async function process(inputs, ctx) {
  const { idleThresholdMinutes = 60, scope = 'repo', target } = inputs ?? {};
  const result = await ctx.task(scanAndReviveTask, { idleThresholdMinutes, scope, target });
  return {
    success: true,
    actions: Array.isArray(result?.actions) ? result.actions : [],
  };
}
