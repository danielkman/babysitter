import * as childProcess from "node:child_process";
import { buildShellInvocation } from "@a5c-ai/genty-runtime";
import type {
  AgentCoreHistoryEntry,
  AgentCoreJsonSchema,
  AgentCoreOutputFormat,
  AgentCorePromptInput,
  AgentCorePromptOptions,
  AgentCorePromptPart,
  AgentCorePromptResult,
  AgentCoreSessionEvent,
  AgentCoreSessionOptions,
  AgentCoreStructuredOutputOptions,
  CustomToolDefinition,
  ToolExecutionContext,
  ToolResult,
} from "./types";
import { estimateTokens } from "./context/token-estimator";
import type { TokenEstimatorContext } from "./context/types";

// 15 minutes — accommodates long-running model responses (e.g., gpt-5.5 thinking)
// and Azure Foundry cold-start latency. Override per-call via session.prompt(text, timeout).
const DEFAULT_TIMEOUT_MS = 900_000;
const DEFAULT_MAX_HISTORY_TURNS = 20;
const DEFAULT_OUTPUT_SCHEMA_NAME = "agent_core_response";
const MAX_BASE64_IMAGE_BYTES = 20 * 1024 * 1024;
// Safeguard against runaway tool-calling loops (e.g. a tool that always
// triggers another tool call). Each model turn counts as one iteration.
const MAX_TOOL_LOOP_ITERATIONS = 50;

export type AgentCoreEventListener = (event: AgentCoreSessionEvent) => void;

type ProviderMessageContent = string | NormalizedContentPart[];

interface ProviderMessage {
  role: string;
  content: ProviderMessageContent;
}

/** A model-emitted tool call, normalized across providers. */
interface NormalizedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** Raw argument JSON string as streamed (used to faithfully echo back the assistant turn). */
  rawArguments: string;
}

/**
 * Provider-shaped message used inside the tool-calling loop. Unlike
 * `ProviderMessage`, `content` is whatever each provider's chat API expects
 * (already shaped for OpenAI or Anthropic) so multi-turn tool exchanges can be
 * appended verbatim.
 */
interface RawProviderMessage {
  role: string;
  content: unknown;
  /** OpenAI assistant tool-call array (only on assistant tool-call turns). */
  tool_calls?: unknown;
  /** OpenAI tool-result message linkage. */
  tool_call_id?: string;
}

type NormalizedContentPart =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "url"; url: string; mediaType?: string } }
  | { type: "image"; source: { type: "base64"; data: string; mediaType: string } };

interface NormalizedStructuredOutput {
  outputFormat: AgentCoreOutputFormat;
  schema?: AgentCoreJsonSchema;
  name?: string;
  strict?: boolean;
}

interface NormalizedCompletionRequest {
  messages: ProviderMessage[];
  structuredOutput?: NormalizedStructuredOutput;
  customTools?: CustomToolDefinition[];
}

type CompletionUsage = NonNullable<AgentCorePromptResult["usage"]>;

type CompletionStreamResult = { text: string; usage?: CompletionUsage; toolCalls?: NormalizedToolCall[] };

function buildSystemPrompt(options: AgentCoreSessionOptions): string | undefined {
  const segments: string[] = [];
  if (options.systemPrompt?.trim()) {
    segments.push(options.systemPrompt.trim());
  }
  if (options.appendSystemPrompt?.length) {
    for (const prompt of options.appendSystemPrompt) {
      if (prompt.trim()) {
        segments.push(prompt.trim());
      }
    }
  }
  if (segments.length === 0) {
    return undefined;
  }
  return segments.join("\n\n");
}

function normalizePromptOptions(
  sessionOptions: AgentCoreSessionOptions,
  timeoutOrOptions?: number | AgentCorePromptOptions,
): Required<Pick<AgentCorePromptOptions, "timeout">> & AgentCoreStructuredOutputOptions {
  const promptOptions = typeof timeoutOrOptions === "number" ? { timeout: timeoutOrOptions } : timeoutOrOptions ?? {};
  return {
    timeout: promptOptions.timeout ?? sessionOptions.timeout ?? DEFAULT_TIMEOUT_MS,
    outputFormat: promptOptions.outputFormat ?? sessionOptions.outputFormat ?? "text",
    outputSchema: promptOptions.outputSchema ?? sessionOptions.outputSchema,
    outputSchemaName: promptOptions.outputSchemaName ?? sessionOptions.outputSchemaName,
    outputSchemaStrict: promptOptions.outputSchemaStrict ?? sessionOptions.outputSchemaStrict,
  };
}

function normalizeStructuredOutput(options: AgentCoreStructuredOutputOptions): NormalizedStructuredOutput | undefined {
  const outputFormat = options.outputFormat ?? "text";
  if (outputFormat === "text") {
    if (options.outputSchema) {
      throw new Error("outputSchema requires outputFormat='json_schema'");
    }
    return undefined;
  }

  if (outputFormat === "json_object") {
    if (options.outputSchema) {
      throw new Error("outputSchema is only valid with outputFormat='json_schema'");
    }
    return { outputFormat };
  }

  if (outputFormat !== "json_schema") {
    throw new Error(`Unsupported outputFormat '${String(outputFormat)}'`);
  }

  if (!isPlainObject(options.outputSchema)) {
    throw new Error("outputFormat='json_schema' requires outputSchema to be a JSON Schema object");
  }

  const name = options.outputSchemaName?.trim() || DEFAULT_OUTPUT_SCHEMA_NAME;
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
    throw new Error("outputSchemaName must be 1-64 characters and contain only letters, numbers, '_' or '-'");
  }

  return {
    outputFormat,
    schema: options.outputSchema,
    name,
    strict: options.outputSchemaStrict ?? true,
  };
}

