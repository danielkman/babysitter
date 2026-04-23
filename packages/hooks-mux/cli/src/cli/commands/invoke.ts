/**
 * invoke command — Primary hook entrypoint.
 *
 * Spec section 18.1.
 *
 * Pipeline:
 *   1. Read stdin when adapter expects it
 *   2. Normalize event via core normalizeEvent
 *   3. Resolve/load session context via core session store
 *   4. Run handler or fan-out plan via core runPlan
 *   5. Merge results via core mergeResults
 *   6. Persist session store
 *   7. Apply propagation backend
 *   8. Emit adapter-native output
 */

import type { CommandModule } from 'yargs';
import {
  normalizeEvent,
  resolveHookPlan,
  runPlan,
  mergeResults,
  loadSession,
  saveSession,
  adaptOutput,
  propagateEnv,
  type SessionState,
  type MergedExecutionResult,
} from '@a5c-ai/hooks-mux-core';
import { loadAdapter } from '../adapter-loader';
import { createHooksLogger } from '../hooks-logger';
import { readStdin } from '../stdin';

interface InvokeArgs {
  adapter: string;
  handler?: string[];
  'bootstrap-only'?: boolean;
  'session-id'?: string;
  json?: boolean;
}

/**
 * Try to parse a string as JSON, returning undefined on failure.
 */
function tryParseJson(raw: string): unknown | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

/**
 * Resolve the session ID from explicit flag, env, or stdin payload.
 */
function resolveSessionId(
  explicitSessionId: string | undefined,
  stdinData: Record<string, unknown> | undefined,
  env: Record<string, string>,
): string | null {
  if (explicitSessionId) return explicitSessionId;
  if (env['AGENT_SESSION_ID']) return env['AGENT_SESSION_ID'];
  if (stdinData && typeof stdinData['session_id'] === 'string') {
    return stdinData['session_id'] as string;
  }
  return null;
}

/**
 * Parse --handler values into HandlerRef objects.
 * Format: "source:handler" or just "source" (handler defaults to "handler").
 */
function parseHandlerArgs(handlers: string[]): Array<{ source: string; handler: string }> {
  return handlers.map((h) => {
    const colonIdx = h.indexOf(':');
    if (colonIdx >= 0) {
      return { source: h.slice(0, colonIdx), handler: h.slice(colonIdx + 1) };
    }
    return { source: h, handler: 'handler' };
  });
}

