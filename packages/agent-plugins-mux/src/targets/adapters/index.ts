// Adapter registry — built dynamically from the agent-catalog graph

export type { HarnessOutputAdapter } from './interface.js';
export { BaseHarnessOutputAdapter } from './base.js';

import { listPluginTargetDescriptors } from '@a5c-ai/agent-catalog';
import type { HarnessOutputAdapter } from './interface.js';
import { ClaudeCodeAdapter } from './claude-code.js';
import { CodexAdapter } from './codex.js';
import { CursorAdapter } from './cursor.js';
import { GeminiAdapter } from './gemini.js';
import { GithubCopilotAdapter } from './github-copilot.js';
import { OpenCodeAdapter } from './opencode.js';
import { OpenClawAdapter } from './openclaw.js';
import { PiAdapter } from './pi.js';
import { OhMyPiAdapter } from './oh-my-pi.js';

// Re-export individual adapter classes
export { ClaudeCodeAdapter } from './claude-code.js';
export { CodexAdapter } from './codex.js';
export { CursorAdapter } from './cursor.js';
export { GeminiAdapter } from './gemini.js';
export { GithubCopilotAdapter } from './github-copilot.js';
export { OpenCodeAdapter } from './opencode.js';
export { OpenClawAdapter } from './openclaw.js';
export { PiAdapter } from './pi.js';
export { OhMyPiAdapter } from './oh-my-pi.js';

// Re-export hook/manifest generators for backward compatibility
export { generateClaudeCodeHooksJson, generateClaudeCodeManifest } from './claude-code.js';
export { generateCodexHooksJson, generateCodexManifest } from './codex.js';
export { generateCursorHooksJson, generateCursorManifest } from './cursor.js';
export { generateGeminiHooksJson, generateGeminiManifest } from './gemini.js';
export { generateGithubCopilotHooksJson, generateGithubCopilotManifest } from './github-copilot.js';
export { generateOpenCodeHooksJson, generateOpenCodeManifest } from './opencode.js';
export { generateOpenClawHooksJson, generateOpenClawManifest, generateOpenClawPackageManifest } from './openclaw.js';
export { generatePiManifest } from './pi.js';
export { generateOhMyPiManifest } from './oh-my-pi.js';

// Map hookRegistrationFormat (from the catalog graph) to adapter class.
// When a new target is added to the catalog, add its adapter class here.
const ADAPTER_BY_HOOK_FORMAT: Record<string, () => HarnessOutputAdapter> = {
  'claude-code': () => new ClaudeCodeAdapter(),
  'codex': () => new CodexAdapter(),
  'cursor': () => new CursorAdapter(),
  'gemini': () => new GeminiAdapter(),
  'github-copilot': () => new GithubCopilotAdapter(),
  'opencode': () => new OpenCodeAdapter(),
  'openclaw': () => new OpenClawAdapter(),
};

// Programmatic targets without hook registration — keyed by targetId
const ADAPTER_BY_TARGET_ID: Record<string, () => HarnessOutputAdapter> = {
  'pi': () => new PiAdapter(),
  'oh-my-pi': () => new OhMyPiAdapter(),
};

// Build registry dynamically from the catalog graph
const ADAPTER_REGISTRY: Record<string, HarnessOutputAdapter> = {};
for (const descriptor of listPluginTargetDescriptors()) {
  const format = descriptor.hookRegistrationFormat;
  const factory = (format && ADAPTER_BY_HOOK_FORMAT[format]) || ADAPTER_BY_TARGET_ID[descriptor.targetId];
  if (factory) {
    ADAPTER_REGISTRY[descriptor.targetId] = factory();
  }
}

export function getAdapter(targetName: string): HarnessOutputAdapter | undefined {
  return ADAPTER_REGISTRY[targetName];
}

export { ADAPTER_REGISTRY };
