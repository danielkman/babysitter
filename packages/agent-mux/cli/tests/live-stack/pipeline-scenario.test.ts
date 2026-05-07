import { describe, expect, it } from 'vitest';

import { buildPrimaryLiveStackCommands } from './primary-live-runner';
import { liveStackScenarioFromEnv } from './scenario-contract';

describe('pipeline-owned live stack scenario contract', () => {
  it('validates the scenario selected by the Publish workflow matrix', () => {
    const scenario = liveStackScenarioFromEnv(process.env);
    const commands = buildPrimaryLiveStackCommands(scenario, {
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 1000,
    });

    expect(scenario.scenarioId).toBeTruthy();
    expect(scenario.layers.length).toBeGreaterThan(0);
    expect(scenario.expectedArtifacts.length).toBeGreaterThan(0);
    expect(commands.length).toBe(scenario.agent.integrationType === 'runtime-cli' ? 1 : 3);

    if (scenario.agent.integrationType === 'runtime-cli') {
      expect(commands[0]?.command).toMatch(/babysitter-agent|node(\.exe)?$/);
      expect(commands[0]?.args).toContain('create-run');
      expect(commands[0]?.args).not.toContain('harness:install-plugin');
    } else {
      expect(commands.map((command) => command.args[0])).toEqual(['harness:install', 'harness:install-plugin', 'launch']);
    }
  });
});
