export type LiveStackProvider = 'foundry-openai' | 'anthropic-direct';
export type AgentMuxProviderId = 'foundry' | 'anthropic';
export type LiveStackAgentPath = 'agent-mux' | 'babysitter-agent';
export type LiveStackIntegrationType = 'third-party-plugin' | 'runtime-cli';

export interface LiveStackModelEntry {
  readonly provider: LiveStackProvider;
  readonly amuxProvider: AgentMuxProviderId;
  readonly model: string;
  readonly credentialMode: 'github-org-secrets-and-vars' | 'github-org-secrets';
  readonly requiredEnv: readonly string[];
}

export interface LiveStackAgentEntry {
  readonly agentPath: LiveStackAgentPath;
  readonly agent: 'claude-code' | 'codex' | 'internal';
  readonly integrationType: LiveStackIntegrationType;
  readonly setupCommands: readonly string[];
}

export interface LiveStackScenario {
  readonly scenarioId: string;
  readonly lane: 'model-backed-live';
  readonly model: LiveStackModelEntry;
  readonly agent: LiveStackAgentEntry;
  readonly layers: readonly string[];
  readonly requiredTraceIds: readonly string[];
  readonly expectedArtifacts: readonly string[];
}

export interface CapabilityStatus {
  readonly runnable: boolean;
  readonly missingEnv: readonly string[];
  readonly skipReason?: string;
}

export interface LiveStackEvidenceBundle {
  readonly scenarioId: string;
  readonly agentMuxRunId?: string;
  readonly agentMuxSessionId?: string;
  readonly babysitterRunId?: string;
  readonly babysitterEffectId?: string;
  readonly hookEventId?: string;
  readonly hookMuxEventId?: string;
  readonly transportTraceId?: string;
  readonly provider: string;
  readonly model: string;
  readonly artifacts: Record<string, string>;
}

export function primaryLiveStackScenario(): LiveStackScenario {
  return createLiveStackScenario({
    scenarioId: 'live.agent-mux.claude-code.foundry-openai.gpt-5.5',
    agentPath: 'agent-mux',
    agent: 'claude-code',
    integrationType: 'third-party-plugin',
    provider: 'foundry-openai',
    amuxProvider: 'foundry',
    model: 'gpt-5.5',
    credentialMode: 'github-org-secrets-and-vars',
    requiredEnv: ['AZURE_API_KEY', 'AMUX_API_BASE'],
    layers: [
      'agent-mux invocation',
      'harness plugin setup',
      'plugin babysitter command dispatch',
      'session persistence',
      'native stop hook',
      'hooks-mux normalization',
      'transport-mux route',
      'provider/model trace',
    ],
    requiredTraceIds: ['agentMuxRunId', 'agentMuxSessionId', 'babysitterRunId', 'babysitterEffectId', 'hookEventId', 'hookMuxEventId', 'transportTraceId'],
    expectedArtifacts: [
      'agent-mux-events',
      'plugin-command-transcript',
      'babysitter-run-summary',
      'babysitter-task-bundle',
      'hooks-mux-normalized-event',
      'hooks-mux-handler-result',
      'transport-mux-trace',
      'provider-trace-redacted',
    ],
  });
}

export function liveStackScenarioFromEnv(env: Record<string, string | undefined>): LiveStackScenario {
  if (!env['LIVE_STACK_SCENARIO_ID']) return primaryLiveStackScenario();
  return createLiveStackScenario({
    scenarioId: env['LIVE_STACK_SCENARIO_ID'],
    agentPath: requiredEnvValue(env, 'LIVE_STACK_AGENT_PATH') as LiveStackAgentPath,
    agent: requiredEnvValue(env, 'LIVE_STACK_AGENT') as LiveStackAgentEntry['agent'],
    integrationType: requiredEnvValue(env, 'LIVE_STACK_INTEGRATION_TYPE') as LiveStackIntegrationType,
    provider: requiredEnvValue(env, 'LIVE_STACK_PROVIDER') as LiveStackProvider,
    amuxProvider: requiredEnvValue(env, 'LIVE_STACK_AMUX_PROVIDER') as AgentMuxProviderId,
    model: requiredEnvValue(env, 'LIVE_STACK_MODEL'),
    credentialMode: requiredEnvValue(env, 'LIVE_STACK_CREDENTIAL_MODE') as LiveStackModelEntry['credentialMode'],
    requiredEnv: listEnvValue(env, 'LIVE_STACK_REQUIRED_ENV'),
    layers: listEnvValue(env, 'LIVE_STACK_LAYERS'),
    requiredTraceIds: listEnvValue(env, 'LIVE_STACK_REQUIRED_TRACE_IDS'),
    expectedArtifacts: listEnvValue(env, 'LIVE_STACK_EXPECTED_ARTIFACTS'),
  });
}

