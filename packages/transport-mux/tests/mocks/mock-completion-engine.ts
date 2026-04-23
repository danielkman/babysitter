import type { CompletionEngine, CompletionRequest, CompletionResult } from '../../src/types.js';

export interface MockCompletionEngine extends CompletionEngine {
  requests: CompletionRequest[];
}

export function createMockCompletionEngine(
  resultOverrides: Partial<CompletionResult> = {},
): MockCompletionEngine {
  const requests: CompletionRequest[] = [];

  return {
    requests,
    async complete(request) {
      requests.push(request);
      return {
        id: 'mock-completion',
        model: request.model,
        role: 'assistant',
        text: 'Hello',
        finishReason: 'stop',
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
        ...resultOverrides,
      };
    },
  };
}
