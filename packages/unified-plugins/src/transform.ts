// Stage 3: TRANSFORM - Transform components to target format

import * as fs from 'fs';
import * as path from 'path';
import type {
  A5cPluginManifest,
  TargetProfile,
  TransformResult,
  TransformedFile,
  Diagnostic,
} from './types.js';
import {
  buildSkillFromCommand,
  markdownToToml,
  slugify,
} from './utils.js';

// Hook script templates
import {
  generateBashHookScript,
  generatePowerShellHookScript,
  generateJavaScriptHookScript,
  generateTypeScriptHookStub,
} from './hookTemplates.js';

// Manifest generators
import {
  generateClaudeCodeManifest,
  generateCodexManifest,
  generateCursorManifest,
  generateGeminiManifest,
  generateGithubCopilotManifest,
  generatePiManifest,
  generateOhMyPiManifest,
  generateOpenCodeManifest,
  generateOpenClawManifest,
} from './manifestGenerators.js';

// Hook registration generators
import {
  generateClaudeCodeHooksJson,
  generateCodexHooksJson,
  generateCursorHooksJson,
  generateGeminiHooksJson,
  generateGithubCopilotHooksJson,
  generateOpenCodeHooksJson,
  generateOpenClawHooksJson,
} from './hookRegistration.js';

// Proxied hook templates for programmatic targets
import {
  generateProxiedHookScript,
  generateProxiedHooksJson,
  generateProgrammaticExtension,
} from './proxiedHookTemplates.js';

// Bin script templates for npm-cli distribution
import {
  generateCliBinScript,
  generateInstallScript,
  generateUninstallScript,
} from './binTemplates.js';

// Installation instructions
import { generateInstallInstructions } from './installInstructions.js';

export function transform(
  sourceDir: string,
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): TransformResult {
  const files: TransformedFile[] = [];
  const diagnostics: Diagnostic[] = [];

  // Transform commands
  const commandFiles = transformCommands(sourceDir, manifest, targetProfile, diagnostics);
  files.push(...commandFiles);

  // Transform skills
  const skillFiles = transformSkills(sourceDir, manifest, targetProfile, diagnostics);
  files.push(...skillFiles);

  // Transform hooks
  const hookFiles = transformHooks(sourceDir, manifest, targetProfile, diagnostics);
  files.push(...hookFiles);

  // Generate manifests
  const manifestFiles = generateManifests(sourceDir, manifest, targetProfile, diagnostics);
  files.push(...manifestFiles);

  // Copy context files
  const contextFiles = copyContextFiles(sourceDir, manifest, targetProfile, diagnostics);
  files.push(...contextFiles);

  // Copy versions.json
  const versionsPath = path.join(sourceDir, 'versions.json');
  if (fs.existsSync(versionsPath)) {
    files.push({
      path: 'versions.json',
      content: fs.readFileSync(versionsPath, 'utf-8'),
    });
  }

  // Generate extra files (Pi/oh-my-pi extensions, etc.)
  const extraFiles = generateExtraFiles(sourceDir, manifest, targetProfile, diagnostics);
  files.push(...extraFiles);

  return { files, diagnostics };
}

