// compositor.js — single output-canvas compositor for the avatar-render PoC.
//
// Responsibility:
//   Own the single #out canvas (and its 2D context) that becomes the published video track.
//   Each requestAnimationFrame:
//     1. avatar.renderFrame(); ctx.drawImage(avatar.getCanvas(), 0,0,w,h)  — base layer.
//     2. drawScreenLayer(ctx)      — REAL noVNC / screen-share / image layer (G7), drawn UNDER
//                                    the annotation overlay so annotations sit on top.
//     3. drawAnnotationLayer(ctx)  — REAL 2D overlay: the static lower-third marker FIRST, then
//                                    declarative annotation ops pushed via pushAnnotation() (G7).
//
//   The compositor deliberately NEVER calls captureStream() itself — capture is owned by
//   publish-effect.js so the capture/effect lifecycle is testable in isolation.
//
//   Exposes start()/stop(), frameCount(), getCanvas(), a lastFrameNonBlank() pixel probe used by
//   verify.mjs (V4) to assert non-blank rendering, plus the G7 surface:
//   pushAnnotation()/clearAnnotations()/setScreenSource()/clearScreen()/lastDrawWarning().

/**
 * Create the compositor over a single output canvas.
 *
 * @param {Object} opts
 * @param {HTMLCanvasElement} opts.outCanvas   The #out canvas (published surface).
 * @param {Object} opts.avatar                 A createAvatar() surface (renderFrame/getCanvas).
 * @returns {{
 *   start: () => void,
 *   stop: () => void,
 *   getCanvas: () => HTMLCanvasElement,
 *   frameCount: () => number,
 *   lastFrameNonBlank: () => boolean,
 *   pushAnnotation: (ops: Object|Object[]) => void,
 *   clearAnnotations: () => void,
 *   setScreenSource: (el: Element, opts?: Object) => void,
 *   clearScreen: () => void,
 *   lastDrawWarning: () => (Object|null),
 * }}
 */
