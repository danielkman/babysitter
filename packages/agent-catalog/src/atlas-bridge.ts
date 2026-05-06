/**
 * Atlas bridge for agent-catalog.
 *
 * Adapts the Atlas graph singleton (`@a5c-ai/atlas`) into the same query
 * surface that `graph.ts` exposes, so `data.ts` can source its projections
 * from the pre-indexed Atlas graph instead of reading raw YAML files.
 *
 * Atlas records carry `_kind` where agent-catalog uses `kind`.
 * Atlas edges carry `kind` where agent-catalog uses `relation`.
 * The adapter functions below paper over these differences.
 */

import { atlas } from "@a5c-ai/atlas";
import type { AtlasRecord, Edge } from "@a5c-ai/atlas";
import type {
  CatalogGraph,
  GraphDocument,
  GraphNode,
  GraphRelationship,
  OntologySchema,
} from "./models";

// ---------------------------------------------------------------------------
// Record adaptation: Atlas `_kind` -> agent-catalog `kind`
// ---------------------------------------------------------------------------

function adaptRecord(record: AtlasRecord): GraphNode {
  const { _kind, _file, _cluster, ...rest } = record;
  return { ...rest, kind: _kind } as unknown as GraphNode;
}

// ---------------------------------------------------------------------------
// Edge adaptation: Atlas `kind` -> agent-catalog `relation`
// ---------------------------------------------------------------------------

function adaptEdge(edge: Edge, index: number): GraphRelationship {
  return {
    id: `edge:${edge.from}->${edge.to}:${edge.kind}:${index}`,
    relation: edge.kind,
    from: edge.from,
    to: edge.to,
    ...(edge.attributes ?? {}),
  } as GraphRelationship;
}

// ---------------------------------------------------------------------------
// Public API — drop-in replacements for graph.ts functions
// ---------------------------------------------------------------------------

let cachedNodes: GraphNode[] | undefined;
let cachedEdges: GraphRelationship[] | undefined;

function allNodes(): GraphNode[] {
  if (!cachedNodes) {
    cachedNodes = atlas.getAllRecords().map(adaptRecord);
  }
  return cachedNodes;
}

function allEdges(): GraphRelationship[] {
  if (!cachedEdges) {
    cachedEdges = atlas.getIndex().edges.map(adaptEdge);
  }
  return cachedEdges;
}

export function listGraphNodes(): GraphNode[] {
  return [...allNodes()];
}

export function listNodesByKind(kind: GraphNode["kind"]): GraphNode[] {
  return atlas.getRecordsByKind(kind as string).map(adaptRecord);
}

export function getNodeById<TNode extends GraphNode = GraphNode>(
  nodeId: string,
): TNode | undefined {
  const record = atlas.getRecord(nodeId);
  return record ? (adaptRecord(record) as TNode) : undefined;
}

export function listRelationshipsByRelation(
  relation: string,
): GraphRelationship[] {
  return allEdges().filter((edge) => edge.relation === relation);
}

export function listOutgoingTargets(
  nodeId: string,
  relation: string,
): GraphNode[] {
  const targetIds = atlas
    .getOutgoing(nodeId)
    .filter((edge) => edge.kind === relation)
    .map((edge) => edge.to);

  return targetIds
    .map((id) => atlas.getRecord(id))
    .filter((record): record is AtlasRecord => record !== undefined)
    .map(adaptRecord);
}

export function listIncomingSources(
  nodeId: string,
  relation: string,
): GraphNode[] {
  const sourceIds = atlas
    .getIncoming(nodeId)
    .filter((edge) => edge.kind === relation)
    .map((edge) => edge.from);

  return sourceIds
    .map((id) => atlas.getRecord(id))
    .filter((record): record is AtlasRecord => record !== undefined)
    .map(adaptRecord);
}

// ---------------------------------------------------------------------------
// Graph-document and schema synthesis
//
// The original graph.ts reads these from dedicated YAML files. Atlas stores
// them as regular records (kind GraphDocument / OntologySchema). We pull them
// from Atlas and cast to the expected shapes.
// ---------------------------------------------------------------------------

export function getGraphDocument(): GraphDocument {
  const records = atlas.getRecordsByKind("GraphDocument");
  const record = records.find(
    (r) => r._cluster === "agent-catalog" || r.id === "graph:agent-catalog",
  );
  if (!record) {
    throw new Error(
      "Atlas bridge: GraphDocument record for agent-catalog not found.",
    );
  }
  return adaptRecord(record) as unknown as GraphDocument;
}

export function getOntologySchema(): OntologySchema {
  const records = atlas.getRecordsByKind("OntologySchema");
  const record = records.find(
    (r) =>
      r._cluster === "agent-catalog" ||
      r.id === "schema:agent-catalog-ontology",
  );
  if (!record) {
    throw new Error(
      "Atlas bridge: OntologySchema record for agent-catalog not found.",
    );
  }
  return adaptRecord(record) as unknown as OntologySchema;
}

export function getCatalogGraph(): CatalogGraph {
  return {
    document: getGraphDocument(),
    schema: getOntologySchema(),
    nodes: allNodes(),
    edges: allEdges(),
  };
}

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

export function clearAtlasBridgeCache(): void {
  cachedNodes = undefined;
  cachedEdges = undefined;
}