export function createLiveStackScenario(input: {
  readonly scenarioId: string;
  readonly agentPath: LiveStackAgentPath;
  readonly agent: LiveStackAgentEntry['agent'];
  readonly integrationType: LiveStackIntegrationType;
  readonly provider: LiveStackProvider;
  readonly amuxProvider: AgentMuxProviderId;
  readonly model: string;
  readonly credentialMode: LiveStackModelEntry['credentialMode'];
  readonly requiredEnv: readonly string[];
  readonly layers: readonly string[];
  readonly requiredTraceIds: readonly string[];
  readonly expectedArtifacts: readonly string[];
}): LiveStackScenario {
  return {
    scenarioId: input.scenarioId,
    lane: 'model-backed-live',
    model: {
      provider: input.provider,
      amuxProvider: input.amuxProvider,
      model: input.model,
      credentialMode: input.credentialMode,
      requiredEnv: input.requiredEnv,
    },
    agent: {
      agentPath: input.agentPath,
      agent: input.agent,
      integrationType: input.integrationType,
      setupCommands: setupCommandsFor(input.agentPath, input.agent),
    },
    layers: input.layers,
    requiredTraceIds: input.requiredTraceIds,
    expectedArtifacts: input.expectedArtifacts,
  };
}

export function getScenarioCapabilityStatus(scenario: LiveStackScenario, env: Record<string, string | undefined>): CapabilityStatus {
  const missingEnv = scenario.model.requiredEnv.filter((name) => !env[name]);
  return missingEnv.length === 0
    ? { runnable: true, missingEnv }
    : { runnable: false, missingEnv, skipReason: `missing live-model credential env: ${missingEnv.join(', ')}` };
}

export function createEvidenceBundle(
  scenario: LiveStackScenario,
  ids: Partial<Omit<LiveStackEvidenceBundle, 'scenarioId' | 'provider' | 'model' | 'artifacts'>>,
  artifacts: Record<string, string>,
): LiveStackEvidenceBundle {
  return redactLiveStackArtifact({
    scenarioId: scenario.scenarioId,
    provider: scenario.model.provider,
    model: scenario.model.model,
    ...ids,
    artifacts,
  }) as LiveStackEvidenceBundle;
}

export function redactLiveStackArtifact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactLiveStackArtifact(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        isSecretKey(key) ? '[REDACTED]' : redactLiveStackArtifact(entry),
      ]),
    );
  }
  return typeof value === 'string' && looksLikeSecret(value) ? '[REDACTED]' : value;
}

export function assertEvidenceBundleComplete(scenario: LiveStackScenario, bundle: LiveStackEvidenceBundle): string[] {
  return scenario.requiredTraceIds.filter((traceId) => !bundle[traceId as keyof LiveStackEvidenceBundle]);
}

function setupCommandsFor(agentPath: LiveStackAgentPath, agent: LiveStackAgentEntry['agent']): readonly string[] {
  if (agentPath === 'babysitter-agent') return ['babysitter-agent create-run --harness internal'];
  return [`babysitter harness:install ${agent}`, `babysitter harness:install-plugin ${agent}`];
}

function requiredEnvValue(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`missing pipeline live-stack scenario env: ${name}`);
  return value;
}

function listEnvValue(env: Record<string, string | undefined>, name: string): readonly string[] {
  return requiredEnvValue(env, name).split(',').map((value) => value.trim()).filter(Boolean);
}

function isSecretKey(key: string): boolean {
  return /(api[_-]?key|token|secret|authorization|password|credential)/i.test(key);
}

function looksLikeSecret(value: string): boolean {
  return /^(sk-|pat_|ghp_|xox|Bearer\s+)/i.test(value) || value.length > 80;
}