function normalizePromptInput(input: AgentCorePromptInput): ProviderMessageContent {
  if (typeof input === "string") {
    return input;
  }

  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("prompt input parts must be a non-empty array");
  }

  const content: NormalizedContentPart[] = [];
  for (const part of input) {
    content.push(normalizePromptPart(part));
  }
  return content;
}

function normalizePromptPart(part: AgentCorePromptPart): NormalizedContentPart {
  if (part.type === "text") {
    if (!part.text) {
      throw new Error("text prompt parts require non-empty text");
    }
    return { type: "text", text: part.text };
  }

  if (part.type === "image_url") {
    if (!isHttpUrl(part.imageUrl)) {
      throw new Error("image_url prompt parts require an http(s) imageUrl");
    }
    validateImageMediaType(part.mediaType, false);
    return { type: "image", source: { type: "url", url: part.imageUrl, mediaType: part.mediaType } };
  }

  if (part.type === "image_base64") {
    validateImageMediaType(part.mediaType, true);
    validateBase64ImageData(part.data);
    return { type: "image", source: { type: "base64", data: part.data, mediaType: part.mediaType } };
  }

  throw new Error(`Unsupported prompt part type '${String((part as { type?: unknown }).type)}'`);
}

function buildNormalizedRequest(
  input: AgentCorePromptInput,
  sessionOptions: AgentCoreSessionOptions,
  promptOptions: AgentCorePromptOptions,
  historyMessages: ProviderMessage[] = [],
): NormalizedCompletionRequest {
  const messages: ProviderMessage[] = [];
  const systemPrompt = buildSystemPrompt(sessionOptions);
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push(...historyMessages);
  messages.push({ role: "user", content: normalizePromptInput(input) });

  const structuredOutput = normalizeStructuredOutput(promptOptions);
  const customTools = sessionOptions.customTools?.length ? sessionOptions.customTools : undefined;
  return {
    messages,
    ...(structuredOutput ? { structuredOutput } : {}),
    ...(customTools ? { customTools } : {}),
  };
}