export function createCompositor({ outCanvas, avatar } = {}) {
  if (!outCanvas) throw new Error('compositor.js: createCompositor() requires { outCanvas }');
  if (!avatar) throw new Error('compositor.js: createCompositor() requires { avatar }');

  const ctx = outCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('compositor.js: 2D context unavailable on outCanvas');

  const w = outCanvas.width;
  const h = outCanvas.height;

  let rafId = null;
  let frames = 0;
  let running = false;

  // --- G7 layer state -------------------------------------------------------------------------
  // The current declarative annotation op list (last-write-wins per pushAnnotation/clearAnnotations).
  let annotationOps = [];
  // The active screen-layer source { el, mode, region } (noVNC canvas / getDisplayMedia video /
  // image), or null when no screen share is active.
  let screenSource = null;
  // Observable probe: { layer, op?, message } of the most recent per-frame draw fault. Surfaces the
  // cause of a skipped/failed op WITHOUT masking it (read by verify S5/S6 + live diagnostics).
  let lastDrawError = null;
  // Tracks the screen-source readiness reason so a "source not ready" note is recorded once per
  // readiness transition rather than spamming lastDrawError every frame.
  let lastScreenNotReady = false;

  // rAF is not available in some headless/eval contexts; fall back to a timer so the loop still
  // runs. (This is a runtime-environment shim, not a behavioral fallback.)
  const raf =
    (typeof requestAnimationFrame === 'function')
      ? requestAnimationFrame
      : (cb) => setTimeout(() => cb(Date.now()), 16);
  const caf =
    (typeof cancelAnimationFrame === 'function') ? cancelAnimationFrame : clearTimeout;

  function composite() {
    // 1) Base layer: render the avatar a frame, then copy its WebGL canvas onto #out.
    try {
      avatar.renderFrame();
      const src = avatar.getCanvas();
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(src, 0, 0, w, h);
    } catch (err) {
      // Surface but do not crash the loop; a single bad frame should not kill compositing.
      console.warn('compositor.js: base-layer draw failed:', err && err.message);
    }

    // 2) Screenshare / noVNC / image layer — REAL. Composited UNDER the annotation overlay so
    //    annotations draw on top of the shared screen (deliberate, documented order change from
    //    the original annotation-then-screen stub order).
    drawScreenLayer();

    // 3) Annotation overlay layer — REAL. Draws the static lower-third marker FIRST (preserved),
    //    then each declarative op pushed via pushAnnotation().
    drawAnnotationLayer(frames);

    frames += 1;
  }

  // --- Layer renderers (closures over ctx/w/h and the G7 state) -------------------------------

  // Annotation overlay: keep the static lower-third marker first (S1 / lastFrameNonBlank rely on a
  // non-blank frame and the existing exercised path), then render the declarative annotation ops.
  function drawAnnotationLayer(frame) {
    // Static lower-third bar + frame counter — byte-behavior-preserved from the original stub.
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, h - 28, w, 28);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#cfe';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(`avatar-poc  frame ${frame}`, 8, h - 9);
    ctx.restore();

    // Declarative ops. Each op is save/restore-wrapped + try/catch'd so a half-applied transform
    // or alpha can't leak into the next op, and one bad op never kills the loop.
    for (const op of annotationOps) {
      ctx.save();
      try {
        drawAnnotationOp(op);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        console.warn('compositor: annotation op failed', op && op.type, message);
        lastDrawError = { layer: 'annotation', op: op && op.type, message };
      } finally {
        ctx.restore();
      }
    }
  }

  function drawAnnotationOp(op) {
    if (!op || typeof op !== 'object') {
      console.warn('compositor: unknown annotation op', op);
      lastDrawError = { layer: 'annotation', op: undefined, message: 'op is not an object' };
      return;
    }
    switch (op.type) {
      case 'text': {
        ctx.fillStyle = op.color || '#cfe';
        ctx.font = op.font || '14px system-ui, sans-serif';
        ctx.fillText(String(op.text ?? ''), op.x || 0, op.y || 0);
        break;
      }
      case 'rect': {
        if (op.fill) {
          ctx.fillStyle = op.color || '#cfe';
          ctx.fillRect(op.x || 0, op.y || 0, op.w || 0, op.h || 0);
        } else {
          ctx.strokeStyle = op.color || '#cfe';
          ctx.lineWidth = op.width || 2;
          ctx.strokeRect(op.x || 0, op.y || 0, op.w || 0, op.h || 0);
        }
        break;
      }
      case 'line': {
        ctx.strokeStyle = op.color || '#cfe';
        ctx.lineWidth = op.width || 2;
        ctx.beginPath();
        ctx.moveTo(op.x1 || 0, op.y1 || 0);
        ctx.lineTo(op.x2 || 0, op.y2 || 0);
        ctx.stroke();
        break;
      }
      case 'image': {
        // el = an in-page element drawn immediately; src = a lazily-created Image() that draws
        // once complete (async readiness, NOT a behavioral fallback).
        const el = op.el || op.__img;
        if (el) {
          ctx.drawImage(el, op.x || 0, op.y || 0, op.w || el.width || 0, op.h || el.height || 0);
        } else if (op.src) {
          // Lazily create + cache an Image() on the op; draw once it loads. Until then this is a
          // documented no-op with an observable note (readiness, not a silent fallback).
          if (typeof Image !== 'undefined') {
            const img = new Image();
            img.src = op.src;
            op.__img = img;
            op.el = undefined;
            if (img.complete && img.naturalWidth > 0) {
              ctx.drawImage(img, op.x || 0, op.y || 0, op.w || img.width || 0, op.h || img.height || 0);
            } else {
              lastDrawError = { layer: 'annotation', op: 'image', message: 'image not yet loaded' };
              console.warn('compositor: annotation image not yet loaded', op.src);
            }
          } else {
            throw new Error('Image constructor unavailable');
          }
        } else {
          throw new Error("image op requires 'el' or 'src'");
        }
        break;
      }
      default: {
        // Unknown op type: surface it (NOT silently ignored), skip, continue with the rest.
        console.warn('compositor: unknown annotation op', op.type);
        lastDrawError = { layer: 'annotation', op: op.type, message: 'unknown annotation op type' };
      }
    }
  }

  // Screen layer: drawImage the active source into its region. Same crash-safety discipline as the
  // base layer — a not-ready source skips the frame WITH an observable note; a throw is surfaced.
  function drawScreenLayer() {
    const src = screenSource;
    if (!src || !src.el) {
      lastScreenNotReady = false;
      return;
    }
    const el = src.el;

    // Readiness guard (skip-this-frame, observable, not a fallback):
    //  - <video> with readyState < 2 (HAVE_CURRENT_DATA) has no decodable frame yet.
    //  - <img> not complete / 0 natural size has no pixels yet.
    //  - any source reporting 0x0 dimensions cannot be drawn.
    let notReadyReason = null;
    const isVideo = typeof HTMLVideoElement !== 'undefined' && el instanceof HTMLVideoElement;
    const isImg = typeof HTMLImageElement !== 'undefined' && el instanceof HTMLImageElement;
    if (isVideo && el.readyState < 2) {
      notReadyReason = 'video source not ready (readyState<2)';
    } else if (isImg && (!el.complete || el.naturalWidth === 0)) {
      notReadyReason = 'image source not ready (incomplete)';
    } else {
      const sw = el.videoWidth ?? el.naturalWidth ?? el.width ?? 0;
      const sh = el.videoHeight ?? el.naturalHeight ?? el.height ?? 0;
      if (!sw || !sh) notReadyReason = 'screen source has zero dimensions';
    }
    if (notReadyReason) {
      // Record once per readiness transition (do not spam every frame).
      if (!lastScreenNotReady) {
        lastDrawError = { layer: 'screen', message: notReadyReason };
        lastScreenNotReady = true;
      }
      return;
    }
    lastScreenNotReady = false;

    // Region: explicit region override, else 'full' fills the frame, else (default) an inset in
    // the bottom-right quadrant (~w/3 x h/3, 12px margin).
    let rx; let ry; let rw; let rh;
    if (src.region) {
      ({ x: rx, y: ry, w: rw, h: rh } = src.region);
    } else if (src.mode === 'full') {
      rx = 0; ry = 0; rw = w; rh = h;
    } else {
      const margin = 12;
      rw = Math.floor(w / 3);
      rh = Math.floor(h / 3);
      rx = w - rw - margin;
      ry = h - rh - margin;
    }

    try {
      ctx.drawImage(el, rx, ry, rw, rh);
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      console.warn('compositor: screen-layer draw failed', message);
      lastDrawError = { layer: 'screen', message };
    }
  }

  function loop() {
    if (!running) return;
    composite();
    rafId = raf(loop);
  }

  return {
    start() {
      if (running) return;
      running = true;
      rafId = raf(loop);
    },
    stop() {
      running = false;
      if (rafId != null) caf(rafId);
      rafId = null;
    },
    getCanvas: () => outCanvas,
    frameCount: () => frames,

    /**
     * Sample a grid of pixels via getImageData and report whether the last composited frame is
     * NOT all-blank (all-transparent or all-black). Used by verify.mjs V4.
     */
    lastFrameNonBlank() {
      // Sample a sparse grid rather than the full buffer (cheap, sufficient to detect content).
      const cols = 8;
      const rows = 8;
      let nonBlank = false;
      for (let iy = 0; iy < rows && !nonBlank; iy += 1) {
        for (let ix = 0; ix < cols && !nonBlank; ix += 1) {
          const x = Math.floor(((ix + 0.5) / cols) * w);
          const y = Math.floor(((iy + 0.5) / rows) * h);
          const d = ctx.getImageData(x, y, 1, 1).data;
          // Non-blank == some opacity AND some luminance above a small threshold.
          if (d[3] > 0 && (d[0] > 4 || d[1] > 4 || d[2] > 4)) {
            nonBlank = true;
          }
        }
      }
      return nonBlank;
    },

    // --- G7 annotation overlay -----------------------------------------------------------------
    /**
     * Set the current declarative annotation overlay. Accepts one op or an array of ops; replaces
     * the existing op list (a draw call shows "this set"). Invalid input is surfaced (console.warn
     * + lastDrawError) and leaves the previous ops intact — never a silent no-op.
     */
    pushAnnotation(ops) {
      const list = Array.isArray(ops) ? ops : [ops];
      const valid = list.every((op) => op && typeof op === 'object' && typeof op.type === 'string');
      if (!valid) {
        const message = 'pushAnnotation: each op must be an object with a string type';
        console.warn('compositor:', message, ops);
        lastDrawError = { layer: 'annotation', message };
        return;
      }
      annotationOps = list.slice();
    },
    clearAnnotations() {
      annotationOps = [];
    },

    // --- G7 screen / noVNC / image layer -------------------------------------------------------
    /**
     * Store the screen-layer source element (a <canvas> noVNC RFB target, a <video> from
     * getDisplayMedia, or an <img>). opts.mode 'full' fills the frame; default 'inset' draws a
     * bottom-right quadrant; opts.region {x,y,w,h} overrides the computed region.
     */
    setScreenSource(el, opts = {}) {
      if (!el) {
        const message = 'setScreenSource: element required';
        console.warn('compositor:', message);
        lastDrawError = { layer: 'screen', message };
        return;
      }
      screenSource = { el, mode: opts.mode || 'inset', region: opts.region };
      lastScreenNotReady = false;
    },
    clearScreen() {
      screenSource = null;
      lastScreenNotReady = false;
    },

    /** Observable probe: the most recent per-frame draw fault, or null. Complements lastFrameNonBlank. */
    lastDrawWarning() {
      return lastDrawError;
    },
  };
}
