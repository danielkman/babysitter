// Stage 1: VALIDATE - Validate UPF source directory

import * as fs from 'fs';
import * as path from 'path';
import type { A5cPluginManifest, ValidateResult, Diagnostic } from './types.js';
import { validate as validateSchema } from './schema.js';

export function validate(sourceDir: string): ValidateResult {
  const diagnostics: Diagnostic[] = [];

  // Check if sourceDir exists
  if (!fs.existsSync(sourceDir)) {
    diagnostics.push({
      level: 'error',
      category: 'validation',
      message: `Source directory does not exist: ${sourceDir}`,
    });
    return { valid: false, manifest: null, diagnostics };
  }

  // Load plugin.json
  const manifestPath = path.join(sourceDir, 'plugin.json');
  if (!fs.existsSync(manifestPath)) {
    diagnostics.push({
      level: 'error',
      category: 'validation',
      message: 'Missing required file: plugin.json',
      source: manifestPath,
    });
    return { valid: false, manifest: null, diagnostics };
  }

  let manifest: A5cPluginManifest;
  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    manifest = JSON.parse(content) as A5cPluginManifest;
  } catch (error) {
    diagnostics.push({
      level: 'error',
      category: 'validation',
      message: `Failed to parse plugin.json: ${(error as Error).message}`,
      source: manifestPath,
    });
    return { valid: false, manifest: null, diagnostics };
  }

  // Validate against schema
  const schemaResult = validateSchema(manifest);
  diagnostics.push(...schemaResult.diagnostics);

  if (!schemaResult.valid) {
    return { valid: false, manifest, diagnostics };
  }

  // Verify referenced files exist
  if (manifest.hooks) {
    for (const [hookName, handlerValue] of Object.entries(manifest.hooks)) {
      if (handlerValue === null || handlerValue === true) continue;
      if (typeof handlerValue !== 'string') continue;

      const fullPath = path.join(sourceDir, handlerValue);
      if (!fs.existsSync(fullPath)) {
        diagnostics.push({
          level: 'error',
          category: 'validation',
          message: `Hook handler file not found: ${handlerValue}`,
          component: `hooks.${hookName}`,
          source: fullPath,
        });
      }
    }
  }

  // Verify command files
  if (manifest.commands) {
    const commandPaths = typeof manifest.commands === 'string'
      ? [manifest.commands]
      : manifest.commands;

    for (const cmdPath of commandPaths) {
      const fullPath = path.join(sourceDir, cmdPath);
      if (!fs.existsSync(fullPath)) {
        diagnostics.push({
          level: 'error',
          category: 'validation',
          message: `Command file or directory not found: ${cmdPath}`,
          source: fullPath,
        });
      }
    }
  }

  // Verify skill files
  if (manifest.skills) {
    for (const skill of manifest.skills) {
      const fullPath = path.join(sourceDir, skill.file);
      if (!fs.existsSync(fullPath)) {
        diagnostics.push({
          level: 'error',
          category: 'validation',
          message: `Skill file not found: ${skill.file}`,
          component: `skills.${skill.name}`,
          source: fullPath,
        });
      }
    }
  }

  // Verify context files
  if (manifest.contextFiles) {
    for (const [target, contextPath] of Object.entries(manifest.contextFiles)) {
      const fullPath = path.join(sourceDir, contextPath);
      if (!fs.existsSync(fullPath)) {
        diagnostics.push({
          level: 'warning',
          category: 'validation',
          message: `Context file not found: ${contextPath} (for target ${target})`,
          source: fullPath,
        });
      }
    }
  }

  // Verify versions.json exists
  const versionsPath = path.join(sourceDir, 'versions.json');
  if (!fs.existsSync(versionsPath)) {
    diagnostics.push({
      level: 'error',
      category: 'validation',
      message: 'Missing required file: versions.json',
      source: versionsPath,
    });
  } else {
    try {
      const versionsContent = fs.readFileSync(versionsPath, 'utf-8');
      const versions = JSON.parse(versionsContent) as { sdkVersion?: string };
      if (!versions.sdkVersion) {
        diagnostics.push({
          level: 'error',
          category: 'validation',
          message: 'versions.json is missing required field: sdkVersion',
          source: versionsPath,
        });
      }
    } catch (error) {
      diagnostics.push({
        level: 'error',
        category: 'validation',
        message: `Failed to parse versions.json: ${(error as Error).message}`,
        source: versionsPath,
      });
    }
  }

  // Check for duplicate skill names
  if (manifest.skills) {
    const skillNames = new Set<string>();
    for (const skill of manifest.skills) {
      if (skillNames.has(skill.name)) {
        diagnostics.push({
          level: 'error',
          category: 'validation',
          message: `Duplicate skill name: ${skill.name}`,
          component: `skills.${skill.name}`,
        });
      }
      skillNames.add(skill.name);
    }
  }

  const hasErrors = diagnostics.some((d) => d.level === 'error');
  return {
    valid: !hasErrors,
    manifest,
    diagnostics,
  };
}
