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
      // Pi has native Azure OpenAI support via --provider flag and env vars
      const apiBase = config.params['apiBase'] ? String(config.params['apiBase']) : undefined;
      if (apiBase) env['AZURE_OPENAI_BASE_URL'] = `${apiBase}/openai`;
      if (config.auth.apiKey) env['AZURE_OPENAI_API_KEY'] = config.auth.apiKey;
      args.push('--provider', 'azure');
      env['ANTHROPIC_API_KEY'] = '';
      return { env, args, proxyRequired: false };
    }
    case 'anthropic':
      if (config.auth.apiKey) env['ANTHROPIC_API_KEY'] = config.auth.apiKey;
      args.push('--provider', 'anthropic');
      return { env, args, proxyRequired: false };
    default:
      // For providers Pi doesn't natively support, route through transport-mux proxy
      if (config.auth.apiKey) env['OPENAI_API_KEY'] = config.auth.apiKey;
      env['ANTHROPIC_API_KEY'] = '';
      return { env, args, proxyRequired: true, proxyExposedTransport: 'openai-chat' };
  }
}
