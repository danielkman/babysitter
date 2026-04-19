// Hook registration file generators for all targets

import type { A5cPluginManifest, TargetProfile } from './types.js';
import { slugify } from './utils.js';

export function generateClaudeCodeHooksJson(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const hooksJson: {
    description?: string;
    hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>>;
  } = {
    description: `${manifest.name} plugin hooks for continuous orchestration loops and token compression`,
    hooks: {},
  };

  if (manifest.hooks) {
    for (const [canonicalHook, handlerPath] of Object.entries(manifest.hooks)) {
      if (handlerPath === null) continue;

      const nativeHook = targetProfile.supportedHooks.get(canonicalHook);
      if (!nativeHook) continue;

      const hookSlug = slugify(canonicalHook);
      const scriptPath = `\${CLAUDE_PLUGIN_ROOT}/hooks/${manifest.name}-proxied-${hookSlug}-hook.sh`;

      const hookEntry: { matcher?: string; hooks: Array<{ type: string; command: string }> } = {
        hooks: [
          {
            type: 'command',
            command: `bash ${scriptPath}`,
          },
        ],
      };

      // Add matcher if configured
      if (manifest.hookConfig?.matchers?.[canonicalHook]) {
        hookEntry.matcher = manifest.hookConfig.matchers[canonicalHook];
      }

      hooksJson.hooks[nativeHook] = [hookEntry];
    }
  }

  return JSON.stringify(hooksJson, null, 2);
}

export function generateCodexHooksJson(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const hooksJson: {
    hooks: Record<string, Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>>;
  } = {
    hooks: {},
  };

  if (manifest.hooks) {
    for (const [canonicalHook, handlerPath] of Object.entries(manifest.hooks)) {
      if (handlerPath === null) continue;

      const nativeHook = targetProfile.supportedHooks.get(canonicalHook);
      if (!nativeHook) continue;

      const hookSlug = slugify(canonicalHook);
      const scriptPath = `./hooks/${manifest.name}-proxied-${hookSlug}-hook.sh`;

      hooksJson.hooks[nativeHook] = [
        {
          matcher: '.*',
          hooks: [
            {
              type: 'command',
              command: scriptPath,
            },
          ],
        },
      ];
    }
  }

  return JSON.stringify(hooksJson, null, 2);
}

export function generateCursorHooksJson(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const hooksJson: {
    version: number;
    hooks: Record<
      string,
      Array<{
        type: string;
        bash: string;
        powershell: string;
        timeoutSec?: number;
        loop_limit?: null;
      }>
    >;
  } = {
    version: 1,
    hooks: {},
  };

  if (manifest.hooks) {
    for (const [canonicalHook, handlerPath] of Object.entries(manifest.hooks)) {
      if (handlerPath === null) continue;

      const nativeHook = targetProfile.supportedHooks.get(canonicalHook);
      if (!nativeHook) continue;

      const hookSlug = slugify(canonicalHook);
      const bashPath = `./hooks/${manifest.name}-proxied-${hookSlug}-hook.sh`;
      const ps1Path = `./hooks/${manifest.name}-proxied-${hookSlug}-hook.ps1`;

      const hookEntry: {
        type: string;
        bash: string;
        powershell: string;
        timeoutSec?: number;
        loop_limit?: null;
      } = {
        type: 'command',
        bash: `bash "${bashPath}"`,
        powershell: `powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1Path}"`,
        timeoutSec: 30,
      };

      if (canonicalHook === 'Stop') {
        hookEntry.loop_limit = null;
      }

      hooksJson.hooks[nativeHook] = [hookEntry];
    }
  }

  return JSON.stringify(hooksJson, null, 2);
}

