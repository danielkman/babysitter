/**
 * adapters integration bridge for agent-platform.
 *
 * This module provides an alternative invocation path that delegates to
 * an AgentMuxClient rather than spawning harness CLIs directly. The existing
 * invoker.ts is preserved as a fallback.
 *
 * @module harness/adapters
 */

export type {
  AgentMuxRunOptions,
  AgentMuxRunHandle,
  AdapterAgentEvent,
  AdapterInteractionChannel,
  AgentMuxClient,
  AdapterAdapterInfo,
  AdapterAdapterInstallationCheck,
  AdapterAuthCheck,
  AgentMuxClientWithDiscovery,
} from "./agentMuxTypes";

export {
  HARNESS_TO_AGENT_MUX_ADAPTER,
  mapHarnessToAmuxAdapter,
  hasAmuxAdapter,
} from "./agentMuxHarnessMap";

export {
  mapAmuxEvent,
  isToolEvent,
  isCostEvent,
  isInteractiveEvent,
  isErrorEvent,
  isSessionLifecycleEvent,
  type BabysitterEvent,
  type BabysitterEventKind,
} from "./agentMuxEventMapper";

export {
  invokeViaAgentMux,
  type AdapterBridgeOptions,
  type AgentMuxBridgeResult,
  type AdapterEventCallback,
} from "./agentMuxBridge";

export {
  getAgentMuxClient,
  isAgentMuxAvailable,
  _resetAgentMuxClientCache,
} from "./agentMuxClientFactory";

export { AdapterEventEmitter } from "./agentMuxEventEmitter";

export {
  createAmuxStdinReader,
  waitForInteractionResponse,
  type AdapterInteractionEvent,
} from "./agentMuxStdinReader";
