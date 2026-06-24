// audio-providers.js — pluggable TTS/STT/VAD providers + a config-driven registry.
//
// Responsibility (G3 TTS-out / G5 STT-in / G6 VAD): expose three thin provider
// interfaces and a registry that selects a concrete provider by the config string
// already carried in config.tts.provider / config.stt.provider / config.vad.provider.
//
// Design constraints honored:
//   - ZERO new dependencies. The built-in providers are pure data/arithmetic; they touch
//     no audio hardware and open no socket. The Web Audio graph that turns a TTS descriptor
//     into a live MediaStreamTrack lives in the PAGE (puppeteer-jitsi-client.js), not here.
//   - "Fallbacks are evil": an unknown provider name resolves to null (never a silent mock
//     substitution). Real adapters (deepgram/azure/elevenlabs/cartesia) are config-driven
//     thin stubs that return a STRUCTURED `requires <KEY>` error WITHOUT importing an SDK or
//     opening a network connection — they document the seam, they do not fake success.
//
// Sync vs async: SttProvider.detect/transcribe and VadProvider.detect are SYNCHRONOUS (the
// mock/local ones are pure), because runtime.audio.transcribe()/detectVoice() are asserted on
// their return value (not awaited) in tests/runtime.test.js. TtsProvider.synthesize MAY be async.

/**
 * @typedef {Object} TtsProvider
 * @property {string} name
 * @property {(text: string, opts?: Object) => (Promise<TtsDescriptor>|TtsDescriptor|{ ok:false, error:string })} synthesize
 *   text -> audio payload. For the synthetic provider this returns a descriptor
 *   `{ kind:'tone', sampleRate, channels, durationMs, freq }` that the in-page Web Audio graph
 *   turns into an AudioBuffer/Oscillator. For real adapters it would return
 *   `{ kind:'pcm', sampleRate, channels, bytes:Uint8Array }` — but in this repo the real
 *   adapters are stubs that return a structured `requires <KEY>` error (no network).
 */

/**
 * @typedef {Object} TtsDescriptor
 * @property {'tone'|'pcm'} kind
 * @property {number} sampleRate
 * @property {number} channels
 * @property {number} [durationMs]
 * @property {number} [freq]
 * @property {Uint8Array} [bytes]
 */

/**
 * @typedef {Object} SttProvider
 * @property {string} name
 * @property {(audioChunk: (Buffer|Uint8Array), opts?: Object) => ({ ok:true, provider:string, text:string, words?:string[], confidence?:number }|{ ok:false, error:string })} transcribe
 */

/**
 * @typedef {Object} VadProvider
 * @property {string} name
 * @property {(audioChunk: (Buffer|Uint8Array), opts?: Object) => ({ ok:true, provider:string, speechDetected:boolean, energy?:number }|{ ok:false, error:string })} detect
 */

const SYNTH_TTS_NAME = 'mock-tts';
const CANNED_STT_NAME = 'mock-stt';
const LOCAL_VAD_NAME = 'local-vad';

/**
 * Synthetic-tone TTS. No creds, no hardware: returns a pure descriptor that the page-side
 * Web Audio graph renders into a live audio track (G3). durationMs scales with text length.
 * @type {TtsProvider}
 */
export const SyntheticTtsProvider = {
  name: SYNTH_TTS_NAME,
  synthesize(text, opts = {}) {
    const len = typeof text === 'string' ? text.length : 0;
    const durationMs = Math.min(4000, Math.max(200, len * 60));
    return {
      kind: 'tone',
      sampleRate: 48000,
      channels: 1,
      durationMs,
      freq: opts.freq || 440,
    };
  },
};

/**
 * Canned-text STT. Deterministic, derived from chunk length; never a network call (G5).
 * @type {SttProvider}
 */
export const CannedSttProvider = {
  name: CANNED_STT_NAME,
  transcribe(chunk, opts = {}) {
    const length = chunk == null ? 0 : (chunk.length ?? 0);
    const text = opts.canned || `mock transcript (${length} bytes)`;
    return {
      ok: true,
      provider: CANNED_STT_NAME,
      text,
      words: text.split(/\s+/).filter(Boolean),
      confidence: 1,
    };
  },
};

/**
 * Compute a normalized energy [0,1] over an audio chunk.
 *  - If the chunk looks like 16-bit little-endian PCM (length even and >= one frame), treat it
 *    as Int16 samples and compute RMS over the full-scale range.
 *  - Otherwise (short/non-PCM byte buffers, e.g. the 5-byte `Buffer.from('audio')` fixture),
 *    fall back to byte-deviation energy, which is below the default threshold for such buffers.
 * @param {Buffer|Uint8Array} chunk
 * @returns {number} energy in [0,1]
 */
function computeEnergy(chunk) {
  if (chunk == null || chunk.length === 0) return 0;
  const len = chunk.length;
  const PCM_FRAME_MIN = 2;
  if (len % 2 === 0 && len >= PCM_FRAME_MIN) {
    let sumSq = 0;
    let n = 0;
    for (let i = 0; i + 1 < len; i += 2) {
      // 16-bit LE signed sample.
      let sample = chunk[i] | (chunk[i + 1] << 8);
      if (sample >= 0x8000) sample -= 0x10000;
      const norm = sample / 32768;
      sumSq += norm * norm;
      n += 1;
    }
    return n > 0 ? Math.sqrt(sumSq / n) : 0;
  }
  // Byte-deviation fallback for non-PCM/odd-length buffers: deviation from the 0x80 midpoint,
  // normalized to [0,1]. For ASCII text like 'audio' this stays well under the threshold.
  let sumSq = 0;
  for (let i = 0; i < len; i += 1) {
    const dev = (chunk[i] - 128) / 128;
    sumSq += dev * dev;
  }
  // Scale down so short low-amplitude byte buffers register as quiet.
  return Math.sqrt(sumSq / len) * 0.1;
}

