// publish-effect.js — lib-jitsi-meet stream effect + conference attach helper (PoC).
//
// Responsibility (proves gap G2 — publish a generated video track):
//   Provide a plain-JS object conforming to lib-jitsi-meet's stream-effect interface
//   (the JitsiStreamPresenterEffect shape: isEnabled / startEffect / stopEffect) that
//   turns the composited #out canvas into a MediaStream via canvas.captureStream(fps).
//   startEffect(stream) returns the captured MediaStream — the contract that
//   JitsiLocalTrack.setEffect() expects.
//
//   Also provide attachToConference(): the idiomatic LJM path that finds the local video
//   track on window.APP.conference and calls localVideoTrack.setEffect(effect). A
//   documented (manual-only, NOT auto-selected) replaceTrack() variant is noted for the
//   X6 setEffect-reliability risk.
//
//   This module deliberately does NOT import lib-jitsi-meet — on the joined Jitsi page LJM
//   is already present as window.APP / JitsiMeetJS. The effect is plain JS conforming to the
//   interface, so its shape is unit-checkable (verify.mjs V3) without LJM loaded.

/**
 * Create a canvas->MediaStream publish effect conforming to the LJM stream-effect shape.
 *
 * Mirrors lib-jitsi-meet's JitsiStreamPresenterEffect contract exactly:
 *   - isEnabled(sourceLocalTrack): only video tracks may carry this effect.
 *   - startEffect(stream):         returns canvas.captureStream(fps) — a MediaStream whose
 *                                  single video track is the composited output. LJM takes the
 *                                  returned stream's video track and publishes it in place of
 *                                  the source track.
 *   - stopEffect():                stops the captured stream's tracks and clears state.
 *
 * @param {Object} opts
 * @param {HTMLCanvasElement} opts.canvas   The #out canvas to capture.
 * @param {number} [opts.fps=25]            Capture frame rate (fps:0 + requestFrame() for manual cadence).
 * @returns {{
 *   isEnabled: (sourceLocalTrack: any) => boolean,
 *   startEffect: (stream: MediaStream) => MediaStream,
 *   stopEffect: () => void,
 * }}
 */
export function createCanvasPublishEffect({ canvas, fps = 25 } = {}) {
  if (!canvas || typeof canvas.captureStream !== 'function') {
    throw new Error('publish-effect.js: createCanvasPublishEffect() requires a canvas with captureStream()');
  }

  let outputStream = null;

  return {
    /**
     * LJM calls isEnabled(sourceLocalTrack) to decide whether the effect may apply to a track.
     * This effect produces a video MediaStream, so it is only enabled for video source tracks.
     *
     * The source track may arrive in several shapes depending on the LJM version / call site:
     *   - a JitsiLocalTrack       → has getType() returning 'video'
     *   - a raw MediaStreamTrack  → has .kind === 'video'
     * We accept either, matching the JitsiStreamPresenterEffect tolerance.
     */
    isEnabled(sourceLocalTrack) {
      if (!sourceLocalTrack) return false;
      if (typeof sourceLocalTrack.getType === 'function') {
        return sourceLocalTrack.getType() === 'video';
      }
      if (typeof sourceLocalTrack.kind === 'string') {
        return sourceLocalTrack.kind === 'video';
      }
      return false;
    },

    /**
     * Start the effect. LJM passes the original source MediaStream and expects a NEW
     * MediaStream back whose video track replaces the source's. We ignore the incoming
     * stream (the composited canvas is the source of truth) and return the canvas capture.
     *
     * @param {MediaStream} _stream  The original source stream (unused here).
     * @returns {MediaStream}        canvas.captureStream(fps) — live composited video.
     */
    startEffect(_stream) {
      outputStream = canvas.captureStream(fps);
      return outputStream;
    },

    /**
     * Stop the effect: stop every track of the captured stream so the camera light /
     * encoder shuts down cleanly, then clear state. Idempotent.
     */
    stopEffect() {
      if (outputStream) {
        for (const track of outputStream.getTracks()) {
          track.stop();
        }
        outputStream = null;
      }
    },
  };
}

/**
 * Attach a CanvasPublishEffect to the local video track of a live Jitsi conference.
 *
 * Idiomatic LJM path: localVideoTrack.setEffect(effect). This is the MANUAL live-Jitsi step —
 * there is no live conference in the headless PoC harness, so this function no-ops gracefully
 * when window.APP.conference is absent (returns { attached: false, reason }).
 *
 * --- replaceTrack() fallback (DOCUMENTED, NOT auto-selected) ----------------------------------
 * LJM's setEffect() has known reliability caveats (risk X6): reported multi-second / ~20s delays
 * before the effected track goes live, and failures when the local track's "old" track is null
 * (e.g. when video was never started, or after a prior unmute race). If setEffect proves
 * unreliable in a given deployment, the manual fallback is:
 *
 *     const newStream = canvas.captureStream(fps);
 *     const newTrack  = await JitsiMeetJS.createLocalTracksFromMediaStreams([
 *       { stream: newStream, sourceType: 'canvas', mediaType: 'video' },
 *     ]); // or wrap newStream's video track as a JitsiLocalTrack
 *     await conference.replaceTrack(oldLocalVideoTrack, newTrack);
 *
 * replaceTrack swaps the published track directly (bypassing the effect pipeline), which sidesteps
 * the setEffect stalls but loses setEffect's automatic mute/unmute/track-lifecycle handling. It is
 * intentionally left as documentation here, not wired in, so the PoC exercises the canonical path.
 *
 * @param {Object} opts
 * @param {{ isEnabled: Function, startEffect: Function, stopEffect: Function }} opts.effect
 * @param {any} [opts.conference]  Defaults to window.APP?.conference on the joined page.
 * @returns {Promise<{ attached: boolean, reason?: string }>}
 */
export async function attachToConference({
  effect,
  conference = (typeof window !== 'undefined' ? window.APP?.conference : undefined),
} = {}) {
  if (!effect || typeof effect.startEffect !== 'function') {
    throw new Error('publish-effect.js: attachToConference() requires { effect } with a startEffect()');
  }

  // No live conference here (headless PoC / no joined room) => no-op gracefully.
  if (!conference) {
    return { attached: false, reason: 'no window.APP.conference (manual live-Jitsi step only)' };
  }

  // Resolve the local video track: prefer the dedicated getter, fall back to scanning local tracks.
  const localVideoTrack =
    conference.getLocalVideoTrack?.() ??
    conference.getLocalTracks?.().find((t) => t.getType?.() === 'video');

  if (!localVideoTrack) {
    return { attached: false, reason: 'no local video track on conference' };
  }

  // Idiomatic LJM path. See the replaceTrack() fallback note above for the X6 caveat.
  await localVideoTrack.setEffect(effect);
  return { attached: true };
}
