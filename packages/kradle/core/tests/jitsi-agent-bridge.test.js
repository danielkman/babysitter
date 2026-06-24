import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentMuxClient, createJitsiAgentBridge, createResource } from '../src/index.js';

function stack(spec = {}) {
  return createResource('AgentStack', { name: 'standup-bot', namespace: 'kradle-org-default' }, {
    organizationRef: 'default',
    baseAgent: 'claude-code',
    adapter: 'claude-code',
    runtimeIdentity: { serviceAccountRef: 'kradle' },
    ...spec,
  });
}

test('Jitsi agent bridge gates capability and prepares meeting context', async () => {
  const emitted = [];
  const bridge = createJitsiAgentBridge({
    meetingController: {
      async getMeeting(ref) {
        assert.equal(ref, 'daily');
        return {
          metadata: { name: 'daily' },
          spec: { roomId: 'daily-default', ttlMinutes: 30 },
          status: { phase: 'Active', roomUrl: 'https://meet.example/daily-default' },
        };
      },
      generateParticipantJwt(roomId, participant, ttlMinutes) {
        assert.equal(roomId, 'daily-default');
        assert.equal(participant.id, 'dispatch-1');
        assert.equal(ttlMinutes, 30);
        return 'kradle-jitsi.jwt.sig';
      },
    },
    eventBus: { emit: (event) => emitted.push(event) },
    now: () => new Date('2026-05-30T12:00:00Z'),
  });

  assert.equal(bridge.hasMeetingCapability(stack()), false);
  assert.equal(bridge.hasMeetingCapability(stack({ jitsiCapability: true })), true);

  const run = { metadata: { name: 'dispatch-1' }, spec: {}, status: {} };
  const context = await bridge.prepareMeetingContext(run, 'daily', stack({
    jitsiCapability: true,
    jitsiConfig: { participantName: 'Standup Bot', role: 'observer', capabilities: { chat: 'readwrite', audio: 'listen' } },
  }));
  assert.equal(context.roomUrl, 'https://meet.example/daily-default');
  assert.equal(context.jwt, 'kradle-jitsi.jwt.sig');
  assert.equal(context.role, 'observer');
  assert.equal(run.spec.meetingRef, 'daily');
  assert.equal(run.spec.meetingContext.roomId, 'daily-default');
  assert.equal(run.spec.meetingContext.jwt, undefined);
  assert.deepEqual(run.spec.meetingContext.tokenRef, { runtimeOnly: true });

  await bridge.onAgentJoined('dispatch-1', 'daily');
  await bridge.onAgentLeft('dispatch-1', 'daily', 'completed');
  assert.deepEqual(emitted.map((event) => event.type), ['agent-joined-meeting', 'agent-left-meeting', 'participant-left']);
});

test('Jitsi agent bridge can resolve meetings from resources and keeps generated JWT runtime-only', async () => {
  const bridge = createJitsiAgentBridge({ now: () => new Date('2026-05-30T12:00:00Z') });
  const run = { metadata: { name: 'dispatch-1' }, spec: {}, status: {} };
  const context = await bridge.prepareMeetingContext(run, 'daily', stack({
    jitsiCapability: true,
    jitsiConfig: { role: 'participant', capabilities: { chat: 'readwrite', audio: 'listen' } },
  }), {
    resources: {
      JitsiMeeting: [
        createResource('JitsiMeeting', { name: 'daily', namespace: 'kradle-org-default' }, {
          organizationRef: 'default',
          providerRef: 'jitsi-prod',
          roomId: 'daily-default',
          ttlMinutes: 30,
        }, {
          phase: 'Active',
          roomUrl: 'https://meet.example/daily-default',
        }),
      ],
    },
  });

  assert.match(context.jwt, /^kradle-jitsi\./);
  assert.equal(run.spec.meetingContext.jwt, undefined);
  assert.equal(run.spec.meetingContext.role, 'participant');
});

function activeMeetingResources() {
  return {
    JitsiMeeting: [
      createResource('JitsiMeeting', { name: 'daily', namespace: 'kradle-org-default' }, {
        organizationRef: 'default',
        providerRef: 'jitsi-prod',
        roomId: 'daily-default',
        ttlMinutes: 30,
      }, { phase: 'Active', roomUrl: 'https://meet.example/daily-default' }),
    ],
  };
}

test('G10: identity appearance/voice are embedded into meetingContext.avatar/voice/video', async () => {
  const bridge = createJitsiAgentBridge({ now: () => new Date('2026-05-30T12:00:00Z') });
  const run = { metadata: { name: 'dispatch-1' }, spec: {}, status: {} };
  const identity = {
    appearance: { spec: { renderer: 'talkinghead', avatarModelUrl: 'https://x/a.glb', visemeSet: 'oculus', defaultMood: 'neutral', defaultView: 'upper' } },
    voiceProfile: { spec: { ttsProvider: 'azure', ttsConfig: { voice: 'en-US-Aria', speed: 1 } } },
  };
  await bridge.prepareMeetingContext(run, 'daily', stack({
    jitsiCapability: true,
    jitsiConfig: { role: 'agent', capabilities: { audio: 'publish', video: 'publish', chat: 'readwrite' } },
  }), { resources: activeMeetingResources(), identity });

  const ctx = run.spec.meetingContext;
  assert.equal(ctx.video, 'publish');
  assert.deepEqual(ctx.avatar, { renderer: 'talkinghead', avatarModelUrl: 'https://x/a.glb', visemeSet: 'oculus', defaultMood: 'neutral', defaultView: 'upper' });
  assert.deepEqual(ctx.voice, { provider: 'azure', voice: 'en-US-Aria', speed: 1 });
});

