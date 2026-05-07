#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const scenarioId = process.env.LIVE_STACK_SCENARIO_ID || 'live.agent-mux.claude-code.foundry-openai.gpt-5.5';
const coveredLayers = listEnv('LIVE_STACK_COVERAGE_LAYERS', [
  'agent-mux',
  'plugin',
  'transport-mux',
  'hooks-mux',
  'babysitter-sdk',
  'foundry-openai',
]);
const requiredArtifacts = listEnv('LIVE_STACK_EXPECTED_ARTIFACTS', [
  'agent-mux-events',
  'plugin-command-transcript',
  'babysitter-run-summary',
  'babysitter-task-bundle',
  'hooks-mux-normalized-event',
  'hooks-mux-handler-result',
  'transport-mux-trace',
  'provider-trace-redacted',
]);

const report = {
  generatedAt: new Date().toISOString(),
  scenarioId,
  agentPath: process.env.LIVE_STACK_AGENT_PATH || 'agent-mux',
  agent: process.env.LIVE_STACK_AGENT || 'claude-code',
  provider: process.env.LIVE_STACK_PROVIDER || 'foundry-openai',
  model: process.env.LIVE_STACK_MODEL || 'gpt-5.5',
  coveredLayers: [...new Set(coveredLayers)].sort(),
  requiredArtifacts,
};

const outDir = path.join('artifacts', 'live-stack');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${safeFileName(scenarioId)}-coverage-summary.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

function listEnv(name, fallback) {
  return process.env[name] ? process.env[name].split(',').map((value) => value.trim()).filter(Boolean) : fallback;
}

function safeFileName(value) {
  return value.replace(/[^A-Za-z0-9_.-]+/g, '-');
}
