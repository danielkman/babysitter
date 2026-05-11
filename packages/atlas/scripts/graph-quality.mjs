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

// 1. Basic stats
const avgDegree = (edgeCount * 2 / recordCount).toFixed(1);

// 2. Orphans
const withEdges = new Set([...edges.map(e => e.from), ...edges.map(e => e.to)]);
const orphans = records.filter(r => !withEdges.has(r.id));
const orphanPct = (orphans.length / recordCount * 100).toFixed(1);
const connectivityScore = (100 - parseFloat(orphanPct)).toFixed(1);

// 3. Edge diversity
const activeEdgeKinds = Object.entries(index.edgeKinds).filter(([k, v]) => v.count > 0).length;
const totalEdgeKinds = Object.keys(index.edgeKinds).length;
const edgeDiversity = (activeEdgeKinds / totalEdgeKinds * 100).toFixed(1);

// 4. Library coverage
const libs = records.filter(r => r._kind === 'Library');
const libWithSkill = new Set(edges.filter(e => e.from.startsWith('library:') && (e.kind === 'library_used_by' || e.kind === 'used_for')).map(e => e.from));
const libCoverage = libs.length > 0 ? (libWithSkill.size / libs.length * 100).toFixed(1) : '0.0';

// 5. Tool coverage
const tools = records.filter(r => r._kind === 'Tool');
const toolWithSkill = new Set(edges.filter(e => e.from.startsWith('tool:') && (e.kind === 'used_for' || e.kind === 'tool_used_by')).map(e => e.from));
const toolCoverage = tools.length > 0 ? (toolWithSkill.size / tools.length * 100).toFixed(1) : '0.0';

// 6. Framework coverage
const fws = records.filter(r => r._kind === 'Framework');
const fwWithSkill = new Set(edges.filter(e => e.from.startsWith('framework:') && e.kind === 'used_by_skill_area').map(e => e.from));
const fwCoverage = fws.length > 0 ? (fwWithSkill.size / fws.length * 100).toFixed(1) : '0.0';

// 7. ToolServer integration
const ts = records.filter(r => r._kind === 'ToolServer');
const tsWithInt = new Set(edges.filter(e => e.kind === 'integrates_with' && e.from.startsWith('tool-server:')).map(e => e.from));
const tsCoverage = ts.length > 0 ? (Math.min(tsWithInt.size, ts.length) / ts.length * 100).toFixed(1) : '0.0';

// 8. Alternative coverage
const altEligible = records.filter(r => ['Tool', 'Framework', 'Library'].includes(r._kind)).length;
const withAlt = new Set(edges.filter(e => e.kind === 'alternative_to').flatMap(e => [e.from, e.to]));
const altCoverage = altEligible > 0 ? (withAlt.size / altEligible * 100).toFixed(1) : '0.0';

// 9. Learning paths
const skillAreas = records.filter(r => r._kind === 'SkillArea');
const withPrereq = new Set(edges.filter(e => e.kind === 'prerequisite_for_learning').flatMap(e => [e.from, e.to]));
const learnCoverage = skillAreas.length > 0 ? (Math.min(withPrereq.size, skillAreas.length) / skillAreas.length * 100).toFixed(1) : '0.0';

// 10. Memory coverage
const agents = records.filter(r => r._kind === 'AgentVersion');
const withMem = new Set(edges.filter(e => e.kind === 'uses_memory_system').map(e => e.from));
const memCoverage = agents.length > 0 ? Math.min(100, withMem.size / agents.length * 100).toFixed(1) : '0.0';

// 11. Dangling edges
const recordIds = new Set(Object.keys(index.records));
const dangling = edges.filter(e => !recordIds.has(e.to)).length;

// Overall score (weighted)
const overall = (
  parseFloat(connectivityScore) * 0.15 +
  parseFloat(edgeDiversity) * 0.10 +
  parseFloat(libCoverage) * 0.10 +
  parseFloat(toolCoverage) * 0.10 +
  parseFloat(fwCoverage) * 0.10 +
  parseFloat(tsCoverage) * 0.10 +
  parseFloat(altCoverage) * 0.05 +
  parseFloat(learnCoverage) * 0.05 +
  parseFloat(memCoverage) * 0.05 +
  (100 - dangling / edgeCount * 10000) * 0.10 +
  (index.stats.parseErrors === 0 ? 100 : 0) * 0.10
).toFixed(1);

console.log('╔══════════════════════════════════════════════╗');
console.log('║        Atlas Graph Quality Report            ║');
console.log('╠══════════════════════════════════════════════╣');
console.log(`║ Records:          ${String(recordCount).padStart(8)}                  ║`);
console.log(`║ Edges:            ${String(edgeCount).padStart(8)}                  ║`);
console.log(`║ Node kinds:       ${String(Object.keys(index.nodeKinds).length).padStart(8)}                  ║`);
console.log(`║ Edge kinds:       ${String(totalEdgeKinds).padStart(8)} (${activeEdgeKinds} active)      ║`);
console.log(`║ Avg degree:       ${String(avgDegree).padStart(8)}                  ║`);
console.log('╠══════════════════════════════════════════════╣');
console.log(`║ Connectivity:     ${String(connectivityScore+'%').padStart(8)}                  ║`);
console.log(`║ Edge diversity:   ${String(edgeDiversity+'%').padStart(8)}                  ║`);
console.log(`║ Library→skill:    ${String(libCoverage+'%').padStart(8)}                  ║`);
console.log(`║ Tool→skill:       ${String(toolCoverage+'%').padStart(8)}                  ║`);
console.log(`║ Framework→skill:  ${String(fwCoverage+'%').padStart(8)}                  ║`);
console.log(`║ ToolServer integ: ${String(tsCoverage+'%').padStart(8)}                  ║`);
console.log(`║ Alternatives:     ${String(altCoverage+'%').padStart(8)}                  ║`);
console.log(`║ Learning paths:   ${String(learnCoverage+'%').padStart(8)}                  ║`);
console.log(`║ Memory systems:   ${String(memCoverage+'%').padStart(8)}                  ║`);
console.log(`║ Dangling edges:   ${String(dangling).padStart(8)}                  ║`);
console.log(`║ Parse errors:     ${String(index.stats.parseErrors).padStart(8)}                  ║`);
console.log('╠══════════════════════════════════════════════╣');
console.log(`║ OVERALL SCORE:    ${String(overall+'/100').padStart(8)}                  ║`);
console.log('╚══════════════════════════════════════════════╝');
