'use client';

/**
 * G15 — Agent-aware overlay derivation for the in-console Jitsi call UI.
 *
 * Pure mapping over a JitsiMeeting CR. Reads ONLY the real status fields
 * emitted by `reconcile` in packages/kradle/core/src/jitsi-meeting-controller.js:
 *   - status.media.agentTracks  -> [{ participant, audio, video, screenshare }]
 *   - status.session.agents     -> [{ stackRef, jobRef, phase }]
 *   - status.governanceRuns      -> [{ tool, runId, phase }]   (phase may be 'waiting-approval')
 *   - status.participants.current (used only to enrich avatarRef if a session agent is absent)
 *
 * Correct EMPTINESS, never a fallback: a missing/empty status yields empty arrays and
 * hasPendingApproval=false. We never synthesize a placeholder agent and never default a
 * real identity field (participant/tool/runId) to a fabricated string — `?? null` only.
 *
 * @param {object} [meeting] - JitsiMeeting CR (may be undefined).
 * @returns {{
 *   agents: Array<{ name: string|null, role: string|null, publishing: { audio: boolean, video: boolean, screenshare: boolean }, avatarRef: string|null }>,
 *   governance: Array<{ tool: string|null, runId: string|null, phase: string|null }>,
 *   hasPendingApproval: boolean,
 * }}
 */
export function deriveAgentOverlay(meeting) {
  const status = meeting?.status || {};
  const tracks = Array.isArray(status.media?.agentTracks) ? status.media.agentTracks : [];
  const sessionAgents = Array.isArray(status.session?.agents) ? status.session.agents : [];
  const runs = Array.isArray(status.governanceRuns) ? status.governanceRuns : [];

  // One overlay agent per published agentTrack (the publishing identity),
  // enriched by the matching session agent (matched on stackRef === participant).
  const agents = tracks.map((track) => {
    const sessionAgent = sessionAgents.find(
      (agent) => agent?.stackRef && agent.stackRef === track?.participant,
    ) || null;
    return {
      name: track?.participant ?? null,
      role: sessionAgent?.phase ?? null,
      publishing: {
        audio: track?.audio === true,
        video: track?.video === true,
        screenshare: track?.screenshare === true,
      },
      avatarRef: sessionAgent?.stackRef ?? null,
    };
  });

  const governance = runs.map((run) => ({
    tool: run?.tool ?? null,
    runId: run?.runId ?? null,
    phase: run?.phase ?? null,
  }));

  const hasPendingApproval = governance.some((run) => run.phase === 'waiting-approval');

  return { agents, governance, hasPendingApproval };
}
