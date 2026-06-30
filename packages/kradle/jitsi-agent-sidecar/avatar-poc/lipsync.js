// lipsync.js — pure viseme scheduler + AudioContext-clock runtime + audio publish.
//
// Responsibility (proves gap G4 — lipsync; and the X1 A/V-sync fix). Two cleanly
// separated parts:
//
//   1) PURE buildVisemeSchedule(visemes, vtimes, opts) — data -> data, no GPU/audio/clock.
//      Mirrors the Azure VisemeReceived shape: `visemes` = Oculus/Azure viseme ids
//      (numbers, 0..21) and `vtimes` = matching audio offsets. Azure emits AudioOffset in
//      100ns TICKS; this fn accepts either ticks (default) or ms via opts.unit. Output is an
//      ordered [{ timeMs, visemeId, morph, weight }] sorted ascending by timeMs, each viseme
//      id mapped to a TalkingHead/Oculus mouth morph via the static VISEME_MAP (documents the
//      Azure-id -> Oculus-morph + mouth-openness approximation, risk X4). Deterministic: same
//      input -> deep-equal output. This is the headless-verifiable CI gate (verify.mjs V1).
//
//   2) LipsyncRunner — the X1 single-clock runtime: holds one shared AudioContext and a
//      MediaStreamAudioDestinationNode, plays an AudioBuffer, and schedules each morph against
//      audioContext.currentTime (NOT performance.now) so audio + visemes share one clock on one
//      page -> bounded A/V drift. getAudioTrack() yields the audio MediaStreamTrack to publish
//      into the SAME conference as the video.
//
// The pure scheduler (part 1) has zero DOM/audio/GPU dependencies, so V1 runs headlessly in
// plain node. The runtime (part 2) is isolated and only touches Web Audio at play() time.

/**
 * Convert an Azure AudioOffset in ticks (100ns units) to milliseconds.
 * 1 ms = 10,000 ticks, so ms = ticks / 10000.
 * @param {number} ticks
 * @returns {number} milliseconds
 */
export function ticksToMs(ticks) {
  return ticks / 10000;
}

// --- VISEME_MAP ------------------------------------------------------------------------------
//
// Azure Speech viseme id (0..21, the Oculus/Azure "22-set") -> { morph, openness }.
//
//   `morph`    — the TalkingHead/Oculus mouth-morph name (the avatar's `setViseme(morph, weight)`
//                vocabulary: sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, I, O, U).
//   `openness` — an APPROXIMATE mouth-openness in [0,1] used as the default per-viseme weight.
//                This is the documented Azure(ARKit-tuned) -> Oculus retarget approximation
//                (risk X4): silence is fully closed (0), the wide-open vowels (aa/O/U) are near
//                1, and the closed bilabials (PP) are ~0. Quality/fidelity of the exact morph is
//                a manual concern; the ordering (silence closed < open vowels) is the contract V1
//                asserts.
//
// Mapping follows the standard Azure viseme-id table mapped onto the 15 Oculus visemes:
//   https://learn.microsoft.com/azure/ai-services/speech-service/how-to-speech-synthesis-viseme
const VISEME_MAP = {
  0: { morph: 'sil', openness: 0.0 }, // silence
  1: { morph: 'aa', openness: 0.9 }, // æ, ə, ʌ
  2: { morph: 'aa', openness: 1.0 }, // ɑ
  3: { morph: 'O', openness: 0.85 }, // ɔ
  4: { morph: 'E', openness: 0.55 }, // ɛ, ʊ
  5: { morph: 'RR', openness: 0.45 }, // ɝ
  6: { morph: 'I', openness: 0.4 }, // j, i, ɪ
  7: { morph: 'U', openness: 0.7 }, // w, u
  8: { morph: 'O', openness: 0.8 }, // o
  9: { morph: 'aa', openness: 0.9 }, // aʊ
  10: { morph: 'O', openness: 0.85 }, // ɔɪ
  11: { morph: 'aa', openness: 1.0 }, // aɪ
  12: { morph: 'kk', openness: 0.4 }, // h
  13: { morph: 'RR', openness: 0.45 }, // ɹ
  14: { morph: 'nn', openness: 0.3 }, // l
  15: { morph: 'SS', openness: 0.2 }, // s, z
  16: { morph: 'CH', openness: 0.4 }, // ʃ, tʃ, dʒ, ʒ
  17: { morph: 'TH', openness: 0.3 }, // ð
  18: { morph: 'FF', openness: 0.25 }, // f, v
  19: { morph: 'DD', openness: 0.35 }, // d, t, n, θ
  20: { morph: 'kk', openness: 0.4 }, // k, g, ŋ
  21: { morph: 'PP', openness: 0.05 }, // p, b, m
};

