export function loadConfig(env = process.env) {
  return {
    roomUrl: env.JITSI_ROOM_URL || '',
    jwt: env.JITSI_JWT || '',
    roomId: env.JITSI_ROOM_ID || '',
    participantName: env.JITSI_PARTICIPANT_NAME || 'Kradle Agent',
    role: env.JITSI_PARTICIPANT_ROLE || 'observer',
    goodbyeMessage: env.JITSI_GOODBYE_MESSAGE || 'Kradle agent is leaving the meeting.',
    socketPath: env.AGENT_SOCKET_PATH || '/tmp/jitsi-agent.sock',
    capabilities: {
      audio: env.JITSI_AUDIO_MODE || 'none',
      chat: env.JITSI_CHAT_MODE || 'read',
      screenshare: env.JITSI_SCREENSHARE_MODE || 'none',
    },
    tts: {
      provider: env.JITSI_TTS_PROVIDER || '',
      voice: env.JITSI_TTS_VOICE || 'nova',
      speed: env.JITSI_TTS_SPEED || '1.0',
    },
    stt: {
      provider: env.JITSI_STT_PROVIDER || '',
    },
    videoMode: env.JITSI_VIDEO_MODE || 'none',
    avatar: {
      renderer: env.JITSI_AVATAR_RENDERER || '',
      modelUrl: env.JITSI_AVATAR_MODEL_URL || '',
      visemeSet: env.JITSI_AVATAR_VISEME_SET || '',
      defaultMood: env.JITSI_AVATAR_DEFAULT_MOOD || 'neutral',
      defaultView: env.JITSI_AVATAR_DEFAULT_VIEW || 'upper',
    },
    vad: {
      provider: env.JITSI_VAD_PROVIDER || 'local-vad',
    },
    headless: env.JITSI_HEADLESS !== 'false',
    chromiumExecutablePath: env.PUPPETEER_EXECUTABLE_PATH || env.CHROMIUM_PATH || '',
  };
}
