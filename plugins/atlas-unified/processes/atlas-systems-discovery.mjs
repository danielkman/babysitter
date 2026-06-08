/**
 * @process atlas/atlas-systems-discovery
 * @description Turn a stated need into a full system design by mining the Atlas
 *   knowledge graph. Short, iterative, TDD-shaped: each phase produces a checkable
 *   artifact and asserts on it before proceeding. All graph queries go through the
 *   Atlas MCP tools (mcp__atlas__atlas_public_*). Agent tasks only — no shell.
 * @inputs { need, projectDir?, outDir? }
 * @outputs { success, domain, anchorCount, design }
 *
 * Repo override honored: agent-only subtasks (no shell); breakpoints kept sparse
 * (interview only when the need is genuinely ambiguous).
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

// ---------------------------------------------------------------------------
// Phase 1: frame the need as a domain + outcomes (interview only if ambiguous)
// ---------------------------------------------------------------------------
export const frameNeedTask = defineTask('atlas-discovery-frame-need', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Frame the stated need as a domain + outcomes',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Systems analyst (Atlas graph-driven design)',
      task: `Restate the stated need as a concrete domain plus a list of desired outcomes so the Atlas graph can be mined for the system it implies.`,
      context: { need: args.need, outDir: args.outDir },
      instructions: [
        'Use the atlas-graph-query skill conventions for any graph lookups.',
        'Restate the stated need below as: a single domain string, and an outcomes[] list (what the resulting system must achieve).',
        'If the need is genuinely ambiguous, note the ambiguity in `ambiguous: true` and explain — the orchestrator will decide whether to interview.',
        `Write a JSON file to "${args.outDir}/frame.json" with keys: domain (non-empty string), outcomes (non-empty array of strings), ambiguous (boolean), questions (array).`,
        'TDD assertion for this phase: frame.json MUST have a non-empty `domain` and a non-empty `outcomes[]`. Do not finish until both are present.',
        `Stated need:\n${args.need}`,
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['domain', 'outcomes'],
      properties: {
        domain: { type: 'string' },
        outcomes: { type: 'array' },
        ambiguous: { type: 'boolean' },
        questions: { type: 'array' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/inputs.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

// ---------------------------------------------------------------------------
// Phase 2: locate anchor nodes via search + clusters/kinds
// ---------------------------------------------------------------------------
export const anchorSearchTask = defineTask('atlas-discovery-anchor-search', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Locate Atlas anchor nodes for the domain',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Atlas graph miner',
      task: `Find seed/anchor node ids in the Atlas graph for domain "${args.domain}".`,
      context: { domain: args.domain, outcomes: args.outcomes, outDir: args.outDir },
      instructions: [
        'Use mcp__atlas__atlas_public_search with the domain + outcome terms to find candidate seed nodes.',
        'Use mcp__atlas__atlas_public_clusters and mcp__atlas__atlas_public_kinds to scope the relevant part of the graph.',
        'Collect only ids returned by the Atlas tools — never invent node ids.',
        `Write "${args.outDir}/anchors.json" with keys: anchors (array of { id, name, kind }), clusters (array), kinds (array).`,
        'TDD assertion for this phase: anchors.json MUST contain at least one real Atlas id traceable to a tool result. Iterate your queries until you have one.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['anchors'],
      properties: {
        anchors: { type: 'array' },
        clusters: { type: 'array' },
        kinds: { type: 'array' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/inputs.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

// ---------------------------------------------------------------------------
// Phase 3: expand the graph from anchors to gather the system's parts
// ---------------------------------------------------------------------------
export const expandGraphTask = defineTask('atlas-discovery-expand-graph', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Expand the Atlas graph from anchors',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Atlas graph miner',
      task: `Expand from the anchor nodes to gather the components, workflows, processes, data models and capabilities the system needs.`,
      context: { domain: args.domain, anchors: args.anchors, outDir: args.outDir },
      instructions: [
        'For each anchor id, call mcp__atlas__atlas_public_neighbors(id, depth, edges, kinds) to traverse the graph.',
        'Use mcp__atlas__atlas_public_record on interesting nodes to read fields and edges.',
        'Group every discovered node by kind (components, workflows, processes, data, capabilities, integrations).',
        `Write "${args.outDir}/graph.json" grouping nodes by kind; each node entry is { id, name, kind, via } where via cites the tool result it came from.`,
        'TDD assertion for this phase: graph.json groups nodes by kind and EVERY id traces back to a tool result (no invented ids). Iterate until this holds.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['groups'],
      properties: {
        groups: { type: 'object' },
        nodeCount: { type: 'number' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/inputs.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

// ---------------------------------------------------------------------------
// Phase 4: synthesize the layered system design
// ---------------------------------------------------------------------------
export const synthesizeDesignTask = defineTask('atlas-discovery-synthesize-design', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Synthesize the layered system design',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'System designer',
      task: `Assemble the discovered Atlas nodes into a layered system design for domain "${args.domain}".`,
      context: { domain: args.domain, outcomes: args.outcomes, graph: args.graph, outDir: args.outDir },
      instructions: [
        'Assemble the grouped graph nodes into a layered design: components, processes, data, integrations, and nuances.',
        `Write a human design doc to "${args.outDir}/design.md" covering all five layers, each item citing its real Atlas id.`,
        `Write a machine mirror to "${args.outDir}/design.json" with keys: domain, outcomes, layers { components[], processes[], data[], integrations[], nuances[] }.`,
        'Never invent graph node ids — reference only ids present in graph.json.',
        'TDD assertion for this phase: design.md covers components/processes/data/integrations/nuances; design.json mirrors it; no invented ids. Iterate until all hold.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['layers'],
      properties: {
        domain: { type: 'string' },
        outcomes: { type: 'array' },
        layers: { type: 'object' },
        designPath: { type: 'string' },
      },
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

  // Phase 1: frame the need.
  const frame = await ctx.task(frameNeedTask, base, { key: 'frame-need' });

  // Sparse breakpoint: only interview when the need is genuinely ambiguous.
  if (frame.ambiguous === true) {
    const clarify = await ctx.breakpoint({
      question: `The stated need is ambiguous for domain framing. ${(frame.questions || []).join(' ')} Please clarify the goal/domain.`,
      options: ['Provide clarification', 'Proceed with best-guess framing'],
      expert: 'owner',
      tags: ['interview'],
    });
    if (clarify && clarify.response) {
      base.need = `${need}\n\nClarification: ${clarify.response}`;
    }
  }

  // Phase 2: locate anchors.
  const anchors = await ctx.task(anchorSearchTask, { ...base, domain: frame.domain, outcomes: frame.outcomes }, { key: 'anchor-search' });

  // Phase 3: expand the graph.
  const graph = await ctx.task(expandGraphTask, { ...base, domain: frame.domain, anchors: anchors.anchors }, { key: 'expand-graph' });

  // Phase 4: synthesize the design.
  const design = await ctx.task(synthesizeDesignTask, { ...base, domain: frame.domain, outcomes: frame.outcomes, graph: graph.groups }, { key: 'synthesize-design' });

  return {
    success: true,
    domain: frame.domain,
    anchorCount: Array.isArray(anchors.anchors) ? anchors.anchors.length : 0,
    design,
  };
}

export default process;
