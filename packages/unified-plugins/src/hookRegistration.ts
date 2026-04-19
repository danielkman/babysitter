// Hook registration file generators for all targets
// Generates hooks.json (or equivalent) that wires up hook scripts
// with HOOK_TYPE and ADAPTER_NAME env vars per target.

import type { A5cPluginManifest, TargetProfile } from './types.js';
import { slugify } from './utils.js';

function resolveHookPath(
  handlerValue: string | boolean,
  hookSlug: string,
  pluginName: string,
  hookFilePattern?: string
): string | null {
  if (typeof handlerValue !== 'string' || handlerValue === 'proxy') return null;
  if (hookFilePattern) {
    return 'hooks/' + hookFilePattern
      .replace(/\{\{name\}\}/g, pluginName)
      .replace(/\{\{slug\}\}/g, hookSlug);
  }
  return handlerValue;
}

function resolveCmd(
  handlerValue: string | boolean,
  hookSlug: string,
  adapter: string,
  rootRef: string,
  pluginName: string,
  pattern?: string
): string {
  if (handlerValue === 'proxy') {
    return `a5c-hooks-proxy invoke --adapter ${adapter} --json`;
  }
  const p = resolveHookPath(handlerValue, hookSlug, pluginName, pattern);
  if (p) return `HOOK_TYPE=${hookSlug} ADAPTER_NAME=${adapter} PLUGIN_ROOT=${rootRef} bash ${rootRef}/${p}`;
  return `echo '{}'`;
}

function resolvePsCmd(
  handlerValue: string | boolean,
  hookSlug: string,
  adapter: string,
  pluginName: string,
  pattern?: string
): string {
  if (handlerValue === 'proxy') {
    return `a5c-hooks-proxy invoke --adapter ${adapter} --json`;
  }
  const p = resolveHookPath(handlerValue, hookSlug, pluginName, pattern);
  if (p) return `$env:HOOK_TYPE='${hookSlug}'; $env:ADAPTER_NAME='${adapter}'; & "./${p.replace(/\.sh$/, '.ps1')}"`;
  return `Write-Output '{}'`;
}

function getPattern(manifest: A5cPluginManifest, targetName: string): string | undefined {
  const val = manifest.targets?.[targetName]?.hookFilePattern;
  return typeof val === 'string' ? val : undefined;
}

function iterateHooks(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile,
  cb: (canonical: string, native: string, handler: string | boolean) => void
): void {
  if (!manifest.hooks) return;
  for (const [canonical, handler] of Object.entries(manifest.hooks)) {
    if (handler === null) continue;
    const native = targetProfile.supportedHooks.get(canonical);
    if (!native) continue;
    cb(canonical, native, handler);
  }
}

export function generateClaudeCodeHooksJson(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const hooks: Record<string, unknown> = {};
  const rootRef = targetProfile.pluginRootEnvVar
    ? `\${${targetProfile.pluginRootEnvVar}}`
    : '$(cd "$(dirname "$0")/.." && pwd)';
  const pat = getPattern(manifest, targetProfile.name);

  iterateHooks(manifest, targetProfile, (canonical, native, handler) => {
    const slug = slugify(canonical);
    const cmd = resolveCmd(handler, slug, targetProfile.adapterName, rootRef, manifest.name, pat);
    const entry: Record<string, unknown> = {
      hooks: [{ type: 'command', command: cmd }],
    };
    if (manifest.hookConfig?.matchers?.[canonical]) {
      entry.matcher = manifest.hookConfig.matchers[canonical];
    }
    hooks[native] = [entry];
  });

  return JSON.stringify({ description: `${manifest.name} plugin hooks`, hooks }, null, 2);
}

export function generateCodexHooksJson(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const hooks: Record<string, unknown> = {};
  const pat = getPattern(manifest, targetProfile.name);

  iterateHooks(manifest, targetProfile, (canonical, native, handler) => {
    const slug = slugify(canonical);
    const cmd = resolveCmd(handler, slug, targetProfile.adapterName, '.', manifest.name, pat);
    hooks[native] = [{ matcher: '.*', hooks: [{ type: 'command', command: cmd }] }];
  });

  return JSON.stringify({ hooks }, null, 2);
}

