// End-to-end tests: compile the sample plugin to all targets and verify output

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { compile, compileAll } from '../compiler.js';

const SAMPLE_PLUGIN_DIR = path.resolve(__dirname, '../../examples/sample-plugin');

describe('e2e: sample plugin compilation', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upf-e2e-'));
  });

  it('should compile to all 9 targets without errors', () => {
    const results = compileAll(SAMPLE_PLUGIN_DIR, tmpDir, {});

    expect(results).toHaveLength(9);
    for (const result of results) {
      expect(
        result.status,
        `${result.target} failed: ${result.diagnostics.filter(d => d.level === 'error').map(d => d.message).join(', ')}`
      ).not.toBe('error');
      expect(result.emittedFiles.length).toBeGreaterThan(0);
    }
  });

  it('should generate README.md for every target', () => {
    const results = compileAll(SAMPLE_PLUGIN_DIR, tmpDir, {});

    for (const result of results) {
      const readmePath = path.join(result.outputDir, 'README.md');
      expect(fs.existsSync(readmePath), `${result.target} missing README.md`).toBe(true);

      const readme = fs.readFileSync(readmePath, 'utf-8');
      expect(readme).toContain('sample-plugin');
      // The title/description should use the manifest name, not a hardcoded one
      expect(readme).toContain('# sample-plugin');
    }
  });

  it('should use manifest name in hook file naming, not hardcoded prefix', () => {
    const results = compileAll(SAMPLE_PLUGIN_DIR, tmpDir, {});

    for (const result of results) {
      // Filter to actual hook script files (not proxied-hooks.json metadata)
      const hookScripts = result.emittedFiles.filter(
        f => f.includes('-proxied-') && !f.endsWith('.json')
      );
      for (const hookFile of hookScripts) {
        expect(hookFile).toContain('sample-plugin-proxied');
      }
    }
  });

  describe('target-specific output', () => {
    it('claude-code: should emit plugin.json and hooks.json', () => {
      const result = compile({
        source: SAMPLE_PLUGIN_DIR,
        target: 'claude-code',
        output: path.join(tmpDir, 'cc-test'),
      });

      expect(result.status).not.toBe('error');
      expect(result.emittedFiles).toContain('plugin.json');
      expect(result.emittedFiles).toContain('hooks.json');

      const pluginJson = JSON.parse(
        fs.readFileSync(path.join(result.outputDir, 'plugin.json'), 'utf-8')
      );
      expect(pluginJson.name).toBe('sample-plugin');
    });

    it('codex: should emit package.json with bin scripts', () => {
      const result = compile({
        source: SAMPLE_PLUGIN_DIR,
        target: 'codex',
        output: path.join(tmpDir, 'codex-test'),
      });

      expect(result.status).not.toBe('error');
      expect(result.emittedFiles).toContain('package.json');
      expect(result.emittedFiles).toContain('bin/cli.js');
      expect(result.emittedFiles).toContain('bin/install.js');
      expect(result.emittedFiles).toContain('bin/uninstall.js');

      const pkgJson = JSON.parse(
        fs.readFileSync(path.join(result.outputDir, 'package.json'), 'utf-8')
      );
      expect(pkgJson.bin).toBeDefined();
    });

    it('pi: should emit extensions/index.ts with runProxiedHook', () => {
      const result = compile({
        source: SAMPLE_PLUGIN_DIR,
        target: 'pi',
        output: path.join(tmpDir, 'pi-test'),
      });

      expect(result.status).not.toBe('error');
      expect(result.emittedFiles).toContain('extensions/index.ts');
      expect(result.emittedFiles).toContain('hooks/proxied-hooks.json');

      const ext = fs.readFileSync(
        path.join(result.outputDir, 'extensions/index.ts'),
        'utf-8'
      );
      expect(ext).toContain('runProxiedHook');
      expect(ext).toContain('@mariozechner/pi-coding-agent');
      expect(ext).toContain('PI_PLUGIN_ROOT');
      expect(ext).toContain('"help"');
      expect(ext).toContain('"status"');
    });

    it('pi: should emit proxied hook JS scripts', () => {
      const result = compile({
        source: SAMPLE_PLUGIN_DIR,
        target: 'pi',
        output: path.join(tmpDir, 'pi-hooks-test'),
      });

      expect(result.status).not.toBe('error');

      const hookFiles = result.emittedFiles.filter(
        f => f.startsWith('hooks/sample-plugin-proxied-')
      );
      expect(hookFiles.length).toBeGreaterThanOrEqual(4);

      const sessionStart = fs.readFileSync(
        path.join(result.outputDir, 'hooks/sample-plugin-proxied-session-start.js'),
        'utf-8'
      );
      expect(sessionStart).toContain('hooks-proxy');
      expect(sessionStart).toContain('--adapter pi');
    });

    it('oh-my-pi: should use oh-my-pi adapter and OMP_PLUGIN_ROOT', () => {
      const result = compile({
        source: SAMPLE_PLUGIN_DIR,
        target: 'oh-my-pi',
        output: path.join(tmpDir, 'omp-test'),
      });

      expect(result.status).not.toBe('error');

      const ext = fs.readFileSync(
        path.join(result.outputDir, 'extensions/index.ts'),
        'utf-8'
      );
      expect(ext).toContain('@oh-my-pi/pi-coding-agent');
      expect(ext).toContain('OMP_PLUGIN_ROOT');

      const sessionHook = fs.readFileSync(
        path.join(result.outputDir, 'hooks/sample-plugin-proxied-session-start.js'),
        'utf-8'
      );
      expect(sessionHook).toContain('--adapter oh-my-pi');
    });

    it('gemini: should emit GEMINI.md context file', () => {
      const result = compile({
        source: SAMPLE_PLUGIN_DIR,
        target: 'gemini',
        output: path.join(tmpDir, 'gemini-test'),
      });

      expect(result.status).not.toBe('error');
      expect(result.emittedFiles).toContain('GEMINI.md');
    });

    it('marketplace targets should not emit bin/ scripts', () => {
      const result = compile({
        source: SAMPLE_PLUGIN_DIR,
        target: 'claude-code',
        output: path.join(tmpDir, 'cc-nobin-test'),
      });

      expect(result.status).not.toBe('error');
      const binFiles = result.emittedFiles.filter(f => f.startsWith('bin/'));
      expect(binFiles).toHaveLength(0);
    });

    it('opencode: should emit accomplish-skills', () => {
      const result = compile({
        source: SAMPLE_PLUGIN_DIR,
        target: 'opencode',
        output: path.join(tmpDir, 'opencode-test'),
      });

      expect(result.status).not.toBe('error');
      expect(result.emittedFiles).toContain('accomplish-skills/sample-plugin/SKILL.md');
    });
  });
});