function mergeFollowUps(input: AgentCorePromptInput, followUps: string[]): AgentCorePromptInput {
  if (followUps.length === 0) {
    return input;
  }
  const followUpText = followUps.map((item) => `Follow-up instruction:\n${item}`).join("\n\n");
  if (typeof input === "string") {
    return [input, followUpText].join("\n\n");
  }
  return [...input, { type: "text", text: followUpText }];
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateImageMediaType(mediaType: string | undefined, required: boolean): void {
  if (!mediaType) {
    if (required) {
      throw new Error("image_base64 prompt parts require mediaType");
    }
    return;
  }
  if (!/^image\/[a-zA-Z0-9.+-]+$/.test(mediaType)) {
    throw new Error("image prompt mediaType must start with image/");
  }
}

function validateBase64ImageData(data: string): void {
  if (!data || data.startsWith("data:")) {
    throw new Error("image_base64 prompt parts require raw base64 data, not a data URL");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0) {
    throw new Error("image_base64 prompt parts require valid base64 data");
  }
  const estimatedBytes = Math.floor((data.length * 3) / 4);
  if (estimatedBytes > MAX_BASE64_IMAGE_BYTES) {
    throw new Error(`image_base64 prompt parts must be <= ${MAX_BASE64_IMAGE_BYTES} bytes`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface ResolvedEndpoint {
  apiBase: string;
  apiKey: string;
  model: string;
  isAzure: boolean;
  isAnthropic: boolean;
}

function resolveEndpoint(options: AgentCoreSessionOptions): ResolvedEndpoint {
  const agentMuxProvider = process.env["AGENT_MUX_PROVIDER"];
  const agentMuxApiBase = process.env["AGENT_MUX_API_BASE"];
  const agentMuxApiKey = process.env["AGENT_MUX_API_KEY"];
  const agentMuxModel = process.env["AGENT_MUX_MODEL"];
  const azureApiKey = process.env["AZURE_API_KEY"] || process.env["AZURE_OPENAI_API_KEY"];
  const azureProject = process.env["AZURE_OPENAI_PROJECT_NAME"];
  const openaiApiKey = process.env["OPENAI_API_KEY"];
  const openaiModel = process.env["OPENAI_MODEL"];
  const anthropicApiKey = process.env["ANTHROPIC_API_KEY"];

  const model = options.model || agentMuxModel || openaiModel || "gpt-4o";
  if (!options.model && !agentMuxModel && !openaiModel) {
    process.stderr.write(`[agent-core] no model specified, defaulting to gpt-4o\n`);
  }

  if (agentMuxProvider === "foundry" || agentMuxProvider === "azure") {
    const apiBase = agentMuxApiBase || "";
    const apiKey = agentMuxApiKey || azureApiKey || "";
    return { apiBase: `${apiBase}/openai`, apiKey, model, isAzure: true, isAnthropic: false };
  }

  // Azure OpenAI via AZURE_OPENAI_API_KEY + AZURE_OPENAI_PROJECT_NAME
  if (azureApiKey && azureProject) {
    const apiBase = `https://${azureProject}.services.ai.azure.com/openai`;
    return { apiBase, apiKey: azureApiKey, model, isAzure: true, isAnthropic: false };
  }

  if (agentMuxApiBase) {
    const apiKey = agentMuxApiKey || openaiApiKey || "";
    return { apiBase: agentMuxApiBase, apiKey, model, isAzure: false, isAnthropic: false };
  }

  if (openaiApiKey) {
    return { apiBase: "https://api.openai.com/v1", apiKey: openaiApiKey, model, isAzure: false, isAnthropic: false };
  }

  if (anthropicApiKey) {
    const anthropicModel = model.startsWith("gpt") ? "claude-sonnet-4-6" : model;
    if (anthropicModel !== model) {
      process.stderr.write(`[agent-core] anthropic provider: converting model ${model} → ${anthropicModel}\n`);
    }
    return { apiBase: "https://api.anthropic.com", apiKey: anthropicApiKey, model: anthropicModel, isAzure: false, isAnthropic: true };
  }

  if (!agentMuxApiKey) {
    throw new Error(
      "No API credentials found. Set one of: " +
      "AGENT_MUX_PROVIDER + AGENT_MUX_API_BASE + AZURE_API_KEY (for Foundry/Azure), " +
      "OPENAI_API_KEY (for OpenAI), " +
      "ANTHROPIC_API_KEY (for Anthropic), " +
      "or AGENT_MUX_API_BASE + AGENT_MUX_API_KEY (for custom endpoint). " +
      "Alternatively, use --harness claude-code to route through an installed agent."
    );
  }

  return { apiBase: "https://api.openai.com/v1", apiKey: agentMuxApiKey, model, isAzure: false, isAnthropic: false };
}

function tokenEstimatorContextForEndpoint(endpoint: ResolvedEndpoint): TokenEstimatorContext {
  return {
    provider: endpoint.isAnthropic ? "anthropic" : endpoint.isAzure ? "azure" : "openai",
    model: endpoint.model,
  };
}

function toOpenAiMessage(message: ProviderMessage): { role: string; content: string | Array<Record<string, unknown>> } {
  if (typeof message.content === "string") {
    return { role: message.role, content: message.content };
  }
  return {
    role: message.role,
    content: message.content.map((part) => {
      if (part.type === "text") {
        return { type: "text", text: part.text };
      }
      const url = part.source.type === "url"
        ? part.source.url
        : `data:${part.source.mediaType};base64,${part.source.data}`;
      return { type: "image_url", image_url: { url } };
    }),
  };
}

function toAnthropicContent(content: ProviderMessageContent): string | Array<Record<string, unknown>> {
  if (typeof content === "string") {
    return content;
  }
  return content.map((part) => {
    if (part.type === "text") {
      return { type: "text", text: part.text };
    }
    if (part.source.type === "url") {
      return {
        type: "image",
        source: {
          type: "url",
          url: part.source.url,
        },
      };
    }
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: part.source.mediaType,
        data: part.source.data,
      },
    };
  });
}

function contentToText(content: ProviderMessageContent): string {
  if (typeof content === "string") {
    return content;
  }
  return content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n\n");
}

function buildOpenAiResponseFormat(
  structuredOutput: NormalizedStructuredOutput | undefined,
): Record<string, unknown> {
  if (!structuredOutput) {
    return {};
  }
  if (structuredOutput.outputFormat === "json_object") {
    return { response_format: { type: "json_object" } };
  }
  return {
    response_format: {
      type: "json_schema",
      json_schema: {
        name: structuredOutput.name ?? DEFAULT_OUTPUT_SCHEMA_NAME,
        schema: structuredOutput.schema,
        strict: structuredOutput.strict ?? true,
      },
    },
  };
}

function buildAnthropicStructuredOutputPrompt(
  structuredOutput: NormalizedStructuredOutput | undefined,
): string | undefined {
  if (!structuredOutput) {
    return undefined;
  }
  if (structuredOutput.outputFormat === "json_object") {
    return "Return only a valid JSON object. Do not include markdown fences, prose, or leading/trailing text.";
  }
  return [
    "Return only JSON that conforms to the following JSON Schema.",
    "Do not include markdown fences, prose, or leading/trailing text.",
    JSON.stringify({
      name: structuredOutput.name ?? DEFAULT_OUTPUT_SCHEMA_NAME,
      strict: structuredOutput.strict ?? true,
      schema: structuredOutput.schema,
    }),
  ].join("\n");
}

function applyStructuredOutputResult<TParsed>(
  text: string,
  structuredOutput: NormalizedStructuredOutput | undefined,
): Pick<AgentCorePromptResult<TParsed>, "parsed" | "validationError" | "success" | "exitCode"> {
  if (!structuredOutput) {
    return { success: true, exitCode: 0 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      success: false,
      exitCode: 1,
      validationError: `Structured output JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      success: false,
      exitCode: 1,
      validationError: "Structured output must be a JSON object",
    };
  }

  if (structuredOutput.outputFormat === "json_schema" && structuredOutput.schema) {
    const validationError = validateJsonSchemaValue(parsed, structuredOutput.schema);
    if (validationError) {
      return { success: false, exitCode: 1, parsed: parsed as TParsed, validationError };
    }
  }

  return { success: true, exitCode: 0, parsed: parsed as TParsed };
}

function validateJsonSchemaValue(value: unknown, schema: AgentCoreJsonSchema, path = "$"): string | undefined {
  const type = schema["type"];
  if (typeof type === "string" && !matchesJsonSchemaType(value, type)) {
    return `${path} must be ${type}`;
  }

  const enumValues = schema["enum"];
  if (Array.isArray(enumValues) && !enumValues.some((item) => Object.is(item, value))) {
    return `${path} must be one of the schema enum values`;
  }

  if (type === "object" || (isPlainObject(value) && isPlainObject(schema["properties"]))) {
    if (!isPlainObject(value)) {
      return `${path} must be object`;
    }
    const required = Array.isArray(schema["required"]) ? schema["required"] : [];
    for (const key of required) {
      if (typeof key === "string" && !(key in value)) {
        return `${path}.${key} is required`;
      }
    }
    const properties = schema["properties"];
    if (isPlainObject(properties)) {
      for (const [key, propertySchema] of Object.entries(properties)) {
        if (key in value && isPlainObject(propertySchema)) {
          const error = validateJsonSchemaValue(value[key], propertySchema, `${path}.${key}`);
          if (error) {
            return error;
          }
        }
      }
    }
  }

  if (type === "array" && Array.isArray(value)) {
    const items = schema["items"];
    if (isPlainObject(items)) {
      for (let index = 0; index < value.length; index += 1) {
        const error = validateJsonSchemaValue(value[index], items, `${path}[${index}]`);
        if (error) {
          return error;
        }
      }
    }
  }

  return undefined;
}

function matchesJsonSchemaType(value: unknown, type: string): boolean {
  switch (type) {
    case "object":
      return isPlainObject(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return true;
  }
}

function buildOpenAiTools(customTools: CustomToolDefinition[] | undefined): Record<string, unknown> {
  if (!customTools?.length) {
    return {};
  }
  return {
    tools: customTools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    })),
    tool_choice: "auto",
  };
}

function buildAnthropicTools(customTools: CustomToolDefinition[] | undefined): Record<string, unknown> {
  if (!customTools?.length) {
    return {};
  }
  return {
    tools: customTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    })),
  };
}

async function callCompletionApi(
  endpoint: ResolvedEndpoint,
  request: NormalizedCompletionRequest,
  timeout: number,
  onDelta: (delta: string) => void,
  onController?: (controller: AbortController | undefined) => void,
  /**
   * Extra provider-shaped turns appended after the base messages. Used by the
   * tool-calling loop to feed prior assistant tool-call turns and tool results
   * back to the model. Already shaped for the active provider.
   */
  extraRawMessages: RawProviderMessage[] = [],
  externalSignal?: AbortSignal,
): Promise<CompletionStreamResult> {
  const controller = new AbortController();
  onController?.(controller);
  const startTime = Date.now();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${Math.round((Date.now() - startTime) / 1000)}s (limit: ${Math.round(timeout / 1000)}s)`));
  }, timeout);
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  try {
    let url: string;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    let body: string;

    if (endpoint.isAnthropic) {
      url = `${endpoint.apiBase}/v1/messages`;
      headers["x-api-key"] = endpoint.apiKey;
      headers["anthropic-version"] = "2023-06-01";
      const systemPrompts = request.messages.filter(m => m.role === "system").map(m => contentToText(m.content));
      const nonSystemMsgs = request.messages.filter(m => m.role !== "system");
      const structuredPrompt = buildAnthropicStructuredOutputPrompt(request.structuredOutput);
      const system = [...systemPrompts, structuredPrompt].filter(Boolean).join("\n\n");
      const baseMessages = nonSystemMsgs.map(m => ({ role: m.role, content: toAnthropicContent(m.content) }));
      const extra = extraRawMessages.map((m) => ({ role: m.role, content: m.content }));
      body = JSON.stringify({
        model: endpoint.model,
        max_tokens: 16384,
        stream: true,
        ...(system ? { system } : {}),
        ...buildAnthropicTools(request.customTools),
        messages: [...baseMessages, ...extra],
      });
    } else if (endpoint.isAzure) {
      url = `${endpoint.apiBase}/deployments/${endpoint.model}/chat/completions?api-version=2025-04-01-preview`;
      headers["api-key"] = endpoint.apiKey;
      body = JSON.stringify({
        model: endpoint.model,
        messages: [...request.messages.map(toOpenAiMessage), ...extraRawMessages.map(toOpenAiRawMessage)],
        max_completion_tokens: 16384,
        stream: true,
        ...buildOpenAiResponseFormat(request.structuredOutput),
        ...buildOpenAiTools(request.customTools),
      });
    } else {
      url = `${endpoint.apiBase}/chat/completions`;
      headers["Authorization"] = `Bearer ${endpoint.apiKey}`;
      body = JSON.stringify({
        model: endpoint.model,
        messages: [...request.messages.map(toOpenAiMessage), ...extraRawMessages.map(toOpenAiRawMessage)],
        max_completion_tokens: 16384,
        stream: true,
        ...buildOpenAiResponseFormat(request.structuredOutput),
        ...buildOpenAiTools(request.customTools),
      });
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed (${response.status}) at ${url}: ${errorText.slice(0, 500)}`);
    }

    return endpoint.isAnthropic
      ? readAnthropicStream(response, onDelta, endpoint)
      : readOpenAiStream(response, onDelta, endpoint);
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
    onController?.(undefined);
  }
}

function toOpenAiRawMessage(message: RawProviderMessage): Record<string, unknown> {
  const result: Record<string, unknown> = { role: message.role, content: message.content };
  if (message.tool_calls !== undefined) {
    result["tool_calls"] = message.tool_calls;
  }
  if (message.tool_call_id !== undefined) {
    result["tool_call_id"] = message.tool_call_id;
  }
  return result;
}

async function readOpenAiStream(
  response: Response,
  onDelta: (delta: string) => void,
  endpoint: ResolvedEndpoint,
): Promise<CompletionStreamResult> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let usage: CompletionUsage | undefined;
  let buffer = "";
  // Accumulated tool calls keyed by streamed index. name arrives once; arguments
  // arrive as string chunks that must be concatenated in order.
  const toolCallAccumulator = new Map<number, { id: string; name: string; arguments: string }>();

  const finalize = (): CompletionStreamResult => {
    const toolCalls = collectOpenAiToolCalls(toolCallAccumulator);
    return toolCalls.length > 0
      ? { text: chunks.join(""), usage, toolCalls }
      : { text: chunks.join(""), usage };
  };

  const handlePayload = (payload: string): boolean => {
    if (payload === "[DONE]") return true;

    let chunk: {
      choices?: Array<{
        delta?: {
          content?: string | null;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
        finish_reason?: string | null;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    try {
      chunk = JSON.parse(payload);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse OpenAI stream chunk: ${message}`);
    }

    const choice = chunk.choices?.[0];
    const delta = choice?.delta?.content;
    if (delta) {
      chunks.push(delta);
      onDelta(delta);
    }
    const deltaToolCalls = choice?.delta?.tool_calls;
    if (deltaToolCalls) {
      for (const call of deltaToolCalls) {
        const index = call.index ?? 0;
        const existing = toolCallAccumulator.get(index) ?? { id: "", name: "", arguments: "" };
        if (call.id) existing.id = call.id;
        if (call.function?.name) existing.name = call.function.name;
        if (call.function?.arguments) existing.arguments += call.function.arguments;
        toolCallAccumulator.set(index, existing);
      }
    }
    if (chunk.usage) {
      const inputTokens = chunk.usage.prompt_tokens ?? 0;
      const outputTokens = chunk.usage.completion_tokens ?? 0;
      usage = {
        inputTokens,
        outputTokens,
        totalTokens: chunk.usage.total_tokens ?? inputTokens + outputTokens,
        provider: endpoint.isAzure ? "azure" : "openai",
        model: endpoint.model,
      };
    }
    return Boolean(choice?.finish_reason);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const complete = handlePayload(trimmed.slice(5).trim());
      if (complete) {
        return finalize();
      }
    }
  }

  buffer += decoder.decode();
  for (const line of buffer.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("data:")) continue;
    const complete = handlePayload(trimmed.slice(5).trim());
    if (complete) break;
  }

  return finalize();
}

