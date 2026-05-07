import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  assertEvidenceBundleComplete,
  createEvidenceBundle,
  getScenarioCapabilityStatus,
  liveStackScenarioFromEnv,
  redactLiveStackArtifact,
  type LiveStackEvidenceBundle,
  type LiveStackScenario,
} from './scenario-contract';

export interface CommandExecution {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Record<string, string>;
  readonly cwd: string;
  readonly timeoutMs: number;
}

export interface CommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface PrimaryLiveRunOptions {
  readonly env: Record<string, string | undefined>;
  readonly cwd: string;
  readonly artifactsDir: string;
  readonly executeCommand: (execution: CommandExecution) => Promise<CommandResult>;
  readonly executeLiveProvider?: boolean;
  readonly timeoutMs?: number;
}

export interface PrimaryLiveRunResult {
  readonly status: 'skipped' | 'passed' | 'failed';
  readonly scenarioId: string;
  readonly skipReason?: string;
  readonly commands: readonly CommandExecution[];
  readonly evidence?: LiveStackEvidenceBundle;
  readonly missingTraceIds?: readonly string[];
  readonly artifactPath?: string;
  readonly failure?: string;
}

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

export function buildPrimaryLiveStackCommands(
  scenario: LiveStackScenario,
  options: Pick<PrimaryLiveRunOptions, 'env' | 'cwd' | 'timeoutMs'>,
): readonly CommandExecution[] {
  const commandEnv = buildCommandEnv(options.env);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const traceId = commandEnv['LIVE_STACK_TRACE_ID'];
  const prompt = buildPrompt(scenario, traceId);

  if (scenario.agent.integrationType === 'runtime-cli') {
    return [
      commandExecution(commandEnv, 'LIVE_STACK_BABYSITTER_AGENT_BIN', 'babysitter-agent', ['create-run', '--harness', 'internal', '--workspace', options.cwd, '--model', scenario.model.model, '--prompt', prompt, '--json'], options.cwd, timeoutMs),
    ];
  }

  const launchHarness = scenario.agent.agent === 'claude-code' ? 'claude' : scenario.agent.agent;
  return [
    commandExecution(commandEnv, 'LIVE_STACK_BABYSITTER_BIN', 'babysitter', ['harness:install', scenario.agent.agent, '--workspace', options.cwd, '--json'], options.cwd, timeoutMs),
    commandExecution(commandEnv, 'LIVE_STACK_BABYSITTER_BIN', 'babysitter', ['harness:install-plugin', scenario.agent.agent, '--workspace', options.cwd, '--json'], options.cwd, timeoutMs),
    commandExecution(commandEnv, 'LIVE_STACK_AMUX_BIN', 'amux', ['launch', launchHarness, scenario.model.amuxProvider, '--model', scenario.model.model, '--with-proxy-if-needed', '--prompt', prompt, '--max-turns', '1'], options.cwd, timeoutMs),
  ];
}

export async function runPrimaryLiveStackScenario(options: PrimaryLiveRunOptions): Promise<PrimaryLiveRunResult> {
  const scenario = liveStackScenarioFromEnv(options.env);
  const capability = getScenarioCapabilityStatus(scenario, options.env);
  const commands = buildPrimaryLiveStackCommands(scenario, options);

  if (!capability.runnable) {
    return { status: 'skipped', scenarioId: scenario.scenarioId, skipReason: capability.skipReason, commands: redactCommands(commands) };
  }

  if (options.executeLiveProvider !== true) {
    return {
      status: 'skipped',
      scenarioId: scenario.scenarioId,
      skipReason: 'set LIVE_STACK_RUN_MODEL_TESTS=1 to execute live provider scenario',
      commands: redactCommands(commands),
    };
  }

  await fs.mkdir(options.artifactsDir, { recursive: true });
  const commandResults: CommandResult[] = [];
  for (const command of commands) {
    const result = await options.executeCommand(command);
    commandResults.push(result);
    if (result.status !== 0) {
      const artifactPath = await writeArtifact(options.artifactsDir, scenario, { status: 'failed', command: redactCommands([command])[0], commandResults });
      return { status: 'failed', scenarioId: scenario.scenarioId, commands: redactCommands(commands), artifactPath, failure: `command failed: ${command.command} ${command.args.join(' ')}` };
    }
  }

  const captured = extractTraceIds(commandResults.map((result) => `${result.stdout}\n${result.stderr}`).join('\n'));
  const evidence = createEvidenceBundle(
    scenario,
    captured,
    Object.fromEntries(scenario.expectedArtifacts.map((name) => [name, path.join(options.artifactsDir, `${name}.json`)])),
  );
  const missingTraceIds = assertEvidenceBundleComplete(scenario, evidence);
  const artifactPath = await writeArtifact(options.artifactsDir, scenario, {
    status: missingTraceIds.length === 0 ? 'passed' : 'failed',
    commands: redactCommands(commands),
    evidence,
    missingTraceIds,
    commandResults,
  });

  return {
    status: missingTraceIds.length === 0 ? 'passed' : 'failed',
    scenarioId: scenario.scenarioId,
    commands: redactCommands(commands),
    evidence,
    missingTraceIds,
    artifactPath,
    failure: missingTraceIds.length > 0 ? `missing trace ids: ${missingTraceIds.join(', ')}` : undefined,
  };
}

