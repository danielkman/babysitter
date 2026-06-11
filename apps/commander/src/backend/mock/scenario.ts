/**
 * Mock scenario seeding (SPEC §7).
 *
 * Deterministically generates the boot world from a seed:
 *   - 10–16 units (agent sessions) across >=4 adapters
 *     (claude-code, codex, gemini-cli, pi)
 *   - 6–10 tasks (kradle AgentDispatchRun resources) across 2–3 workspaces
 *
 * Same seed => byte-identical scenario. Framework-free.
 */

import type { CommanderTask } from '../../contracts/kradle-resources';
import { KRADLE_API_VERSION } from '../../contracts/kradle-resources';
import { Prng } from './prng';

/** Fixed simulated epoch: the sim clock never touches Date.now(). */
export const SIM_EPOCH_MS = 1_770_000_000_000;

export const ADAPTERS = ['claude-code', 'codex', 'gemini-cli', 'pi'] as const;
export type AdapterName = (typeof ADAPTERS)[number];

export const MODELS_BY_ADAPTER: Record<AdapterName, readonly string[]> = {
  'claude-code': ['claude-sonnet-4-5', 'claude-opus-4-6'],
  codex: ['gpt-5.2-codex', 'gpt-5.1-codex-mini'],
  'gemini-cli': ['gemini-3-pro', 'gemini-3-flash'],
  pi: ['pi-2.5'],
};

const CALLSIGNS = [
  'vanguard',
  'specter',
  'raven',
  'atlas',
  'nomad',
  'cipher',
  'drift',
  'ember',
  'falcon',
  'goliath',
  'halo',
  'ion',
  'juno',
  'kestrel',
  'lumen',
  'mirage',
] as const;

const WORKSPACE_DEFS = [
  { name: 'frontier', repository: 'a5c-ai/frontier' },
  { name: 'bastion', repository: 'a5c-ai/bastion' },
  { name: 'relay', repository: 'a5c-ai/relay' },
] as const;

const TASK_KINDS = [
  'ci-repair',
  'feature-dev',
  'code-review',
  'bug-fix',
  'refactor',
  'docs',
  'test-coverage',
  'perf-tuning',
  'security-audit',
  'release-prep',
] as const;

const TASK_TITLES: Record<(typeof TASK_KINDS)[number], string> = {
  'ci-repair': 'Repair the broken pipeline',
  'feature-dev': 'Capture the feature ridge',
  'code-review': 'Audit the incoming diff',
  'bug-fix': 'Hunt the regression',
  refactor: 'Rebuild the supply lines',
  docs: 'Chart the territory',
  'test-coverage': 'Fortify the test perimeter',
  'perf-tuning': 'Streamline the engine core',
  'security-audit': 'Sweep for breaches',
  'release-prep': 'Stage the launch sequence',
};

export interface ScenarioWorkspace {
  workspaceId: string;
  name: string;
  repository: string;
}

export interface ScenarioUnit {
  /** Entity id; doubles as the gateway sessionId. */
  unitId: string;
  agent: AdapterName;
  model: string;
  /** Human-readable callsign used as the session title. */
  title: string;
  workspaceId: string;
  createdAt: number;
}

export interface Scenario {
  seed: number;
  epochMs: number;
  workspaces: ScenarioWorkspace[];
  units: ScenarioUnit[];
  tasks: CommanderTask[];
}

/** Generate the deterministic boot world for a seed. */
export function generateScenario(seed: number): Scenario {
  const rng = new Prng((seed ^ 0x5eed_c0de) >>> 0);

  // --- workspaces: 2–3 -----------------------------------------------------
  const workspaceCount = rng.int(2, 3);
  const workspaces: ScenarioWorkspace[] = WORKSPACE_DEFS.slice(0, workspaceCount).map(
    (def, index) => ({
      workspaceId: `ws-${String(index + 1).padStart(2, '0')}-${def.name}`,
      name: def.name,
      repository: def.repository,
    }),
  );

  // --- units: 10–16 across >=4 adapters ------------------------------------
  const unitCount = rng.int(10, 16);
  const callsigns = rng.shuffle(CALLSIGNS);
  const units: ScenarioUnit[] = [];
  for (let i = 0; i < unitCount; i += 1) {
    // Round-robin over adapters guarantees all 4 factions are represented.
    const agent = ADAPTERS[i % ADAPTERS.length] as AdapterName;
    const model = rng.pick(MODELS_BY_ADAPTER[agent]);
    const callsign = callsigns[i % callsigns.length] as string;
    const workspace = rng.pick(workspaces);
    units.push({
      unitId: `u${String(i + 1).padStart(2, '0')}-${callsign}`,
      agent,
      model,
      title: callsign,
      workspaceId: workspace.workspaceId,
      createdAt: SIM_EPOCH_MS - rng.int(1, 72) * 3_600_000,
    });
  }

  // --- tasks: 6–10 across the workspaces -----------------------------------
  const taskCount = rng.int(6, 10);
  const kinds = rng.shuffle(TASK_KINDS);
  const tasks: CommanderTask[] = [];
  for (let i = 0; i < taskCount; i += 1) {
    const taskKind = kinds[i % kinds.length] as (typeof TASK_KINDS)[number];
    const workspace = workspaces[i % workspaces.length] as ScenarioWorkspace;
    const name = `adr-${String(i + 1).padStart(2, '0')}-${taskKind}`;
    tasks.push({
      apiVersion: KRADLE_API_VERSION,
      kind: 'AgentDispatchRun',
      metadata: {
        name,
        namespace: 'kradle-system',
        labels: {
          'a5c.ai/title': TASK_TITLES[taskKind],
          'kradle.a5c.ai/repository': workspace.repository,
          'kradle.a5c.ai/agent-stack': 'commander-fleet',
          'kradle.a5c.ai/runner-pool': 'untrusted-linux',
        },
      },
      spec: {
        repository: workspace.repository,
        ref: 'refs/heads/main',
        branch: 'main',
        sha: deterministicSha(rng),
        sourceRefs: {
          triggerRule: 'commander-manual-dispatch',
        },
        agentStack: 'commander-fleet',
        taskKind,
        workspaceRef: workspace.workspaceId,
        runnerPool: 'untrusted-linux',
        approvalPolicy: {
          requireWriteBackApproval: true,
        },
      },
      status: {
        storage: 'postgres',
        phase: 'Pending',
        conditions: [],
      },
    });
  }

  return { seed, epochMs: SIM_EPOCH_MS, workspaces, units, tasks };
}

function deterministicSha(rng: Prng): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 12; i += 1) {
    out += hex[rng.int(0, 15)];
  }
  return out;
}
