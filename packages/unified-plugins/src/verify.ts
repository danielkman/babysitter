// Stage 5: VERIFY - Verify emitted output

import * as fs from 'fs';
import * as path from 'path';
import type { VerifyResult, Diagnostic } from './types.js';

export function verify(
  outputDir: string,
  emittedFiles: string[]
): VerifyResult {
  const diagnostics: Diagnostic[] = [];
  const verificationChecklist: string[] = [];

  // Check that all emitted files exist
  for (const filePath of emittedFiles) {
    const fullPath = path.join(outputDir, filePath);
    if (!fs.existsSync(fullPath)) {
      diagnostics.push({
        level: 'error',
        category: 'verification',
        message: `Emitted file does not exist: ${filePath}`,
        source: fullPath,
      });
    } else {
      verificationChecklist.push(`✓ File exists: ${filePath}`);
    }
  }

  // Verify JSON files are valid JSON
  for (const filePath of emittedFiles) {
    if (filePath.endsWith('.json')) {
      const fullPath = path.join(outputDir, filePath);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          JSON.parse(content);
          verificationChecklist.push(`✓ Valid JSON: ${filePath}`);
        } catch (error) {
          diagnostics.push({
            level: 'error',
            category: 'verification',
            message: `Invalid JSON in ${filePath}: ${(error as Error).message}`,
            source: fullPath,
          });
        }
      }
    }
  }

  // Verify hook scripts have shebangs
  for (const filePath of emittedFiles) {
    if (filePath.endsWith('.sh') || filePath.endsWith('.js')) {
      const fullPath = path.join(outputDir, filePath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (!content.startsWith('#!')) {
          diagnostics.push({
            level: 'warning',
            category: 'verification',
            message: `Hook script missing shebang: ${filePath}`,
            source: fullPath,
            suggestion: 'Add shebang line (#!/bin/bash or #!/usr/bin/env node)',
          });
        } else {
          verificationChecklist.push(`✓ Shebang present: ${filePath}`);
        }
      }
    }
  }

  // Verify SKILL.md files have valid frontmatter
  for (const filePath of emittedFiles) {
    if (filePath.endsWith('SKILL.md')) {
      const fullPath = path.join(outputDir, filePath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (!content.startsWith('---')) {
          diagnostics.push({
            level: 'warning',
            category: 'verification',
            message: `SKILL.md missing frontmatter: ${filePath}`,
            source: fullPath,
          });
        } else {
          verificationChecklist.push(`✓ Frontmatter present: ${filePath}`);
        }
      }
    }
  }

  return { diagnostics, verificationChecklist };
}
