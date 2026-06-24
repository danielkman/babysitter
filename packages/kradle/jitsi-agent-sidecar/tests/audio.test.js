import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAudioPipeline } from '../src/audio.js';
import {
  createProviderRegistry,
  SyntheticTtsProvider,
  CannedSttProvider,
  EnergyVadProvider,
} from '../src/audio-providers.js';

// A loud 16-bit PCM chunk: 200 frames near full-scale -> energy above the VAD threshold.
function loudPcmChunk(frames = 200, amplitude = 30000) {
  const buf = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i += 1) {
    const sample = i % 2 === 0 ? amplitude : -amplitude;
    buf.writeInt16LE(sample, i * 2);
  }
  return buf;
}

// A quiet 16-bit PCM chunk: all zeros -> energy below the threshold.
function quietPcmChunk(frames = 200) {
  return Buffer.alloc(frames * 2);
}

describe('audio-providers registry selection', () => {
  it('returns the built-in mocks for their registered names', () => {
    const reg = createProviderRegistry();
    assert.equal(reg.tts('mock-tts'), SyntheticTtsProvider);
    assert.equal(reg.stt('mock-stt'), CannedSttProvider);
    assert.equal(reg.vad('local-vad'), EnergyVadProvider);
  });

  it('returns null for an unknown provider name (no silent mock substitution)', () => {
    const reg = createProviderRegistry();
    assert.equal(reg.tts('nope'), null);
    assert.equal(reg.stt('nope'), null);
    assert.equal(reg.vad('nope'), null);
  });

  it('real adapters are config-driven stubs returning a structured requires error (no SDK/network)', () => {
    const reg = createProviderRegistry();
    const dg = reg.tts('deepgram');
    assert.ok(dg, 'deepgram tts stub registered');
    const r = dg.synthesize('hello');
    assert.equal(r.ok, false);
    assert.match(r.error, /deepgram requires JITSI_TTS_API_KEY/);
    assert.match(r.error, /not wired in this repo/);

    const dgStt = reg.stt('deepgram');
    const rs = dgStt.transcribe(Buffer.from('x'));
    assert.equal(rs.ok, false);
    assert.match(rs.error, /deepgram requires JITSI_STT_API_KEY/);

    const az = reg.tts('azure');
    assert.match(az.synthesize('x').error, /azure requires/);
  });

  it('first-wins registration lets a test register a mock under a real adapter name', () => {
    const reg = createProviderRegistry();
    const fake = { name: 'deepgram', synthesize: () => ({ kind: 'tone' }) };
    reg.registerTts('deepgram', fake); // built-in stub already registered -> first wins
    assert.notEqual(reg.tts('deepgram'), fake);
    // But a brand-new name registers cleanly.
    reg.registerTts('fresh', fake);
    assert.equal(reg.tts('fresh'), fake);
  });
});

describe('audio pipeline gating OFF -> exact structured errors', () => {
  it('audio:none reproduces all three not-configured errors verbatim', () => {
    const pipe = createAudioPipeline({ capabilities: { audio: 'none' } });
    assert.equal(pipe.canSpeak(), false);
    assert.equal(pipe.canTranscribe(), false);
    assert.equal(pipe.canDetectVoice(), false);
  });

  it('speak/transcribe/detectVoice return the exact structured errors when gated off', async () => {
    const pipe = createAudioPipeline({ capabilities: { audio: 'none' } });
    assert.deepEqual(await pipe.speak('hi'), {
      ok: false,
      error: 'speak_tts requires audio speak capability and a configured TTS provider',
    });
    assert.deepEqual(pipe.transcribe(Buffer.from('audio')), {
      ok: false,
      error: 'STT requires listen-capable audio configuration and a configured STT provider',
    });
    assert.deepEqual(pipe.detectVoice(Buffer.from('audio')), {
      ok: false,
      error: 'VAD requires listen-capable audio configuration',
    });
  });

  it('audio:listen with no STT provider -> STT not configured (deep-equal pin)', () => {
    const pipe = createAudioPipeline({ capabilities: { audio: 'listen' } });
    assert.equal(pipe.canTranscribe(), false);
    assert.deepEqual(pipe.transcribe(Buffer.from('audio')), {
      ok: false,
      error: 'STT requires listen-capable audio configuration and a configured STT provider',
    });
    // VAD defaults to local-vad and is listen-capable; the 5-byte fixture is below threshold.
    assert.deepEqual(pipe.detectVoice(Buffer.from('audio')), {
      ok: true,
      provider: 'local-vad',
      speechDetected: false,
    });
  });

  it('unknown configured TTS provider surfaces the same not-configured error (no fallback)', async () => {
    const pipe = createAudioPipeline({ capabilities: { audio: 'both' }, tts: { provider: 'ghost' } });
    assert.equal(pipe.canSpeak(), true); // capability + provider string present
    assert.deepEqual(await pipe.speak('hi'), {
      ok: false,
      error: 'speak_tts requires audio speak capability and a configured TTS provider',
    });
  });
});

