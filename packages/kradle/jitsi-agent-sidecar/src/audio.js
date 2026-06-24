// audio.js — capability-gated audio pipeline routed through pluggable providers.
//
// Preserves the EXACT capability-gating contract and the byte-for-byte not-configured /
// VAD-success shapes that tests/runtime.test.js pins with assert.deepEqual. The only additive
// change is a superset `audio` descriptor on the TTS ok:true branch (which is NOT deep-equal
// asserted). Stays node-only: it returns the synthesis DESCRIPTOR; the AudioContext ->
// MediaStreamAudioDestinationNode -> live track lives in the page (puppeteer-jitsi-client.js).

import { createProviderRegistry } from './audio-providers.js';

/**
 * @param {Object} [config]
 * @param {Object} [deps]
 * @param {ReturnType<typeof createProviderRegistry>} [deps.registry]  DI seam for tests.
 */
export function createAudioPipeline(config = {}, deps = {}) {
  const capabilities = config.capabilities || {};
  const audioMode = capabilities.audio || config.audioMode || 'none';
  const ttsProvider = config.tts?.provider || config.ttsProvider || '';
  const sttProvider = config.stt?.provider || config.sttProvider || '';
  const vadProvider = config.vad?.provider || config.vadProvider || 'local-vad';

  const registry = deps.registry || createProviderRegistry();

  const NOT_CONFIGURED_TTS = 'speak_tts requires audio speak capability and a configured TTS provider';
  const NOT_CONFIGURED_STT = 'STT requires listen-capable audio configuration and a configured STT provider';
  const NOT_CONFIGURED_VAD = 'VAD requires listen-capable audio configuration';

  return {
    canSpeak() {
      return (audioMode === 'speak' || audioMode === 'both') && Boolean(ttsProvider);
    },

    canTranscribe() {
      return (audioMode === 'listen' || audioMode === 'both') && Boolean(sttProvider);
    },

    canDetectVoice() {
      return audioMode === 'listen' || audioMode === 'both';
    },

    async speak(text, options = {}) {
      if (!this.canSpeak()) {
        return { ok: false, error: NOT_CONFIGURED_TTS };
      }
      // Unknown provider name is NOT configured — surface the same not-configured error
      // (no silent mock substitution).
      const provider = registry.tts(ttsProvider);
      if (!provider) {
        return { ok: false, error: NOT_CONFIGURED_TTS };
      }
      const voice = options.voice || config.tts?.voice || config.ttsVoice || 'nova';
      const speed = options.speed || config.tts?.speed || config.ttsSpeed;
      const audio = await provider.synthesize(text, { voice, speed });
      // A real-adapter stub returns a structured { ok:false, error } from synthesize; surface it.
      if (audio && audio.ok === false) {
        return { ok: false, error: audio.error };
      }
      // Superset of the historical { ok:true, provider, voice, text } — additive `audio` only.
      return { ok: true, provider: ttsProvider, voice, text, audio };
    },

    transcribe(chunk, options = {}) {
      if (!this.canTranscribe()) {
        return { ok: false, error: NOT_CONFIGURED_STT };
      }
      const provider = registry.stt(sttProvider);
      if (!provider) {
        return { ok: false, error: NOT_CONFIGURED_STT };
      }
      return provider.transcribe(chunk, options);
    },

    detectVoice(chunk, options = {}) {
      if (!this.canDetectVoice()) {
        return { ok: false, error: NOT_CONFIGURED_VAD };
      }
      const provider = registry.vad(vadProvider);
      if (!provider) {
        return { ok: false, error: NOT_CONFIGURED_VAD };
      }
      return provider.detect(chunk, options);
    },
  };
}
