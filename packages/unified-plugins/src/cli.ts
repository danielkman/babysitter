#!/usr/bin/env node
// CLI for unified-plugins compiler

import * as process from 'process';
import { compile, compileAll } from './compiler.js';
import { validate } from './validate.js';
import { getAllTargets } from './targets/index.js';
import type { Diagnostic } from './types.js';

const args = process.argv.slice(2);

function showUsage() {
  console.log(`
unified-plugins - Cross-harness plugin compiler for AI coding agents

Usage:
  unified-plugins compile --target <name|all> --output <dir> [options]
  unified-plugins validate [options]
  unified-plugins diff --target <name> --existing <dir> [options]
  unified-plugins init --name <name> [options]
  unified-plugins list-targets [options]

Commands:
  compile        Compile UPF source to target format(s)
  validate       Validate UPF source without compiling
  diff           Compare compiled output against existing directory
  init           Scaffold a new UPF plugin
  list-targets   List available compilation targets

Options:
  --source <dir>     UPF source directory (default: current directory)
  --target <name>    Target harness name or "all"
  --output <dir>     Output directory
  --existing <dir>   Path to existing plugin directory (for diff)
  --name <name>      Plugin name (for init)
  --verify           Run verification checks after compilation
  --dry-run          Show what would be emitted without writing files
  --json             Output structured JSON result
  --verbose          Verbose logging
  --help, -h         Show this help message

Valid targets:
  claude-code, codex, cursor, gemini, github-copilot,
  pi, oh-my-pi, opencode, openclaw
`);
}

function parseArgs(): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);

      if (
        key === 'verify' ||
        key === 'dry-run' ||
        key === 'json' ||
        key === 'verbose' ||
        key === 'help'
      ) {
        parsed[key] = true;
      } else {
        const value = args[i + 1];
        if (value && !value.startsWith('--')) {
          parsed[key] = value;
          i++;
        }
      }
    } else if (arg === '-h') {
      parsed.help = true;
    } else if (!parsed.command) {
      parsed.command = arg;
    }
  }

  return parsed;
}

function printDiagnostics(diagnostics: Diagnostic[], verbose = false) {
  const errors = diagnostics.filter((d) => d.level === 'error');
  const warnings = diagnostics.filter((d) => d.level === 'warning');
  const infos = diagnostics.filter((d) => d.level === 'info');

  for (const diag of errors) {
    console.error(`\x1b[31m[ERROR]\x1b[0m ${diag.message}`);
    if (diag.source) console.error(`  Source: ${diag.source}`);
    if (diag.suggestion) console.error(`  Suggestion: ${diag.suggestion}`);
  }

  for (const diag of warnings) {
    console.warn(`\x1b[33m[WARNING]\x1b[0m ${diag.message}`);
    if (diag.source && verbose) console.warn(`  Source: ${diag.source}`);
  }

  if (verbose) {
    for (const diag of infos) {
      console.log(`\x1b[36m[INFO]\x1b[0m ${diag.message}`);
    }
  }

  if (errors.length > 0 || warnings.length > 0 || infos.length > 0) {
    console.log(
      `\nSummary: ${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} info`
    );
  }
}

function runCompile(parsed: Record<string, string | boolean>) {
  const source = (parsed.source as string) || process.cwd();
  const target = parsed.target as string;
  const output = parsed.output as string;
  const dryRun = parsed['dry-run'] as boolean;
  const verifyOutput = parsed.verify as boolean;
  const jsonOutput = parsed.json as boolean;
  const verbose = parsed.verbose as boolean;

  if (!target || !output) {
    console.error('Error: --target and --output are required');
    process.exit(1);
  }

  if (target === 'all') {
    const results = compileAll(source, output, { dryRun, verifyOutput });

    if (jsonOutput) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      for (const result of results) {
        console.log(`\n=== Target: ${result.target} ===`);
        console.log(`Status: ${result.status}`);
        console.log(`Output: ${result.outputDir}`);
        console.log(`Emitted files: ${result.emittedFiles.length}`);
        printDiagnostics(result.diagnostics, verbose);
      }

      const failed = results.filter((r) => r.status === 'error').length;
      const warnings = results.filter((r) => r.status === 'warning').length;
      const success = results.filter((r) => r.status === 'success').length;

      console.log(
        `\n=== Overall ===\n${success} succeeded, ${warnings} with warnings, ${failed} failed`
      );
    }

    const hasErrors = results.some((r) => r.status === 'error');
    process.exit(hasErrors ? 1 : 0);
  } else {
    const result = compile({
      source,
      target,
      output,
      dryRun,
      verifyOutput,
    });

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Target: ${result.target}`);
      console.log(`Status: ${result.status}`);
      console.log(`Output: ${result.outputDir}`);
      console.log(`Emitted files: ${result.emittedFiles.length}`);

      if (result.verificationChecklist.length > 0 && verbose) {
        console.log('\nVerification:');
        for (const check of result.verificationChecklist) {
          console.log(`  ${check}`);
        }
      }

      printDiagnostics(result.diagnostics, verbose);
    }

    process.exit(result.status === 'error' ? 1 : 0);
  }
}

function runValidate(parsed: Record<string, string | boolean>) {
  const source = (parsed.source as string) || process.cwd();
  const jsonOutput = parsed.json as boolean;
  const verbose = parsed.verbose as boolean;

  const result = validate(source);

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Valid: ${result.valid}`);
    printDiagnostics(result.diagnostics, verbose);
  }

  process.exit(result.valid ? 0 : 1);
}

function runListTargets(parsed: Record<string, string | boolean>) {
  const jsonOutput = parsed.json as boolean;
  const targets = getAllTargets();

  if (jsonOutput) {
    console.log(JSON.stringify(targets, null, 2));
  } else {
    console.log('Available targets:');
    for (const target of targets) {
      console.log(`  - ${target}`);
    }
  }

  process.exit(0);
}

function runDiff(_parsed: Record<string, string | boolean>) {
  console.error('Error: diff command not yet implemented');
  process.exit(1);
}

function runInit(_parsed: Record<string, string | boolean>) {
  console.error('Error: init command not yet implemented');
  process.exit(1);
}

function main() {
  const parsed = parseArgs();

  if (parsed.help || !parsed.command) {
    showUsage();
    process.exit(0);
  }

  const command = parsed.command as string;

  try {
    switch (command) {
      case 'compile':
        runCompile(parsed);
        break;
      case 'validate':
        runValidate(parsed);
        break;
      case 'list-targets':
        runListTargets(parsed);
        break;
      case 'diff':
        runDiff(parsed);
        break;
      case 'init':
        runInit(parsed);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        showUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error(`Fatal error: ${(error as Error).message}`);
    if (parsed.verbose) {
      console.error((error as Error).stack);
    }
    process.exit(1);
  }
}

main();
