/**
 * Minimal completion engine for amux launch proxy mode.
 *
 * When the exposed transport differs from the target provider's API format
 * (e.g., exposing Anthropic for claude but targeting Azure/foundry), the
 * proxy needs a completion engine to translate between formats.
 */

import type { CompletionEngine, CompletionRequest, CompletionResult, CompletionStreamEvent } from '@a5c-ai/transport-mux';

interface GoogleCompletionEngineOptions {
  apiBase?: string;
  apiKey: string;
  targetModel: string;
  provider?: string;
  project?: string;
  location?: string;
  useVertexAi?: boolean;
}

function buildUrl(apiBase: string, model: string): string {
  return `${apiBase}/openai/deployments/${model}/chat/completions?api-version=2025-04-01-preview`;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'api-key': apiKey,
  };
}

function buildBody(messages: Array<{ role: string; content: string }>, model: string, stream: boolean, tools?: unknown[], toolChoice?: unknown): string {
  const body: Record<string, unknown> = { messages, model, stream };
  if (tools && tools.length > 0) body.tools = tools;
  if (toolChoice !== undefined) body.tool_choice = toolChoice;
  return JSON.stringify(body);
}

function buildGoogleContents(messages: Array<{ role: string; content: string }>): Array<{ role: string; parts: Array<{ text: string }> }> {
  return messages.map((message) => ({
    role: message.role === 'assistant' || message.role === 'model' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
}

function buildGoogleBody(messages: Array<{ role: string; content: string }>, tools?: unknown[]): string {
  const body: Record<string, unknown> = { contents: buildGoogleContents(messages) };
  if (tools && tools.length > 0) {
    body.tools = [{ functionDeclarations: tools.map((t: any) => ({ name: t.function?.name ?? t.name, description: t.function?.description ?? t.description, parameters: t.function?.parameters ?? t.parameters })) }];
  }
  return JSON.stringify(body);
}

function buildGoogleUrl(options: GoogleCompletionEngineOptions, streaming: boolean): string {
  const useVertexAi = options.useVertexAi === true || options.provider === 'vertex';
  const method = streaming ? 'streamGenerateContent' : 'generateContent';

  if (useVertexAi) {
    const project = options.project ?? process.env['GOOGLE_CLOUD_PROJECT'];
    if (!project) {
      throw new Error('GOOGLE_CLOUD_PROJECT is required for Vertex AI Gemini proxy calls.');
    }
    const location = options.location ?? process.env['GOOGLE_CLOUD_LOCATION'] ?? 'global';
    const apiBase = options.apiBase ?? 'https://aiplatform.googleapis.com';
    const url = new URL(`/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(options.targetModel)}:${method}`, apiBase);
    url.searchParams.set('key', options.apiKey);
    if (streaming) url.searchParams.set('alt', 'sse');
    return String(url);
  }

  const apiBase = options.apiBase ?? 'https://generativelanguage.googleapis.com';
  const url = new URL(`/v1beta/models/${encodeURIComponent(options.targetModel)}:${method}`, apiBase);
  url.searchParams.set('key', options.apiKey);
  if (streaming) url.searchParams.set('alt', 'sse');
  return String(url);
}

function googleHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

function extractGoogleText(data: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }> }): string {
  return data.candidates
    ?.flatMap((candidate) => candidate.content?.parts?.map((part) => part.text ?? '') ?? [])
    .filter(Boolean)
    .join('') ?? '';
}

function googleUsage(data: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } }) {
  return {
    promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
    completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
  };
}

function parseGoogleStreamPayload(payload: string): { text?: string; finishReason?: string; usage?: CompletionResult['usage'] } | null {
  if (!payload || payload === '[DONE]') return null;
  try {
    const data = JSON.parse(payload) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    };
    return {
      text: extractGoogleText(data),
      finishReason: data.candidates?.find((candidate) => candidate.finishReason)?.finishReason?.toLowerCase(),
      usage: data.usageMetadata ? googleUsage(data) : undefined,
    };
  } catch {
    return null;
  }
}

