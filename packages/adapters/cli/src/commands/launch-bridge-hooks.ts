/**
 * Bridge hook emulation — thin wrapper.
 *
 * The implementation now lives in @a5c-ai/adapters-launch.
 * This module re-exports everything for backward compatibility.
 */

export {
  BridgeHookEmulator,
} from '@a5c-ai/adapters-launch';

export type {
  BridgeHookContext,
  SessionStartResult,
  StopResult,
} from '@a5c-ai/adapters-launch';
