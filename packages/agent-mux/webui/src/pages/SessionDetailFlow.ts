export type NativeSessionMessage = {
  role?: string;
  content?: string;
  thinking?: string;
  toolCalls?: Array<{
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
    durationMs?: number;
  }>;
  toolResult?: {
    toolCallId?: string;
    toolName?: string;
    output?: unknown;
  };
};

export type SessionCost = {
  totalUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
  cachedTokens?: number;
};

export type AgentFlowSegmentKind = 'user' | 'assistant' | 'thinking' | 'tool' | 'system' | 'lifecycle';

export type AgentFlowSegment = {
  id: string;
  kind: AgentFlowSegmentKind;
  title: string;
  detail: string;
  weight: number;
};

export type AgentFlowLane = {
  runId: string;
  agent: string;
  status: string;
  startedAt: number;
  segmentCount: number;
  toolCount: number;
  totalUsd: number | null;
  segments: AgentFlowSegment[];
};

function previewText(value: string, maxLength = 88): string {
  const flattened = value.replace(/\s+/g, ' ').trim();
  if (flattened.length <= maxLength) {
    return flattened;
  }
  return `${flattened.slice(0, Math.max(0, maxLength - 1))}…`;
}

function computeSegmentWeight(detail: string, start: number | null, end: number | null): number {
  const durationMs = start != null && end != null ? Math.max(0, end - start) : 0;
  if (durationMs > 0) {
    return Math.max(1, Math.min(8, Math.round(durationMs / 1000) + 1));
  }
  return Math.max(1, Math.min(6, Math.ceil(Math.max(16, detail.length) / 28)));
}

function getLifecycleLabel(event: Record<string, unknown>): string {
  const type = String(event.type ?? '');
  if (type === 'turn_start' || type === 'turn_end') {
    return `turn ${String(event.turnIndex ?? '?')}`;
  }
  if (type === 'step_start' || type === 'step_end') {
    return `step ${String(event.stepType ?? event.stepIndex ?? '?')}`;
  }
  if (type === 'session_start' || type === 'session_resume' || type === 'session_end') {
    return `session ${type.replace('session_', '')}`;
  }
  return type.replace(/_/g, ' ');
}

function getSystemLabel(event: Record<string, unknown>): string {
  const type = String(event.type ?? '');
  if (type === 'shell_start') {
    return `shell ${previewText(String(event.command ?? ''), 48)}`;
  }
  if (type === 'shell_exit') {
    return `shell exit ${String(event.exitCode ?? '?')}`;
  }
  if (type.startsWith('file_')) {
    return `${type.replace('file_', '')} ${previewText(String(event.path ?? ''), 36)}`;
  }
  if (type.startsWith('mcp_tool_')) {
    return `${String(event.toolName ?? 'mcp tool')} · ${String(event.server ?? 'server')}`;
  }
  return type.replace(/_/g, ' ');
}

