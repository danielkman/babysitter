/**
 * Bridge hook emulation — thin wrapper.
 *
 * The implementation now lives in @a5c-ai/agent-launch-mux.
 * This module re-exports everything for backward compatibility.
 */

export {
  BridgeHookEmulator,
} from '@a5c-ai/agent-launch-mux';

export type {
  BridgeHookContext,
  SessionStartResult,
  StopResult,
} from '@a5c-ai/agent-launch-mux';
