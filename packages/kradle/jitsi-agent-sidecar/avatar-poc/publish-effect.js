// publish-effect.js — lib-jitsi-meet stream effect + conference attach helper
//                      (PoC, SKELETON / no logic yet).
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
//
// Implements nothing yet — exported stubs only.

/**
 * Create a canvas->MediaStream publish effect conforming to the LJM stream-effect shape.
 *
 * @param {HTMLCanvasElement} [canvas]   The #out canvas to capture.
 * @param {number} [fps=25]              Capture frame rate (fps:0 + requestFrame() for manual cadence).
 * @returns {{
 *   isEnabled: (sourceLocalTrack: any) => boolean,   // true for a video MediaStreamTrack
 *   startEffect: (stream: MediaStream) => MediaStream, // returns canvas.captureStream(fps)
 *   stopEffect: () => void,                            // stop captured tracks
 * }}
 */
export function createCanvasPublishEffect(/* canvas, fps = 25 */) {
  // TODO(poc): implement the isEnabled/startEffect/stopEffect lifecycle over canvas.captureStream(fps).
  throw new Error('publish-effect.js: createCanvasPublishEffect() not implemented (PoC skeleton)');
}

/**
 * Attach a CanvasPublishEffect to the local video track of a live Jitsi conference.
 * Idiomatic LJM path: localVideoTrack.setEffect(effect). (Live/manual path — see README.)
 *
 * @param {Object} [opts]
 * @param {any} [opts.conference]            Defaults to window.APP.conference on the joined page.
 * @param {HTMLCanvasElement} [opts.canvas]  The #out canvas to publish.
 * @param {number} [opts.fps]                Capture fps.
 * @returns {Promise<void>}
 */
export function attachToConference(/* opts */) {
  // TODO(poc): resolve local video track (getLocalVideoTrack ?? getLocalTracks().find video);
  //            await localVideoTrack.setEffect(createCanvasPublishEffect(canvas, fps)).
  //            Document-only replaceTrack() fallback variant for X6 (not auto-selected).
  throw new Error('publish-effect.js: attachToConference() not implemented (PoC skeleton)');
}