async function* parseGoogleStream(response: Response): AsyncIterable<CompletionStreamEvent> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let usage: CompletionResult['usage'] | undefined;
  let finishReason: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const payload = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
      const parsed = parseGoogleStreamPayload(payload);
      if (!parsed) continue;
      if (parsed.text) yield { type: 'text-delta', text: parsed.text };
      if (parsed.usage) usage = parsed.usage;
      if (parsed.finishReason) finishReason = parsed.finishReason;
    }
  }

  yield { type: 'done', finishReason, usage };
}

export function createOpenAICompletionEngine(options: {
  apiBase: string;
  apiKey: string;
  targetModel: string;
}): CompletionEngine {
  return {
    async complete(request: CompletionRequest): Promise<CompletionResult> {
      const messages = request.messages.map((m) => ({ role: m.role, content: m.content }));
      const response = await fetch(
        buildUrl(options.apiBase, options.targetModel),
        {
          method: 'POST',
          headers: buildHeaders(options.apiKey),
          body: buildBody(messages, options.targetModel, false, request.tools, request.toolChoice),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
      }

      const data = await response.json() as {
        id: string;
        choices: Array<{ message: { content: string }; finish_reason: string }>;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      const choice = data.choices[0];
      return {
        id: data.id,
        model: options.targetModel,
        role: 'assistant',
        text: choice?.message?.content ?? '',
        finishReason: choice?.finish_reason ?? 'stop',
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
      };
    },

    async *stream(request: CompletionRequest): AsyncIterable<CompletionStreamEvent> {
      const messages = request.messages.map((m) => ({ role: m.role, content: m.content }));
      const response = await fetch(
        buildUrl(options.apiBase, options.targetModel),
        {
          method: 'POST',
          headers: buildHeaders(options.apiKey),
          body: buildBody(messages, options.targetModel, true, request.tools, request.toolChoice),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') {
            yield { type: 'done' };
            return;
          }

          try {
            const chunk = JSON.parse(payload) as {
              choices: Array<{ delta: { content?: string }; finish_reason?: string | null }>;
              usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
            };
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              yield { type: 'text-delta', text: delta };
            }
            if (chunk.choices[0]?.finish_reason) {
              yield {
                type: 'done',
                finishReason: chunk.choices[0].finish_reason,
                usage: chunk.usage ? {
                  promptTokens: chunk.usage.prompt_tokens,
                  completionTokens: chunk.usage.completion_tokens,
                  totalTokens: chunk.usage.total_tokens,
                } : undefined,
              };
              return;
            }
          } catch {
            // skip malformed chunks
          }
        }
      }

      yield { type: 'done' };
    },
  };
}

export function createGoogleCompletionEngine(options: GoogleCompletionEngineOptions): CompletionEngine {
  return {
    async complete(request: CompletionRequest): Promise<CompletionResult> {
      const messages = request.messages.map((m) => ({ role: m.role, content: m.content }));
      const response = await fetch(buildGoogleUrl(options, false), {
        method: 'POST',
        headers: googleHeaders(),
        body: buildGoogleBody(messages, request.tools),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google API error ${response.status}: ${errorText}`);
      }

      const data = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
      };

      return {
        id: `google_${Date.now()}`,
        model: options.targetModel,
        role: 'assistant',
        text: extractGoogleText(data),
        finishReason: data.candidates?.find((candidate) => candidate.finishReason)?.finishReason?.toLowerCase() ?? 'stop',
        usage: googleUsage(data),
      };
    },

    async *stream(request: CompletionRequest): AsyncIterable<CompletionStreamEvent> {
      const messages = request.messages.map((m) => ({ role: m.role, content: m.content }));
      const response = await fetch(buildGoogleUrl(options, true), {
        method: 'POST',
        headers: googleHeaders(),
        body: buildGoogleBody(messages, request.tools),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google API error ${response.status}: ${errorText}`);
      }

      yield* parseGoogleStream(response);
    },
  };
}
