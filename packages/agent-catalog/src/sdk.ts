import {
  AGENT_CATALOG,
  CAPABILITY_ASSERTIONS,
  CLAIMS,
  FALLBACK_METADATA,
  GRAPH_DOCUMENT,
  HARNESS_IMAGES,
  HOST_DETECTION_RULES,
  HOOKS,
  HOOKS_MUX_DETECTION_RULES,
  HOST_METADATA_FIELDS,
  HOST_SIGNAL_MAP,
  ONTOLOGY_SCHEMA,
  PLUGIN_TARGETS,
} from "./data";
import { getCatalogGraph, listGraphNodes, listRelationshipsByRelation } from "./graph";
import type {
  AgentCatalog,
  AgentOntologyDetail,
  AgentOntologyEvidenceSummary,
  AgentOntologyListItem,
  AgentVersionReference,
  AgentVersion,
  CapabilityAssertion,
  CapabilityDescriptor,
  CatalogGraph,
  ClaimRecord,
  GraphNode,
  HarnessFallbackMetadata,
  HarnessImageEntry,
  HookDescriptor,
  HooksMuxDetectionRule,
  HostMetadataField,
  HostDetectionRule,
  LifecycleNuance,
  ModelProviderVersion,
  ModelVersion,
  ModalityDescriptor,
  OntologySchema,
  PluginTargetDescriptor,
  SessionNuance,
  TransportDescriptor,
  UiAgentCard,
} from "./models";