function collectOpenAiToolCalls(
  accumulator: Map<number, { id: string; name: string; arguments: string }>,
): NormalizedToolCall[] {
  const indices = [...accumulator.keys()].sort((a, b) => a - b);
  const toolCalls: NormalizedToolCall[] = [];
  for (const index of indices) {
    const entry = accumulator.get(index)!;
    if (!entry.name) continue;
    toolCalls.push({
      id: entry.id,
      name: entry.name,
      arguments: parseToolArguments(entry.arguments, entry.name),
      rawArguments: entry.arguments || "{}",
    });
  }
  return toolCalls;
}

function parseToolArguments(raw: string, toolName: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse tool-call arguments for '${toolName}': ${message}`);
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`Tool-call arguments for '${toolName}' must be a JSON object`);
  }
  return parsed;
}

async function readAnthropicStream(
  response: Response,
  onDelta: (delta: string) => void,
  endpoint: ResolvedEndpoint,
): Promise<CompletionStreamResult> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let usage: CompletionUsage | undefined;
  let buffer = "";
  let done = false;
  // tool_use content blocks keyed by their content-block index. partial_json
  // arrives in input_json_delta events and must be concatenated in order.
  const toolUseBlocks = new Map<number, { id: string; name: string; partialJson: string }>();

  const handlePayload = (payload: string): void => {
    if (payload === "[DONE]") {
      done = true;
      return;
    }

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(payload) as Record<string, unknown>;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse Anthropic stream chunk: ${message}`);
    }

    const type = event.type;
    if (type === "content_block_start") {
      const index = typeof event["index"] === "number" ? (event["index"] as number) : 0;
      const block = event["content_block"] as { type?: string; id?: string; name?: string } | undefined;
      if (block?.type === "tool_use") {
        toolUseBlocks.set(index, { id: block.id ?? "", name: block.name ?? "", partialJson: "" });
      }
      return;
    }

    if (type === "message_start") {
      const message = event.message as { usage?: { input_tokens?: number } } | undefined;
      if (message?.usage) {
        const inputTokens = message.usage.input_tokens ?? 0;
        const outputTokens = usage?.outputTokens ?? 0;
        usage = {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          provider: "anthropic",
          model: endpoint.model,
        };
      }
      return;
    }

    if (type === "content_block_delta") {
      const delta = event.delta as { type?: string; text?: string; partial_json?: string } | undefined;
      if (delta?.type === "text_delta" && delta.text) {
        chunks.push(delta.text);
        onDelta(delta.text);
      } else if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
        const index = typeof event["index"] === "number" ? (event["index"] as number) : 0;
        const block = toolUseBlocks.get(index);
        if (block) {
          block.partialJson += delta.partial_json;
        }
      }
      return;
    }

    if (type === "message_delta") {
      const messageUsage = event.usage as { output_tokens?: number } | undefined;
      if (messageUsage) {
        const inputTokens = usage?.inputTokens ?? 0;
        const outputTokens = messageUsage.output_tokens ?? 0;
        usage = {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          provider: "anthropic",
          model: endpoint.model,
        };
      }
      done = true;
      return;
    }

    if (type === "message_stop") {
      done = true;
    }
  };

  while (!done) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      handlePayload(trimmed.slice(5).trim());
      if (done) break;
    }
  }

  buffer += decoder.decode();
  for (const line of buffer.split("\n")) {
    if (done) break;
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("data:")) continue;
    handlePayload(trimmed.slice(5).trim());
  }

  const toolCalls = collectAnthropicToolCalls(toolUseBlocks);
  return toolCalls.length > 0
    ? { text: chunks.join(""), usage, toolCalls }
    : { text: chunks.join(""), usage };
}

