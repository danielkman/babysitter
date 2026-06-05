import type { ExtensionRegistry } from '@a5c-ai/genty-core/extensions';

export interface BridgedToolDefinition {
  name: string;
  description: string;
  execute: (params: Record<string, unknown>) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

export function bridgeExtensionTools(registry: ExtensionRegistry): BridgedToolDefinition[] {
  return registry.getAllTools().map((extTool) => ({
    name: extTool.name,
    description: extTool.description,
    execute: async (params: Record<string, unknown>) => {
      try {
        const result = await extTool.handler(params);
        return {
          content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Extension tool error: ${message}` }],
        };
      }
    },
  }));
}