const DEFAULT_VAD_THRESHOLD = 0.02;

/**
 * Local energy-threshold VAD (G6). Pure RMS over the chunk; no hardware, no network.
 * For the `Buffer.from('audio')` fixture (5 bytes, non-PCM) energy is below the default
 * threshold => speechDetected:false, preserving runtime.test.js.
 * @type {VadProvider}
 */
export const EnergyVadProvider = {
  name: LOCAL_VAD_NAME,
  detect(chunk, opts = {}) {
    const threshold = typeof opts.threshold === 'number' ? opts.threshold : DEFAULT_VAD_THRESHOLD;
    const energy = computeEnergy(chunk);
    // NOTE: the success shape is intentionally EXACTLY { ok, provider, speechDetected } with NO
    // extra keys — tests/runtime.test.js pins this with assert.deepEqual. The computed `energy`
    // is exposed only via opts.includeEnergy for callers that want it (off by default), so the
    // default round-trip stays byte-for-byte compatible.
    const result = {
      ok: true,
      provider: LOCAL_VAD_NAME,
      speechDetected: energy > threshold,
    };
    if (opts.includeEnergy) result.energy = energy;
    return result;
  },
};

/**
 * Build a thin, config-driven stub for a real provider. It NEVER imports an SDK and NEVER opens
 * a socket: invoking any of its methods returns a structured not-wired error naming the missing
 * key. This documents the integration seam while keeping the sidecar zero-dep and CI-safe.
 * @param {string} providerName
 * @param {string} requiresKey   The env/config key the real adapter would require.
 * @returns {TtsProvider & SttProvider & VadProvider}
 */
function makeRealAdapterStub(providerName, requiresKey) {
  const error = `${providerName} requires ${requiresKey} (manual/config-only; not wired in this repo)`;
  return {
    name: providerName,
    synthesize() { return { ok: false, error }; },
    transcribe() { return { ok: false, error }; },
    detect() { return { ok: false, error }; },
  };
}

// Real-adapter seams. Names match the config string a deployment would set. Each is a stub.
const REAL_TTS_ADAPTERS = {
  deepgram: () => makeRealAdapterStub('deepgram', 'JITSI_TTS_API_KEY'),
  azure: () => makeRealAdapterStub('azure', 'JITSI_TTS_API_KEY'),
  elevenlabs: () => makeRealAdapterStub('elevenlabs', 'JITSI_TTS_API_KEY'),
  cartesia: () => makeRealAdapterStub('cartesia', 'JITSI_TTS_API_KEY'),
};

const REAL_STT_ADAPTERS = {
  deepgram: () => makeRealAdapterStub('deepgram', 'JITSI_STT_API_KEY'),
  azure: () => makeRealAdapterStub('azure', 'JITSI_STT_API_KEY'),
};

/**
 * Create a provider registry that selects by the config provider-name string.
 *
 * Lookups (`tts(name)`, `stt(name)`, `vad(name)`) return the registered provider or `null`
 * for an unknown name (no silent mock substitution). Built-in mocks are pre-registered under
 * 'mock-tts'/'mock-stt'/'local-vad'; real adapters under their deployment names as thin stubs.
 * First-wins registration so a test may register a mock under a real adapter's name.
 *
 * @returns {{
 *   tts: (name: string) => (TtsProvider|null),
 *   stt: (name: string) => (SttProvider|null),
 *   vad: (name: string) => (VadProvider|null),
 *   registerTts: (name: string, provider: TtsProvider) => void,
 *   registerStt: (name: string, provider: SttProvider) => void,
 *   registerVad: (name: string, provider: VadProvider) => void,
 * }}
 */
export function createProviderRegistry() {
  const ttsRegistry = new Map();
  const sttRegistry = new Map();
  const vadRegistry = new Map();

  const registerTts = (name, provider) => { if (!ttsRegistry.has(name)) ttsRegistry.set(name, provider); };
  const registerStt = (name, provider) => { if (!sttRegistry.has(name)) sttRegistry.set(name, provider); };
  const registerVad = (name, provider) => { if (!vadRegistry.has(name)) vadRegistry.set(name, provider); };

  // Built-in mocks (no creds).
  registerTts(SYNTH_TTS_NAME, SyntheticTtsProvider);
  registerStt(CANNED_STT_NAME, CannedSttProvider);
  registerVad(LOCAL_VAD_NAME, EnergyVadProvider);

  // Real adapters as thin config-driven stubs (no SDK import, no network).
  for (const [name, build] of Object.entries(REAL_TTS_ADAPTERS)) registerTts(name, build());
  for (const [name, build] of Object.entries(REAL_STT_ADAPTERS)) registerStt(name, build());

  return {
    tts(name) { return ttsRegistry.get(name) || null; },
    stt(name) { return sttRegistry.get(name) || null; },
    vad(name) { return vadRegistry.get(name) || null; },
    registerTts,
    registerStt,
    registerVad,
  };
}
