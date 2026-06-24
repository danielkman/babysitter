// compositor.js — single output-canvas compositor (PoC, SKELETON / no logic yet).
//
// Responsibility:
//   Own the single #out canvas (and its 2D context) that becomes the published video
//   track. Run a requestAnimationFrame loop that, each frame:
//     1. avatar.renderFrame(); ctx.drawImage(avatar.getCanvas(), 0,0,w,h)  — base layer.
//     2. drawAnnotationLayer(ctx)  — stub 2D overlay (future lower-third / timestamp; G7).
//     3. drawScreenLayer(ctx)      — stub for the noVNC / screen-share layer (G7); no-op.
//
//   The compositor deliberately NEVER calls captureStream() itself — capture is owned by
//   publish-effect.js so the capture/effect lifecycle is testable in isolation.
//
//   Exposes frameCount and a lastFrameNonBlank() pixel probe used by verify.mjs (V4) to
//   assert non-blank rendering.
//
// Implements nothing yet — exported stub only.

/**
 * Create the compositor over a single output canvas.
 *
 * @param {Object} [opts]
 * @param {HTMLCanvasElement} [opts.canvas]   The #out canvas (published surface).
 * @param {Object} [opts.avatar]              An object from createAvatar() (renderFrame/getCanvas).
 * @returns {{
 *   start: () => void,                        // begin the rAF compositing loop
 *   stop: () => void,                         // stop the loop
 *   getCanvas: () => HTMLCanvasElement,        // returns #out
 *   frameCount: () => number,                  // frames composited so far
 *   lastFrameNonBlank: () => boolean,          // pixel-sample probe (used by V4)
 * }}
 */
export function createCompositor(/* opts */) {
  // TODO(poc): own canvas + 2d ctx; rAF loop drawing avatar base + annotation/screen stubs;
  //            track frameCount; implement lastFrameNonBlank() via getImageData sampling.
  throw new Error('compositor.js: createCompositor() not implemented (PoC skeleton)');
}
