import type { AgentName, ProviderConfig } from '@a5c-ai/agent-mux-core';
import { getHarnessDefaultTransport } from '@a5c-ai/agent-mux-core';
import type { HarnessProviderTranslation } from './provider-translation.js';
import { translateForClaude } from './translations/claude-translation.js';
import { translateForCodex } from './translations/codex-translation.js';
import { translateForGemini } from './translations/gemini-translation.js';
import { translateForOpenCode } from './translations/opencode-translation.js';
import { translateForGenericOpenAI } from './translations/generic-openai-translation.js';

type TranslationFn = (config: ProviderConfig) => HarnessProviderTranslation;

const TRANSLATION_REGISTRY = new Map<string, TranslationFn>();

export function registerTranslation(agent: string, fn: TranslationFn): void {
  TRANSLATION_REGISTRY.set(agent, fn);
}

// Self-register all built-in translations
registerTranslation('claude', translateForClaude);
registerTranslation('codex', translateForCodex);
registerTranslation('gemini', translateForGemini);
registerTranslation('qwen', translateForGemini);
registerTranslation('opencode', translateForOpenCode);

// Generic OpenAI translation for adapters that don't need custom logic
for (const agent of ['cursor', 'pi', 'omp', 'openclaw', 'hermes', 'droid', 'amp']) {
  registerTranslation(agent, translateForGenericOpenAI);
}

export function translateForHarness(agent: AgentName, config: ProviderConfig, adapter?: { translateProvider?(config: Record<string, unknown>): any }): HarnessProviderTranslation {
  if (adapter?.translateProvider) {
    return adapter.translateProvider(config as unknown as Record<string, unknown>);
  }
  const fn = TRANSLATION_REGISTRY.get(agent);
  if (fn) return fn(config);
  return {
    env: {},
    args: [],
    proxyRequired: true,
    proxyExposedTransport: getHarnessDefaultTransport(agent),
  };
}
