// ChannelServer — wraps the MCP `Server` to implement the claude/channel
// contract (SPEC §2/§6 R1, DESIGN §1).
//
//   - Declares channel capabilities: always experimental['claude/channel']={}
//     and tools={}; experimental['claude/channel/permission']={} when the
//     optional permission relay is enabled.
//   - emit({content,meta}) sends exactly ONE notifications/claude/channel with
//     SANITIZED meta (identifier keys only) and never a `source` key.
//   - Registers the `reply` tool (ListTools + CallTool); a reply handler returns
//     { ok, ref? } and the tool maps falsy ok / a throw to { isError:true }.
//   - Transport-injectable via connect(transport) so tests capture the wire.
//   - Optional permission relay: handles inbound permission_request and exposes
//     emitPermission({request_id, behavior}).

import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ReplyResult } from './types.js';

const CHANNEL_NOTIFICATION = 'notifications/claude/channel';
const PERMISSION_NOTIFICATION = 'notifications/claude/channel/permission';
const PERMISSION_REQUEST_NOTIFICATION = 'notifications/claude/channel/permission_request';

/** A meta key is valid iff it is a bare identifier: ^[A-Za-z0-9_]+$ */
const IDENTIFIER_RE = /^[A-Za-z0-9_]+$/;

// Strip control chars (incl. newlines/tabs/DEL), double/single quotes, and angle
// brackets from meta VALUES so a value can never break the wire
// `<channel k="v" ...>` attribute encoding or smuggle markup into the channel tag.
// Built from explicit hex escapes to avoid literal control bytes in source.
const UNSAFE_VALUE_CHARS = new RegExp("[\u0000-\u001F\u007F\"'<>]", "g");

/** A reply handler invoked when Claude calls the `reply` tool. */
export type ReplyHandler = (a: { reply_to: string; text: string }) => Promise<ReplyResult>;

/** A permission-request handler invoked on an inbound permission_request. */
export type PermissionRequestHandler = (req: {
  request_id: string;
  tool_name?: string;
  description?: string;
  input_preview?: string;
}) => void | Promise<void>;

/**
 * Sanitize meta into a strict `Record<string,string>`:
 *  - drop keys that are not bare identifiers `[A-Za-z0-9_]+`,
 *  - never emit a `source` key (Claude sets `source` from the server name),
 *  - drop entries whose value is null/undefined,
 *  - coerce every kept value to a String and strip control / quote / angle-bracket
 *    characters so the wire attribute stays clean (SPEC §2, finding §11).
 */
function sanitizeMeta(meta: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!meta || typeof meta !== 'object') return out;
  for (const [k, v] of Object.entries(meta)) {
    if (k === 'source') continue;
    if (!IDENTIFIER_RE.test(k)) continue;
    if (v === null || v === undefined) continue;
    out[k] = String(v).replace(UNSAFE_VALUE_CHARS, '');
  }
  return out;
}

// Default server `instructions` (SPEC §5, finding §12). Surfaced to Claude when
// the config does not override them; explains how channel events arrive and how
// to respond to the origin via the `reply` tool + the event's `reply_to` token.
export const DEFAULT_INSTRUCTIONS =
  'This MCP server is a Claude Code *channel*. External events (e.g. GitHub or ' +
  'Jira activity) arrive as <channel source="..." ...>content</channel> tags. ' +
  'Each event carries a `reply_to` attribute — an opaque routing token. To respond ' +
  'back to the origin of an event (post a comment on the originating issue/PR or ' +
  'Jira issue), call the `reply` tool with that event\'s exact `reply_to` value and ' +
  'your `text`. Do not invent or modify `reply_to`; echo it verbatim. The token is ' +
  'opaque and carries no secrets — it only tells the framework where your reply ' +
  'should go.';

export class ChannelServer {
  name: string;
  permissionRelay: boolean;
  instructions: string;
  server: Server;
  _replyHandler: ReplyHandler | null;
  _permissionRequestHandler: PermissionRequestHandler | null;