function commandExecution(env: Record<string, string>, overrideKey: string, fallbackCommand: string, args: readonly string[], cwd: string, timeoutMs: number): CommandExecution {
  const overrideBin = env[overrideKey];
  return overrideBin
    ? { command: process.execPath, args: [overrideBin, ...args], env, cwd, timeoutMs }
    : { command: fallbackCommand, args, env, cwd, timeoutMs };
}

function buildCommandEnv(env: Record<string, string | undefined>): Record<string, string> {
  const traceId = env['LIVE_STACK_TRACE_ID'] ?? `live-stack-${Date.now()}`;
  return Object.fromEntries(
    Object.entries({ ...env, LIVE_STACK_TRACE_ID: traceId, AGENT_SESSION_ID: env['AGENT_SESSION_ID'] ?? traceId }).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function buildPrompt(scenario: LiveStackScenario, traceId: string): string {
  if (scenario.agent.integrationType === 'runtime-cli') {
    return `Create a tiny Babysitter proof run for ${scenario.scenarioId}. trace=${traceId}. Return run id, effect id, and terminal status.`;
  }

  return `/babysitter:call Create a tiny proof run for ${scenario.scenarioId}. trace=${traceId}. Return Babysitter run id, effect id, hook status, and stop-hook status.`;
}

function extractTraceIds(output: string): Partial<LiveStackEvidenceBundle> {
  return {
    agentMuxRunId: firstMatch(output, /(?:agentMuxRunId|runId)["'=:\s]+([A-Za-z0-9_.:-]+)/),
    agentMuxSessionId: firstMatch(output, /(?:agentMuxSessionId|sessionId|AGENT_SESSION_ID)["'=:\s]+([A-Za-z0-9_.:-]+)/),
    babysitterRunId: firstMatch(output, /(?:babysitterRunId|runId)["'=:\s]+(01[A-Z0-9]{24,}|run-[A-Za-z0-9_.:-]+)/),
    babysitterEffectId: firstMatch(output, /(?:babysitterEffectId|effectId)["'=:\s]+([A-Za-z0-9_.:-]+)/),
    hookEventId: firstMatch(output, /(?:hookEventId)["'=:\s]+([A-Za-z0-9_.:-]+)/),
    hookMuxEventId: firstMatch(output, /(?:hookMuxEventId)["'=:\s]+([A-Za-z0-9_.:-]+)/),
    transportTraceId: firstMatch(output, /(?:transportTraceId|LIVE_STACK_TRACE_ID)["'=:\s]+([A-Za-z0-9_.:-]+)/),
  };
}

function firstMatch(value: string, pattern: RegExp): string | undefined {
  return pattern.exec(value)?.[1];
}

function redactCommands(commands: readonly CommandExecution[]): readonly CommandExecution[] {
  return redactLiveStackArtifact(commands) as readonly CommandExecution[];
}

async function writeArtifact(artifactsDir: string, scenario: LiveStackScenario, value: unknown): Promise<string> {
  const artifactPath = path.join(artifactsDir, `${scenario.scenarioId}.json`);
  await fs.writeFile(artifactPath, JSON.stringify(redactLiveStackArtifact(value), null, 2));
  return artifactPath;
}