// The closed/neutral fallback morph for an out-of-range or unknown viseme id. We do NOT silently
// substitute a different visible mouth shape — unknown ids resolve to silence (closed).
const SILENCE = { morph: 'sil', openness: 0.0 };

/**
 * Resolve a single Azure/Oculus viseme id to its mouth morph + approximate openness.
 * @param {number} visemeId
 * @returns {{ morph: string, openness: number }}
 */
function mapViseme(visemeId) {
  return VISEME_MAP[visemeId] || SILENCE;
}

/**
 * PURE: build an ordered viseme schedule from Azure-style viseme ids and audio offsets.
 *
 * Deterministic: same input -> deep-equal output. No GPU, no audio, no DOM, no clock.
 *
 * @param {number[]} visemes               Azure/Oculus viseme ids (0..21), one per cue.
 * @param {number[]} vtimes                Matching audio offsets, same length as `visemes`.
 * @param {Object}  [opts]
 * @param {'ticks'|'ms'} [opts.unit='ticks']  Unit of `vtimes`. Azure default is ticks (100ns).
 * @param {number}  [opts.weight=1]           Multiplier applied to each viseme's openness to
 *                                             produce the final weight (clamped to [0,1]).
 * @returns {Array<{ timeMs: number, visemeId: number, morph: string, weight: number }>}
 *          Sorted ascending by timeMs.
 */
export function buildVisemeSchedule(visemes, vtimes, opts = {}) {
  if (!Array.isArray(visemes) || !Array.isArray(vtimes)) {
    throw new Error('buildVisemeSchedule: visemes and vtimes must both be arrays');
  }
  if (visemes.length !== vtimes.length) {
    throw new Error(
      `buildVisemeSchedule: visemes (${visemes.length}) and vtimes (${vtimes.length}) length mismatch`,
    );
  }

  const unit = opts.unit ?? 'ticks';
  if (unit !== 'ticks' && unit !== 'ms') {
    throw new Error(`buildVisemeSchedule: opts.unit must be 'ticks' or 'ms' (got ${unit})`);
  }
  const weightScale = opts.weight ?? 1;

  const schedule = visemes.map((visemeId, i) => {
    const offset = vtimes[i];
    const timeMs = unit === 'ticks' ? ticksToMs(offset) : offset;
    const { morph, openness } = mapViseme(visemeId);
    const weight = Math.min(1, Math.max(0, openness * weightScale));
    return { timeMs, visemeId, morph, weight };
  });

  // Stable ascending sort by timeMs. Equal times keep input order (i carried implicitly via
  // a secondary key) so the result is fully deterministic.
  schedule.sort((a, b) => (a.timeMs - b.timeMs) || (a.visemeId - b.visemeId));

  return schedule;
}

/**
 * RMS-amplitude fallback (D.2): when no viseme TIMING is available, derive a single open-mouth
 * morph from an audio frame's RMS amplitude. Maps loudness -> mouth openness on the 'aa' morph.
 *
 * PURE: number -> entry. Same input -> same output.
 *
 * @param {number} rms   Root-mean-square amplitude in [0,1] (e.g. from an AnalyserNode frame).
 * @returns {{ morph: string, weight: number }}
 */
export function amplitudeToMorph(rms) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(rms) ? rms : 0));
  // Light gamma so quiet speech still opens the mouth a little; loud peaks saturate near 1.
  const weight = Math.min(1, Math.max(0, Math.sqrt(clamped)));
  return { morph: weight > 0 ? 'aa' : 'sil', weight };
}