export function generateCursorHooksJson(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const hooks: Record<string, unknown> = {};
  const pat = getPattern(manifest, targetProfile.name);

  iterateHooks(manifest, targetProfile, (canonical, native, handler) => {
    const slug = slugify(canonical);
    const bash = resolveCmd(handler, slug, targetProfile.adapterName, '.', manifest.name, pat);
    const ps = resolvePsCmd(handler, slug, targetProfile.adapterName, manifest.name, pat);
    const entry: Record<string, unknown> = { type: 'command', bash, powershell: ps, timeoutSec: 30 };
    if (canonical === 'Stop') entry.loop_limit = null;
    hooks[native] = [entry];
  });

  return JSON.stringify({ version: 1, hooks }, null, 2);
}

export function generateGeminiHooksJson(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const hooks: Record<string, unknown> = {};
  const rootRef = targetProfile.pluginRootEnvVar
    ? `\${${targetProfile.pluginRootEnvVar}}`
    : '${extensionPath}';
  const pat = getPattern(manifest, targetProfile.name);

  iterateHooks(manifest, targetProfile, (canonical, native, handler) => {
    const slug = slugify(canonical);
    const cmd = resolveCmd(handler, slug, targetProfile.adapterName, rootRef, manifest.name, pat);
    hooks[native] = [{
      hooks: [{
        name: `${manifest.name}-${slug}`,
        type: 'command',
        command: cmd,
        timeout: 30000,
        description: `${manifest.name} ${canonical} hook`,
      }],
    }];
  });

  return JSON.stringify({
    description: `${manifest.name} plugin hooks for Gemini CLI`,
    hooks,
  }, null, 2);
}

export function generateGithubCopilotHooksJson(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const hooks: Record<string, unknown> = {};
  const pat = getPattern(manifest, targetProfile.name);

  iterateHooks(manifest, targetProfile, (canonical, native, handler) => {
    const slug = slugify(canonical);
    const bash = resolveCmd(handler, slug, targetProfile.adapterName, '.', manifest.name, pat);
    const ps = resolvePsCmd(handler, slug, targetProfile.adapterName, manifest.name, pat);
    hooks[native] = [{ type: 'command', bash, powershell: ps, timeoutSec: 30 }];
  });

  return JSON.stringify({ version: 1, hooks }, null, 2);
}

export function generateOpenCodeHooksJson(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const hooks: Record<string, unknown> = {};
  const pat = getPattern(manifest, targetProfile.name);

  iterateHooks(manifest, targetProfile, (canonical, native, handler) => {
    const slug = slugify(canonical);
    if (handler === 'proxy') {
      hooks[native] = [{
        type: 'command',
        script: `a5c-hooks-proxy invoke --adapter ${targetProfile.adapterName} --json`,
        env: { HOOK_TYPE: slug, ADAPTER_NAME: targetProfile.adapterName },
        description: `${manifest.name} ${canonical} hook`,
        timeoutMs: canonical === 'ShellEnv' ? 5000 : 30000,
      }];
    } else {
      const p = resolveHookPath(handler, slug, manifest.name, pat);
      const script = p ? p.replace(/\.sh$/, '.js') : 'echo {}';
      hooks[native] = [{
        type: 'command',
        script,
        env: { HOOK_TYPE: slug, ADAPTER_NAME: targetProfile.adapterName },
        description: `${manifest.name} ${canonical} hook`,
        timeoutMs: canonical === 'ShellEnv' ? 5000 : 30000,
      }];
    }
  });

  return JSON.stringify({
    version: 1,
    description: `${manifest.name} hook registration for OpenCode.`,
    hooks,
  }, null, 2);
}

export function generateOpenClawHooksJson(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const hooks: Record<string, unknown> = {};
  const pat = getPattern(manifest, targetProfile.name);

  iterateHooks(manifest, targetProfile, (canonical, native, handler) => {
    const slug = slugify(canonical);
    const cmd = resolveCmd(handler, slug, targetProfile.adapterName, '.', manifest.name, pat);
    hooks[native] = [{ matcher: '*', hooks: [{ type: 'command', command: cmd }] }];
  });

  return JSON.stringify({
    description: `${manifest.name} plugin hooks for OpenClaw`,
    hooks,
  }, null, 2);
}
