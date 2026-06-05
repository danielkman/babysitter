import { describe, it, expect } from 'vitest';
import { ExtensionRegistry } from '@a5c-ai/genty-core/extensions';
import { bridgeExtensionTools } from './extensionToolBridge.js';

describe('extensionToolBridge', () => {
  it('bridges extension tools to BridgedToolDefinition format', async () => {
    const registry = new ExtensionRegistry();
    await registry.activate({
      name: 'test-ext',
      activate(ctx) {
        ctx.registerTool({
          name: 'greet',
          description: 'Greets a user',
          inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
          handler: async (input: Record<string, unknown>) => `Hello ${input.name}!`,
        });
      },
    });

    const tools = bridgeExtensionTools(registry);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('ext:test-ext:greet');
    expect(tools[0].description).toBe('Greets a user');

    const result = await tools[0].execute({ name: 'World' });
    expect(result.content[0].text).toBe('Hello World!');
  });

  it('wraps handler errors gracefully', async () => {
    const registry = new ExtensionRegistry();
    await registry.activate({
      name: 'err-ext',
      activate(ctx) {
        ctx.registerTool({
          name: 'fail',
          description: 'Always fails',
          inputSchema: {},
          handler: async () => { throw new Error('boom'); },
        });
      },
    });

    const tools = bridgeExtensionTools(registry);
    const result = await tools[0].execute({});
    expect(result.content[0].text).toContain('Extension tool error: boom');
  });

  it('returns empty array for registry with no tools', () => {
    const registry = new ExtensionRegistry();
    expect(bridgeExtensionTools(registry)).toEqual([]);
  });
});
