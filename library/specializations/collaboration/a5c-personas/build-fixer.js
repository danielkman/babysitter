/**
 * @process specializations/collaboration/a5c-personas/build-fixer
 * @description CI failure triage (a5c build-fixer-agent persona). Classifies failures
 *   into three categories — project code, infrastructure, flaky test — and runs the
 *   matching playbook (PR fix, infra PR, or @developer-agent issue).
 * @inputs { workflowRun: object, failureLogs?: string, repo?: string }
 * @outputs { success: boolean, category: "project-code"|"infra"|"flaky-test"|"unknown", artifact?: string }
 *
 * Source: a5c-ai/registry/prompts/development/build-fixer-agent.prompt.md
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

const triageTask = defineTask(
  'build-fixer.triage-failure',
  async ({ workflowRun, failureLogs }, ctx) => {
    return ctx.agent({
      title: `Triage CI failure for run ${workflowRun?.id ?? '?'}`,
      prompt: [
        'You are the build-fixer-agent. Analyse this GitHub Actions workflow failure and classify it:',
        '- "project-code": failure caused by actual code in the repo (compile error, logic bug surfaced by tests).',
        '- "infra": build config, dependency pin, environmental or CI-config problem.',
        '- "flaky-test": a specific test that is intermittent or environment-sensitive; not a code bug.',
        '',
        'Only operate on commits to primary/integration branches (main, develop, a5c/main). If this is a feature',
        'branch run, return { category: "unknown", skip: true, reason: "not on primary branch" }.',
        '',
        `Workflow run: ${JSON.stringify(workflowRun ?? {}, null, 2)}`,
        `Logs (may be truncated):\n${(failureLogs ?? '').slice(0, 40000)}`,
        '',
        'Return JSON: { category, rootCause, relatedFailures: string[], skip?: boolean, reason?: string }.',
      ].join('\n'),
    });
  },
  { kind: 'agent', title: 'Triage CI failure', labels: ['a5c', 'build-fixer', 'ci'] },
);

const fixCodeTask = defineTask(
  'build-fixer.fix-project-code',
  async ({ workflowRun, triage }, ctx) => {
    return ctx.agent({
      title: 'Open PR fixing project-code failure',
      prompt: [
        'Category 1 (project-code). Open a PR that fixes the real underlying issue.',
        'Include: root-cause explanation, verification steps, link to failing workflow run, labels "build" + "bug" + priority.',
        'Do NOT disable tests or mask failures.',
        `Triage: ${JSON.stringify(triage)}`,
        `Run: ${JSON.stringify(workflowRun ?? {})}`,
        'Return JSON: { prUrl: string, summary: string }.',
      ].join('\n'),
    });
  },
  { kind: 'agent', title: 'Fix project code (Cat 1)', labels: ['a5c', 'build-fixer'] },
);

const fixInfraTask = defineTask(
  'build-fixer.fix-infra',
  async ({ workflowRun, triage }, ctx) => {
    return ctx.agent({
      title: 'Open PR fixing infra/config failure',
      prompt: [
        'Category 2 (infra). Open a PR that fixes CI config, dependency pins, tool versions, or environment setup.',
        'Include: verification steps, link to failing run, labels "build" + "infra" + priority.',
        'Avoid masking: fix the root cause, not the symptom.',
        `Triage: ${JSON.stringify(triage)}`,
        `Run: ${JSON.stringify(workflowRun ?? {})}`,
        'Return JSON: { prUrl: string, summary: string }.',
      ].join('\n'),
    });
  },
  { kind: 'agent', title: 'Fix infra (Cat 2)', labels: ['a5c', 'build-fixer'] },
);

const fileFlakyIssueTask = defineTask(
  'build-fixer.file-flaky-issue',
  async ({ workflowRun, triage }, ctx) => {
    return ctx.agent({
      title: 'File consolidated flaky-test issue for @developer-agent',
      prompt: [
        'Category 3 (flaky-test). Do NOT attempt to self-fix. File a consolidated GitHub issue:',
        '- Tag @developer-agent.',
        '- Group related flaky failures in one issue to avoid noise.',
        '- Include: test name(s), failure context, link to workflow run, reproduction hints if any.',
        '- Labels: "build" + "bug" + "flaky" + priority.',
        '- Before filing, search for an existing similar issue/PR and cross-link instead of duplicating.',
        `Triage: ${JSON.stringify(triage)}`,
        `Run: ${JSON.stringify(workflowRun ?? {})}`,
        'Return JSON: { issueUrl: string, summary: string }.',
      ].join('\n'),
    });
  },
  { kind: 'agent', title: 'File flaky-test issue (Cat 3)', labels: ['a5c', 'build-fixer'] },
);

export async function process(inputs, ctx) {
  const { workflowRun = {}, failureLogs = '' } = inputs ?? {};
  const triage = await ctx.task(triageTask, { workflowRun, failureLogs });
  if (triage?.skip) {
    return { success: true, category: 'unknown', artifact: triage?.reason };
  }
  const category = triage?.category ?? 'unknown';
  let artifact;
  if (category === 'project-code') {
    const fix = await ctx.task(fixCodeTask, { workflowRun, triage });
    artifact = fix?.prUrl;
  } else if (category === 'infra') {
    const fix = await ctx.task(fixInfraTask, { workflowRun, triage });
    artifact = fix?.prUrl;
  } else if (category === 'flaky-test') {
    const file = await ctx.task(fileFlakyIssueTask, { workflowRun, triage });
    artifact = file?.issueUrl;
  }
  return { success: category !== 'unknown', category, artifact };
}
