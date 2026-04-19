// Unified installation instructions generator for all targets

import type { A5cPluginManifest, TargetProfile } from './types.js';

export function generateInstallInstructions(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const npmPkg = targetProfile.npmPackageName || `@a5c-ai/${manifest.name}-${targetProfile.name}`;
  const cliName = `${manifest.name}-${targetProfile.name}`;
  const sections: string[] = [];

  sections.push(`# ${manifest.name} — ${targetProfile.displayName} Plugin`);
  sections.push('');
  sections.push(manifest.description);
  sections.push('');

  // Prerequisites
  sections.push('## Prerequisites');
  sections.push('');
  sections.push('Install the Babysitter SDK CLI:');
  sections.push('');
  sections.push('```bash');
  sections.push('npm install -g @a5c-ai/babysitter-sdk');
  sections.push('```');
  sections.push('');

  // Installation
  sections.push('## Installation');
  sections.push('');

  switch (targetProfile.distribution) {
    case 'marketplace':
      sections.push(generateMarketplaceInstructions(manifest, targetProfile));
      break;
    case 'npm-cli':
      sections.push(generateNpmCliInstructions(manifest, targetProfile, npmPkg, cliName));
      break;
    case 'both':
      sections.push('### Option 1: Marketplace (Recommended)');
      sections.push('');
      sections.push(generateMarketplaceInstructions(manifest, targetProfile));
      sections.push('');
      sections.push('### Option 2: npm Install');
      sections.push('');
      sections.push(generateNpmCliInstructions(manifest, targetProfile, npmPkg, cliName));
      break;
  }

  sections.push('');

  // Workspace install
  if (targetProfile.npmPublishable) {
    sections.push('### Workspace Install');
    sections.push('');
    sections.push('```bash');
    sections.push(`npx -y ${npmPkg} install --workspace .`);
    sections.push('```');
    sections.push('');
  }

  // What's included
  sections.push('## What\'s Included');
  sections.push('');
  sections.push(generateIncludedSection(manifest, targetProfile));
  sections.push('');

  // Verification
  sections.push('## Verification');
  sections.push('');
  sections.push(generateVerificationSection(manifest, targetProfile, npmPkg));

  return sections.join('\n');
}

function generateMarketplaceInstructions(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const lines: string[] = [];

  switch (targetProfile.name) {
    case 'claude-code':
      lines.push('```bash');
      lines.push(`babysitter harness:install-plugin claude-code`);
      lines.push('```');
      break;
    case 'cursor':
      lines.push('```bash');
      lines.push(`babysitter harness:install-plugin cursor`);
      lines.push('```');
      break;
    case 'github-copilot':
      lines.push('```bash');
      lines.push(`babysitter harness:install-plugin github-copilot`);
      lines.push('```');
      break;
    default:
      lines.push(`Install via ${targetProfile.displayName}'s plugin marketplace.`);
      break;
  }

  return lines.join('\n');
}

function generateNpmCliInstructions(
  _manifest: A5cPluginManifest,
  targetProfile: TargetProfile,
  npmPkg: string,
  cliName: string
): string {
  const lines: string[] = [];

  lines.push('```bash');
  lines.push(`npm install -g ${npmPkg}`);
  lines.push(`${cliName} install --global`);
  lines.push('```');
  lines.push('');

  if (targetProfile.name === 'codex') {
    lines.push('Then open Codex and navigate to `/plugins` to activate the plugin.');
  } else {
    lines.push(`Restart ${targetProfile.displayName} to pick up the installed plugin.`);
  }

  return lines.join('\n');
}

function generateIncludedSection(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile
): string {
  const items: string[] = [];

  if (manifest.skills && manifest.skills.length > 0) {
    items.push(`- **Skills**: ${manifest.skills.map(s => s.name).join(', ')}`);
  }

  if (manifest.hooks && Object.keys(manifest.hooks).length > 0) {
    const hookNames = Object.keys(manifest.hooks).filter(h => manifest.hooks![h] !== null);
    items.push(`- **Hooks**: ${hookNames.join(', ')}`);
  }

  if (manifest.commands) {
    items.push('- **Commands**: Slash commands for plugin operations');
  }

  if (targetProfile.adapterFamily === 'programmatic') {
    items.push(`- **Extension**: Programmatic ${targetProfile.displayName} extension with shell-hook adapter bridge`);
  }

  if (targetProfile.distribution === 'npm-cli' || targetProfile.distribution === 'both') {
    items.push('- **CLI**: Install/uninstall scripts for global and workspace setup');
  }

  return items.join('\n');
}

function generateVerificationSection(
  manifest: A5cPluginManifest,
  targetProfile: TargetProfile,
  npmPkg: string
): string {
  const lines: string[] = [];

  lines.push('```bash');

  if (targetProfile.npmPublishable) {
    lines.push(`npm ls -g ${npmPkg} --depth=0`);
  }

  lines.push(`babysitter harness:discover --json | grep ${targetProfile.adapterName}`);
  lines.push('```');

  return lines.join('\n');
}
