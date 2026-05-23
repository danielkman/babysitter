/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type {
  ToolSource,
  ToolDescriptor,
  ToolServer,
  ToolDispatchRule,
  ToolDispatchPolicy,
  ToolCallContext,
  ToolCallResult,
} from './types.js';

/* ------------------------------------------------------------------ */
/*  Registry                                                           */
/* ------------------------------------------------------------------ */

export { ToolRegistry } from './registry.js';

/* ------------------------------------------------------------------ */
/*  Dispatch                                                           */
/* ------------------------------------------------------------------ */

export { ToolDispatcher } from './dispatch.js';
export type { ToolExecutor, ToolDispatcherOptions } from './dispatch.js';

/* ------------------------------------------------------------------ */
/*  Schema translation (re-exports from transport-mux + adapters)      */
/* ------------------------------------------------------------------ */

export {
  convertTools,
  toToolDescriptor,
  fromToolDescriptor,
  translateTools,
} from './schema-translation.js';
export type { NormalizedToolDefinition, CodecCapabilities } from './schema-translation.js';

/* ------------------------------------------------------------------ */
/*  Hooks bridge                                                       */
/* ------------------------------------------------------------------ */

export { NoopToolHookBridge } from './hooks.js';
export type { ToolHookBridge, ToolHookResult } from './hooks.js';
