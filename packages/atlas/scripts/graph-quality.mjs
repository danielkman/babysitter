import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '..', 'src', 'index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

const records = Object.values(index.records);
const edges = index.edges;
const recordCount = records.length;
const edgeCount = edges.length;
const verbose = process.argv.includes('--verbose');

// ── Helpers ──
const pct = (n, d) => d > 0 ? Math.min(100, n / d * 100).toFixed(1) : '0.0';
const pad = (s, w = 8) => String(s).padStart(w);
const edgesFrom = (id) => edges.filter(e => e.from === id);
const edgesTo = (id) => edges.filter(e => e.to === id);
const edgeSet = (kind) => new Set(edges.filter(e => e.kind === kind).flatMap(e => [e.from, e.to]));
const sourceSet = (kind) => new Set(edges.filter(e => e.kind === kind).map(e => e.from));
const byKind = (k) => records.filter(r => r._kind === k);
const recordIds = new Set(Object.keys(index.records));

// ═══════════════════════════════════════════
// SECTION 1: Structural Quality (existing)
// ═══════════════════════════════════════════

const avgDegree = (edgeCount * 2 / recordCount).toFixed(1);

const withEdges = new Set([...edges.map(e => e.from), ...edges.map(e => e.to)]);
const orphans = records.filter(r => !withEdges.has(r.id));
const connectivityScore = (100 - orphans.length / recordCount * 100).toFixed(1);

const activeEdgeKinds = Object.entries(index.edgeKinds).filter(([, v]) => v.count > 0).length;
const totalEdgeKinds = Object.keys(index.edgeKinds).length;
const edgeDiversity = pct(activeEdgeKinds, totalEdgeKinds);

const libs = byKind('Library');
const libWithSkill = new Set(edges.filter(e => e.from.startsWith('library:') && (e.kind === 'library_used_by' || e.kind === 'used_for')).map(e => e.from));
const libCoverage = pct(libWithSkill.size, libs.length);

const tools = byKind('Tool');
const toolWithSkill = new Set(edges.filter(e => e.from.startsWith('tool:') && (e.kind === 'used_for' || e.kind === 'tool_used_by')).map(e => e.from));
const toolCoverage = pct(toolWithSkill.size, tools.length);

const fws = byKind('Framework');
const fwWithSkill = new Set(edges.filter(e => e.from.startsWith('framework:') && e.kind === 'used_by_skill_area').map(e => e.from));
const fwCoverage = pct(fwWithSkill.size, fws.length);

const tsList = byKind('ToolServer');
const tsWithInt = new Set(edges.filter(e => e.kind === 'integrates_with' && e.from.startsWith('tool-server:')).map(e => e.from));
const tsCoverage = pct(tsWithInt.size, tsList.length);

const altEligible = records.filter(r => ['Tool', 'Framework', 'Library'].includes(r._kind)).length;
const withAlt = edgeSet('alternative_to');
const altCoverage = pct(withAlt.size, altEligible);

const skillAreas = byKind('SkillArea');
const withPrereq = edgeSet('prerequisite_for_learning');
const learnCoverage = pct(Math.min(withPrereq.size, skillAreas.length), skillAreas.length);

const agentVersions = byKind('AgentVersion');
const withMem = sourceSet('uses_memory_system');
const memCoverage = pct(withMem.size, agentVersions.length);

const dangling = edges.filter(e => !recordIds.has(e.to)).length;

// ═══════════════════════════════════════════
// SECTION 2: Description & Attribute Coverage
// ═══════════════════════════════════════════

const domainKinds = ['Tool', 'Framework', 'Library', 'ToolServer', 'AgentProduct', 'SkillArea', 'Role', 'Workflow', 'Methodology', 'Topic', 'Domain'];
const domainRecords = records.filter(r => domainKinds.includes(r._kind));

const withDesc = domainRecords.filter(r => r.description && String(r.description).trim().length > 10);
const descCoverage = pct(withDesc.size ?? withDesc.length, domainRecords.length);

const withDisplayName = domainRecords.filter(r => r.displayName && String(r.displayName).trim().length > 0);
const displayNameCoverage = pct(withDisplayName.length, domainRecords.length);