export function generateGeminiHooksJson(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const hooksJson: {
    description?: string;
    hooks: Record<
      string,
      Array<{
        matcher?: string;
        hooks: Array<{
          name: string;
          type: string;
          command: string;
          timeout: number;
          description: string;
        }>;
      }>
    >;
  } = {
    description: `${manifest.name} plugin hooks for Gemini CLI — session initialization and AfterAgent continuation loop`,
    hooks: {},
  };

  if (manifest.hooks) {
    for (const [canonicalHook, handlerPath] of Object.entries(manifest.hooks)) {
      if (handlerPath === null) continue;

      const nativeHook = targetProfile.supportedHooks.get(canonicalHook);
      if (!nativeHook) continue;

      const hookSlug = slugify(canonicalHook);
      const scriptPath = `\${extensionPath}/hooks/${manifest.name}-proxied-${hookSlug}-hook.sh`;

      const descriptions: Record<string, string> = {
        SessionStart: 'Initializes session state so the AfterAgent hook can track orchestration progress',
        AfterAgent: 'Orchestration loop driver — blocks session exit to continue iterating until the run is complete',
      };

      hooksJson.hooks[nativeHook] = [
        {
          hooks: [
            {
              name: `${manifest.name}-${hookSlug}`,
              type: 'command',
              command: `bash "${scriptPath}"`,
              timeout: 30000,
              description: descriptions[canonicalHook] || `${manifest.name} ${canonicalHook} hook`,
            },
          ],
        },
      ];
    }
  }

  return JSON.stringify(hooksJson, null, 2);
}

export function generateGithubCopilotHooksJson(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const hooksJson: {
    version: number;
    hooks: Record<
      string,
      Array<{
        type: string;
        bash: string;
        powershell: string;
        timeoutSec: number;
      }>
    >;
  } = {
    version: 1,
    hooks: {},
  };

  if (manifest.hooks) {
    for (const [canonicalHook, handlerPath] of Object.entries(manifest.hooks)) {
      if (handlerPath === null) continue;

      const nativeHook = targetProfile.supportedHooks.get(canonicalHook);
      if (!nativeHook) continue;

      const hookSlug = slugify(canonicalHook);
      const bashPath = `./hooks/${manifest.name}-proxied-${hookSlug}-hook.sh`;
      const ps1Path = `./hooks/${manifest.name}-proxied-${hookSlug}-hook.ps1`;

      hooksJson.hooks[nativeHook] = [
        {
          type: 'command',
          bash: bashPath,
          powershell: ps1Path,
          timeoutSec: 30,
        },
      ];
    }
  }

  return JSON.stringify(hooksJson, null, 2);
}

export function generateOpenCodeHooksJson(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const hooksJson: {
    version: number;
    description: string;
    hooks: Record<
      string,
      Array<{
        type: string;
        script: string;
        description: string;
        timeoutMs: number;
      }>
    >;
  } = {
    version: 1,
    description: `${manifest.name} hook registration for OpenCode.`,
    hooks: {},
  };

  if (manifest.hooks) {
    for (const [canonicalHook, handlerPath] of Object.entries(manifest.hooks)) {
      if (handlerPath === null) continue;

      const nativeHook = targetProfile.supportedHooks.get(canonicalHook);
      if (!nativeHook) continue;

      const hookSlug = nativeHook.replace(/\./g, '-');
      const scriptPath = `hooks/${manifest.name}-proxied-${hookSlug}.js`;

      const descriptions: Record<string, string> = {
        SessionStart: 'Initialize session state',
        SessionIdle: 'Handle session idle events',
        ShellEnv: 'Inject shell environment variables',
        PreToolUse: 'Pre-tool-use hook',
        PostToolUse: 'Post-tool-use hook',
      };

      hooksJson.hooks[nativeHook] = [
        {
          type: 'command',
          script: scriptPath,
          description: descriptions[canonicalHook] || `${manifest.name} ${canonicalHook} hook`,
          timeoutMs: canonicalHook === 'ShellEnv' ? 5000 : 30000,
        },
      ];
    }
  }

  return JSON.stringify(hooksJson, null, 2);
}

export function generateOpenClawHooksJson(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const hooksJson: {
    description?: string;
    hooks: Record<
      string,
      Array<{
        matcher: string;
        hooks: Array<{
          type: string;
          command: string;
        }>;
      }>
    >;
  } = {
    description: `${manifest.name} plugin hooks for OpenClaw`,
    hooks: {},
  };

  if (manifest.hooks) {
    for (const [canonicalHook, handlerPath] of Object.entries(manifest.hooks)) {
      if (handlerPath === null) continue;

      const nativeHook = targetProfile.supportedHooks.get(canonicalHook);
      if (!nativeHook) continue;

      const hookSlug = slugify(canonicalHook);
      const scriptPath = `./hooks/${manifest.name}-proxied-${hookSlug}-hook.sh`;

      hooksJson.hooks[nativeHook] = [
        {
          matcher: '*',
          hooks: [
            {
              type: 'command',
              command: scriptPath,
            },
          ],
        },
      ];
    }
  }

  return JSON.stringify(hooksJson, null, 2);
}
