/**
 * @process processes/shared/a5c-protocol/progressive-updates
 * @description Progressive-updates discipline: abort-if-irrelevant gate → plan file at
 *   docs/dev/{agent}/{task}-{ts}.md → first commit → draft PR → execute → mark
 *   ready-for-review → @validator-agent. Primary branch is `a5c/main`; never commit
 *   directly to it. Emits follow-up URIs in the a5c.ai format.
 * @inputs { agent: string, task: string, issueRef?: object, prRef?: object, targetBranch?: string }
 * @outputs { success: boolean, outcome: "aborted"|"delivered", planPath?: string, prUrl?: string, followUps?: string[] }
 *
 * Source: a5c-ai/action/default-prompt.md (progressive updates, abort gate, follow-up URIs)
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

const abortGateTask = defineTask(
  'progressive-updates.abort-if-irrelevant',
  async ({ issueRef, prRef }, ctx) => {
    return ctx.agent({
      title: 'Abort-if-irrelevant gate',
      prompt: [
        'You are running the abort-if-irrelevant gate at the start of an a5c agent run.',
        'Abort the entire run (and delete the working branch if one was created) if ANY of:',
        '  - The referenced issue is already closed.',
        '  - The referenced PR is already merged or closed.',
        '  - Another agent has already started/finished the same task (branch exists with their work).',
        '  - The task is otherwise no longer relevant.',
        `Issue: ${JSON.stringify(issueRef ?? null)}`,
        `PR: ${JSON.stringify(prRef ?? null)}`,
        'Return JSON: { abort: boolean, reason?: string }.',
      ].join('\n'),
    });
  },
  { kind: 'agent', title: 'Abort-if-irrelevant gate', labels: ['a5c', 'progressive-updates'] },
);

const writePlanTask = defineTask(
  'progressive-updates.write-plan',
  async ({ agent, task }, ctx) => {
    return ctx.agent({
      title: 'Write initial plan doc + first commit',
      prompt: [
        'Configure git identity: user.name=<agent-name>, user.email=a5c-agent@a5c.ai.',
        'Create working branch off of `a5c/main` (the primary branch). NEVER commit directly to `a5c/main`.',
        `Write an initial plan file at: docs/dev/${agent}/${task}-${new Date().toISOString().replace(/[:.]/g, '-')}.md`,
        'Plan file should contain: goal, approach, acceptance criteria, risks, follow-ups placeholder.',
        'Commit the plan as the FIRST commit on the branch.',
        'Return JSON: { planPath: string, branch: string, commitSha: string }.',
      ].join('\n'),
    });
  },
  { kind: 'agent', title: 'Write plan + first commit', labels: ['a5c', 'progressive-updates'] },
);

const draftPrTask = defineTask(
  'progressive-updates.open-draft-pr',
  async ({ agent, task, branch, planPath }, ctx) => {
    return ctx.agent({
      title: 'Open draft PR',
      prompt: [
        'Open a DRAFT pull request targeting `a5c/main`. Body should link the plan file and outline the intended changes.',
        `Branch: ${branch}`,
        `Plan: ${planPath}`,
        `Agent: ${agent} / Task: ${task}`,
        'Return JSON: { prUrl: string, prNumber: number }.',
      ].join('\n'),
    });
  },
  { kind: 'agent', title: 'Open draft PR', labels: ['a5c', 'progressive-updates'] },
);

const executeTask = defineTask(
  'progressive-updates.execute-and-update',
  async ({ agent, task, branch, planPath, prUrl }, ctx) => {
    return ctx.agent({
      title: 'Execute plan, update plan doc, push commits',
      prompt: [
        'Execute the plan. Commit in small, reviewable steps on the working branch.',
        'After each meaningful step, append progress to the plan doc and push.',
        'Before marking ready-for-review: rebase onto the latest `a5c/main`.',
        `Branch: ${branch}; Plan: ${planPath}; PR: ${prUrl}; Agent: ${agent}; Task: ${task}`,
        'Return JSON: { commitsPushed: number, readyForReview: boolean }.',
      ].join('\n'),
    });
  },
  { kind: 'agent', title: 'Execute + update', labels: ['a5c', 'progressive-updates'] },
);

const readyAndValidateTask = defineTask(
  'progressive-updates.ready-and-call-validator',
  async ({ prUrl, agent, task }, ctx) => {
    return ctx.agent({
      title: 'Mark PR ready + call validator',
      prompt: [
        'Mark the draft PR as ready-for-review. In a NEW comment (not an edit), mention @validator-agent.',
        'If there are follow-ups, list them at the bottom of the PR body using the a5c follow-up URI convention:',
        '  follow ups: [agent name](https://app.a5c.ai/follow-ups/<agent-name>/<description>)',
        `PR: ${prUrl}; Agent: ${agent}; Task: ${task}`,
        'Return JSON: { readyForReview: boolean, followUps: string[] }.',
      ].join('\n'),
    });
  },
  { kind: 'agent', title: 'Ready + call validator', labels: ['a5c', 'progressive-updates'] },
);

export async function process(inputs, ctx) {
  const { agent = 'developer-agent', task = 'task', issueRef, prRef } = inputs ?? {};
  const gate = await ctx.task(abortGateTask, { issueRef, prRef });
  if (gate?.abort) {
    return { success: true, outcome: 'aborted', planPath: undefined, prUrl: undefined };
  }
  const plan = await ctx.task(writePlanTask, { agent, task });
  const draft = await ctx.task(draftPrTask, {
    agent,
    task,
    branch: plan?.branch,
    planPath: plan?.planPath,
  });
  await ctx.task(executeTask, {
    agent,
    task,
    branch: plan?.branch,
    planPath: plan?.planPath,
    prUrl: draft?.prUrl,
  });
  const done = await ctx.task(readyAndValidateTask, {
    prUrl: draft?.prUrl,
    agent,
    task,
  });
  return {
    success: true,
    outcome: 'delivered',
    planPath: plan?.planPath,
    prUrl: draft?.prUrl,
    followUps: Array.isArray(done?.followUps) ? done.followUps : [],
  };
}
