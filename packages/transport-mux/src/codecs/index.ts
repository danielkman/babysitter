import type { TransportCodec } from '../codec.js';
import type { TransportId } from '../types.js';

import { AnthropicCodec } from './anthropic.js';
import { GoogleCodec } from './google.js';
import { OpenAiChatCodec } from './openai-chat.js';

const codecRegistry = new Map<TransportId, TransportCodec>();

function register(codec: TransportCodec): void {
  codecRegistry.set(codec.transportId, codec);
}

register(new AnthropicCodec());
register(new GoogleCodec());
register(new OpenAiChatCodec());

/**
 * Look up a TransportCodec by transport identifier.
 * Returns `undefined` when no codec has been registered for the given id.
 */
export function getCodec(transportId: TransportId): TransportCodec | undefined {
  return codecRegistry.get(transportId);
}

export { AnthropicCodec } from './anthropic.js';
export { GoogleCodec } from './google.js';
export { OpenAiChatCodec } from './openai-chat.js';
