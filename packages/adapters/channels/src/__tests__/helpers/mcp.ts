// Shared test helpers for driving the MCP layer offline.
//
// Two strategies are exposed (DESIGN §6 testability hooks):
//
// 1. `connectedClient(server)` — the PREFERRED path. Wires the real MCP `Client`
//    to the `ChannelServer`'s underlying `Server` via
//    `InMemoryTransport.createLinkedPair()`, registers a handler for the custom
//    `notifications/claude/channel` method, and returns helpers to read captured
//    notifications and to call the `reply` tool.
//
// 2. `capturingTransport()` — a minimal `Transport` that records every raw
//    `send()` payload.

import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

/**
 * Zod schema for the custom outbound channel notification. `method` is a literal
 * so `client.setNotificationHandler(...)` registers under exactly this method;
 * `params` is loose so arbitrary `meta` keys survive parsing.
 */
export const ChannelNotificationSchema = z.object({
  method: z.literal('notifications/claude/channel'),
  params: z
    .object({
      content: z.string(),
      meta: z.record(z.string(), z.any()).optional()
    })
    .loose()
    .optional()
});

/** Schema for the optional permission relay notification (server -> client). */
export const ChannelPermissionNotificationSchema = z.object({
  method: z.literal('notifications/claude/channel/permission'),
  params: z.object({}).loose().optional()
});

interface ChannelServerLike {
  server: unknown;
  connect: (t: Transport) => Promise<void> | void;
}

/**
 * Connect a real MCP Client to a ChannelServer over a linked in-memory pair.
 */
export async function connectedClient(
  channelServer: ChannelServerLike,
  opts: { clientCapabilities?: Record<string, unknown> } = {}
): Promise<{
  client: Client;
  notifications: Array<{ content: string; meta: Record<string, any> }>;
  permissionNotifications: Array<Record<string, unknown>>;
  serverTransport: InMemoryTransport;
  clientTransport: InMemoryTransport;
  close: () => Promise<void>;
}> {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client(
    { name: 'test-client', version: '0.0.0' },
    { capabilities: opts.clientCapabilities || {} }
  );

  const notifications: Array<{ content: string; meta: Record<string, any> }> = [];
  client.setNotificationHandler(ChannelNotificationSchema, (n) => {
    notifications.push({
      content: n.params?.content as string,
      meta: (n.params?.meta as Record<string, any>) || {}
    });
  });

  const permissionNotifications: Array<Record<string, unknown>> = [];
  client.setNotificationHandler(ChannelPermissionNotificationSchema, (n) => {
    permissionNotifications.push((n.params as Record<string, unknown>) || {});
  });

  await Promise.all([
    channelServer.connect(serverTransport),
    client.connect(clientTransport)
  ]);

  return {
    client,
    notifications,
    permissionNotifications,
    serverTransport,
    clientTransport,
    async close() {
      await client.close();
    }
  };
}

export interface CapturingTransport extends Transport {
  sent: any[];
  notifications: Array<{ content: string; meta: Record<string, any> }>;
  reset: () => void;
  receive: (message: any) => void;
}

/**
 * A minimal capturing Transport that records raw outbound JSON-RPC payloads.
 */
export function capturingTransport(): CapturingTransport {
  const transport: CapturingTransport = {
    sent: [],
    notifications: [],
    onmessage: undefined,
    onclose: undefined,
    onerror: undefined,
    sessionId: undefined,
    async start() {},
    async close() {
      this.onclose?.();
    },
    async send(message: any) {
      this.sent.push(message);
      if (message?.method === 'notifications/claude/channel') {
        this.notifications.push({
          content: message.params?.content,
          meta: message.params?.meta || {}
        });
      }
    },
    reset() {
      this.sent.length = 0;
      this.notifications.length = 0;
    },
    // Test-only helper to push an inbound message into the protocol.
    receive(message: any) {
      this.onmessage?.(message);
    }
  };
  return transport;
}

/**
 * Pull the single channel notification's params out of a capturing transport's
 * raw `sent` log (skips the JSON-RPC envelope noise).
 */
export function channelNotificationsFrom(transport: {
  sent: any[];
}): Array<{ content: string; meta: Record<string, any> }> {
  return transport.sent
    .filter((m) => m?.method === 'notifications/claude/channel')
    .map((m) => ({ content: m.params?.content, meta: m.params?.meta || {} }));
}