const HARNESS_ALIASES: Record<string, string> = {
  claude: "claude-code",
  "claude-code": "claude-code",
  codex: "codex",
  cursor: "cursor",
  gemini: "gemini-cli",
  "gemini-cli": "gemini-cli",
  copilot: "github-copilot",
  "github-copilot": "github-copilot",
  omp: "oh-my-pi",
  "oh-my-pi": "oh-my-pi",
  opencode: "opencode",
  openclaw: "openclaw",
  pi: "pi",
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const AGENT_FILE_PATH = "packages/agent-catalog/graph/nodes/agents/versions.yaml";
const AGENT_DIRECTORY = "packages/agent-catalog/graph";

function slugifyVersionRange(versionRange: string): string {
  return versionRange
    .replace(/>=/g, "ge-")
    .replace(/<=/g, "le-")
    .replace(/>/g, "gt-")
    .replace(/</g, "lt-")
    .replace(/=/g, "eq-")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function agentVersionNodeId(agent: Pick<AgentVersion, "agentId" | "versionRange">): string {
  return `agentVersion:${agent.agentId}:${slugifyVersionRange(agent.versionRange)}`;
}

function orderedByIds<T>(ids: string[], items: T[], getId: (item: T) => string): T[] {
  const byId = new Map(items.map((item) => [getId(item), item]));
  return ids.map((id) => byId.get(id)).filter((item): item is T => Boolean(item));
}

function findProviderVersions(agent: AgentVersion): ModelProviderVersion[] {
  return orderedByIds(
    agent.providerIds,
    AGENT_CATALOG.providers.filter((provider) => agent.providerIds.includes(provider.providerId)),
    (provider) => provider.providerId,
  );
}

function findModelVersions(agent: AgentVersion): ModelVersion[] {
  return orderedByIds(
    agent.modelIds,
    AGENT_CATALOG.models.filter((model) => agent.modelIds.includes(model.modelId)),
    (model) => model.modelId,
  );
}

function findTransports(agent: AgentVersion): TransportDescriptor[] {
  return orderedByIds(
    agent.transportIds,
    AGENT_CATALOG.transports.filter((transport) => agent.transportIds.includes(transport.transportId)),
    (transport) => transport.transportId,
  );
}

function findModalities(agent: AgentVersion): ModalityDescriptor[] {
  return orderedByIds(
    agent.modalityIds,
    AGENT_CATALOG.modalities.filter((modality) => agent.modalityIds.includes(modality.modalityId)),
    (modality) => modality.modalityId,
  );
}

function findCapabilities(agent: AgentVersion): CapabilityDescriptor[] {
  return orderedByIds(
    agent.capabilityIds,
    AGENT_CATALOG.capabilities.filter((capability) => agent.capabilityIds.includes(capability.capabilityId)),
    (capability) => capability.capabilityId,
  );
}

function findHooks(agent: AgentVersion): HookDescriptor[] {
  return orderedByIds(
    agent.hookIds,
    AGENT_CATALOG.hooks.filter((hook) => agent.hookIds.includes(hook.hookId)),
    (hook) => hook.hookId,
  );
}

function findPluginTargets(agent: AgentVersion): PluginTargetDescriptor[] {
  return orderedByIds(
    agent.pluginTargetIds,
    PLUGIN_TARGETS.filter((target) => agent.pluginTargetIds.includes(target.targetId)),
    (target) => target.targetId,
  );
}

function findSessionSemantics(agent: AgentVersion): SessionNuance[] {
  return orderedByIds(
    agent.sessionNuanceIds,
    AGENT_CATALOG.sessionNuances.filter((nuance) => agent.sessionNuanceIds.includes(nuance.nuanceId)),
    (nuance) => nuance.nuanceId,
  );
}

function findLifecycleSemantics(agent: AgentVersion): LifecycleNuance[] {
  return orderedByIds(
    agent.lifecycleNuanceIds,
    AGENT_CATALOG.lifecycleNuances.filter((nuance) => agent.lifecycleNuanceIds.includes(nuance.nuanceId)),
    (nuance) => nuance.nuanceId,
  );
}

function findCapabilityMatrix(agent: AgentVersion): CapabilityAssertion[] {
  const subjectId = agentVersionNodeId(agent);
  return CAPABILITY_ASSERTIONS.filter(
    (assertion) => assertion.subjectKind === "AgentVersion" && assertion.subjectId === subjectId,
  );
}

function findClaims(agent: AgentVersion, capabilityMatrix: CapabilityAssertion[]): ClaimRecord[] {
  const claimMap = new Map<string, ClaimRecord>();

  for (const assertion of capabilityMatrix) {
    for (const claim of assertion.supportingClaims) {
      claimMap.set(claim.claimId, claim);
    }
  }

  for (const claim of CLAIMS) {
    if (claim.subjectKind === "AgentVersion" && claim.subjectId === agentVersionNodeId(agent)) {
      claimMap.set(claim.claimId, claim);
    }
    if (agent.evidenceIds.includes(claim.claimId)) {
      claimMap.set(claim.claimId, claim);
    }
  }

  return Array.from(claimMap.values());
}

function findEvidence(agent: AgentVersion, capabilityMatrix: CapabilityAssertion[], claims: ClaimRecord[]) {
  const evidenceIds = new Set<string>([
    ...agent.evidenceIds,
    ...capabilityMatrix.flatMap((assertion) => assertion.evidenceIds),
    ...claims.flatMap((claim) => claim.evidenceIds),
  ]);

  return AGENT_CATALOG.evidence.filter((evidence) => evidenceIds.has(evidence.evidenceId));
}

function buildEvidenceSummary(
  capabilityMatrix: CapabilityAssertion[],
  claims: ClaimRecord[],
  evidenceCount: number,
): AgentOntologyEvidenceSummary {
  return {
    evidenceCount,
    claimCount: claims.length,
    corroboratedCount: capabilityMatrix.filter((assertion) => assertion.evidenceStrength === "corroborated").length,
    partialCount: capabilityMatrix.filter((assertion) => assertion.evidenceStrength === "partial").length,
    inferredCount: capabilityMatrix.filter((assertion) => assertion.evidenceStrength === "inferred").length,
    unresolvedGapCount: new Set(capabilityMatrix.flatMap((assertion) => assertion.unresolvedGaps)).size,
  };
}

function toAgentReference(agent: AgentVersion): AgentVersionReference {
  return {
    id: agentVersionNodeId(agent),
    slug: getAgentVersionSlug(agent),
    agentId: agent.agentId,
    name: agent.displayName,
    versionRange: agent.versionRange,
  };
}

function buildOntologyListItem(agent: AgentVersion): AgentOntologyListItem {
  const capabilityMatrix = findCapabilityMatrix(agent);
  const claims = findClaims(agent, capabilityMatrix);
  const evidence = findEvidence(agent, capabilityMatrix, claims);

  return {
    ...toAgentReference(agent),
    aliases: agent.aliases,
    runtimeFamily: agent.runtimeFamily,
    releaseChannel: agent.releaseChannel,
    since: agent.since,
    until: agent.until,
    osSupport: agent.osSupport,
    description: agent.summary,
    sourcePackage: agent.sourcePackage,
    providers: findProviderVersions(agent),
    models: findModelVersions(agent),
    transports: findTransports(agent),
    modalities: findModalities(agent),
    capabilities: findCapabilities(agent),
    hooks: findHooks(agent),
    pluginTargets: findPluginTargets(agent),
    sessionSemantics: findSessionSemantics(agent),
    lifecycleSemantics: findLifecycleSemantics(agent),
    evidenceSummary: buildEvidenceSummary(capabilityMatrix, claims, evidence.length),
    filePath: AGENT_FILE_PATH,
    directory: AGENT_DIRECTORY,
  };
}

function getRelatedVersionReferences(agent: AgentVersion, relation: "supersedes", direction: "from" | "to") {
  const currentNodeId = agentVersionNodeId(agent);
  const matchingIds = listRelationshipsByRelation(relation)
    .filter((edge) => (direction === "from" ? edge.from === currentNodeId : edge.to === currentNodeId))
    .map((edge) => (direction === "from" ? edge.to : edge.from));

  return AGENT_CATALOG.agents
    .filter((candidate) => matchingIds.includes(agentVersionNodeId(candidate)))
    .map(toAgentReference);
}

export function getCatalogGraphSnapshot(): CatalogGraph {
  return clone(getCatalogGraph());
}

export function getCatalogGraphDocument() {
  return clone(GRAPH_DOCUMENT);
}

export function getCatalogOntologySchema(): OntologySchema {
  return clone(ONTOLOGY_SCHEMA);
}

export function getAgentCatalog(): AgentCatalog {
  return clone(AGENT_CATALOG);
}

export function listOntologyClaims(): ClaimRecord[] {
  return clone(CLAIMS);
}

export function getCapabilitySupportAssertions(): CapabilityAssertion[] {
  return clone(CAPABILITY_ASSERTIONS);
}

export function listAgentVersions(): AgentVersion[] {
  return clone(AGENT_CATALOG.agents);
}

export function getAgentVersions(agentIdOrAlias: string): AgentVersion[] {
  const normalized = agentIdOrAlias.toLowerCase();
  return AGENT_CATALOG.agents.filter(
    (agent) =>
      agent.agentId === normalized ||
      agent.aliases.includes(normalized) ||
      agent.displayName.toLowerCase() === normalized,
  );
}

export function listOntologyNodesByKind(kind: GraphNode["kind"]): GraphNode[] {
  return clone(listGraphNodes().filter((node) => node.kind === kind));
}

export function listOntologyRelations(relation: string) {
  return clone(listRelationshipsByRelation(relation));
}

export function getFallbackHarnessMetadata(harnessName: string): HarnessFallbackMetadata | undefined {
  const key = HARNESS_ALIASES[harnessName] ?? harnessName;
  const metadata = FALLBACK_METADATA[key];
  return metadata ? clone(metadata) : undefined;
}

export function listFallbackHarnessMetadata(): Record<string, HarnessFallbackMetadata> {
  return clone(FALLBACK_METADATA);
}

export function getHostSignalMap(): Record<string, string[]> {
  return clone(HOST_SIGNAL_MAP);
}

export function getHostMetadataFields(): Record<string, HostMetadataField[]> {
  return clone(HOST_METADATA_FIELDS);
}

export function getHostDetectionRules(): HostDetectionRule[] {
  return clone(HOST_DETECTION_RULES);
}

export function getHooksMuxDetectionRules(): HooksMuxDetectionRule[] {
  return clone(HOOKS_MUX_DETECTION_RULES);
}

export function getHarnessImages(): HarnessImageEntry[] {
  return clone(HARNESS_IMAGES);
}

export function lookupHarnessImage(harness: string): HarnessImageEntry | undefined {
  const normalized = harness.toLowerCase();
  const key = HARNESS_ALIASES[normalized] ?? normalized;
  return HARNESS_IMAGES.find((entry) => entry.harness === key);
}

export function listPluginTargets(): string[] {
  return PLUGIN_TARGETS.map((target) => target.targetId).sort();
}

export function listPluginTargetDescriptors(): PluginTargetDescriptor[] {
  return clone(PLUGIN_TARGETS);
}

export function getPluginTargetDescriptor(targetId: string): PluginTargetDescriptor | undefined {
  const target = PLUGIN_TARGETS.find((entry) => entry.targetId === targetId);
  return target ? clone(target) : undefined;
}

export function getHookCatalog(): HookDescriptor[] {
  return clone(HOOKS);
}

export function getHookNameMap(): Record<string, Record<string, string>> {
  const map: Record<string, Record<string, string>> = {};
  for (const hook of HOOKS) {
    map[hook.canonicalName] = { ...hook.targetNames };
  }
  return map;
}

export function getAgentVersionSlug(agent: Pick<AgentVersion, "agentId" | "versionRange">): string {
  return `${agent.agentId}--${slugifyVersionRange(agent.versionRange)}`;
}

export function getUiAgentOntologyList(): AgentOntologyListItem[] {
  return clone(AGENT_CATALOG.agents.map(buildOntologyListItem));
}

export function getUiAgentOntologyEntry(slugOrId: string): AgentOntologyDetail | undefined {
  const agent = AGENT_CATALOG.agents.find(
    (candidate) =>
      getAgentVersionSlug(candidate) === slugOrId ||
      agentVersionNodeId(candidate) === slugOrId,
  );

  if (!agent) {
    return undefined;
  }

  const capabilityMatrix = findCapabilityMatrix(agent);
  const claims = findClaims(agent, capabilityMatrix);
  const evidence = findEvidence(agent, capabilityMatrix, claims);

  return clone({
    ...buildOntologyListItem(agent),
    capabilityMatrix,
    evidence,
    claims,
    supersedes: getRelatedVersionReferences(agent, "supersedes", "from"),
    supersededBy: getRelatedVersionReferences(agent, "supersedes", "to"),
    schemaVersion: GRAPH_DOCUMENT.schemaVersion,
    generatedAt: GRAPH_DOCUMENT.generatedAt,
  });
}

export function getUiAgentCards(): UiAgentCard[] {
  return getUiAgentOntologyList().map((agent) => ({
    id: agent.slug,
    name: agent.name,
    versionRange: agent.versionRange,
    description: agent.description,
    providerNames: agent.providers.map((provider) => provider.displayName),
    transportLabels: agent.transports.map((transport) => transport.label),
    capabilities: agent.capabilities.map((capability) => capability.label),
    hookNames: agent.hooks.map((hook) => hook.canonicalName),
    filePath: agent.filePath,
    directory: agent.directory,
    metadata: {
      agentId: agent.agentId,
      aliases: agent.aliases,
      slug: agent.slug,
      runtimeFamily: agent.runtimeFamily,
      pluginTargets: agent.pluginTargets.map((target) => target.targetId),
      modalities: agent.modalities.map((modality) => modality.modalityId),
      evidenceSummary: agent.evidenceSummary,
      schemaVersion: GRAPH_DOCUMENT.schemaVersion,
    },
  }));
}