  constructor({
    name,
    instructions,
    permissionRelay = false
  }: { name: string; instructions?: string; permissionRelay?: boolean } = {} as {
    name: string;
    instructions?: string;
    permissionRelay?: boolean;
  }) {
    this.name = name;
    this.permissionRelay = !!permissionRelay;
    // Use the caller's instructions when provided, else a sane default that
    // guides Claude to use the reply tool (never silently empty).
    this.instructions =
      typeof instructions === 'string' && instructions.length > 0
        ? instructions
        : DEFAULT_INSTRUCTIONS;
    this._replyHandler = null;
    this._permissionRequestHandler = null;

    const capabilities: {
      tools: Record<string, object>;
      experimental: Record<string, object>;
    } = {
      tools: {},
      experimental: {
        'claude/channel': {}
      }
    };
    if (this.permissionRelay) {
      capabilities.experimental['claude/channel/permission'] = {};
    }

    this.server = new Server(
      { name: name || 'mcp-channels', version: '0.1.0' },
      { capabilities, instructions: this.instructions }
    );

    this._registerReplyTool();
    if (this.permissionRelay) {
      this._registerPermissionRelay();
    }
  }

  /** Register the `reply` tool handlers (ListTools + CallTool). */
  _registerReplyTool(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'reply',
          description:
            'Reply back to the origin of a channel event. Pass the event\'s ' +
            'reply_to token and your text; the framework routes it to the right ' +
            'backend (e.g. a GitHub/Jira comment).',
          inputSchema: {
            type: 'object',
            properties: {
              reply_to: {
                type: 'string',
                description: 'The opaque reply_to token from the inbound <channel> meta.'
              },
              text: { type: 'string', description: 'The reply text to post to origin.' }
            },
            required: ['reply_to', 'text']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
      const { name, arguments: args = {} } = req.params as {
        name: string;
        arguments?: { reply_to?: string; text?: string };
      };
      if (name !== 'reply') {
        return { content: [{ type: 'text', text: `unknown tool: ${name}` }], isError: true };
      }
      if (!this._replyHandler) {
        return {
          content: [{ type: 'text', text: 'reply: no reply handler is configured' }],
          isError: true
        };
      }
      try {
        const result = await this._replyHandler({
          reply_to: args.reply_to as string,
          text: args.text as string
        });
        if (!result || !result.ok) {
          return {
            content: [{ type: 'text', text: 'reply failed: could not deliver to origin' }],
            isError: true
          };
        }
        const ref = result.ref ? ` (${result.ref})` : '';
        return { content: [{ type: 'text', text: `reply sent${ref}` }] };
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `reply failed: ${(err as Error)?.message || String(err)}` }
          ],
          isError: true
        };
      }
    });
  }

  /** Wire the inbound permission_request notification handler. */
  _registerPermissionRelay(): void {
    this.server.setNotificationHandler(
      z.object({
        method: z.literal(PERMISSION_REQUEST_NOTIFICATION),
        params: z
          .object({
            request_id: z.string(),
            tool_name: z.string().optional(),
            description: z.string().optional(),
            input_preview: z.string().optional()
          })
          .loose()
      }),
      async (notification) => {
        if (this._permissionRequestHandler) {
          await this._permissionRequestHandler(
            notification.params as Parameters<PermissionRequestHandler>[0]
          );
        }
      }
    );
  }

  /**
   * Set the handler invoked when Claude calls the `reply` tool.
   */
  setReplyHandler(fn: ReplyHandler): void {
    this._replyHandler = fn;
  }

  /**
   * Set the handler invoked on an inbound permission_request (relay mode).
   */
  setPermissionRequestHandler(fn: PermissionRequestHandler): void {
    this._permissionRequestHandler = fn;
  }

  /**
   * Emit one channel event as a notifications/claude/channel.
   */
  async emit({
    content,
    meta
  }: { content?: string; meta?: Record<string, unknown> } = {}): Promise<void> {
    await this.server.notification({
      method: CHANNEL_NOTIFICATION,
      params: {
        content: content ?? '',
        meta: sanitizeMeta(meta)
      }
    });
  }

  /**
   * Emit a permission decision back to Claude (relay mode). `behavior` is coerced
   * to EXACTLY 'allow' or 'deny' so the SPEC §2 contract holds regardless of what
   * the caller passes — any value other than the literal 'allow' becomes 'deny'
   * (silence/garbage means deny, the safe stance for an untrusted-input gate).
   */
  async emitPermission({
    request_id,
    behavior
  }: {
    request_id: string;
    behavior: 'allow' | 'deny';
  }): Promise<void> {
    await this.server.notification({
      method: PERMISSION_NOTIFICATION,
      params: { request_id, behavior: behavior === 'allow' ? 'allow' : 'deny' }
    });
  }

  /**
   * Connect the underlying MCP server to a transport.
   */
  async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);
  }

  /** Close the underlying MCP server. */
  async close(): Promise<void> {
    await this.server.close();
  }
}
