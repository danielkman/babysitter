import type { ProviderConfig } from '@a5c-ai/agent-mux-core';
import type { HarnessProviderTranslation } from '../provider-translation.js';

export function translateForPi(config: ProviderConfig): HarnessProviderTranslation {
  const env: Record<string, string> = {};
  const args: string[] = [];

  switch (config.provider) {
    case 'openai':
      if (config.auth.apiKey) env['OPENAI_API_KEY'] = config.auth.apiKey;
      return { env, args, proxyRequired: false };
    case 'foundry':
    case 'azure': {
      // Azure AI Services (foundry) requires api-version query params that Pi
      // can't add natively. Route through the transport-mux proxy which exposes
      // an OpenAI-compatible endpoint locally (Pi reads OPENAI_BASE_URL from
      // the proxy's applyHarnessEnv).
      env['ANTHROPIC_API_KEY'] = '';
      return { env, args, proxyRequired: true, proxyExposedTransport: 'openai-chat' };
    }
    case 'anthropic':
      if (config.auth.apiKey) env['ANTHROPIC_API_KEY'] = config.auth.apiKey;
      args.push('--provider', 'anthropic');
      return { env, args, proxyRequired: false };
    case 'custom':
    case 'ollama':
    case 'local':
    case 'lmstudio':
    case 'vllm': {
      // Custom/local providers: Pi supports baseUrl via models.json config
      if (config.params['apiBase']) {
        env['OPENAI_BASE_URL'] = String(config.params['apiBase']);
        env['OPENAI_API_BASE'] = String(config.params['apiBase']);
      }
      if (config.auth.apiKey) env['OPENAI_API_KEY'] = config.auth.apiKey;
      env['ANTHROPIC_API_KEY'] = '';
      return { env, args, proxyRequired: false };
    }
    default:
      // For providers Pi doesn't natively support, route through transport-mux proxy
      if (config.auth.apiKey) env['OPENAI_API_KEY'] = config.auth.apiKey;
      env['ANTHROPIC_API_KEY'] = '';
      return { env, args, proxyRequired: true, proxyExposedTransport: 'openai-chat' };
  }
}
