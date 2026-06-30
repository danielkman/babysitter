/**
 * G15 — Agent overlay derivation spec.
 *
 * deriveAgentOverlay(meeting) is a pure `.js` module, so node:test can import it
 * directly (no base64 data: URL hack needed). Asserts:
 *   (a) a populated JitsiMeeting status (agent track publishing audio+video, a session
 *       agent, and a governanceRuns entry with phase 'waiting-approval') yields a
 *       non-empty agents array with publishing flags, non-empty governance, and
 *       hasPendingApproval === true;
 *   (b) empty/missing status (undefined, {}, { status: {} }) yields correct emptiness —
 *       empty arrays + hasPendingApproval === false, no throw, no placeholder agent;
 *   (c) the experience JSX wires the overlay in (structural mirror of jitsi-structure.test.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveAgentOverlay } from '../app/components/jitsi/agent-overlay.js';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('populated status → agents with publishing flags, governance, hasPendingApproval true', () => {
  const meeting = {
    status: {
      media: {
        agentTracks: [
          { participant: 'nova-stack', audio: true, video: true, screenshare: false },
        ],
      },
      session: {
        agents: [{ stackRef: 'nova-stack', jobRef: 'job-1', phase: 'running' }],
      },
      governanceRuns: [
        { tool: 'draw_canvas', runId: '01HVZ', phase: 'waiting-approval' },
      ],
      participants: { current: [{ id: 'nova-stack', name: 'Nova' }] },
    },
  };
  const out = deriveAgentOverlay(meeting);
  assert.equal(out.agents.length, 1);
  assert.equal(out.agents[0].name, 'nova-stack');
  assert.deepEqual(out.agents[0].publishing, { audio: true, video: true, screenshare: false });
  assert.equal(out.agents[0].role, 'running');
  assert.equal(out.agents[0].avatarRef, 'nova-stack');
  assert.equal(out.governance.length, 1);
  assert.equal(out.governance[0].tool, 'draw_canvas');
  assert.equal(out.governance[0].runId, '01HVZ');
  assert.equal(out.hasPendingApproval, true);
});

test('governance with no waiting-approval phase → hasPendingApproval false', () => {
  const out = deriveAgentOverlay({
    status: {
      media: { agentTracks: [{ participant: 'a', audio: true, video: false }] },
      governanceRuns: [{ tool: 'speak', runId: 'r1', phase: 'completed' }],
    },
  });
  assert.equal(out.agents.length, 1);
  assert.deepEqual(out.agents[0].publishing, { audio: true, video: false, screenshare: false });
  assert.equal(out.hasPendingApproval, false);
});

test('empty/missing status → correct emptiness, no throw, no placeholder', () => {
  for (const meeting of [undefined, {}, { status: {} }, { status: { media: {}, session: {} } }]) {
    const out = deriveAgentOverlay(meeting);
    assert.deepEqual(out.agents, []);
    assert.deepEqual(out.governance, []);
    assert.equal(out.hasPendingApproval, false);
  }
});

test('experience JSX imports deriveAgentOverlay and renders jitsiAgentOverlay', () => {
  const src = fs.readFileSync(
    path.join(webRoot, 'app', 'components', 'jitsi', 'jitsi-meeting-experience.jsx'),
    'utf8',
  );
  assert.match(src, /deriveAgentOverlay/);
  assert.match(src, /jitsiAgentOverlay/);
});
