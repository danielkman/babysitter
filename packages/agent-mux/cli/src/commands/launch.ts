/**
 * `amux launch` command — thin wrapper.
 *
 * The launch orchestration logic now lives in @a5c-ai/agent-launch-mux.
 * This module re-exports everything for backward compatibility.
 */

export {
  launchCommand,
  resolveLaunchPlan,
  LAUNCH_FLAGS,
} from '@a5c-ai/agent-launch-mux';

export type {
  LaunchPlanInput,
  ProxyPlan,
  LaunchPlan,
} from '@a5c-ai/agent-launch-mux';