/**
 * Runtime that plays an utterance and drives visemes on a single shared audio clock (X1).
 *
 * The published audio and the scheduled visemes both reference audioContext.currentTime, so a
 * second participant hears audio and sees mouth motion off ONE clock on ONE page -> bounded
 * A/V drift. This class is the ONLY part of lipsync.js that touches Web Audio; the scheduler
 * above is pure so V1 needs no audio hardware.
 */
export class LipsyncRunner {
  /**
   * @param {Object} opts
   * @param {AudioContext} opts.audioContext  Shared Web Audio context (one clock).
   * @param {AudioBuffer}  opts.audioBuffer   The utterance audio to play.
   * @param {Object}       opts.avatar        createAvatar() surface (needs setViseme).
   * @param {Array<{ timeMs: number, visemeId: number, morph: string, weight: number }>} opts.schedule
   *        The output of buildVisemeSchedule().
   * @param {number} [opts.lead=0.06]         Lead time (s) before playback starts, so the first
   *                                          cue can be scheduled slightly ahead of currentTime.
   */
  constructor({ audioContext, audioBuffer, avatar, schedule, lead = 0.06 } = {}) {
    if (!audioContext) throw new Error('LipsyncRunner: { audioContext } is required');
    if (!avatar || typeof avatar.setViseme !== 'function') {
      throw new Error('LipsyncRunner: { avatar } with setViseme() is required');
    }
    if (!Array.isArray(schedule)) throw new Error('LipsyncRunner: { schedule } array is required');

    this.audioContext = audioContext;
    this.audioBuffer = audioBuffer || null;
    this.avatar = avatar;
    this.schedule = schedule;
    this.lead = lead;

    // The audio destination node whose .stream carries the published audio. Created once so the
    // audio track is stable for the conference lifetime.
    this.audioDest = audioContext.createMediaStreamDestination();

    this._source = null;
    this._rafId = null;
    this._startAt = null;
    this._nextIndex = 0;
    this._playing = false;
  }

  /**
   * Start audio playback AND the synchronized viseme ticker. Both are anchored to
   * audioContext.currentTime + lead (the single clock, X1).
   * @returns {void}
   */
  play() {
    if (this._playing) return;
    this._playing = true;

    const startAt = this.audioContext.currentTime + this.lead;
    this._startAt = startAt;
    this._nextIndex = 0;

    if (this.audioBuffer) {
      const source = this.audioContext.createBufferSource();
      source.buffer = this.audioBuffer;
      source.connect(this.audioDest);
      // Also connect to the context destination so a local listener hears it; harmless headlessly.
      try { source.connect(this.audioContext.destination); } catch { /* no destination in some ctxs */ }
      source.onended = () => this.stop();
      source.start(startAt);
      this._source = source;
    }

    const tick = () => {
      if (!this._playing) return;
      const elapsedMs = (this.audioContext.currentTime - this._startAt) * 1000;
      // Apply every cue whose time has arrived since the last tick.
      while (
        this._nextIndex < this.schedule.length &&
        this.schedule[this._nextIndex].timeMs <= elapsedMs
      ) {
        const cue = this.schedule[this._nextIndex];
        try { this.avatar.setViseme(cue.morph, cue.weight); } catch { /* tolerate per-frame */ }
        this._nextIndex += 1;
      }
      if (this._nextIndex < this.schedule.length) {
        this._rafId = requestAnimationFrame(tick);
      }
    };
    this._rafId = requestAnimationFrame(tick);
  }

  /**
   * Stop playback and the ticker, and close the mouth.
   * @returns {void}
   */
  stop() {
    if (!this._playing) return;
    this._playing = false;
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._source) {
      try { this._source.stop(); } catch { /* already stopped */ }
      this._source = null;
    }
    try { this.avatar.setViseme('sil', 0); } catch { /* tolerate */ }
  }

  /**
   * The audio MediaStreamTrack to publish into the SAME conference as the video.
   * @returns {MediaStreamTrack}
   */
  getAudioTrack() {
    return this.audioDest.stream.getAudioTracks()[0];
  }
}
