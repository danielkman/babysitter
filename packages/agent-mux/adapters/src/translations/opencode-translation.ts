import * as fs from 'node:fs';
import type { ProviderConfig, ProviderId } from '@a5c-ai/agent-comm-mux';
import type { HarnessProviderTranslation } from '../provider-translation.js';

const OPENCODE_SDK_MAP: Partial<Record<ProviderId, string>> = {
  anthropic: '@ai-sdk/anthropic',
  openai: '@ai-sdk/openai',
  google: '@ai-sdk/google',
  vertex: '@ai-sdk/google-vertex',
  bedrock: '@ai-sdk/amazon-bedrock',
  azure: '@ai-sdk/azure',
};

function mergeWithExistingConfig(generatedConfig: string): string {
  try {
    const existing = JSON.parse(fs.readFileSync('opencode.json', 'utf-8'));
    const generated = JSON.parse(generatedConfig);
    return JSON.stringify({ ...existing, ...generated });
  } catch {
    return generatedConfig;
  }
}

function buildOpenCodeConfig(npm: string, model: string, options?: Record<string, unknown>): string {
  return JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    provider: { amux: { npm, options: options ?? {} } },
    model: { default: `amux/${model}` },
  });
}

export function translateForOpenCode(config: ProviderConfig): HarnessProviderTranslation {
  const env: Record<string, string> = {};
  const args: string[] = [];
  const nativeSdk = OPENCODE_SDK_MAP[config.provider];

  if (nativeSdk) {
    if (config.auth.apiKey) {
      const envKeyMap: Partial<Record<ProviderId, string>> = {
        anthropic: 'ANTHROPIC_API_KEY',
        openai: 'OPENAI_API_KEY',
        google: 'GOOGLE_GENERATIVE_AI_API_KEY',
      };
      const envKey = envKeyMap[config.provider];
      if (envKey) env[envKey] = config.auth.apiKey;
    }
    env['OPENCODE_CONFIG_CONTENT'] = mergeWithExistingConfig(buildOpenCodeConfig(nativeSdk, config.model));
    return { env, args, proxyRequired: false };
  }

  // For providers without a bundled SDK (foundry, custom, etc.), route through
  // the proxy and use @ai-sdk/openai which IS bundled in the opencode binary.
  // The proxy handles auth translation (e.g. Azure api-key → Bearer token).
  env['OPENCODE_CONFIG_CONTENT'] = mergeWithExistingConfig(buildOpenCodeConfig(
    '@ai-sdk/openai',
    config.model,
  ));
  if (config.auth.apiKey) env['OPENAI_API_KEY'] = config.auth.apiKey;
  return { env, args, proxyRequired: true, proxyExposedTransport: 'openai-chat' as any };
}
