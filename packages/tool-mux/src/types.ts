export type ToolSource = 'builtin' | 'mcp' | 'plugin' | 'custom';

export interface ToolDescriptor {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>; // JSON Schema
  source: ToolSource;
  server?: string;
  permissions?: string[];
  metadata?: Record<string, unknown>;
}

export interface ToolServer {
  id: string;
  name: string;
  type: 'mcp' | 'native' | 'remote';
  tools: ToolDescriptor[];
}

export interface ToolDispatchRule {
  match: string; // glob pattern on tool name
  server: string;
  priority?: number;
  conditions?: Record<string, unknown>;
}

export interface ToolDispatchPolicy {
  rules: ToolDispatchRule[];
  defaultServer?: string;
}

export interface ToolCallContext {
  toolName: string;
  input: unknown;
  caller?: string;
  runId?: string;
  sessionId?: string;
}

export interface ToolCallResult {
  output: unknown;
  durationMs: number;
  error?: string;
}
