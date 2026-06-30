// Registry of the consequential visual tools that are routed through the
// babysitter media-governance boundary (G13). ZERO-DEP.
//
// Each entry declares:
//   - action:          the sidecar action name (matches the fast-path command).
//   - filler:          pre-filler the agent speaks while the governed run executes (spec §3 / §3.2 step 3).
//   - approvalPosture: "auth" (sensitive) | "destroy" (irreversible) — drives the
//                      breakpointId prefix that forces OWNER approval (spec §6).
//   - governedProcess: a STRING ref to the SDK-side process. The zero-dep cli
//                      NEVER imports it; the bridge/driver resolves it at run time.
//
// @reference docs/research/voice-governance-bridge-spec.md §3, §6, §8A

const GOVERNED_PROCESS_REF = '../governance/governed-visual-tool.process.js#process';

export const GOVERNED_VISUAL_TOOLS = {
  draw_canvas: {
    action: 'draw_canvas',
    filler: 'Let me put that on screen — one moment.',
    approvalPosture: 'auth',
    governedProcess: GOVERNED_PROCESS_REF,
  },
  share_surface: {
    action: 'share_surface',
    filler: 'Setting up the screen share — one moment.',
    approvalPosture: 'auth',
    governedProcess: GOVERNED_PROCESS_REF,
  },
  send_video_metadata: {
    action: 'send_video_metadata',
    filler: 'Sending that out — one moment.',
    approvalPosture: 'destroy',
    governedProcess: GOVERNED_PROCESS_REF,
  },
};

/**
 * Whether the given sidecar action is a governed visual tool.
 * @param {string} action
 * @returns {boolean}
 */
export function isGovernedVisualTool(action) {
  return Object.prototype.hasOwnProperty.call(GOVERNED_VISUAL_TOOLS, action);
}

/**
 * Get the governed-tool descriptor for the given action, or undefined.
 * @param {string} action
 * @returns {object|undefined}
 */
export function getGovernedTool(action) {
  return GOVERNED_VISUAL_TOOLS[action];
}
