import type { ProviderConfig } from '@a5c-ai/agent-mux-core';
import type { HarnessProviderTranslation } from '../provider-translation.js';

export function translateForGenericOpenAI(config: ProviderConfig): HarnessProviderTranslation {
  const env: Record<string, string> = {};
  const args: string[] = [];

  // OpenAI-compatible providers can be reached directly
  if (config.params['apiBase']) {
    const base = String(config.params['apiBase']);
    env['OPENAI_BASE_URL'] = base;
    env['OPENAI_API_BASE'] = base; // legacy env var used by some CLIs
  }
  if (config.auth.apiKey) {
    env['OPENAI_API_KEY'] = config.auth.apiKey;
  }

  // When routing through a non-Anthropic provider, suppress ANTHROPIC_API_KEY
  // to prevent the harness from falling back to direct Anthropic calls.
  if (config.provider !== 'anthropic') {
    env['ANTHROPIC_API_KEY'] = '';
  }

  const directProviders = ['openai', 'foundry', 'groq', 'fireworks', 'together', 'deepseek',
    'mistral', 'cerebras', 'sambanova', 'openrouter', 'ollama', 'local',
    'lmstudio', 'vllm', 'custom'];

  if (directProviders.includes(config.provider)) {
    return { env, args, proxyRequired: false };
  }

  return { env, args, proxyRequired: true, proxyExposedTransport: 'openai-chat' };
}