export const invokeCommand: CommandModule<object, InvokeArgs> = {
  command: 'invoke',
  describe: 'Primary hook entrypoint — normalize, execute, merge, propagate',
  builder: (yargs) =>
    yargs
      .option('adapter', {
        type: 'string',
        demandOption: true,
        describe: 'Adapter name (e.g. claude, codex, copilot) or "auto" to detect from environment',
      })
      .option('handler', {
        type: 'array',
        string: true,
        describe: 'Shell command handler(s) in command:label format',
      })
      .option('bootstrap-only', {
        type: 'boolean',
        default: false,
        describe: 'Only bootstrap session context, skip handler execution',
      })
      .option('session-id', {
        type: 'string',
        describe: 'Explicit session ID override',
      })
      .option('json', {
        type: 'boolean',
        default: false,
        describe: 'Output JSON format',
      }),
  handler: async (args) => {
    const logger = createHooksLogger('invoke');

    // 1. Load adapter
    const loaded = loadAdapter(args.adapter);
    await logger.info('invoke started', {
      adapter: args.adapter,
      bootstrapOnly: Boolean(args['bootstrap-only']),
      handlerCount: args.handler?.length ?? 0,
    });

    // 2. Read stdin
    const rawStdin = await readStdin();
    const stdinPayload = tryParseJson(rawStdin);
    const stdinData = (typeof stdinPayload === 'object' && stdinPayload !== null && !Array.isArray(stdinPayload))
      ? stdinPayload as Record<string, unknown>
      : undefined;

    // Determine raw event name from env or stdin
    const env = process.env as Record<string, string>;
    const rawEventName = env['HOOKS_PROXY_EVENT_NAME']
      ?? (stdinData?.['event_name'] as string | undefined)
      ?? 'unknown';
    await logger.debug('stdin parsed', {
      rawEventName,
      stdinBytes: rawStdin.length,
      stdinJson: Boolean(stdinData),
    });

    // 3. Normalize event
    const event = normalizeEvent({
      adapter: args.adapter,
      rawEventName,
      stdinPayload,
      env,
      adapterMappings: loaded.phaseMappings,
    });

    // 4. Resolve session
    const sessionId = resolveSessionId(args['session-id'], stdinData, env);
    await logger.debug('session resolved', {
      sessionId,
      explicitSessionId: args['session-id'] ?? null,
    });
    let session: SessionState | null = null;
    if (sessionId) {
      session = await loadSession(sessionId);
      if (!session) {
        // Create a new session
        session = {
          version: 'a5c.hooks.session.v1',
          sessionId,
          adapter: args.adapter,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          cwd: event.execution.cwd ?? undefined,
          transcriptPath: event.execution.transcriptPath ?? undefined,
          persistedEnv: { ...event.env.persisted },
          contextVars: {},
          contextFragments: [],
          metadata: {},
        };
      }

      // Inject session context into event execution
      event.execution.sessionId = sessionId;
      if (session.persistedEnv) {
        Object.assign(event.execution.persistedEnv, session.persistedEnv);
      }
    }

    // 5. Bootstrap-only mode: persist session and exit
    if (args['bootstrap-only']) {
      if (session) {
        await saveSession(session);
      }
      await logger.info('bootstrap-only invoke completed', {
        adapter: args.adapter,
        sessionId,
      });
      if (args.json) {
        process.stdout.write(JSON.stringify({ status: 'bootstrapped', sessionId }, null, 2) + '\n');
      }
      return;
    }

    // 6. Resolve execution plan
    const handlers = args.handler ? parseHandlerArgs(args.handler) : [];
    const plan = resolveHookPlan({
      phase: event.phase,
      handlers,
    });

    // 7. Run plan and merge
    let merged: MergedExecutionResult;
    if (plan.length > 0) {
      const results = await runPlan(event, plan, { capabilities: loaded.capabilities });
      merged = mergeResults(results);
    } else {
      // No handlers: produce a noop result
      merged = mergeResults([{ decision: 'noop' }]);
    }
    await logger.debug('plan executed', {
      phase: event.phase,
      planLength: plan.length,
      decision: merged.decision,
      degradedFields: merged.diagnostics.degradedFields,
    });

    // 8. Persist session updates
    if (session && sessionId) {
      if (Object.keys(merged.persistEnv).length > 0) {
        session.persistedEnv = { ...session.persistedEnv, ...merged.persistEnv };
      }
      if (Object.keys(merged.contextVars).length > 0) {
        session.contextVars = { ...session.contextVars, ...merged.contextVars };
      }
      for (const key of merged.unsetEnv) {
        delete session.persistedEnv[key];
      }
      session.updatedAt = new Date().toISOString();
      await saveSession(session);
    }

    // 9. Apply propagation backend
    if (Object.keys(merged.persistEnv).length > 0) {
      const backend = loaded.capabilities.envPersistenceMode;
      await propagateEnv(backend, merged.persistEnv, {
        nativeEnvFilePath: env['CLAUDE_ENV_FILE'] ?? env['HOOKS_PROXY_ENV_FILE'],
      });
    }

    // 10. Emit adapter-native output
    const adapted = adaptOutput({
      adapter: args.adapter,
      mergedResult: merged,
      nativeInput: stdinPayload,
      capabilities: loaded.capabilities,
    });

    await logger.info('invoke completed', {
      adapter: args.adapter,
      phase: event.phase,
      sessionId,
      decision: merged.decision,
      degradedFields: adapted.degradedFields,
    });
    process.stdout.write(JSON.stringify(adapted.output, null, args.json ? 2 : 0) + '\n');
  },
};
