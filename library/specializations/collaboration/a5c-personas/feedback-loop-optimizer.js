/**
 * @process specializations/collaboration/a5c-personas/feedback-loop-optimizer
 * @description Feedback-loop auditor (a5c feedback-loop-optimizer-agent persona). Audits
 *   repo for gaps in pre-commit, CI, coverage, monitoring, and on-call; opens small
 *   (1–3h) decoupled issues per gap. Never commits code.
 * @inputs { repo?: string, focusAreas?: string[] }
 * @outputs { success: boolean, gapsFound: number, issuesOpened: string[] }
 *
 * Source: a5c-ai/registry/prompts/development/feedback-loop-optimizer-agent.prompt.md
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

const FOCUS_AREAS_DEFAULT = [
  'pre-commit-hooks',
  'e2e-smoke-tests',
  'ci-workflows',
  'linting-formatting',
  'coverage-reporting',
  'monitoring-logging-tracing',
  'alerting-on-call',
];

const auditTask = defineTask(
  'feedback-loop-optimizer.audit-gaps',
  async ({ repo, focusAreas }, ctx) => {
    return ctx.agent({
      title: 'Audit repo for feedback-loop gaps',
      prompt: [
        'You are the feedback-loop-optimizer-agent. Audit this repo and enumerate gaps across:',
        ...focusAreas.map((a) => `  - ${a}`),
        '',
        'Detect language/tooling choices before suggesting specifics:',
        '  - Pre-commit: ruff/black for Python; eslint/prettier for JS/TS; go fmt; etc.',
        '  - Tests: unit + integration baselines; E2E framework (Playwright) for web.',
        '  - Coverage: pytest-cov, nyc/istanbul, with thresholds wired into CI.',
        '  - CI: distinct jobs for lint, type-check, test, coverage, build.',
        '  - Monitoring: OpenTelemetry/Prometheus/Grafana/Loki OSS stack.',
        '  - Alerting: Alertmanager, Grafana OnCall, Healthchecks.io.',
        '',
        'Honour existing conventions; do not propose destructive migrations without replacement plans.',
        `Repo: ${repo ?? '(current workspace)'}`,
        'Return JSON: { gaps: Array<{ area: string, summary: string, proposedIssue: { title: string, body: string, labels: string[] } }> }.',
      ].join('\n'),
    });
  },
  { kind: 'agent', title: 'Audit feedback-loop gaps', labels: ['a5c', 'feedback-loop-optimizer'] },
);

const openIssuesTask = defineTask(
  'feedback-loop-optimizer.open-issues',
  async ({ gaps }, ctx) => {
    return ctx.agent({
      title: `Open ${gaps.length} decoupled feedback-loop issues`,
      prompt: [
        'You are the feedback-loop-optimizer-agent. Open one small (1-3 hour), decoupled GitHub issue per gap.',
        'Before opening each issue, search existing open issues to avoid duplicates — if a matching one exists,',
        'comment/link instead of duplicating.',
        'Required labels on every issue: "feedback-loop-optimizer" plus an area-specific tag',
        '(testing | ci | lint | coverage | monitoring | alerting | pre-commit).',
        'Never commit code directly — issues and PR comments only, via gh CLI.',
        `Gaps: ${JSON.stringify(gaps, null, 2)}`,
        'Return JSON: { issuesOpened: string[], deduped: string[] }.',
      ].join('\n'),
    });
  },
  { kind: 'agent', title: 'Open feedback-loop issues', labels: ['a5c', 'feedback-loop-optimizer'] },
);

export async function process(inputs, ctx) {
  const { repo, focusAreas = FOCUS_AREAS_DEFAULT } = inputs ?? {};
  const audit = await ctx.task(auditTask, { repo, focusAreas });
  const gaps = Array.isArray(audit?.gaps) ? audit.gaps : [];
  if (gaps.length === 0) {
    return { success: true, gapsFound: 0, issuesOpened: [] };
  }
  const opened = await ctx.task(openIssuesTask, { gaps });
  return {
    success: true,
    gapsFound: gaps.length,
    issuesOpened: Array.isArray(opened?.issuesOpened) ? opened.issuesOpened : [],
  };
}