// Products with description
const products = byKind('AgentProduct');
const productsWithDesc = products.filter(r => r.description && String(r.description).trim().length > 20);
const productDescCoverage = pct(productsWithDesc.length, products.length);

// Tools with homepageUrl or repoUrl
const toolsWithUrl = tools.filter(r => r.homepageUrl || r.repoUrl || r.npmPackage);
const toolUrlCoverage = pct(toolsWithUrl.length, tools.length);

// Frameworks with homepageUrl
const fwsWithUrl = fws.filter(r => r.homepageUrl || r.repoUrl);
const fwUrlCoverage = pct(fwsWithUrl.length, fws.length);

// ═══════════════════════════════════════════
// SECTION 3: Claims & Evidence Coverage
// ═══════════════════════════════════════════

const claims = byKind('TestableClaim');
const claimsWithTest = claims.filter(c => c.testCommand && String(c.testCommand).trim().length > 0);
const claimTestCoverage = pct(claimsWithTest.length, claims.length);

const experiments = byKind('Experiment');
const experimentsWithEvidence = experiments.filter(e => e.outcome || e.result || e.status);
const experimentCompletionRate = pct(experimentsWithEvidence.length, experiments.length);

const evidenceSources = byKind('EvidenceSource');
const evidenceWithUrl = evidenceSources.filter(e => e.url || e.repoUrl || e.sourceUrl);
const evidenceUrlCoverage = pct(evidenceWithUrl.length, evidenceSources.length);

// Claims per product (how many products have at least one claim about them?)
const claimTargets = new Set(edges.filter(e => e.kind === 'backed_by_evidence' || e.kind === 'claims' || e.kind === 'tests_claim').flatMap(e => [e.from, e.to]));
const productsWithClaims = products.filter(p => {
  const productEdges = edges.filter(e => (e.from === p.id || e.to === p.id) && (e.kind === 'has_testable_claim' || e.kind === 'tests_claim'));
  return productEdges.length > 0;
});
const productClaimCoverage = pct(productsWithClaims.length, products.length);

// ═══════════════════════════════════════════
// SECTION 4: Association Completeness
// ═══════════════════════════════════════════

// Tools/Frameworks/Libraries with belongs_to_language
const langEdge = (prefix) => new Set(edges.filter(e => e.from.startsWith(prefix) && e.kind === 'belongs_to_language').map(e => e.from));
const toolsWithLang = langEdge('tool:');
const fwsWithLang = langEdge('framework:');
const libsWithLang = langEdge('library:');
const toolLangCoverage = pct(toolsWithLang.size, tools.length);
const fwLangCoverage = pct(fwsWithLang.size, fws.length);
const libLangCoverage = pct(libsWithLang.size, libs.length);

// Roles with at least one responsibility edge
const roles = byKind('Role');
const rolesWithResp = new Set(edges.filter(e => e.kind === 'has_responsibility' && roles.some(r => r.id === e.from)).map(e => e.from));
const roleRespCoverage = pct(rolesWithResp.size, roles.length);

// Workflows with at least one step or involves edge
const workflows = byKind('Workflow');
const workflowEdgeSet = new Set(edges.filter(e => (e.kind === 'has_step' || e.kind === 'involves_role' || e.kind === 'involves_skill_area') && workflows.some(w => w.id === e.from)).map(e => e.from));
const workflowAssocCoverage = pct(workflowEdgeSet.size, workflows.length);

// Domains with contains edges
const domains = byKind('Domain');
const domainsWithContains = new Set(edges.filter(e => e.kind === 'contains' && domains.some(d => d.id === e.from)).map(e => e.from));
const domainContainsCoverage = pct(domainsWithContains.size, domains.length);

// Topics with parent domain
const topics = byKind('Topic');
const topicsWithParent = new Set(edges.filter(e => (e.kind === 'belongs_to_domain' || e.kind === 'contains') && topics.some(t => t.id === e.to || t.id === e.from)).flatMap(e => [e.from, e.to]).filter(id => topics.some(t => t.id === id)));
const topicParentCoverage = pct(topicsWithParent.size, topics.length);

// ToolServers with repoUrl or installCommand
const tsWithRepo = tsList.filter(t => t.repoUrl || t.installCommand || t.npmPackage);
const tsRepoCoverage = pct(tsWithRepo.length, tsList.length);

