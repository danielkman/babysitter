/**
 * @process atlas/atlas-data-mining
 * @description Mine the data models/entities a domain requires from the Atlas
 *   knowledge graph. Short, iterative, TDD-shaped: each phase produces a checkable
 *   artifact and asserts on it. All graph queries go through the Atlas MCP tools
 *   (mcp__atlas__atlas_public_*). Agent tasks only — no shell.
 * @inputs { need, projectDir?, outDir? }
 * @outputs { success, domain, entityCount, model }
 *
 * Repo override honored: agent-only subtasks (no shell); breakpoints kept sparse.
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

// ---------------------------------------------------------------------------
// Phase 1: scope the domain to data-bearing kinds
// ---------------------------------------------------------------------------
export const scopeDataDomainTask = defineTask('atlas-datamine-scope-domain', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Scope the domain to data-bearing Atlas kinds',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Atlas graph miner',
      task: `Resolve the domain "${args.need}" to data-bearing Atlas clusters/kinds (e.g. DataModel, Entity, Definition, Term).`,
      context: { need: args.need, outDir: args.outDir },
      instructions: [
        'Use mcp__atlas__atlas_public_clusters and mcp__atlas__atlas_public_kinds to scope the domain.',
        'Identify the data-bearing kinds (DataModel / Entity / Definition / Term and similar).',
        `Write "${args.outDir}/scope.json" with keys: domain, clusters (array), kinds (array of data-bearing kinds).`,
        'TDD assertion for this phase: scope.json MUST list at least one data-bearing kind. Iterate until satisfied.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['kinds'],
      properties: { domain: { type: 'string' }, clusters: { type: 'array' }, kinds: { type: 'array' } },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/inputs.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

// ---------------------------------------------------------------------------
// Phase 2: find entities/models
// ---------------------------------------------------------------------------
export const findEntitiesTask = defineTask('atlas-datamine-find-entities', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Gather entities/data models',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Atlas graph miner',
      task: `Gather the entities/data models in scope for "${args.need}" and their relationships.`,
      context: { need: args.need, scope: args.scope, outDir: args.outDir },
      instructions: [
        'Use mcp__atlas__atlas_public_search (data-bearing kinds) to find entities/models.',
        'Use mcp__atlas__atlas_public_neighbors to gather related entities and how they connect.',
        'Collect only real ids returned by the tools — never invent ids.',
        `Write "${args.outDir}/entities.json" with key: entities (array of { id, name, kind }).`,
        'TDD assertion for this phase: entities.json MUST be non-empty with real ids. Iterate until satisfied.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['entities'],
      properties: { entities: { type: 'array' } },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/inputs.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

// ---------------------------------------------------------------------------
// Phase 3: resolve fields and relations
// ---------------------------------------------------------------------------
export const resolveRelationsTask = defineTask('atlas-datamine-resolve-relations', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Resolve entity fields and relations',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Atlas graph analyst',
      task: `Resolve the fields of each entity and the relations between entities for "${args.need}".`,
      context: { need: args.need, entities: args.entities, outDir: args.outDir },
      instructions: [
        'For each entity, call mcp__atlas__atlas_public_record(id) to read its fields.',
        'Use mcp__atlas__atlas_public_edge_kinds and mcp__atlas__atlas_public_edge_kind to capture the relation types between entities.',
        `Write "${args.outDir}/relations.json" with key: entities (array of { id, name, fields: [...], relations: [{ from, to, kind }] }).`,
        'Every relation endpoint MUST reference a real entity id from entities.json.',
        'TDD assertion for this phase: each entity has fields[] and relations[], and relation endpoints reference real ids. Iterate until complete.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['entities'],
      properties: { entities: { type: 'array' } },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/inputs.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

// ---------------------------------------------------------------------------
// Phase 4: emit the data model
// ---------------------------------------------------------------------------
export const emitModelTask = defineTask('atlas-datamine-emit-model', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Emit the data-models artifact',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Data modeler / technical writer',
      task: `Write the data model artifacts for the need "${args.need}".`,
      context: { need: args.need, entities: args.entities, outDir: args.outDir },
      instructions: [
        `Write "${args.outDir}/data-models.md" — a human-readable data model with an ER-style summary of entities, fields, and relations, each citing its real Atlas id.`,
        `Write "${args.outDir}/data-models.json" — the machine mirror with key: entities (array of { id, name, fields, relations }).`,
        'TDD assertion for this phase: EVERY relation endpoint MUST exist in the entity set. Iterate until the model is internally consistent.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['entities'],
      properties: { entities: { type: 'array' }, modelPath: { type: 'string' } },
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

  const scope = await ctx.task(scopeDataDomainTask, base, { key: 'scope-domain' });
  const entities = await ctx.task(findEntitiesTask, { ...base, scope }, { key: 'find-entities' });
  const relations = await ctx.task(resolveRelationsTask, { ...base, entities: entities.entities }, { key: 'resolve-relations' });
  const model = await ctx.task(emitModelTask, { ...base, entities: relations.entities }, { key: 'emit-model' });

  return {
    success: true,
    domain: scope.domain ?? need,
    entityCount: Array.isArray(model.entities) ? model.entities.length : 0,
    model,
  };
}

export default process;
