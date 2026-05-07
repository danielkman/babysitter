import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildPrimaryLiveStackCommands, runPrimaryLiveStackScenario } from './primary-live-runner';
import { primaryLiveStackScenario } from './scenario-contract';

describe('primary live stack runner contract', () => {
  it('builds the no-mock command chain through harness install, plugin install, and amux launch', () => {
    const scenario = primaryLiveStackScenario();
    const commands = buildPrimaryLiveStackCommands(scenario, {
      cwd: '/repo',
      timeoutMs: 1000,
      env: { AZURE_API_KEY: 'sk-live-secret', AMUX_API_BASE: 'https://foundry.example.test', LIVE_STACK_TRACE_ID: 'trace-1' },
    });

    expect(commands.map((command) => [command.command, ...command.args])).toEqual([
      ['babysitter', 'harness:install', 'claude-code', '--workspace', '/repo', '--json'],
      ['babysitter', 'harness:install-plugin', 'claude-code', '--workspace', '/repo', '--json'],
      [
        'amux',
        'launch',
        'claude',
        'foundry',
        '--model',
        'gpt-5.5',
        '--with-proxy-if-needed',
        '--prompt',
        '/babysitter:call Create a tiny proof run for live.agent-mux.claude-code.foundry-openai.gpt-5.5. trace=trace-1. Return Babysitter run id, effect id, hook status, and stop-hook status.',
        '--max-turns',
        '1',
      ],
    ]);
  });

  it('skips safely without Foundry credentials and never calls the command executor', async () => {
    const result = await runPrimaryLiveStackScenario({
      cwd: process.cwd(),
      artifactsDir: path.join(os.tmpdir(), 'live-stack-skipped'),
      env: {},
      executeCommand: async () => {
        throw new Error('should not execute commands when credentials are missing');
      },
    });

    expect(result.status).toBe('skipped');
    expect(result.skipReason).toContain('missing live-model credential env');
    expect(result.commands[2]?.command).toBe('amux');
  });

  it('skips credential-present runs unless the explicit live execution flag is set', async () => {
    const result = await runPrimaryLiveStackScenario({
      cwd: process.cwd(),
      artifactsDir: path.join(os.tmpdir(), 'live-stack-opt-in'),
      env: { AZURE_API_KEY: 'sk-live-secret', AMUX_API_BASE: 'https://foundry.example.test' },
      executeCommand: async () => {
        throw new Error('should not execute without live opt-in');
      },
    });

    expect(result.status).toBe('skipped');
    expect(result.skipReason).toBe('set LIVE_STACK_RUN_MODEL_TESTS=1 to execute live provider scenario');
    expect(JSON.stringify(result)).not.toContain('sk-live-secret');
  });

  it('writes a redacted failed artifact when live output lacks required joined trace IDs', async () => {
    const artifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'live-stack-artifacts-'));
    const result = await runPrimaryLiveStackScenario({
      cwd: process.cwd(),
      artifactsDir,
      executeLiveProvider: true,
      env: { AZURE_API_KEY: 'sk-live-secret', AMUX_API_BASE: 'https://foundry.example.test', LIVE_STACK_TRACE_ID: 'transport-trace-1' },
      executeCommand: async () => ({
        status: 0,
        stdout: 'transportTraceId: transport-trace-1\nagentMuxRunId: amux-1\nagentMuxSessionId: sess-1',
        stderr: '',
      }),
    });

    expect(result.status).toBe('failed');
    expect(result.missingTraceIds).toEqual(['babysitterRunId', 'babysitterEffectId', 'hookEventId', 'hookMuxEventId']);
    expect(result.artifactPath).toBeDefined();
    const artifact = await fs.readFile(result.artifactPath!, 'utf8');
    expect(artifact).not.toContain('sk-live-secret');
    expect(artifact).toContain('[REDACTED]');
  });

  const liveIt = process.env['LIVE_STACK_RUN_MODEL_TESTS'] === '1' ? it : it.skip;

  liveIt('executes the primary live provider scenario when explicitly enabled', async () => {
    const result = await runPrimaryLiveStackScenario({
      cwd: process.cwd(),
      artifactsDir: 'artifacts/live-stack',
      executeLiveProvider: true,
      env: process.env,
      executeCommand: executeChildProcess,
      timeoutMs: 20 * 60 * 1000,
    });

    expect(result.status).toBe('passed');
    expect(result.missingTraceIds).toEqual([]);
    expect(result.artifactPath).toBeDefined();
  });
});

async function executeChildProcess(execution: Parameters<typeof runPrimaryLiveStackScenario>[0]['executeCommand'] extends (arg: infer T) => Promise<unknown> ? T : never) {
  const { spawn } = await import('node:child_process');
  return await new Promise<{ status: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(execution.command, execution.args, {
      cwd: execution.cwd,
      env: { ...process.env, ...execution.env },
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      stderr += `\nTimed out after ${execution.timeoutMs}ms`;
    }, execution.timeoutMs);
    child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ status: code ?? 1, stdout, stderr });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ status: 1, stdout, stderr: `${stderr}\n${error.message}` });
    });
  });
}