// ═══════════════════════════════════════════
// SECTION 5: Cross-Layer Associations
// ═══════════════════════════════════════════

// Agent products with stack layer implementations
const agentProducts = byKind('AgentProduct');
const productsWithImpl = new Set(edges.filter(e => e.kind === 'has_version' && agentProducts.some(p => p.id === e.from)).map(e => e.from));
const productImplCoverage = pct(productsWithImpl.size, agentProducts.length);

// Agent versions with capability edges
const versionsWithCaps = new Set(edges.filter(e => e.kind === 'supports' && agentVersions.some(v => v.id === e.from)).map(e => e.from));
const versionCapCoverage = pct(versionsWithCaps.size, agentVersions.length);

// ═══════════════════════════════════════════
// Overall Score (reweighted with new metrics)
// ═══════════════════════════════════════════

const overall = (
  parseFloat(connectivityScore) * 0.10 +
  parseFloat(edgeDiversity) * 0.05 +
  parseFloat(libCoverage) * 0.05 +
  parseFloat(toolCoverage) * 0.05 +
  parseFloat(fwCoverage) * 0.05 +
  parseFloat(tsCoverage) * 0.05 +
  parseFloat(altCoverage) * 0.05 +
  parseFloat(learnCoverage) * 0.03 +
  parseFloat(memCoverage) * 0.03 +
  (100 - dangling / edgeCount * 10000) * 0.05 +
  (index.stats.parseErrors === 0 ? 100 : 0) * 0.05 +
  // New metrics
  parseFloat(descCoverage) * 0.08 +
  parseFloat(claimTestCoverage) * 0.05 +
  parseFloat(productDescCoverage) * 0.04 +
  parseFloat(toolUrlCoverage) * 0.04 +
  parseFloat(roleRespCoverage) * 0.03 +
  parseFloat(domainContainsCoverage) * 0.03 +
  parseFloat(versionCapCoverage) * 0.04 +
  parseFloat(tsRepoCoverage) * 0.04 +
  parseFloat(productClaimCoverage) * 0.04 +
  parseFloat(workflowAssocCoverage) * 0.04
).toFixed(1);

// ═══════════════════════════════════════════
// Output
// ═══════════════════════════════════════════

const W = 56;
const line = (label, value) => `║ ${label.padEnd(26)}${pad(value, 8)}                  ║`;
const header = (title) => `╠${'═'.repeat(W - 2)}╣\n║ ${title.padEnd(W - 4)} ║`;

console.log(`╔${'═'.repeat(W - 2)}╗`);
console.log(`║   Atlas Graph Quality Report (Extended)      ║`);
console.log(`╠${'═'.repeat(W - 2)}╣`);
console.log(line('Records:', recordCount));
console.log(line('Edges:', edgeCount));
console.log(line('Node kinds:', Object.keys(index.nodeKinds).length));
console.log(line('Edge kinds:', `${totalEdgeKinds} (${activeEdgeKinds} active)`));
console.log(line('Avg degree:', avgDegree));

console.log(header('STRUCTURAL QUALITY'));
console.log(line('Connectivity:', connectivityScore + '%'));
console.log(line('Edge diversity:', edgeDiversity + '%'));
console.log(line('Dangling edges:', dangling));
console.log(line('Parse errors:', index.stats.parseErrors));

console.log(header('ENTITY → SKILL COVERAGE'));
console.log(line('Library→skill:', libCoverage + '%'));
console.log(line('Tool→skill:', toolCoverage + '%'));
console.log(line('Framework→skill:', fwCoverage + '%'));
console.log(line('ToolServer integ:', tsCoverage + '%'));
console.log(line('Alternatives:', altCoverage + '%'));

console.log(header('LEARNING & MEMORY'));
console.log(line('Learning paths:', learnCoverage + '%'));
console.log(line('Memory systems:', memCoverage + '%'));

console.log(header('DESCRIPTION & ATTRIBUTES'));
console.log(line('Domain desc coverage:', descCoverage + '%'));
console.log(line('DisplayName coverage:', displayNameCoverage + '%'));
console.log(line('Product descriptions:', productDescCoverage + '%'));
console.log(line('Tool URLs:', toolUrlCoverage + '%'));
console.log(line('Framework URLs:', fwUrlCoverage + '%'));
console.log(line('ToolServer repo/install:', tsRepoCoverage + '%'));

