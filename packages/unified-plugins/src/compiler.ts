// Compiler pipeline orchestrator

import type { CompilationResult } from './types.js';
import { validate } from './validate.js';
import { resolve } from './resolve.js';
import { transform } from './transform.js';
import { emit } from './emit.js';
import { verify } from './verify.js';
import { getAllTargets } from './targets/index.js';

export interface CompileOptions {
  source: string;
  target: string;
  output: string;
  dryRun?: boolean;
  verifyOutput?: boolean;
}

export function compile(options: CompileOptions): CompilationResult {
  const { source, target, output, dryRun = false, verifyOutput = false } = options;

  // Stage 1: VALIDATE
  const validateResult = validate(source);
  if (!validateResult.valid || !validateResult.manifest) {
    return {
      target,
      status: 'error',
      outputDir: output,
      emittedFiles: [],
      componentSupport: {
        hooks: {},
        commands: 'unsupported',
        skills: 'unsupported',
        agents: 'unsupported',
        context: 'unsupported',
      },
      diagnostics: validateResult.diagnostics,
      verificationChecklist: [],
    };
  }

  const diagnostics = [...validateResult.diagnostics];

  // Stage 2: RESOLVE
  const resolveResult = resolve(validateResult.manifest, target);
  diagnostics.push(...resolveResult.diagnostics);

  if (resolveResult.diagnostics.some((d) => d.level === 'error')) {
    return {
      target,
      status: 'error',
      outputDir: output,
      emittedFiles: [],
      componentSupport: resolveResult.componentSupport,
      diagnostics,
      verificationChecklist: [],
    };
  }

  // Stage 3: TRANSFORM
  const transformResult = transform(
    source,
    resolveResult.effectiveManifest,
    resolveResult.targetProfile
  );
  diagnostics.push(...transformResult.diagnostics);

  if (transformResult.diagnostics.some((d) => d.level === 'error')) {
    return {
      target,
      status: 'error',
      outputDir: output,
      emittedFiles: [],
      componentSupport: resolveResult.componentSupport,
      diagnostics,
      verificationChecklist: [],
    };
  }

  // Stage 4: EMIT
  const emitResult = emit(output, transformResult.files, dryRun);
  diagnostics.push(...emitResult.diagnostics);

  if (emitResult.diagnostics.some((d) => d.level === 'error')) {
    return {
      target,
      status: 'error',
      outputDir: output,
      emittedFiles: emitResult.emittedFiles,
      componentSupport: resolveResult.componentSupport,
      diagnostics,
      verificationChecklist: [],
    };
  }

  // Stage 5: VERIFY (optional)
  let verificationChecklist: string[] = [];
  if (verifyOutput && !dryRun) {
    const verifyResult = verify(output, emitResult.emittedFiles);
    diagnostics.push(...verifyResult.diagnostics);
    verificationChecklist = verifyResult.verificationChecklist;
  }

  const hasErrors = diagnostics.some((d) => d.level === 'error');
  const hasWarnings = diagnostics.some((d) => d.level === 'warning');

  return {
    target,
    status: hasErrors ? 'error' : hasWarnings ? 'warning' : 'success',
    outputDir: output,
    emittedFiles: emitResult.emittedFiles,
    componentSupport: resolveResult.componentSupport,
    diagnostics,
    verificationChecklist,
  };
}

export function compileAll(
  source: string,
  outputBaseDir: string,
  options: { dryRun?: boolean; verifyOutput?: boolean } = {}
): CompilationResult[] {
  const targets = getAllTargets();
  const results: CompilationResult[] = [];

  for (const target of targets) {
    const result = compile({
      source,
      target,
      output: `${outputBaseDir}/${target}`,
      ...options,
    });
    results.push(result);
  }

  return results;
}
