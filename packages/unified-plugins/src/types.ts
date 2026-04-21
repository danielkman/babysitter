// Type definitions for the Unified Plugin Format (UPF) and compilation pipeline

export interface A5cPluginManifest {
  // Identity (required)
  name: string;
  version: string;
  description: string;
  author: string | { name: string; email?: string };
  license: string;

  // Repository & Discovery (optional)
  repository?: {
    type: string;
    url: string;
  };
  homepage?: string;
  keywords?: string[];

  // Components — hook values:
  //   string path  = source script, copied to output and wired via registration
  //   "proxy"      = passthrough to hooks-proxy with noop handler (no custom logic)
  //   true         = stub (no-op echo '{}')
  //   null         = disabled for this target
  hooks?: Record<string, string | boolean | null>;
  commands?: string[] | string;
  skills?: Array<{
    name: string;
    file: string;
  }>;
  agents?: string | string[];

  // Context Files
  contextFiles?: Record<string, string>;

  // Target-Specific Overrides
  targets?: Record<string, TargetOverride>;

  // SDK infrastructure — defaults to babysitter SDK if not specified
  sdk?: {
    package?: string;      // e.g. @a5c-ai/babysitter-sdk
    cli?: string;          // e.g. babysitter
    proxyPackage?: string; // e.g. @a5c-ai/hooks-proxy-cli
    scope?: string;        // e.g. @a5c-ai
    envPrefix?: string;    // e.g. BABYSITTER (for env vars like BABYSITTER_STATE_DIR)
    stateDir?: string;     // e.g. .a5c (global state directory name)
  };

  // Global hook file naming pattern — applies to all targets unless overridden
  // Supports {{name}}, {{slug}} (canonical), {{native}} (target-native name)
  hookFilePattern?: string;

  // Extra files to include in output (glob patterns relative to source dir)
  include?: string[];

  // Lifecycle scripts (relative to source dir, copied to output and called by generated installer)
  postInstall?: string;

  // Hook Configuration
  hookConfig?: {
    proxyAdapter?: boolean;
    matchers?: Record<string, string>;
  };
}

export interface TargetOverride {
  npmPackageName?: string;
  type?: 'typescript-build';
  skills?: 'derive-from-commands' | Array<{ name: string; file: string }>;
  hooks?: Record<string, string | boolean | null>;
  commands?: string[] | string;
  extensionManifest?: {
    contextFileName?: string;
    settings?: unknown[];
  };
  extraFiles?: Record<string, string>;
  // Pattern for hook output filenames: {{name}}-proxied-{{slug}}-hook.sh
  // Supports {{name}}, {{slug}} (canonical), {{native}} (target-native hook name)
  hookFilePattern?: string;
  // Pattern for JS bridge filenames (programmatic targets): {{name}}-proxied-{{native}}.js
  hookJsPattern?: string;
  // Rich harness-specific manifest (e.g. codex interface metadata)
  harnessManifest?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Diagnostic {
  level: 'info' | 'warning' | 'error';
  category: 'validation' | 'compatibility' | 'compilation' | 'verification';
  message: string;
  component?: string;
  target?: string;
  source?: string;
  suggestion?: string;
}

export type HookSupport = 'native' | 'emulated' | 'unsupported';
export type CommandSupport = 'native' | 'toml' | 'derived' | 'unsupported';
export type SkillSupport = 'native' | 'derived' | 'unsupported';
export type AgentSupport = 'native' | 'unsupported';
export type ContextSupport = 'native' | 'unsupported';

export interface ComponentSupport {
  hooks: Record<string, HookSupport>;
  commands: CommandSupport;
  skills: SkillSupport;
  agents: AgentSupport;
  context: ContextSupport;
}

export interface CompilationResult {
  target: string;
  status: 'success' | 'warning' | 'error';
  outputDir: string;
  emittedFiles: string[];
  componentSupport: ComponentSupport;
  diagnostics: Diagnostic[];
  verificationChecklist: string[];
}

export interface ValidateResult {
  valid: boolean;
  manifest: A5cPluginManifest | null;
  diagnostics: Diagnostic[];
}

export interface ResolveResult {
  effectiveManifest: A5cPluginManifest;
  targetProfile: TargetProfile;
  componentSupport: ComponentSupport;
  diagnostics: Diagnostic[];
}

export interface TransformedFile {
  path: string;
  content: string;
  executable?: boolean;
}

export interface TransformResult {
  files: TransformedFile[];
  diagnostics: Diagnostic[];
}

export interface EmitResult {
  emittedFiles: string[];
  diagnostics: Diagnostic[];
}

export interface VerifyResult {
  diagnostics: Diagnostic[];
  verificationChecklist: string[];
}

export type HookRegistrationFormat =
  | 'claude-code'
  | 'codex'
  | 'cursor'
  | 'gemini'
  | 'github-copilot'
  | 'opencode'
  | 'openclaw';

export type AdapterFamily = 'shell-hook' | 'programmatic';
export type DistributionModel = 'marketplace' | 'npm-cli' | 'both';

export interface TargetProfile {
  name: string;
  displayName: string;
  adapterName: string;
  pluginRootEnvVar: string | null;
  supportedHooks: Map<string, string>; // canonical -> native
  commandFormat: 'markdown' | 'toml' | 'none';
  skillHandling: 'native' | 'derived-from-commands' | 'none';
  manifestFormat: 'plugin.json' | 'package.json' | 'multiple';
  hookRegistrationFormat: HookRegistrationFormat | null;
  scriptVariants: Array<'bash' | 'powershell' | 'javascript' | 'typescript'>;
  npmPublishable: boolean;
  npmPackageName?: string;
  extraCapabilities?: string[];
  adapterFamily: AdapterFamily;
  distribution: DistributionModel;
  pluginRootEnvVarForExtension?: string;
  marketplacePath?: string;
}

export interface FrontmatterData {
  [key: string]: unknown;
}

export interface ParsedFrontmatter {
  data: FrontmatterData;
  body: string;
}
