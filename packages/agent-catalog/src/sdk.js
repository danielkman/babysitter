"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCatalogGraphSnapshot = getCatalogGraphSnapshot;
exports.getCatalogGraphDocument = getCatalogGraphDocument;
exports.getCatalogOntologySchema = getCatalogOntologySchema;
exports.getAgentCatalog = getAgentCatalog;
exports.listOntologyClaims = listOntologyClaims;
exports.getCapabilitySupportAssertions = getCapabilitySupportAssertions;
exports.listAgentVersions = listAgentVersions;
exports.getAgentVersions = getAgentVersions;
exports.listOntologyNodesByKind = listOntologyNodesByKind;
exports.listOntologyRelations = listOntologyRelations;
exports.getFallbackHarnessMetadata = getFallbackHarnessMetadata;
exports.listFallbackHarnessMetadata = listFallbackHarnessMetadata;
exports.getHostSignalMap = getHostSignalMap;
exports.getHostMetadataFields = getHostMetadataFields;
exports.getHostDetectionRules = getHostDetectionRules;
exports.getHooksMuxDetectionRules = getHooksMuxDetectionRules;
exports.getHarnessImages = getHarnessImages;
exports.lookupHarnessImage = lookupHarnessImage;
exports.listPluginTargets = listPluginTargets;
exports.listPluginTargetDescriptors = listPluginTargetDescriptors;
exports.getPluginTargetDescriptor = getPluginTargetDescriptor;
exports.getHookCatalog = getHookCatalog;
exports.getHookNameMap = getHookNameMap;
exports.getAgentVersionSlug = getAgentVersionSlug;
exports.getUiAgentOntologyList = getUiAgentOntologyList;
exports.getUiAgentOntologyEntry = getUiAgentOntologyEntry;
exports.getUiAgentCards = getUiAgentCards;
const data_1 = require("./data");
const graph_1 = require("./graph");
const HARNESS_ALIASES = {
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
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
const AGENT_FILE_PATH = "packages/agent-catalog/graph/nodes/agents/versions.yaml";
const AGENT_DIRECTORY = "packages/agent-catalog/graph";
function slugifyVersionRange(versionRange) {
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
function agentVersionNodeId(agent) {
    return `agentVersion:${agent.agentId}:${slugifyVersionRange(agent.versionRange)}`;
}
function orderedByIds(ids, items, getId) {
    const byId = new Map(items.map((item) => [getId(item), item]));
    return ids.map((id) => byId.get(id)).filter((item) => Boolean(item));
}
function findProviderVersions(agent) {
    return orderedByIds(agent.providerIds, data_1.AGENT_CATALOG.providers.filter((provider) => agent.providerIds.includes(provider.providerId)), (provider) => provider.providerId);
}
function findModelVersions(agent) {
    return orderedByIds(agent.modelIds, data_1.AGENT_CATALOG.models.filter((model) => agent.modelIds.includes(model.modelId)), (model) => model.modelId);
}
function findTransports(agent) {
    return orderedByIds(agent.transportIds, data_1.AGENT_CATALOG.transports.filter((transport) => agent.transportIds.includes(transport.transportId)), (transport) => transport.transportId);
}
function findModalities(agent) {
    return orderedByIds(agent.modalityIds, data_1.AGENT_CATALOG.modalities.filter((modality) => agent.modalityIds.includes(modality.modalityId)), (modality) => modality.modalityId);
}
function findCapabilities(agent) {
    return orderedByIds(agent.capabilityIds, data_1.AGENT_CATALOG.capabilities.filter((capability) => agent.capabilityIds.includes(capability.capabilityId)), (capability) => capability.capabilityId);
}
function findHooks(agent) {
    return orderedByIds(agent.hookIds, data_1.AGENT_CATALOG.hooks.filter((hook) => agent.hookIds.includes(hook.hookId)), (hook) => hook.hookId);
}
function findPluginTargets(agent) {
    return orderedByIds(agent.pluginTargetIds, data_1.PLUGIN_TARGETS.filter((target) => agent.pluginTargetIds.includes(target.targetId)), (target) => target.targetId);
}
function findSessionSemantics(agent) {
    return orderedByIds(agent.sessionNuanceIds, data_1.AGENT_CATALOG.sessionNuances.filter((nuance) => agent.sessionNuanceIds.includes(nuance.nuanceId)), (nuance) => nuance.nuanceId);
}
function findLifecycleSemantics(agent) {
    return orderedByIds(agent.lifecycleNuanceIds, data_1.AGENT_CATALOG.lifecycleNuances.filter((nuance) => agent.lifecycleNuanceIds.includes(nuance.nuanceId)), (nuance) => nuance.nuanceId);
}
function findCapabilityMatrix(agent) {
    const subjectId = agentVersionNodeId(agent);
    return data_1.CAPABILITY_ASSERTIONS.filter((assertion) => assertion.subjectKind === "AgentVersion" && assertion.subjectId === subjectId);
}
function findClaims(agent, capabilityMatrix) {
    const claimMap = new Map();
    for (const assertion of capabilityMatrix) {
        for (const claim of assertion.supportingClaims) {
            claimMap.set(claim.claimId, claim);
        }
    }
    for (const claim of data_1.CLAIMS) {
        if (claim.subjectKind === "AgentVersion" && claim.subjectId === agentVersionNodeId(agent)) {
            claimMap.set(claim.claimId, claim);
        }
        if (agent.evidenceIds.includes(claim.claimId)) {
            claimMap.set(claim.claimId, claim);
        }
    }
    return Array.from(claimMap.values());
}
function findEvidence(agent, capabilityMatrix, claims) {
    const evidenceIds = new Set([
        ...agent.evidenceIds,
        ...capabilityMatrix.flatMap((assertion) => assertion.evidenceIds),
        ...claims.flatMap((claim) => claim.evidenceIds),
    ]);
    return data_1.AGENT_CATALOG.evidence.filter((evidence) => evidenceIds.has(evidence.evidenceId));
}
function buildEvidenceSummary(capabilityMatrix, claims, evidenceCount) {
    return {
        evidenceCount,
        claimCount: claims.length,
        corroboratedCount: capabilityMatrix.filter((assertion) => assertion.evidenceStrength === "corroborated").length,
        partialCount: capabilityMatrix.filter((assertion) => assertion.evidenceStrength === "partial").length,
        inferredCount: capabilityMatrix.filter((assertion) => assertion.evidenceStrength === "inferred").length,
        unresolvedGapCount: new Set(capabilityMatrix.flatMap((assertion) => assertion.unresolvedGaps)).size,
    };
}
function toAgentReference(agent) {
    return {
        id: agentVersionNodeId(agent),
        slug: getAgentVersionSlug(agent),
        agentId: agent.agentId,
        name: agent.displayName,
        versionRange: agent.versionRange,
    };
}
function buildOntologyListItem(agent) {
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
function getRelatedVersionReferences(agent, relation, direction) {
    const currentNodeId = agentVersionNodeId(agent);
    const matchingIds = (0, graph_1.listRelationshipsByRelation)(relation)
        .filter((edge) => (direction === "from" ? edge.from === currentNodeId : edge.to === currentNodeId))
        .map((edge) => (direction === "from" ? edge.to : edge.from));
    return data_1.AGENT_CATALOG.agents
        .filter((candidate) => matchingIds.includes(agentVersionNodeId(candidate)))
        .map(toAgentReference);
}
function getCatalogGraphSnapshot() {
    return clone((0, graph_1.getCatalogGraph)());
}
function getCatalogGraphDocument() {
    return clone(data_1.GRAPH_DOCUMENT);
}
function getCatalogOntologySchema() {
    return clone(data_1.ONTOLOGY_SCHEMA);
}
function getAgentCatalog() {
    return clone(data_1.AGENT_CATALOG);
}
function listOntologyClaims() {
    return clone(data_1.CLAIMS);
}
function getCapabilitySupportAssertions() {
    return clone(data_1.CAPABILITY_ASSERTIONS);
}
function listAgentVersions() {
    return clone(data_1.AGENT_CATALOG.agents);
}
function getAgentVersions(agentIdOrAlias) {
    const normalized = agentIdOrAlias.toLowerCase();
    return data_1.AGENT_CATALOG.agents.filter((agent) => agent.agentId === normalized ||
        agent.aliases.includes(normalized) ||
        agent.displayName.toLowerCase() === normalized);
}
function listOntologyNodesByKind(kind) {
    return clone((0, graph_1.listGraphNodes)().filter((node) => node.kind === kind));
}
function listOntologyRelations(relation) {
    return clone((0, graph_1.listRelationshipsByRelation)(relation));
}
function getFallbackHarnessMetadata(harnessName) {
    const key = HARNESS_ALIASES[harnessName] ?? harnessName;
    const metadata = data_1.FALLBACK_METADATA[key];
    return metadata ? clone(metadata) : undefined;
}
function listFallbackHarnessMetadata() {
    return clone(data_1.FALLBACK_METADATA);
}
function getHostSignalMap() {
    return clone(data_1.HOST_SIGNAL_MAP);
}
function getHostMetadataFields() {
    return clone(data_1.HOST_METADATA_FIELDS);
}
function getHostDetectionRules() {
    return clone(data_1.HOST_DETECTION_RULES);
}
function getHooksMuxDetectionRules() {
    return clone(data_1.HOOKS_MUX_DETECTION_RULES);
}
function getHarnessImages() {
    return clone(data_1.HARNESS_IMAGES);
}
function lookupHarnessImage(harness) {
    const normalized = harness.toLowerCase();
    const key = HARNESS_ALIASES[normalized] ?? normalized;
    return data_1.HARNESS_IMAGES.find((entry) => entry.harness === key);
}
function listPluginTargets() {
    return data_1.PLUGIN_TARGETS.map((target) => target.targetId).sort();
}
function listPluginTargetDescriptors() {
    return clone(data_1.PLUGIN_TARGETS);
}
function getPluginTargetDescriptor(targetId) {
    const target = data_1.PLUGIN_TARGETS.find((entry) => entry.targetId === targetId);
    return target ? clone(target) : undefined;
}
function getHookCatalog() {
    return clone(data_1.HOOKS);
}
function getHookNameMap() {
    const map = {};
    for (const hook of data_1.HOOKS) {
        map[hook.canonicalName] = { ...hook.targetNames };
    }
    return map;
}
function getAgentVersionSlug(agent) {
    return `${agent.agentId}--${slugifyVersionRange(agent.versionRange)}`;
}
function getUiAgentOntologyList() {
    return clone(data_1.AGENT_CATALOG.agents.map(buildOntologyListItem));
}
function getUiAgentOntologyEntry(slugOrId) {
    const agent = data_1.AGENT_CATALOG.agents.find((candidate) => getAgentVersionSlug(candidate) === slugOrId ||
        agentVersionNodeId(candidate) === slugOrId);
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
        schemaVersion: data_1.GRAPH_DOCUMENT.schemaVersion,
        generatedAt: data_1.GRAPH_DOCUMENT.generatedAt,
    });
}
function getUiAgentCards() {
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
            schemaVersion: data_1.GRAPH_DOCUMENT.schemaVersion,
        },
    }));
}
