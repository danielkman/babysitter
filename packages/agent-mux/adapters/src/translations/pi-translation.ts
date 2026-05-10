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
      // Pi has native Azure support. The AzureOpenAI SDK constructs paths as
      // {baseUrl}/openai/deployments/{model}/... so we pass the base URL as-is.
      const apiBase = config.params['apiBase'] ? String(config.params['apiBase']) : undefined;
      if (apiBase) env['AZURE_OPENAI_BASE_URL'] = apiBase;
      if (config.auth.apiKey) env['AZURE_OPENAI_API_KEY'] = config.auth.apiKey;
      env['AZURE_OPENAI_API_VERSION'] = '2025-04-01-preview';
      args.push('--provider', 'azure');
      env['ANTHROPIC_API_KEY'] = '';
      env['OPENAI_API_KEY'] = '';
      return { env, args, proxyRequired: false };
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
      if (config.params['apiBase']) {
        env['OPENAI_BASE_URL'] = String(config.params['apiBase']);
        env['OPENAI_API_BASE'] = String(config.params['apiBase']);
      }
      if (config.auth.apiKey) env['OPENAI_API_KEY'] = config.auth.apiKey;
      env['ANTHROPIC_API_KEY'] = '';
      return { env, args, proxyRequired: false };
    }
    default:
      // For unsupported providers, route through transport-mux proxy which
      // exposes an OpenAI-compatible local endpoint.
      env['ANTHROPIC_API_KEY'] = '';
      return { env, args, proxyRequired: true, proxyExposedTransport: 'openai-chat' };
  }
}