function collectAnthropicToolCalls(
  blocks: Map<number, { id: string; name: string; partialJson: string }>,
): NormalizedToolCall[] {
  const indices = [...blocks.keys()].sort((a, b) => a - b);
  const toolCalls: NormalizedToolCall[] = [];
  for (const index of indices) {
    const block = blocks.get(index)!;
    if (!block.name) continue;
    toolCalls.push({
      id: block.id,
      name: block.name,
      arguments: parseToolArguments(block.partialJson, block.name),
      rawArguments: block.partialJson || "{}",
    });
  }
  return toolCalls;
}

function mergeUsage(
  base: CompletionUsage | undefined,
  next: CompletionUsage | undefined,
): CompletionUsage | undefined {
  if (!next) return base;
  if (!base) return next;
  return {
    inputTokens: base.inputTokens + next.inputTokens,
    outputTokens: base.outputTokens + next.outputTokens,
    totalTokens: base.totalTokens + next.totalTokens,
    provider: next.provider ?? base.provider,
    model: next.model ?? base.model,
  };
}

function toolResultText(result: ToolResult): string {
  if (!result || !Array.isArray(result.content)) {
    throw new Error("Tool execute() must return a ToolResult with a content array");
  }
  return result.content
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

/** Build the assistant tool-call turn in the active provider's message shape. */
function buildAssistantToolCallMessage(
  endpoint: ResolvedEndpoint,
  text: string,
  toolCalls: NormalizedToolCall[],
): RawProviderMessage {
  if (endpoint.isAnthropic) {
    const content: Array<Record<string, unknown>> = [];
    if (text) {
      content.push({ type: "text", text });
    }
    for (const call of toolCalls) {
      content.push({ type: "tool_use", id: call.id, name: call.name, input: call.arguments });
    }
    return { role: "assistant", content };
  }
  return {
    role: "assistant",
    content: text || null,
    tool_calls: toolCalls.map((call) => ({
      id: call.id,
      type: "function",
      function: { name: call.name, arguments: call.rawArguments },
    })),
  };
}

/** Build the tool-result turn(s) in the active provider's message shape. */
function buildToolResultMessages(
  endpoint: ResolvedEndpoint,
  results: Array<{ toolCall: NormalizedToolCall; text: string }>,
): RawProviderMessage[] {
  if (endpoint.isAnthropic) {
    return [
      {
        role: "user",
        content: results.map(({ toolCall, text }) => ({
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: text,
        })),
      },
    ];
  }
  return results.map(({ toolCall, text }) => ({
    role: "tool",
    tool_call_id: toolCall.id,
    content: text,
  }));
}

export class AgentCoreSessionHandle {
  private readonly options: AgentCoreSessionOptions;
  private readonly listeners = new Set<AgentCoreEventListener>();
  private history: AgentCoreHistoryEntry[] = [];
  private queuedFollowUps: string[] = [];
  private currentSessionId: string | undefined;
  private activeAbortController: AbortController | undefined;
  private isActive = false;

  constructor(options: AgentCoreSessionOptions = {}) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    return;
  }

  async prompt<TParsed = unknown>(text: string, timeout?: number): Promise<AgentCorePromptResult<TParsed>>;
  async prompt<TParsed = unknown>(input: AgentCorePromptInput, options?: AgentCorePromptOptions): Promise<AgentCorePromptResult<TParsed>>;
  async prompt<TParsed = unknown>(
    input: AgentCorePromptInput,
    timeoutOrOptions?: number | AgentCorePromptOptions,
  ): Promise<AgentCorePromptResult<TParsed>> {
    if (this.isActive) {
      throw new Error("Agent core session is already processing a prompt");
    }

    this.isActive = true;
    const promptOptions = normalizePromptOptions(this.options, timeoutOrOptions);
    const effectiveTimeout = promptOptions.timeout;
    const start = Date.now();

    const followUps = this.queuedFollowUps;
    this.queuedFollowUps = [];
    const promptInput = mergeFollowUps(input, followUps);

    const endpoint = resolveEndpoint(this.options);
    try {
      const request = buildNormalizedRequest(
        promptInput,
        this.options,
        promptOptions,
        this.trimHistoryForPrompt(tokenEstimatorContextForEndpoint(endpoint)),
      );
      const promptText = contentToText(request.messages[request.messages.length - 1]?.content ?? "");

      const sessionId = this.currentSessionId ?? `agent-core-${Date.now()}`;
      this.currentSessionId = sessionId;

      this.emit({ type: "session_start", sessionId });

      const providerLabel = endpoint.isAnthropic ? "anthropic" : endpoint.isAzure ? "azure/foundry" : "openai";
      process.stderr.write(`[agent-core] ${providerLabel} → ${endpoint.apiBase} model=${endpoint.model} timeout=${Math.round(effectiveTimeout / 1000)}s\n`);

      const result = await this.runCompletionLoop(endpoint, request, effectiveTimeout, promptText);
      const structuredResult = applyStructuredOutputResult<TParsed>(result.text, request.structuredOutput);

      this.appendTurnEntries(result.historyEntries);
      this.emit({ type: "session_end", sessionId });

      return {
        output: result.text,
        duration: Date.now() - start,
        success: structuredResult.success,
        exitCode: structuredResult.exitCode,
        ...(structuredResult.parsed !== undefined ? { parsed: structuredResult.parsed } : {}),
        ...(structuredResult.validationError ? { validationError: structuredResult.validationError } : {}),
        usage: result.usage,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const detail = `${message} [endpoint=${endpoint.apiBase} model=${endpoint.model} provider=${endpoint.isAnthropic ? 'anthropic' : endpoint.isAzure ? 'azure' : 'openai'}]`;
      this.emit({ type: "error", message: detail });
      return {
        output: message,
        duration: Date.now() - start,
        success: false,
        exitCode: 1,
      };
    } finally {
      this.isActive = false;
    }
  }

  /**
   * Drives one prompt to completion. When the session has no `customTools`,
   * this is a single model call (plain-text / structured-output path). When
   * tools are present it runs a tool-calling loop: each model turn that emits
   * tool calls invokes the matching `execute()` and feeds results back, under a
   * single timeout budget shared across the whole loop, until the model emits
   * plain text (no tool calls) or the iteration safeguard trips.
   */
  private async runCompletionLoop(
    endpoint: ResolvedEndpoint,
    request: NormalizedCompletionRequest,
    effectiveTimeout: number,
    promptText: string,
  ): Promise<{ text: string; usage?: CompletionUsage; historyEntries: AgentCoreHistoryEntry[] }> {
    // Single shared budget for the entire loop (all model calls + tool runs).
    const loopController = new AbortController();
    this.activeAbortController = loopController;
    const loopStart = Date.now();
    const loopTimer = setTimeout(() => {
      loopController.abort(
        new Error(`Request timed out after ${Math.round((Date.now() - loopStart) / 1000)}s (limit: ${Math.round(effectiveTimeout / 1000)}s)`),
      );
    }, effectiveTimeout);

    const historyEntries: AgentCoreHistoryEntry[] = [{ role: "user", content: promptText }];
    const extraRawMessages: RawProviderMessage[] = [];
    const customTools = request.customTools;
    let aggregatedUsage: CompletionUsage | undefined;

    try {
      for (let iteration = 0; iteration < MAX_TOOL_LOOP_ITERATIONS; iteration += 1) {
        const remaining = effectiveTimeout - (Date.now() - loopStart);
        if (remaining <= 0) {
          throw new Error(`Request timed out after ${Math.round((Date.now() - loopStart) / 1000)}s (limit: ${Math.round(effectiveTimeout / 1000)}s)`);
        }

        const result = await callCompletionApi(
          endpoint,
          request,
          remaining,
          (delta) => {
            this.emit({ type: "text_delta", delta });
          },
          undefined,
          extraRawMessages,
          loopController.signal,
        );
        aggregatedUsage = mergeUsage(aggregatedUsage, result.usage);

        const toolCalls = result.toolCalls;
        if (!customTools?.length || !toolCalls?.length) {
          if (result.text) {
            historyEntries.push({ role: "assistant", content: result.text });
          }
          return { text: result.text, usage: aggregatedUsage, historyEntries };
        }

        // Echo the assistant tool-call turn back into provider history.
        extraRawMessages.push(buildAssistantToolCallMessage(endpoint, result.text, toolCalls));
        if (result.text) {
          historyEntries.push({ role: "assistant", content: result.text });
        }

        const toolResults: Array<{ toolCall: NormalizedToolCall; text: string }> = [];
        for (const toolCall of toolCalls) {
          this.emit({ type: "tool_use", name: toolCall.name, toolCallId: toolCall.id });
          const definition = customTools.find((tool) => tool.name === toolCall.name);
          if (!definition) {
            throw new Error(`Model requested unknown tool '${toolCall.name}'`);
          }
          const toolContext: ToolExecutionContext = {
            signal: loopController.signal,
            limits: { timeoutMs: remaining },
          };
          const rawResult = await definition.execute(toolCall.id, toolCall.arguments, undefined, toolContext);
          const resolved: ToolResult = rawResult as ToolResult;
          const text = toolResultText(resolved);
          this.emit({ type: "tool_result", toolCallId: toolCall.id });
          historyEntries.push({ role: "assistant", content: `[tool ${toolCall.name}] ${text}` });
          toolResults.push({ toolCall, text });
        }

        // Feed tool results back as the next user turn.
        extraRawMessages.push(...buildToolResultMessages(endpoint, toolResults));
      }

      throw new Error(`Tool-calling loop exceeded ${MAX_TOOL_LOOP_ITERATIONS} iterations without producing a final response`);
    } finally {
      clearTimeout(loopTimer);
      this.activeAbortController = undefined;
    }
  }

  private emit(event: AgentCoreSessionEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  async steer(text: string): Promise<void> {
    this.queuedFollowUps.push(text);
  }

  async followUp(text: string): Promise<void> {
    this.queuedFollowUps.push(text);
  }

  getHistory(): AgentCoreHistoryEntry[] {
    return this.history.map((entry) => ({ ...entry }));
  }

  clearHistory(): void {
    this.history = [];
  }

  subscribe(listener: AgentCoreEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async executeCommand(
    command: string,
    onChunk?: (chunk: string) => void,
  ): Promise<{ output: string; exitCode: number | undefined; cancelled: boolean }> {
    const shellInvocation = buildShellInvocation(command);

    return new Promise((resolve, reject) => {
      const child = childProcess.spawn(shellInvocation.command, shellInvocation.args, {
        cwd: this.options.workspace,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const chunks: string[] = [];
      let cancelled = false;

      child.stdout?.on("data", (chunk: Buffer | string) => {
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        chunks.push(text);
        onChunk?.(text);
      });
      child.stderr?.on("data", (chunk: Buffer | string) => {
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        chunks.push(text);
        onChunk?.(text);
      });
      child.on("error", reject);
      child.on("close", (code, signal) => {
        if (signal) {
          cancelled = true;
        }
        resolve({
          output: chunks.join(""),
          exitCode: code ?? undefined,
          cancelled,
        });
      });
    });
  }

  async executeBash(
    command: string,
    onChunk?: (chunk: string) => void,
  ): Promise<{ output: string; exitCode: number | undefined; cancelled: boolean }> {
    return this.executeCommand(command, onChunk);
  }

  async abort(): Promise<void> {
    this.activeAbortController?.abort(new Error("Agent core session aborted"));
  }

  dispose(): void {
    this.activeAbortController?.abort(new Error("Agent core session disposed"));
    this.activeAbortController = undefined;
    this.listeners.clear();
    this.queuedFollowUps = [];
    this.history = [];
  }

  get sessionId(): string | undefined {
    return this.currentSessionId;
  }

  get isStreaming(): boolean {
    return this.isActive;
  }

  private appendTurnEntries(entries: AgentCoreHistoryEntry[]): void {
    this.history.push(...entries);
    this.history = this.limitHistoryByTurns(this.history);
  }

  private trimHistoryForPrompt(tokenEstimatorContext?: TokenEstimatorContext): ProviderMessage[] {
    let entries = this.limitHistoryByTurns(this.history);
    entries = this.limitHistoryByTokens(entries, tokenEstimatorContext);
    return entries.map((entry) => ({ role: entry.role, content: entry.content }));
  }

  private limitHistoryByTurns(entries: AgentCoreHistoryEntry[]): AgentCoreHistoryEntry[] {
    const maxHistoryTurns = this.options.maxHistoryTurns ?? DEFAULT_MAX_HISTORY_TURNS;
    if (maxHistoryTurns <= 0) return [];
    return entries.slice(-maxHistoryTurns);
  }

  private limitHistoryByTokens(
    entries: AgentCoreHistoryEntry[],
    tokenEstimatorContext?: TokenEstimatorContext,
  ): AgentCoreHistoryEntry[] {
    const maxHistoryTokens = this.options.maxHistoryTokens;
    if (maxHistoryTokens === undefined) return entries;
    if (maxHistoryTokens <= 0) return [];

    const selected = entries.slice();
    while (selected.length > 0 && historyTokenCount(selected, tokenEstimatorContext) > maxHistoryTokens) {
      selected.shift();
      if (selected[0]?.role === "assistant") {
        selected.shift();
      }
    }
    return selected;
  }
}

function historyTokenCount(entries: AgentCoreHistoryEntry[], context?: TokenEstimatorContext): number {
  return entries.reduce((total, entry) => total + estimateTokens(entry.content, context), 0);
}

export function createAgentCoreSession(options?: AgentCoreSessionOptions): AgentCoreSessionHandle {
  return new AgentCoreSessionHandle(options);
}
