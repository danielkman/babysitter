/**
 * bootstrap command — Dedicated no-op context bootstrap.
 *
 * Spec section 18.3.
 *
 * Delegates to invoke with --bootstrap-only flag internally.
 * Reads stdin for session discovery, creates/loads session, and persists it.
 */

import type { CommandModule } from 'yargs';
import {
  normalizeEvent,
  loadSession,
  saveSession,
} from '@a5c-ai/hooks-mux-core';
import { loadAdapter } from '../adapter-loader';
import { createHooksLogger } from '../hooks-logger';

interface BootstrapArgs {
  adapter: string;
  'session-id'?: string;
  json?: boolean;
}

export const bootstrapCommand: CommandModule<object, BootstrapArgs> = {
  command: 'bootstrap',
  describe: 'No-op context bootstrap — initialize session without running handlers',
  builder: (yargs) =>
    yargs
      .option('adapter', {
        type: 'string',
        demandOption: true,
        describe: 'Adapter name (e.g. claude, codex, copilot) or "auto" to detect from environment',
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
    const logger = createHooksLogger('bootstrap');
    const loaded = loadAdapter(args.adapter);
    const env = process.env as Record<string, string>;

    // Determine session ID
    const sessionId = args['session-id']
      ?? env['AGENT_SESSION_ID']
      ?? `bootstrap-${Date.now()}`;

    // Normalize a synthetic session.start event for context extraction
    const event = normalizeEvent({
      adapter: args.adapter,
      rawEventName: 'bootstrap',
      env,
      adapterMappings: loaded.phaseMappings,
    });

    // Load or create session
    let session = await loadSession(sessionId);
    if (!session) {
      session = {
        version: 'a5c.hooks.session.v1',
        sessionId,
        adapter: args.adapter,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cwd: event.execution.cwd ?? undefined,
        persistedEnv: { ...event.env.persisted },
        contextVars: {},
        contextFragments: [],
        metadata: {},
      };
    }

    await saveSession(session);
    await logger.info('bootstrap completed', {
      adapter: args.adapter,
      sessionId,
      createdAt: session.createdAt,
    });

    const output = {
      status: 'bootstrapped',
      sessionId,
      adapter: args.adapter,
      createdAt: session.createdAt,
    };

    if (args.json) {
      process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    } else {
      console.log(`Session bootstrapped: ${sessionId} (adapter: ${args.adapter})`);
    }
  },
};