console.log(header('CLAIMS & EVIDENCE'));
console.log(line('Claims total:', claims.length));
console.log(line('Claims with tests:', claimTestCoverage + '%'));
console.log(line('Experiments total:', experiments.length));
console.log(line('Experiment completion:', experimentCompletionRate + '%'));
console.log(line('Evidence sources:', evidenceSources.length));
console.log(line('Evidence with URLs:', evidenceUrlCoverage + '%'));
console.log(line('Products with claims:', productClaimCoverage + '%'));

console.log(header('ASSOCIATION COMPLETENESS'));
console.log(line('Tool→language:', toolLangCoverage + '%'));
console.log(line('Framework→language:', fwLangCoverage + '%'));
console.log(line('Library→language:', libLangCoverage + '%'));
console.log(line('Role→responsibility:', roleRespCoverage + '%'));
console.log(line('Workflow associations:', workflowAssocCoverage + '%'));
console.log(line('Domain→contains:', domainContainsCoverage + '%'));
console.log(line('Topic→parent:', topicParentCoverage + '%'));
console.log(line('Product→version:', productImplCoverage + '%'));
console.log(line('Version→capabilities:', versionCapCoverage + '%'));

console.log(`╠${'═'.repeat(W - 2)}╣`);
console.log(`║ OVERALL SCORE:        ${pad(overall + '/100', 8)}                  ║`);
console.log(`╚${'═'.repeat(W - 2)}╝`);

// ── Verbose: list gaps ──
if (verbose) {
  console.log('\n=== GAPS ===\n');

  const noDesc = domainRecords.filter(r => !r.description || String(r.description).trim().length <= 10);
  if (noDesc.length > 0) {
    console.log(`Domain entities without descriptions (${noDesc.length}):`);
    const byK = {};
    for (const r of noDesc) byK[r._kind] = (byK[r._kind] || 0) + 1;
    for (const [k, v] of Object.entries(byK).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  }

  const noUrl = tools.filter(r => !r.homepageUrl && !r.repoUrl && !r.npmPackage);
  if (noUrl.length > 0) {
    console.log(`\nTools without URLs (${noUrl.length}):`);
    for (const t of noUrl.slice(0, 15)) console.log(`  ${t.id}`);
    if (noUrl.length > 15) console.log(`  ... and ${noUrl.length - 15} more`);
  }

  const noTestClaims = claims.filter(c => !c.testCommand);
  if (noTestClaims.length > 0) {
    console.log(`\nClaims without testCommand (${noTestClaims.length}):`);
    for (const c of noTestClaims.slice(0, 10)) console.log(`  ${c.id} — ${c.displayName || ''}`);
    if (noTestClaims.length > 10) console.log(`  ... and ${noTestClaims.length - 10} more`);
  }

  const noLangTools = tools.filter(r => !toolsWithLang.has(r.id));
  if (noLangTools.length > 0) {
    console.log(`\nTools without language (${noLangTools.length}):`);
    for (const t of noLangTools.slice(0, 10)) console.log(`  ${t.id}`);
    if (noLangTools.length > 10) console.log(`  ... and ${noLangTools.length - 10} more`);
  }

  const noCapsVersions = agentVersions.filter(v => !versionsWithCaps.has(v.id));
  if (noCapsVersions.length > 0) {
    console.log(`\nAgent versions without capabilities (${noCapsVersions.length}):`);
    for (const v of noCapsVersions) console.log(`  ${v.id}`);
  }

  const productsNoClaims = products.filter(p => !productsWithClaims.includes(p));
  if (productsNoClaims.length > 0) {
    console.log(`\nProducts without testable claims (${productsNoClaims.length}):`);
    for (const p of productsNoClaims.slice(0, 15)) console.log(`  ${p.id} — ${p.displayName || ''}`);
    if (productsNoClaims.length > 15) console.log(`  ... and ${productsNoClaims.length - 15} more`);
  }

  console.log(`\nOrphans by kind (${orphans.length} total):`);
  const orphanByKind = {};
  for (const r of orphans) orphanByKind[r._kind] = (orphanByKind[r._kind] || 0) + 1;
  for (const [k, v] of Object.entries(orphanByKind).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
}
