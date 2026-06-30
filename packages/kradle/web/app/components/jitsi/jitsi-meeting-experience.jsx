'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { JitsiEmbeddedMeeting } from './jitsi-embedded-meeting.jsx';
import { JitsiMeetingControls } from './jitsi-meeting-controls.jsx';
import { JitsiParticipantList } from './jitsi-participant-list.jsx';
import { deriveAgentOverlay } from './agent-overlay.js';

function mergeParticipants(baseParticipants, liveParticipants) {
  const byId = new Map();
  for (const participant of Array.isArray(baseParticipants) ? baseParticipants : []) {
    const key = participant.id || participant.ref || participant.name;
    if (key) byId.set(key, participant);
  }
  for (const participant of liveParticipants) {
    const key = participant.id || participant.ref || participant.name;
    if (key) byId.set(key, { ...byId.get(key), ...participant, status: 'joined' });
  }
  return [...byId.values()];
}

export function JitsiMeetingExperience({ org = 'default', meeting, recordings = [], displayName = 'Kradle user' }) {
  const meetingRef = meeting?.metadata?.name || meeting?.spec?.roomId || '';
  const [joinPayload, setJoinPayload] = useState(null);
  const [joinState, setJoinState] = useState('idle');
  const [joinError, setJoinError] = useState('');
  const [api, setApi] = useState(null);
  const [liveParticipants, setLiveParticipants] = useState([]);
  const [ended, setEnded] = useState((meeting?.status?.phase || '').toLowerCase() === 'ended');
  const [recordingActive, setRecordingActive] = useState(Boolean(meeting?.status?.recording?.active));

  const requestJoin = useCallback(async () => {
    if (!meetingRef) return null;
    setJoinState('loading');
    setJoinError('');
    try {
      const response = await fetch(`/api/orgs/${org}/jitsi/meetings/${meetingRef}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ participantName: displayName }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || 'Could not join meeting');
      setJoinPayload(payload);
      setJoinState('ready');
      return payload;
    } catch (error) {
      const message = error.message || 'Could not join meeting';
      setJoinError(message);
      setJoinState('error');
      return null;
    }
  }, [displayName, meetingRef, org]);

  useEffect(() => {
    requestJoin();
  }, [requestJoin]);

  const handleParticipantJoined = useCallback((event = {}) => {
    const participant = {
      id: event.id || event.participantId || event.name,
      name: event.displayName || event.name,
      type: event.type || 'user',
      joinedAt: new Date().toISOString(),
      status: 'joined',
    };
    setLiveParticipants((current) => [...current.filter((item) => item.id !== participant.id), participant]);
  }, []);

  const handleParticipantLeft = useCallback((event = {}) => {
    const id = event.id || event.participantId;
    if (!id) return;
    setLiveParticipants((current) => current.filter((item) => item.id !== id));
  }, []);

  const currentParticipants = useMemo(
    () => mergeParticipants(meeting?.status?.participants?.current || [], liveParticipants),
    [liveParticipants, meeting?.status?.participants?.current],
  );
  const overlay = useMemo(() => deriveAgentOverlay(meeting), [meeting]);
  const [hiddenAgents, setHiddenAgents] = useState({});
  const toggleAgentMute = useCallback(() => {
    // Reuses the held iframe `api` (same executeCommand pattern as JitsiMeetingControls).
    api?.executeCommand?.('toggleAudio');
  }, [api]);
  const toggleAgentHidden = useCallback((name) => {
    if (!name) return;
    setHiddenAgents((current) => ({ ...current, [name]: !current[name] }));
  }, []);
  const roomUrl = joinPayload?.roomUrl || '';
  const jwt = joinPayload?.jwt || '';
  const directJoinUrl = joinPayload?.roomUrl && joinPayload?.jwt
    ? `${joinPayload.roomUrl}?jwt=${encodeURIComponent(joinPayload.jwt)}`
    : '';

  return (
    <div className="jitsiMeetingExperience">
      <div className="jitsiMeetingMain">
        <div className="jitsiMeetingHeader">
          <div>
            <h2>{meeting?.spec?.displayName || meetingRef || 'Meeting'}</h2>
            <p>{ended ? 'Meeting ended. Recordings and transcript links appear below when finalized.' : 'Authenticated in-console Jitsi meeting.'}</p>
          </div>
          <button type="button" onClick={requestJoin} disabled={joinState === 'loading'} aria-label={`Join embedded meeting ${meetingRef}`}>
            {joinState === 'loading' ? 'Joining...' : joinPayload ? 'Refresh token' : 'Join meeting'}
          </button>
        </div>
        {joinError ? <p className="jitsiError" role="alert">{joinError}</p> : null}
        <JitsiEmbeddedMeeting
          roomUrl={roomUrl}
          jwt={jwt}
          displayName={displayName}
          onApiReady={setApi}
          onParticipantJoined={handleParticipantJoined}
          onParticipantLeft={handleParticipantLeft}
          onMeetingEnded={() => setEnded(true)}
        />
        {overlay.agents.length > 0 ? (
          <div className="jitsiAgentOverlay" aria-label="Agent overlay">
            {overlay.hasPendingApproval ? (
              <div className="jitsiAgentOverlayApproval" role="status">
                <span>Pending approval</span>
                <ul>
                  {overlay.governance
                    .filter((run) => run.phase === 'waiting-approval')
                    .map((run, index) => (
                      <li key={run.runId || run.tool || index}>
                        {run.tool || 'tool'}{run.runId ? ` · ${run.runId}` : ''}
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
            <ul className="jitsiAgentOverlayList">
              {overlay.agents.map((agent, index) => (
                <li key={agent.name || agent.avatarRef || index} className="jitsiAgentOverlayItem">
                  <span className="jitsiAgentOverlayName">{agent.name || 'agent'}</span>
                  {agent.role ? <span className="jitsiAgentOverlayRole">{agent.role}</span> : null}
                  <span className="jitsiAgentOverlayBadges">
                    {agent.publishing.audio ? <span data-publishing="audio">audio</span> : null}
                    {agent.publishing.video ? <span data-publishing="video">video</span> : null}
                    {agent.publishing.screenshare ? <span data-publishing="screenshare">screen</span> : null}
                  </span>
                  <button
                    type="button"
                    aria-label={`Mute agent ${agent.name || ''}`.trim()}
                    onClick={toggleAgentMute}
                  >
                    Mute
                  </button>
                  <button
                    type="button"
                    aria-label={`Hide agent ${agent.name || ''}`.trim()}
                    aria-pressed={Boolean(hiddenAgents[agent.name])}
                    onClick={() => toggleAgentHidden(agent.name)}
                  >
                    {hiddenAgents[agent.name] ? 'Show' : 'Hide'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <JitsiMeetingControls
          org={org}
          meetingRef={meetingRef}
          api={api}
          recordingActive={recordingActive}
          directJoinUrl={directJoinUrl}
          onJoin={requestJoin}
          onRecordingChange={setRecordingActive}
          onMeetingEnded={() => setEnded(true)}
        />
      </div>
      <JitsiParticipantList
        org={org}
        meeting={meeting}
        participants={currentParticipants}
        invited={meeting?.spec?.participants?.invited || []}
        recordings={recordings}
        recordingActive={recordingActive}
        ended={ended}
      />
    </div>
  );
}
