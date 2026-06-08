/**
 * @process atlas/atlas-collect-nuances
 * @description Gather domain-specific edge cases, constraints, and gotchas from
 *   the Atlas knowledge graph. Short, iterative, TDD-shaped: each phase produces a
 *   checkable artifact and asserts on it. All graph queries go through the Atlas
 *   MCP tools (mcp__atlas__atlas_public_*). Agent tasks only — no shell.
 * @inputs { need, projectDir?, outDir? }
 * @outputs { success, anchorCount, nuances }
 *
 * Repo override honored: agent-only subtasks (no shell); breakpoints kept sparse.
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

// ---------------------------------------------------------------------------
// Phase 1: anchor the system/domain
// ---------------------------------------------------------------------------
export const anchorTask = defineTask('atlas-nuances-anchor', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Locate the system/domain anchor node(s)',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Atlas graph miner',
      task: `Locate the Atlas anchor node(s) for the system/domain "${args.need}".`,
      context: { need: args.need, outDir: args.outDir },
      instructions: [
        'Use mcp__atlas__atlas_public_search with the system/domain terms to find anchor node(s).',
        'Collect only real ids returned by the tool — never invent ids.',
        `Write "${args.outDir}/anchors.json" with key: anchors (array of { id, name, kind }).`,
        'TDD assertion for this phase: anchors.json MUST be non-empty with real ids. Iterate until satisfied.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['anchors'],
      properties: { anchors: { type: 'array' } },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/inputs.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

// ---------------------------------------------------------------------------
// Phase 2: gather context (neighbors + wiki pages)
// ---------------------------------------------------------------------------
export const gatherContextTask = defineTask('atlas-nuances-gather-context', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Gather constraints, capabilities, failure classes, edge cases',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Atlas graph miner',
      task: `Gather the constraints, capabilities, failure classes and edge cases around "${args.need}".`,
      context: { need: args.need, anchors: args.anchors, outDir: args.outDir },
      instructions: [
        'For each anchor, call mcp__atlas__atlas_public_neighbors to traverse related constraints, capabilities, and failure classes.',
        'Call mcp__atlas__atlas_public_wiki_page on relevant nodes to read narrative caveats and gotchas.',
        'Collect only real ids returned by the tools — never invent ids.',
        `Write "${args.outDir}/context.json" grouping findings by type: { constraints: [...], capabilities: [...], failureClasses: [...], edgeCases: [...] }, each item citing a source id.`,
        'TDD assertion for this phase: context.json groups findings by type and each finding cites a real source id. Iterate until satisfied.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['groups'],
      properties: { groups: { type: 'object' } },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/inputs.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

// ---------------------------------------------------------------------------
// Phase 3: distill nuances
// ---------------------------------------------------------------------------
export const distillNuancesTask = defineTask('atlas-nuances-distill', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Distill a deduplicated list of domain nuances',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Domain analyst / technical writer',
      task: `Distill a deduplicated list of domain nuances (constraints, gotchas, non-obvious requirements) for "${args.need}".`,
      context: { need: args.need, context: args.context, outDir: args.outDir },
      instructions: [
        'Synthesize the gathered context into a deduplicated list of nuances: constraints, gotchas, and non-obvious requirements.',
        'Each nuance MUST cite at least one real Atlas source id from context.json.',
        `Write "${args.outDir}/nuances.md" — a human-readable nuance list, each item citing its source id(s).`,
        `Write "${args.outDir}/nuances.json" — the machine mirror with key: nuances (array of { text, type, sourceIds: [...] }).`,
        'TDD assertion for this phase: every nuance cites >= 1 real Atlas id; nuances are deduplicated. Iterate until both hold.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['nuances'],
      properties: { nuances: { type: 'array' }, nuancesPath: { type: 'string' } },
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

  const anchors = await ctx.task(anchorTask, base, { key: 'anchor' });
  const context = await ctx.task(gatherContextTask, { ...base, anchors: anchors.anchors }, { key: 'gather-context' });
  const nuances = await ctx.task(distillNuancesTask, { ...base, context: context.groups }, { key: 'distill-nuances' });

  return {
    success: true,
    anchorCount: Array.isArray(anchors.anchors) ? anchors.anchors.length : 0,
    nuances,
  };
}

export default process;
