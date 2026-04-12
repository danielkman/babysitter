/**
 * @process specializations/domains/business/decision-intelligence/news-impact-assessment
 * @description Assess the impact of a news item on a defined portfolio of stakeholders (product lines, markets, partners).
 * @inputs { newsItem: { headline, source, url?, publishedAt, body }, portfolio: Array<{ id, name, exposure: string }>, horizon?: "immediate"|"quarter"|"year" }
 * @outputs { success: boolean, assessments: Array<object>, topImpacts: Array<object>, recommendedActions: Array<string> }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

const assessTask = defineTask(
  'news-impact.assess-one',
  async ({ newsItem, entry, horizon }, ctx) => {
    return ctx.agent({
      title: `Impact of news on "${entry.name}"`,
      prompt: [
        `Assess the impact of the news item on portfolio entry "${entry.name}".`,
        `News: ${newsItem.headline} (${newsItem.source}, ${newsItem.publishedAt})`,
        `Body: ${newsItem.body}`,
        newsItem.url ? `URL: ${newsItem.url}` : '',
        `Entry exposure: ${entry.exposure}`,
        `Horizon: ${horizon ?? 'quarter'}`,
        'Consider: direct revenue exposure, regulatory/compliance fallout, competitive positioning, supply-chain ripple, reputational risk, opportunity windows.',
        'Return JSON: { entryId, impactDirection: "positive"|"negative"|"mixed"|"neutral", magnitude: 1|2|3|4|5, confidence: "low"|"medium"|"high", rationale, actions: string[] }.',
      ].filter(Boolean).join('\n\n'),
    });
  },
  { kind: 'agent', title: 'Assess news impact', labels: ['business', 'decision-intelligence', 'news'] },
);

const synthesizeTask = defineTask(
  'news-impact.synthesize',
  async ({ assessments, newsItem }, ctx) => {
    return ctx.agent({
      title: 'Synthesize portfolio-level impact',
      prompt: [
        'Synthesize a portfolio-level impact summary from per-entry assessments.',
        `News item: ${newsItem.headline}`,
        `Assessments: ${JSON.stringify(assessments, null, 2)}`,
        'Return JSON: { topImpacts: Array<{ entryId, direction, magnitude, oneLineRationale }>, recommendedActions: string[], summary: string }.',
      ].join('\n\n'),
    });
  },
  { kind: 'agent', title: 'Synthesize impact', labels: ['business', 'decision-intelligence'] },
);

export async function process(inputs, ctx) {
  const { newsItem, portfolio = [], horizon = 'quarter' } = inputs;
  if (portfolio.length === 0) {
    return { success: true, assessments: [], topImpacts: [], recommendedActions: [] };
  }
  const assessments = await ctx.parallel.map(portfolio, (entry) =>
    ctx.task(assessTask, { newsItem, entry, horizon }),
  );
  const synthesis = await ctx.task(synthesizeTask, { assessments, newsItem });
  return {
    success: true,
    assessments,
    topImpacts: synthesis.topImpacts ?? [],
    recommendedActions: synthesis.recommendedActions ?? [],
    summary: synthesis.summary,
  };
}