test('G10: avatarRef on the stack resolves from resources when there is no identity', async () => {
  const bridge = createJitsiAgentBridge({ now: () => new Date('2026-05-30T12:00:00Z') });
  const run = { metadata: { name: 'dispatch-1' }, spec: {}, status: {} };
  const resources = activeMeetingResources();
  resources.AgentAppearance = [
    createResource('AgentAppearance', { name: 'aria-appearance', namespace: 'kradle-org-default' }, {
      organizationRef: 'default', renderer: 'live2d', avatarModelUrl: 'https://x/live2d.json', visemeSet: 'arkit',
    }),
  ];
  await bridge.prepareMeetingContext(run, 'daily', stack({
    jitsiCapability: true,
    jitsiConfig: { role: 'agent', capabilities: { video: 'publish' }, avatarRef: 'aria-appearance' },
  }), { resources });

  assert.equal(run.spec.meetingContext.avatar.renderer, 'live2d');
  assert.equal(run.spec.meetingContext.avatar.avatarModelUrl, 'https://x/live2d.json');
});

test('G10: a declared avatarRef that cannot be resolved hard-fails (throws, no silent fallback)', async () => {
  const bridge = createJitsiAgentBridge({ now: () => new Date('2026-05-30T12:00:00Z') });
  const run = { metadata: { name: 'dispatch-1' }, spec: {}, status: {} };
  await assert.rejects(
    () => bridge.prepareMeetingContext(run, 'daily', stack({
      jitsiCapability: true,
      jitsiConfig: { role: 'agent', capabilities: { video: 'publish' }, avatarRef: 'ghost-appearance' },
    }), { resources: activeMeetingResources() }),
    /AgentAppearance\/ghost-appearance/,
  );
});

test('G10 regression: audio-only stack yields no avatar key and intact capabilities/role', async () => {
  const bridge = createJitsiAgentBridge({ now: () => new Date('2026-05-30T12:00:00Z') });
  const run = { metadata: { name: 'dispatch-1' }, spec: {}, status: {} };
  await bridge.prepareMeetingContext(run, 'daily', stack({
    jitsiCapability: true,
    jitsiConfig: { role: 'participant', capabilities: { audio: 'listen', chat: 'readwrite' } },
  }), { resources: activeMeetingResources() });

  const ctx = run.spec.meetingContext;
  assert.equal(ctx.avatar, undefined);
  assert.equal(ctx.voice, undefined);
  assert.equal(ctx.video, 'none');
  assert.equal(ctx.role, 'participant');
  assert.deepEqual(ctx.capabilities, { audio: 'listen', chat: 'readwrite' });
});

test('Jitsi agent bridge builds sidecar specs and Agent Adapter injects them only for meeting runs', () => {
  const bridge = createJitsiAgentBridge({
    sidecarImage: 'ghcr.io/a5c-ai/jitsi-agent-sidecar:test',
  });
  const sidecar = bridge.buildSidecarSpec('https://meet.example/daily-default', 'kradle-jitsi.jwt.sig', 'Standup Bot', {
    roomId: 'daily-default',
    role: 'observer',
    capabilities: { audio: 'listen', chat: 'readwrite' },
  });
  assert.equal(sidecar.name, 'jitsi-agent-sidecar');
  assert.equal(sidecar.image, 'ghcr.io/a5c-ai/jitsi-agent-sidecar:test');
  assert.equal(sidecar.env.find((entry) => entry.name === 'JITSI_ROOM_URL').value, 'https://meet.example/daily-default');
  assert.equal(sidecar.env.find((entry) => entry.name === 'JITSI_CHAT_MODE').value, 'readwrite');

  const client = createAgentMuxClient();
  const plainJob = client.createAgentJob({ adapter: 'claude-code', org: 'default' }).jobManifest;
  assert.equal(plainJob.spec.template.spec.containers.length, 1);

  const meetingJob = client.createAgentJob({
    adapter: 'claude-code',
    org: 'default',
    meetingContext: {
      roomUrl: 'https://meet.example/daily-default',
      jwt: 'kradle-jitsi.jwt.sig',
      roomId: 'daily-default',
      participantName: 'Standup Bot',
      role: 'observer',
      capabilities: { audio: 'listen', chat: 'readwrite' },
    },
  }).jobManifest;
  assert.equal(meetingJob.spec.template.spec.containers.length, 2);
  assert.ok(meetingJob.spec.template.spec.containers[0].env.some((entry) => entry.name === 'JITSI_MEETING_ACTIVE' && entry.value === 'true'));
  assert.ok(meetingJob.spec.template.spec.volumes.some((volume) => volume.name === 'agent-socket'));
});