function renderToolPayload(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function pushAgentFlowSegment(
  segments: AgentFlowSegment[],
  runId: string,
  kind: AgentFlowSegmentKind,
  title: string,
  detail: string,
  start: number | null,
  end: number | null,
): void {
  const cleaned = previewText(detail.length > 0 ? detail : title, 180);
  segments.push({
    id: `${runId}-${segments.length}-${kind}`,
    kind,
    title,
    detail: cleaned,
    weight: computeSegmentWeight(cleaned, start, end),
  });
}

export function buildAgentFlowLanes(
  runs: Array<Record<string, unknown>>,
  eventBuffers: Record<string, { events: Record<string, unknown>[] } | undefined>,
): AgentFlowLane[] {
  const orderedRuns = [...runs].sort((left, right) => Number(left.startedAt ?? 0) - Number(right.startedAt ?? 0));

  return orderedRuns
    .map((run) => {
      const runId = String(run.runId ?? '');
      const buffer = eventBuffers[runId];
      if (!buffer) {
        return null;
      }

      const segments: AgentFlowSegment[] = [];
      const pendingTools = new Map<string, { toolName: string; startedAt: number | null; detail: string }>();
      let currentAssistantText = '';
      let currentAssistantStart: number | null = null;
      let currentThinkingText = '';
      let currentThinkingStart: number | null = null;
      let toolCount = 0;
      let totalUsd = 0;
      let hasCost = false;

      const flushAssistant = (timestamp: number | null): void => {
        if (!currentAssistantText) return;
        pushAgentFlowSegment(
          segments,
          runId,
          'assistant',
          'assistant',
          currentAssistantText,
          currentAssistantStart,
          timestamp ?? currentAssistantStart,
        );
        currentAssistantText = '';
        currentAssistantStart = null;
      };

      const flushThinking = (timestamp: number | null): void => {
        if (!currentThinkingText) return;
        pushAgentFlowSegment(
          segments,
          runId,
          'thinking',
          'thinking',
          currentThinkingText,
          currentThinkingStart,
          timestamp ?? currentThinkingStart,
        );
        currentThinkingText = '';
        currentThinkingStart = null;
      };

      for (const event of buffer.events) {
        const type = String(event.type ?? '');
        const timestamp = typeof event.timestamp === 'number' ? event.timestamp : null;

        if (type === 'cost') {
          const costRecord = event.cost;
          if (costRecord && typeof costRecord === 'object') {
            totalUsd += Number((costRecord as SessionCost).totalUsd ?? 0);
            hasCost = true;
          }
          continue;
        }

        if (type === 'user_message') {
          flushThinking(timestamp);
          flushAssistant(timestamp);
          const text = String(event.text ?? '');
          if (text.length > 0) {
            pushAgentFlowSegment(segments, runId, 'user', 'user', text, timestamp, timestamp);
          }
          continue;
        }

        if (type === 'thinking_delta') {
          if (currentThinkingStart == null) {
            currentThinkingStart = timestamp;
          }
          currentThinkingText += String(event.delta ?? '');
          continue;
        }

        if (type === 'thinking_stop') {
          const finalThinking = String(event.thinking ?? currentThinkingText);
          if (finalThinking.length > 0) {
            currentThinkingText = finalThinking;
          }
          flushThinking(timestamp);
          continue;
        }

        if (type === 'text_delta') {
          flushThinking(timestamp);
          if (currentAssistantStart == null) {
            currentAssistantStart = timestamp;
          }
          currentAssistantText += String(event.delta ?? '');
          continue;
        }

        if (type === 'message_stop') {
          flushThinking(timestamp);
          const finalText = String(event.text ?? currentAssistantText);
          if (finalText.length > 0) {
            currentAssistantText = finalText;
          }
          flushAssistant(timestamp);
          continue;
        }

        flushThinking(timestamp);
        flushAssistant(timestamp);

        if (type === 'tool_call_start' || type === 'tool_call_ready') {
          pendingTools.set(String(event.toolCallId ?? `tool-${pendingTools.size}`), {
            toolName: String(event.toolName ?? 'tool'),
            startedAt: timestamp,
            detail:
              type === 'tool_call_ready'
                ? renderToolPayload(event.input ?? {})
                : String(event.inputAccumulated ?? ''),
          });
          continue;
        }

        if (type === 'tool_result' || type === 'tool_error') {
          const toolCallId = String(event.toolCallId ?? '');
          const pending = pendingTools.get(toolCallId);
          const toolName = pending?.toolName ?? String(event.toolName ?? 'tool');
          const detail =
            type === 'tool_error'
              ? String(event.error ?? '')
              : renderToolPayload(event.output ?? event);
          pushAgentFlowSegment(
            segments,
            runId,
            'tool',
            toolName,
            detail.length > 0 ? detail : pending?.detail ?? toolName,
            pending?.startedAt ?? timestamp,
            timestamp,
          );
          pendingTools.delete(toolCallId);
          toolCount += 1;
          continue;
        }

        if (
          type === 'session_start' ||
          type === 'session_resume' ||
          type === 'session_end' ||
          type === 'turn_start' ||
          type === 'turn_end' ||
          type === 'step_start' ||
          type === 'step_end'
        ) {
          pushAgentFlowSegment(segments, runId, 'lifecycle', getLifecycleLabel(event), getLifecycleLabel(event), timestamp, timestamp);
          continue;
        }

        if (
          type === 'shell_start' ||
          type === 'shell_exit' ||
          type === 'file_read' ||
          type === 'file_write' ||
          type === 'file_create' ||
          type === 'file_delete' ||
          type === 'file_patch' ||
          type === 'mcp_tool_call_start' ||
          type === 'mcp_tool_result' ||
          type === 'mcp_tool_error'
        ) {
          pushAgentFlowSegment(segments, runId, 'system', getSystemLabel(event), getSystemLabel(event), timestamp, timestamp);
        }
      }

      flushThinking(null);
      flushAssistant(null);

      for (const pending of pendingTools.values()) {
        pushAgentFlowSegment(
          segments,
          runId,
          'tool',
          pending.toolName,
          pending.detail.length > 0 ? pending.detail : pending.toolName,
          pending.startedAt,
          pending.startedAt,
        );
        toolCount += 1;
      }

      return {
        runId,
        agent: String(run.agent ?? 'unknown'),
        status: String(run.status ?? 'unknown'),
        startedAt: Number(run.startedAt ?? 0),
        segmentCount: segments.length,
        toolCount,
        totalUsd: hasCost ? totalUsd : null,
        segments,
      } satisfies AgentFlowLane;
    })
    .filter((lane): lane is AgentFlowLane => lane != null);
}

export function buildNativeAgentFlowLane(
  sessionId: string,
  messages: NativeSessionMessage[],
  agent: string,
  status: string,
): AgentFlowLane | null {
  if (messages.length === 0) {
    return null;
  }

  const segments: AgentFlowSegment[] = [];
  let toolCount = 0;

  for (const [index, message] of messages.entries()) {
    const segmentId = `${sessionId}:native:${index}`;
    if (message.role === 'user' && typeof message.content === 'string' && message.content.length > 0) {
      segments.push({
        id: `${segmentId}:user`,
        kind: 'user',
        title: 'user',
        detail: previewText(message.content, 180),
        weight: computeSegmentWeight(message.content, null, null),
      });
      continue;
    }
    if (typeof message.thinking === 'string' && message.thinking.length > 0) {
      segments.push({
        id: `${segmentId}:thinking`,
        kind: 'thinking',
        title: 'thinking',
        detail: previewText(message.thinking, 180),
        weight: computeSegmentWeight(message.thinking, null, null),
      });
    }
    if (Array.isArray(message.toolCalls)) {
      for (const [toolIndex, toolCall] of message.toolCalls.entries()) {
        const detail = renderToolPayload({
          input: toolCall.input,
          output: toolCall.output,
          durationMs: toolCall.durationMs,
        });
        segments.push({
          id: `${segmentId}:tool:${toolIndex}`,
          kind: 'tool',
          title: String(toolCall.toolName ?? 'tool'),
          detail: previewText(detail, 180),
          weight: computeSegmentWeight(detail, null, null),
        });
        toolCount += 1;
      }
    }
    if (message.role === 'tool' && message.toolResult) {
      const detail = renderToolPayload(message.toolResult.output);
      segments.push({
        id: `${segmentId}:tool-result`,
        kind: 'tool',
        title: String(message.toolResult.toolName ?? 'tool'),
        detail: previewText(detail, 180),
        weight: computeSegmentWeight(detail, null, null),
      });
      toolCount += 1;
      continue;
    }
    if (message.role === 'assistant' && typeof message.content === 'string' && message.content.length > 0) {
      segments.push({
        id: `${segmentId}:assistant`,
        kind: 'assistant',
        title: 'assistant',
        detail: previewText(message.content, 180),
        weight: computeSegmentWeight(message.content, null, null),
      });
      continue;
    }
    if (message.role === 'system' && typeof message.content === 'string' && message.content.length > 0) {
      segments.push({
        id: `${segmentId}:system`,
        kind: 'system',
        title: 'system',
        detail: previewText(message.content, 180),
        weight: computeSegmentWeight(message.content, null, null),
      });
    }
  }

  return {
    runId: `${sessionId}:native`,
    agent,
    status,
    startedAt: 0,
    segmentCount: segments.length,
    toolCount,
    totalUsd: null,
    segments,
  };
}
