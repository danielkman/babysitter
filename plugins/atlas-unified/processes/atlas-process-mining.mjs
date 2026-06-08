/**
 * @process atlas/atlas-process-mining
 * @description Mine the processes/workflows a domain requires from the Atlas
 *   knowledge graph. Short, iterative, TDD-shaped: each phase produces a checkable
 *   artifact and asserts on it. All graph queries go through the Atlas MCP tools
 *   (mcp__atlas__atlas_public_*). Agent tasks only — no shell.
 * @inputs { need, projectDir?, outDir? }
 * @outputs { success, domain, processCount, catalog }
 *
 * Repo override honored: agent-only subtasks (no shell); breakpoints kept sparse.
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

// ---------------------------------------------------------------------------
// Phase 1: scope the domain to Atlas clusters/kinds
// ---------------------------------------------------------------------------
export const scopeDomainTask = defineTask('atlas-procmine-scope-domain', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Scope the domain to Atlas clusters/kinds',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Atlas graph miner',
      task: `Resolve the domain "${args.need}" to the relevant Atlas clusters and kinds for process mining.`,
      context: { need: args.need, outDir: args.outDir },
      instructions: [
        'Use mcp__atlas__atlas_public_clusters and mcp__atlas__atlas_public_kinds to scope the domain.',
        'Identify the target cluster(s) and process/workflow-bearing kind(s) (e.g. Process, Workflow).',
        `Write "${args.outDir}/scope.json" with keys: domain, clusters (array), kinds (array of process/workflow kinds).`,
        'TDD assertion for this phase: scope.json MUST list at least one target cluster or kind. Iterate until satisfied.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['clusters', 'kinds'],
      properties: { domain: { type: 'string' }, clusters: { type: 'array' }, kinds: { type: 'array' } },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/inputs.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

// ---------------------------------------------------------------------------
// Phase 2: find candidate processes/workflows
// ---------------------------------------------------------------------------
export const findProcessesTask = defineTask('atlas-procmine-find-processes', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Enumerate candidate processes/workflows',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Atlas graph miner',
      task: `Enumerate the processes/workflows in scope for "${args.need}".`,
      context: { need: args.need, scope: args.scope, outDir: args.outDir },
      instructions: [
        'Use mcp__atlas__atlas_public_search (filter to Process/Workflow kinds) to find candidate processes.',
        'Use mcp__atlas__atlas_public_neighbors from any anchor to enumerate connected processes/workflows.',
        'Collect only real ids returned by the tools — never invent ids.',
        `Write "${args.outDir}/candidates.json" with key: candidates (array of { id, name, kind }).`,
        'TDD assertion for this phase: candidates.json MUST be non-empty and every id must be real. Iterate your queries until satisfied.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['candidates'],
      properties: { candidates: { type: 'array' } },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/inputs.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

// ---------------------------------------------------------------------------
// Phase 3: detail each candidate and rank by relevance
// ---------------------------------------------------------------------------
export const detailAndRankTask = defineTask('atlas-procmine-detail-rank', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Detail and rank candidate processes',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Atlas graph analyst',
      task: `Detail each candidate process and rank it by relevance to the need "${args.need}".`,
      context: { need: args.need, candidates: args.candidates, outDir: args.outDir },
      instructions: [
        'For each candidate, call mcp__atlas__atlas_public_record(id) to read its phases/steps and edges.',
        'Summarize each process and assign a relevance score (0-1) to the stated need.',
        `Write "${args.outDir}/detail.json" with key: details (array of { id, name, summary, phases, relevance }).`,
        'TDD assertion for this phase: every entry MUST have id, name, a phases/steps summary, and a relevance score. Iterate until complete.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['details'],
      properties: { details: { type: 'array' } },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/inputs.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

// ---------------------------------------------------------------------------
// Phase 4: emit the process catalog
// ---------------------------------------------------------------------------
export const emitCatalogTask = defineTask('atlas-procmine-emit-catalog', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Emit the process catalog',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Technical writer',
      task: `Write the ranked process catalog for the need "${args.need}".`,
      context: { need: args.need, details: args.details, outDir: args.outDir },
      instructions: [
        `Write "${args.outDir}/processes.md" — a ranked, human-readable catalog of the mined processes, each citing its real Atlas id.`,
        `Write "${args.outDir}/processes.json" — the machine mirror with key: processes (array of { id, name, summary, phases, relevance }).`,
        'TDD assertion for this phase: catalog count MUST equal the ranked detail count and every id MUST be present in the detail set. Iterate until consistent.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['processes'],
      properties: { processes: { type: 'array' }, catalogPath: { type: 'string' } },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/inputs.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

// ===========================================================================
// Orchestration
// ===========================================================================
export async function process(inputs, ctx) {
  const need = inputs.need ?? inputs.$ARGUMENTS ?? '';
  const projectDir = inputs.projectDir ?? '.';
  const outDir = inputs.outDir ?? `.a5c/atlas/${ctx.runId ?? 'run'}`;
  const base = { need, projectDir, outDir };

  const scope = await ctx.task(scopeDomainTask, base, { key: 'scope-domain' });
  const candidates = await ctx.task(findProcessesTask, { ...base, scope }, { key: 'find-processes' });
  const detail = await ctx.task(detailAndRankTask, { ...base, candidates: candidates.candidates }, { key: 'detail-and-rank' });
  const catalog = await ctx.task(emitCatalogTask, { ...base, details: detail.details }, { key: 'emit-catalog' });

  return {
    success: true,
    domain: scope.domain ?? need,
    processCount: Array.isArray(catalog.processes) ? catalog.processes.length : 0,
    catalog,
  };
}

export default process;