function transformCommands(
  sourceDir: string,
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile,
  _diagnostics: Diagnostic[]
): TransformedFile[] {
  const files: TransformedFile[] = [];

  if (targetProfile.commandFormat === 'none') {
    return files;
  }

  if (!manifest.commands) {
    return files;
  }

  const commandPaths: string[] = [];
  if (typeof manifest.commands === 'string') {
    // Directory path - glob all .md files
    const commandDir = path.join(sourceDir, manifest.commands);
    if (fs.existsSync(commandDir)) {
      const entries = fs.readdirSync(commandDir);
      for (const entry of entries) {
        if (entry.endsWith('.md')) {
          commandPaths.push(path.join(manifest.commands, entry));
        }
      }
    }
  } else {
    commandPaths.push(...manifest.commands);
  }

  for (const cmdPath of commandPaths) {
    const fullPath = path.join(sourceDir, cmdPath);
    if (!fs.existsSync(fullPath)) {
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf-8');

    if (targetProfile.commandFormat === 'toml') {
      // Convert to TOML (Gemini)
      const tomlContent = markdownToToml(content);
      const basename = path.basename(cmdPath, '.md');
      files.push({
        path: `commands/${basename}.toml`,
        content: tomlContent,
      });
    } else {
      // Copy as-is (Markdown)
      files.push({
        path: cmdPath,
        content,
      });
    }
  }

  return files;
}

function transformSkills(
  sourceDir: string,
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile,
  _diagnostics: Diagnostic[]
): TransformedFile[] {
  const files: TransformedFile[] = [];

  if (targetProfile.skillHandling === 'none') {
    return files;
  }

  // Always copy standalone skills
  if (manifest.skills && Array.isArray(manifest.skills)) {
    for (const skill of manifest.skills) {
      const fullPath = path.join(sourceDir, skill.file);
      if (fs.existsSync(fullPath)) {
        files.push({
          path: skill.file,
          content: fs.readFileSync(fullPath, 'utf-8'),
        });
      }
    }
  }

  // Derive skills from commands if needed
  if (targetProfile.skillHandling === 'derived-from-commands') {
    const commandPaths = getCommandPaths(sourceDir, manifest);

    // Build set of standalone skill names to avoid duplicating them
    const standaloneSkillNames = new Set<string>();
    if (manifest.skills && Array.isArray(manifest.skills)) {
      for (const skill of manifest.skills) {
        standaloneSkillNames.add(skill.name);
      }
    }

    for (const cmdPath of commandPaths) {
      const fullPath = path.join(sourceDir, cmdPath);
      if (!fs.existsSync(fullPath)) continue;

      const basename = path.basename(cmdPath, '.md');

      if (standaloneSkillNames.has(basename)) {
        continue;
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      const derivedSkill = buildSkillFromCommand(basename, content);

      files.push({
        path: `skills/${basename}/SKILL.md`,
        content: derivedSkill,
      });
    }
  }

  return files;
}

function getCommandPaths(
  sourceDir: string,
  manifest: A5cPluginManifest
): string[] {
  if (!manifest.commands) return [];

  const commandPaths: string[] = [];
  if (typeof manifest.commands === 'string') {
    const commandDir = path.join(sourceDir, manifest.commands);
    if (fs.existsSync(commandDir)) {
      const entries = fs.readdirSync(commandDir);
      for (const entry of entries) {
        if (entry.endsWith('.md')) {
          commandPaths.push(path.join(manifest.commands, entry));
        }
      }
    }
  } else {
    commandPaths.push(...manifest.commands);
  }

  return commandPaths;
}

function transformHooks(
  _sourceDir: string,
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile,
  diagnostics: Diagnostic[]
): TransformedFile[] {
  const files: TransformedFile[] = [];

  if (!manifest.hooks || targetProfile.supportedHooks.size === 0) {
    return files;
  }

  const isProgrammatic = targetProfile.adapterFamily === 'programmatic';

  for (const [canonicalHook, handlerPath] of Object.entries(manifest.hooks)) {
    if (handlerPath === null) continue;

    const nativeHook = targetProfile.supportedHooks.get(canonicalHook);
    if (!nativeHook) {
      continue;
    }

    // For programmatic targets, generate proxied Node.js hook scripts
    if (isProgrammatic && targetProfile.scriptVariants.includes('javascript')) {
      const jsScript = generateProxiedHookScript(
        canonicalHook,
        nativeHook,
        targetProfile
      );
      const fileName = `${manifest.name}-proxied-${slugify(canonicalHook)}.js`;
      files.push({
        path: `hooks/${fileName}`,
        content: jsScript,
        executable: true,
      });
      continue;
    }

    // Shell-hook targets: generate bash/powershell/js/ts scripts
    if (targetProfile.scriptVariants.includes('bash')) {
      const bashScript = generateBashHookScript(
        canonicalHook,
        nativeHook,
        targetProfile
      );
      const fileName = `${manifest.name}-proxied-${slugify(canonicalHook)}-hook.sh`;
      files.push({
        path: `hooks/${fileName}`,
        content: bashScript,
        executable: true,
      });
    }

    if (targetProfile.scriptVariants.includes('powershell')) {
      const ps1Script = generatePowerShellHookScript(
        canonicalHook,
        nativeHook,
        targetProfile
      );
      const fileName = `${manifest.name}-proxied-${slugify(canonicalHook)}-hook.ps1`;
      files.push({
        path: `hooks/${fileName}`,
        content: ps1Script,
        executable: false,
      });
    }

    if (!isProgrammatic && targetProfile.scriptVariants.includes('javascript')) {
      const jsScript = generateJavaScriptHookScript(
        canonicalHook,
        nativeHook,
        targetProfile
      );
      const fileName = `${manifest.name}-proxied-${nativeHook.replace(/\./g, '-')}.js`;
      files.push({
        path: `hooks/${fileName}`,
        content: jsScript,
        executable: true,
      });
    }

    if (targetProfile.scriptVariants.includes('typescript')) {
      const tsStub = generateTypeScriptHookStub(canonicalHook, nativeHook);
      const fileName = `${nativeHook.replace(/_/g, '-')}.ts`;
      files.push({
        path: `extensions/hooks/${fileName}`,
        content: tsStub,
        executable: false,
      });
    }
  }

  // Generate proxied-hooks.json for programmatic targets
  if (isProgrammatic && targetProfile.supportedHooks.size > 0) {
    files.push({
      path: 'hooks/proxied-hooks.json',
      content: generateProxiedHooksJson(targetProfile, targetProfile.supportedHooks, manifest.name),
    });
  }

  // Generate hook registration file for shell-hook targets
  if (targetProfile.hookRegistrationFormat) {
    const hookRegFile = generateHookRegistrationFile(
      manifest,
      targetProfile,
      diagnostics
    );
    if (hookRegFile) {
      files.push(hookRegFile);
    }
  }

  return files;
}

function generateHookRegistrationFile(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile,
  _diagnostics: Diagnostic[]
): TransformedFile | null {
  let content = '';
  let filePath = '';

  switch (targetProfile.hookRegistrationFormat) {
    case 'claude-code':
      content = generateClaudeCodeHooksJson(manifest, targetProfile);
      filePath = 'hooks.json';
      break;
    case 'codex':
      content = generateCodexHooksJson(manifest, targetProfile);
      filePath = 'hooks.json';
      break;
    case 'cursor':
      content = generateCursorHooksJson(manifest, targetProfile);
      filePath = 'hooks/hooks-cursor.json';
      break;
    case 'gemini':
      content = generateGeminiHooksJson(manifest, targetProfile);
      filePath = 'hooks/hooks.json';
      break;
    case 'github-copilot':
      content = generateGithubCopilotHooksJson(manifest, targetProfile);
      filePath = 'hooks.json';
      break;
    case 'opencode':
      content = generateOpenCodeHooksJson(manifest, targetProfile);
      filePath = 'hooks/hooks.json';
      break;
    case 'openclaw':
      content = generateOpenClawHooksJson(manifest, targetProfile);
      filePath = 'hooks.json';
      break;
    default:
      return null;
  }

  return { path: filePath, content };
}

function generateManifests(
  sourceDir: string,
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile,
  _diagnostics: Diagnostic[]
): TransformedFile[] {
  const files: TransformedFile[] = [];

  switch (targetProfile.name) {
    case 'claude-code':
      files.push({
        path: 'plugin.json',
        content: generateClaudeCodeManifest(manifest),
      });
      break;
    case 'codex':
      files.push({
        path: 'package.json',
        content: generateCodexManifest(manifest),
      });
      break;
    case 'cursor':
      files.push({
        path: 'plugin.json',
        content: generateCursorManifest(manifest),
      });
      break;
    case 'gemini':
      files.push({
        path: 'plugin.json',
        content: generateGeminiManifest(manifest),
      });
      files.push({
        path: 'gemini-extension.json',
        content: JSON.stringify(
          {
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            contextFileName: 'GEMINI.md',
            settings: [],
          },
          null,
          2
        ),
      });
      break;
    case 'github-copilot': {
      const copilotManifest = generateGithubCopilotManifest(manifest);
      files.push({
        path: 'plugin.json',
        content: copilotManifest,
      });
      files.push({
        path: '.github/plugin.json',
        content: copilotManifest,
      });
      break;
    }
    case 'pi':
      files.push({
        path: 'package.json',
        content: generatePiManifest(manifest),
      });
      break;
    case 'oh-my-pi':
      files.push({
        path: 'package.json',
        content: generateOhMyPiManifest(manifest),
      });
      break;
    case 'opencode':
      files.push({
        path: 'plugin.json',
        content: generateOpenCodeManifest(manifest),
      });
      break;
    case 'openclaw':
      files.push({
        path: 'plugin.json',
        content: generateOpenClawManifest(manifest),
      });
      files.push({
        path: 'openclaw.plugin.json',
        content: JSON.stringify(
          {
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            entrypoint: 'extensions/index.ts',
            hooks: generateOpenClawNativeHooksSection(manifest, targetProfile),
            capabilities: ['orchestration', 'process-management', 'human-in-the-loop'],
          },
          null,
          2
        ),
      });
      break;
  }

  return files;
}

function generateOpenClawNativeHooksSection(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): Record<string, string> {
  const hooks: Record<string, string> = {};

  if (manifest.hooks) {
    for (const [canonicalHook, handlerPath] of Object.entries(manifest.hooks)) {
      if (handlerPath === null) continue;

      const nativeHook = targetProfile.supportedHooks.get(canonicalHook);
      if (nativeHook) {
        hooks[nativeHook] = `extensions/hooks/${nativeHook.replace(/_/g, '-')}.ts`;
      }
    }
  }

  return hooks;
}

function copyContextFiles(
  sourceDir: string,
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile,
  _diagnostics: Diagnostic[]
): TransformedFile[] {
  const files: TransformedFile[] = [];

  if (!manifest.contextFiles) {
    return files;
  }

  const contextPath = manifest.contextFiles[targetProfile.name];
  if (contextPath) {
    const fullPath = path.join(sourceDir, contextPath);
    if (fs.existsSync(fullPath)) {
      const basename = path.basename(contextPath);
      files.push({
        path: basename,
        content: fs.readFileSync(fullPath, 'utf-8'),
      });
    }
  }

  return files;
}

function generateExtraFiles(
  sourceDir: string,
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile,
  _diagnostics: Diagnostic[]
): TransformedFile[] {
  const files: TransformedFile[] = [];

  // Generate programmatic extensions (Pi, oh-my-pi, and other programmatic targets)
  if (targetProfile.adapterFamily === 'programmatic') {
    const cmdPaths = getCommandPaths(sourceDir, manifest);
    const extensionsContent = generateProgrammaticExtension(manifest, targetProfile, cmdPaths);
    files.push({
      path: 'extensions/index.ts',
      content: extensionsContent,
    });
  }

  // Generate CLI bin scripts for npm-cli distribution targets
  if (targetProfile.distribution === 'npm-cli' || targetProfile.distribution === 'both') {
    files.push({
      path: 'bin/cli.js',
      content: generateCliBinScript(manifest, targetProfile),
      executable: true,
    });
    files.push({
      path: 'bin/install.js',
      content: generateInstallScript(manifest, targetProfile),
      executable: true,
    });
    files.push({
      path: 'bin/uninstall.js',
      content: generateUninstallScript(manifest, targetProfile),
      executable: true,
    });
  }

  // Generate installation instructions for all targets
  files.push({
    path: 'README.md',
    content: generateInstallInstructions(manifest, targetProfile),
  });

  // Generate OpenCode accomplish-skills
  if (targetProfile.name === 'opencode') {
    const accomplishSkill = generateOpenCodeAccomplishSkill(manifest);
    if (accomplishSkill) {
      files.push({
        path: `accomplish-skills/${manifest.name}/SKILL.md`,
        content: accomplishSkill,
      });
    }
  }

  return files;
}

function generateOpenCodeAccomplishSkill(
  manifest: A5cPluginManifest
): string | null {
  if (!manifest.skills || manifest.skills.length === 0) return null;

  const primarySkill = manifest.skills[0];

  return `---
name: ${manifest.name}
description: ${manifest.description}
command: /${primarySkill.name}
verified: true
---

# ${manifest.name}

${manifest.description}

(This is a specialized accomplish-mode variant for OpenCode's accomplish workflow.)
`;
}
