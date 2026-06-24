// lipsync.js — pure viseme scheduler + AudioContext-clock runtime + audio publish
//              (PoC, SKELETON / no logic yet).
//
// Responsibility (proves gap G4 — lipsync; and the X1 A/V-sync fix):
//   Two cleanly separated parts:
//
//   1) PURE buildVisemeSchedule(visemes, vtimes) — data -> data, no GPU/audio/clock.
//      Mirrors the Azure VisemeReceived shape: `visemes` = viseme ids (Azure 22-set) or
//      morph names; `vtimes` = matching start times in MILLISECONDS (Azure emits AudioOffset
//      in 100ns ticks; callers convert with ticksToMs(ticks) = ticks / 10000). Output is an
//      ordered [{ timeMs, morph, weight }] sorted ascending by timeMs, each viseme mapped to
//      a TalkingHead Oculus-viseme morph via a static VISEME_MAP (documents the ARKit->Oculus
//      retarget approximation, risk X4), with a trailing weight:0 close on the final viseme.
//      This is the deterministic, headless-verifiable CI gate (verify.mjs V1).
//
//   2) LipsyncRunner — the X1 single-clock runtime: holds one shared AudioContext and a
//      MediaStreamAudioDestinationNode, plays an utterance, and schedules each viseme against
//      audioCtx.currentTime (NOT performance.now) so audio + visemes share one clock on one
//      page -> bounded A/V drift. getAudioStream() yields the audio MediaStream to publish into
//      the SAME conference as the video.
//
// Implements nothing yet — exported stubs only.

/**
 * Convert Azure AudioOffset ticks (100ns units) to milliseconds.
 * @param {number} ticks
 * @returns {number} milliseconds
 */
export function ticksToMs(/* ticks */) {
  // TODO(poc): return ticks / 10000.
  throw new Error('lipsync.js: ticksToMs() not implemented (PoC skeleton)');
}

/**
 * PURE: build an ordered viseme schedule from Azure-style viseme ids/morphs and start times.
 *
 * @param {Array<number|string>} visemes   Azure viseme ids (22-set) or TalkingHead morph names.
 * @param {number[]} vtimes                 Matching start times in MILLISECONDS (same length as `visemes`).
 * @param {Object} [opts]                   Reserved (e.g. default weight, hold duration).
 * @returns {Array<{ timeMs: number, morph: string, weight: number }>}  Sorted ascending by timeMs,
 *          with a trailing weight:0 close for the final viseme.
 */
export function buildVisemeSchedule(/* visemes, vtimes, opts */) {
  // TODO(poc): map each viseme via VISEME_MAP, pair with vtimes, sort by timeMs, append weight:0 close.
  throw new Error('lipsync.js: buildVisemeSchedule() not implemented (PoC skeleton)');
}

/**
 * Document the RMS-envelope fallback: when no viseme timing is available, drive a single
 * open-mouth morph from an AnalyserNode's RMS each frame. (Runtime helper; not the pure unit test.)
 *
 * @param {AnalyserNode} [analyserNode]
 * @param {Object} [opts]
 * @returns {{ tick: () => void }}   Per-frame updater. (Stub.)
 */
export function makeRmsFallbackSchedule(/* analyserNode, opts */) {
  // TODO(poc): compute RMS from analyserNode each tick -> avatar.setViseme('aa', rms-derived weight).
  throw new Error('lipsync.js: makeRmsFallbackSchedule() not implemented (PoC skeleton)');
}

/**
 * Runtime that plays an utterance and drives visemes on a single shared audio clock (X1).
 *
 * Construct with { avatar } (the createAvatar() control surface). Holds one AudioContext and
 * a MediaStreamAudioDestinationNode so the published audio and the visemes share one clock.
 */
export class LipsyncRunner {
  /**
   * @param {Object} [opts]
   * @param {Object} [opts.avatar]   createAvatar() surface (needs setViseme).
   */
  constructor(/* opts */) {
    // TODO(poc): create shared AudioContext + MediaStreamAudioDestinationNode (this.audioDest).
    throw new Error('lipsync.js: LipsyncRunner is not implemented (PoC skeleton)');
  }

  /**
   * Play an utterance, scheduling visemes against audioCtx.currentTime (single clock).
   * @param {Object} args
   * @param {AudioBuffer} args.audioBuffer
   * @param {Array<{ timeMs: number, morph: string, weight: number }>} args.schedule
   * @returns {Promise<void>}
   */
  playUtterance(/* args */) {
    // TODO(poc): startAt = audioCtx.currentTime + lead; bufferSource.connect(audioDest).start(startAt);
    //            per-frame ticker compares (audioCtx.currentTime - startAt) to each timeMs/1000 -> setViseme.
    throw new Error('lipsync.js: LipsyncRunner.playUtterance() not implemented (PoC skeleton)');
  }

  /**
   * The audio MediaStream to publish into the SAME conference as the video.
   * @returns {MediaStream}
   */
  getAudioStream() {
    // TODO(poc): return this.audioDest.stream.
    throw new Error('lipsync.js: LipsyncRunner.getAudioStream() not implemented (PoC skeleton)');
  }
}