describe('audio pipeline gating ON + mock -> success', () => {
  const config = {
    capabilities: { audio: 'both' },
    tts: { provider: 'mock-tts', voice: 'nova' },
    stt: { provider: 'mock-stt' },
    vad: { provider: 'local-vad' },
  };

  it('speak() returns ok:true with a superset audio descriptor', async () => {
    const pipe = createAudioPipeline(config);
    const r = await pipe.speak('hello world');
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'mock-tts');
    assert.equal(r.voice, 'nova');
    assert.equal(r.text, 'hello world');
    assert.ok(r.audio, 'audio descriptor present');
    assert.equal(r.audio.kind, 'tone');
    assert.equal(r.audio.sampleRate, 48000);
    assert.ok(r.audio.durationMs >= 200 && r.audio.durationMs <= 4000);
  });

  it('transcribe() returns ok:true with canned text', () => {
    const pipe = createAudioPipeline(config);
    const r = pipe.transcribe(Buffer.from('some-audio-bytes'));
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'mock-stt');
    assert.equal(typeof r.text, 'string');
    assert.ok(r.text.length > 0);
  });

  it('detectVoice() detects loud PCM as speech and quiet/short buffers as silence', () => {
    const pipe = createAudioPipeline(config);
    assert.deepEqual(pipe.detectVoice(loudPcmChunk()), {
      ok: true,
      provider: 'local-vad',
      speechDetected: true,
    });
    assert.deepEqual(pipe.detectVoice(quietPcmChunk()), {
      ok: true,
      provider: 'local-vad',
      speechDetected: false,
    });
    assert.deepEqual(pipe.detectVoice(Buffer.from('audio')), {
      ok: true,
      provider: 'local-vad',
      speechDetected: false,
    });
  });
});

describe('mock STT/VAD round-trips', () => {
  it('energy VAD boundary: silence/quiet false, loud true', () => {
    assert.equal(EnergyVadProvider.detect(quietPcmChunk()).speechDetected, false);
    assert.equal(EnergyVadProvider.detect(loudPcmChunk()).speechDetected, true);
    // includeEnergy opt exposes the computed energy without affecting the default shape.
    const withEnergy = EnergyVadProvider.detect(loudPcmChunk(), { includeEnergy: true });
    assert.equal(typeof withEnergy.energy, 'number');
    assert.ok(withEnergy.energy > 0);
  });

  it('canned STT text is deterministic for a given chunk', () => {
    const a = CannedSttProvider.transcribe(Buffer.from('abcd'));
    const b = CannedSttProvider.transcribe(Buffer.from('abcd'));
    assert.deepEqual(a, b);
    assert.equal(a.provider, 'mock-stt');
  });

  it('DI seam: createAudioPipeline accepts a custom registry', async () => {
    const reg = createProviderRegistry();
    const pipe = createAudioPipeline(
      { capabilities: { audio: 'speak' }, tts: { provider: 'mock-tts' } },
      { registry: reg },
    );
    const r = await pipe.speak('x');
    assert.equal(r.ok, true);
    assert.equal(r.audio.kind, 'tone');
  });
});
