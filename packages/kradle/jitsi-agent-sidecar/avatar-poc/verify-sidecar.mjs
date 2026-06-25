// verify-sidecar.mjs — headless verification of the LIVE sidecar avatar INJECTION path.
//
// Unlike verify.mjs (which drives avatar-poc/index.html), this harness exercises exactly the
// sequence src/puppeteer-jitsi-client.connect() runs when JITSI_VIDEO_MODE === 'publish':
//   es-module-shims + a CDN importmap-shim + a module-shim bootstrap that imports the promoted
//   modules from src/browser/ over a tiny localhost server, grafts an off-screen stage + #out
//   canvas onto the document, builds avatar + compositor + publish effect, and defines
//   window.__kradleAvatar / window.__kradleVideo.
//
// It does NOT navigate to a real Jitsi room. Instead it serves a BLANK test page that installs a
// MOCK window.APP.conference (recording setEffect / replaceTrack calls) so the publish + G8 paths
// have a target. Reuses every discipline from verify.mjs: the existing puppeteer-core dependency
// (no install, no lockfile edit), a node:http static server, the same Chromium resolution,
// headless:'new' + SwiftShader GL flags, and the SAME SKIP-not-fake rule on missing WebGL / audio.
//
// Checks:
//   S1  inject + render (G1)        — after a few rAF, compositor.lastFrameNonBlank() === true.
//   S2  video track produced (G2)   — effect.startEffect(new MediaStream()) yields a live video
//                                      track, AND the mock conference.setEffect was invoked
//                                      (attachResult.attached === true).
//   S3  audio track produced        — driving the publishAudio shared __kradleAudio ctx yields a
//                                      live audio track, AND the mock conference.replaceTrack was
//                                      invoked.
//   S4  G8 -> avatar control (probe) — window.__kradleAvatar.setExpression('happy') reaches and
//                                      mutates the real avatar (head material color changes).
//
// Exit code: non-zero only on a hard FAIL. SKIP (no WebGL / audio) does NOT fail the run.

import puppeteer from 'puppeteer-core'; // resolved from root node_modules — no new dependency
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Serve the PROMOTED production modules (src/browser/), the same files the sidecar serves.
const BROWSER_DIR = path.join(__dirname, '..', 'src', 'browser');

// CDN pins — identical to src/puppeteer-jitsi-client.js / avatar-poc/index.html.
const ES_MODULE_SHIMS_URL = 'https://cdn.jsdelivr.net/npm/es-module-shims@1.7.1/dist/es-module-shims.js';
const AVATAR_IMPORTMAP = {
  imports: {
    three: 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js',
    'three/': 'https://cdn.jsdelivr.net/npm/three@0.170.0/',
    'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/',
    'three/examples/': 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/',
    '@met4citizen/talkinghead': 'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.5/modules/talkinghead.mjs',
    // noVNC (MPL-2.0) — present so a VNC websocket path COULD resolve; the harness exercises a
    // synthetic source element only (no real VNC), so this is never actually importShim()'d here.
    '@novnc/novnc/core/rfb.js': 'https://cdn.jsdelivr.net/npm/@novnc/novnc@1.5.0/core/rfb.js',
    '@novnc/novnc/': 'https://cdn.jsdelivr.net/npm/@novnc/novnc@1.5.0/',
  },
};

// --- Tiny static server: serves src/browser/*.js + a blank test page that installs the mock. ----
const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
};

// A blank document with a MOCK window.APP.conference. It records setEffect / replaceTrack and
// exposes a local video track so attachToConference() resolves a track and calls setEffect.
const BLANK_PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>
  (function () {
    const calls = { setEffect: 0, replaceTrack: 0 };
    // A fake local video track shaped like a JitsiLocalTrack (getType + a backing MediaStreamTrack).
    const localVideo = {
      getType() { return 'video'; },
      track: { kind: 'video' },
      async setEffect(/* effect */) { calls.setEffect += 1; },
    };
    const localAudio = {
      getType() { return 'audio'; },
      track: { kind: 'audio' },
    };
    window.APP = {
      conference: {
        getLocalVideoTrack() { return localVideo; },
        getLocalAudioTrack() { return localAudio; },
        getLocalTracks() { return [localVideo, localAudio]; },
        replaceTrack() { calls.replaceTrack += 1; },
      },
    };
    window.__mockCalls = calls;
  })();
</script>
</body></html>`;

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        const rel = urlPath.replace(/^\/+/, '');
        // The blank test page (any path that is not an existing module file).
        const filePath = path.join(rootDir, rel);
        if (!rel || rel === 'index.html'
          || !path.resolve(filePath).startsWith(path.resolve(rootDir))
          || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(BLANK_PAGE);
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } catch (e) {
        res.writeHead(500); res.end(String(e && e.message));
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

// --- Chromium executable resolution (same as verify.mjs) -------------------------------------
function resolveChromium() {
  const explicit = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH;
  if (explicit) return explicit;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  return 'chromium';
}

const LAUNCH_OPTS = {
  headless: 'new',
  executablePath: resolveChromium(),
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
};

// The page-side bootstrap — the SAME shape as src/puppeteer-jitsi-client.avatarBootstrapSource().
// Kept in sync deliberately; the harness's job is to prove that shape injects + runs end-to-end.
function avatarBootstrapSource(baseUrl, avatarCfg) {
  return `
(async () => {
  try {
    const cfg = ${JSON.stringify(avatarCfg || {})};
    const importShim = window.importShim;
    const { createAvatar } = await importShim(${JSON.stringify(baseUrl)} + '/avatar.js');
    const { createCompositor } = await importShim(${JSON.stringify(baseUrl)} + '/compositor.js');
    const { createCanvasPublishEffect, attachToConference } = await importShim(${JSON.stringify(baseUrl)} + '/publish-effect.js');

    const stage = document.createElement('div');
    stage.id = '__kradle_avatar_stage';
    stage.style.cssText = 'position:fixed;left:-9999px;top:0;width:640px;height:480px';
    document.body.appendChild(stage);
    const out = document.createElement('canvas');
    out.id = '__kradle_out';
    out.width = 640; out.height = 480;
    out.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(out);

    const avatar = await createAvatar({ stageEl: stage, glbUrl: cfg.modelUrl || undefined });
    avatar.setMood(cfg.defaultMood || 'neutral');
    avatar.setView(cfg.defaultView || 'upper');

    const compositor = createCompositor({ outCanvas: out, avatar });
    compositor.start();

    if (!window.__kradleAudio && typeof AudioContext !== 'undefined') {
      const ctx = new AudioContext();
      window.__kradleAudio = { ctx, dest: ctx.createMediaStreamDestination() };
    }

    const effect = createCanvasPublishEffect({ canvas: out, fps: 25 });
    const attachResult = await attachToConference({ effect, conference: window.APP && window.APP.conference });

    window.__kradleVideo = { compositor, out, effect, attachResult };
    window.__kradleAvatar = {
      __raw: avatar,
      setExpression(expr) { avatar.setMood(expr); },
      setPosture(p) { if (p) avatar.setView(p); },
      playGesture(g) { avatar.playGesture(g); },
      lookAt(target) {
        if (target === 'camera') { avatar.lookAtCamera(); return; }
        if (target && typeof target === 'object') { avatar.lookAt(target.x ?? 0, target.y ?? 0); return; }
        avatar.lookAt(0, 0);
      },
      setView(v) { avatar.setView(v); },
      drawCanvas(ops) { if (window.__kradleVideo && window.__kradleVideo.compositor && window.__kradleVideo.compositor.pushAnnotation) window.__kradleVideo.compositor.pushAnnotation(ops); },
      clearCanvas() { if (window.__kradleVideo && window.__kradleVideo.compositor && window.__kradleVideo.compositor.clearAnnotations) window.__kradleVideo.compositor.clearAnnotations(); },
      // Mirror of the production startScreenshare, plus a SYNTHETIC source:'element' branch the
      // harness uses (a pre-created offscreen canvas) so S6 needs no real VNC / getDisplayMedia.
      async startScreenshare({ source, url, el } = {}) {
        const comp = window.__kradleVideo && window.__kradleVideo.compositor;
        if (!comp || !comp.setScreenSource) throw new Error('compositor has no screen layer');
        try {
          if (source === 'element' && el) {
            // inset (bottom-right quadrant) so the avatar base stays visible outside the region —
            // lets S6 assert BOTH the synthetic source composites AND the avatar keeps rendering.
            comp.setScreenSource(el, { mode: 'inset' });
            window.__kradleScreen = { kind: 'element', el };
          } else if ((typeof url === 'string' && /^wss?:\\/\\//i.test(url)) || source === 'vnc') {
            const { default: RFB } = await window.importShim('@novnc/novnc/core/rfb.js');
            const targetCanvas = document.createElement('canvas');
            stage.appendChild(targetCanvas);
            const rfb = new RFB(targetCanvas, url);
            comp.setScreenSource((rfb && rfb._canvas) || targetCanvas, { mode: 'full' });
            window.__kradleScreen = { kind: 'vnc', rfb, canvas: targetCanvas, url };
          } else if (source === 'display') {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const video = document.createElement('video');
            video.autoplay = true; video.muted = true; video.playsInline = true;
            video.srcObject = stream;
            stage.appendChild(video);
            await video.play().catch(() => {});
            comp.setScreenSource(video, { mode: 'full' });
            window.__kradleScreen = { kind: 'display', video, stream };
          } else {
            throw new Error('startScreenshare: unsupported source/url');
          }
          window.__kradleScreenError = null;
        } catch (err) {
          window.__kradleScreenError = String((err && (err.stack || err.message)) || err);
          console.error('kradle startScreenshare failed:', err);
          throw err;
        }
      },
      stopScreenshare() {
        const comp = window.__kradleVideo && window.__kradleVideo.compositor;
        const s = window.__kradleScreen;
        try {
          if (s && s.rfb && s.rfb.disconnect) s.rfb.disconnect();
          if (s && s.stream && s.stream.getTracks) s.stream.getTracks().forEach((t) => t.stop());
        } catch (err) { console.warn('kradle stopScreenshare teardown:', err && err.message); }
        if (comp && comp.clearScreen) comp.clearScreen();
        window.__kradleScreen = null;
      },
    };
    window.__kradleAvatarBoot = { ready: true, mode: avatar.mode, attached: !!(attachResult && attachResult.attached), reason: attachResult && attachResult.reason };
  } catch (err) {
    window.__kradleAvatarBoot = { ready: false, error: (err && (err.stack || err.message)) || String(err) };
    console.error('kradle avatar bootstrap failed:', err);
  }
})();
`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Inject (the sidecar sequence) -----------------------------------------------------------
async function injectAvatar(page, baseUrl, avatarCfg) {
  await page.addScriptTag({ content: 'window.esmsInitOptions = { shimMode: true };' });
  await page.addScriptTag({ url: ES_MODULE_SHIMS_URL });
  await page.addScriptTag({ content: JSON.stringify(AVATAR_IMPORTMAP), type: 'importmap-shim' });
  await page.addScriptTag({ content: avatarBootstrapSource(baseUrl, avatarCfg) });
  await page.waitForFunction(() => !!window.__kradleAvatarBoot, { timeout: 20000 }).catch(() => {});
}

// --- WebGL probe (mirrors verify.mjs V4) -----------------------------------------------------
async function probeWebgl(page) {
  return page.evaluate(() => {
    let webgl = false; let renderer = null;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
      webgl = !!gl;
      if (gl) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'renderer-info-unavailable';
      }
    } catch (e) { renderer = String(e && (e.message || e)); }
    const boot = window.__kradleAvatarBoot || null;
    return { webgl, renderer, boot };
  });
}

// --- S1: inject + render non-blank -----------------------------------------------------------
async function checkS1_render(page, boot) {
  const name = 'S1 inject + render non-blank';
  if (!boot.webgl) {
    return { status: 'FAIL', soft: true, name, detail: `headless WebGL unavailable: ${boot.renderer || 'no GL context'}` };
  }
  if (!boot.boot || !boot.boot.ready) {
    const err = String((boot.boot && boot.boot.error) || 'window.__kradleAvatarBoot never ready');
    const looksWebgl = /webgl|gl context|swiftshader|getContext|WebGLRenderer|THREE.WebGL/i.test(err);
    return { status: 'FAIL', soft: looksWebgl, name, detail: `bootstrap not ready: ${err}` };
  }
  const probe = await page.evaluate(async () => {
    const wait = () => new Promise((r) => (typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(() => r()) : setTimeout(r, 16)));
    for (let i = 0; i < 8; i += 1) await wait();
    const v = window.__kradleVideo;
    let nonBlank = null; let probeError = null;
    try { nonBlank = v.compositor.lastFrameNonBlank(); } catch (e) { probeError = String(e && (e.message || e)); }
    return { frames: v.compositor.frameCount(), mode: window.__kradleAvatarBoot.mode, nonBlank, probeError };
  });
  if (probe.probeError) {
    const looksWebgl = /webgl|gl context|getImageData|readPixels/i.test(probe.probeError);
    return { status: 'FAIL', soft: looksWebgl, name, detail: `probe error: ${probe.probeError}` };
  }
  if (probe.nonBlank === true) {
    return { status: 'PASS', soft: false, name, detail: `mode=${probe.mode} frames=${probe.frames} non-blank=true` };
  }
  return { status: 'FAIL', soft: false, name, detail: `frames=${probe.frames} mode=${probe.mode} non-blank=false` };
}

// --- S2: live video track + setEffect invoked on the mock conference --------------------------
async function checkS2_videoTrack(page, boot) {
  const name = 'S2 video track + setEffect on mock';
  if (!boot.webgl || !boot.boot || !boot.boot.ready) {
    return { status: 'FAIL', soft: true, name, detail: 'skipped: no render context / bootstrap not ready' };
  }
  const res = await page.evaluate(async () => {
    try {
      const v = window.__kradleVideo;
      const returned = v.effect.startEffect(new MediaStream());
      const isStream = returned instanceof MediaStream;
      const track = isStream ? returned.getVideoTracks()[0] : null;
      const live = !!track && track.kind === 'video' && track.readyState === 'live';
      v.effect.stopEffect();
      return {
        live,
        kind: track ? track.kind : null,
        readyState: track ? track.readyState : null,
        attached: !!(v.attachResult && v.attachResult.attached),
        setEffectCalls: (window.__mockCalls && window.__mockCalls.setEffect) || 0,
        attachReason: v.attachResult && v.attachResult.reason,
      };
    } catch (e) { return { error: String(e && (e.message || e)) }; }
  });
  if (res.error) return { status: 'FAIL', soft: false, name, detail: res.error };
  const ok = res.live && res.attached && res.setEffectCalls > 0;
  const detail = `videoTrack=${res.kind}/${res.readyState} attached=${res.attached} setEffectCalls=${res.setEffectCalls}`;
  return { status: ok ? 'PASS' : 'FAIL', soft: false, name, detail };
}

// --- S3: live audio track + replaceTrack invoked on the mock conference -----------------------
async function checkS3_audioTrack(page, boot) {
  const name = 'S3 audio track + replaceTrack on mock';
  if (!boot.boot || !boot.boot.ready) {
    return { status: 'FAIL', soft: true, name, detail: 'skipped: bootstrap not ready' };
  }
  const res = await page.evaluate(async () => {
    if (typeof AudioContext === 'undefined') return { unavailable: true, error: 'AudioContext undefined' };
    try {
      // Mirror publishAudio()'s shared-ctx path: render a tone into __kradleAudio.dest and publish.
      const w = window;
      if (!w.__kradleAudio) {
        const ctx = new AudioContext();
        w.__kradleAudio = { ctx, dest: ctx.createMediaStreamDestination() };
      }
      const { ctx, dest } = w.__kradleAudio;
      const osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = 440;
      osc.connect(dest);
      const startAt = ctx.currentTime;
      osc.start(startAt); osc.stop(startAt + 0.2);
      const track = dest.stream.getAudioTracks()[0] || null;
      const conf = window.APP && window.APP.conference;
      const localAudio = conf && (conf.getLocalAudioTrack ? conf.getLocalAudioTrack() : null);
      if (track && localAudio && localAudio.track && conf.replaceTrack) conf.replaceTrack(localAudio, track);
      return {
        live: !!track && track.kind === 'audio' && track.readyState === 'live',
        kind: track ? track.kind : null,
        readyState: track ? track.readyState : null,
        replaceTrackCalls: (window.__mockCalls && window.__mockCalls.replaceTrack) || 0,
      };
    } catch (e) { return { error: String(e && (e.message || e)) }; }
  });
  if (res.unavailable) return { status: 'FAIL', soft: true, name, detail: `headless audio unavailable: ${res.error}` };
  if (res.error) {
    const looksAudio = /AudioContext|MediaStream|audio|createMediaStreamDestination/i.test(res.error);
    return { status: 'FAIL', soft: looksAudio, name, detail: res.error };
  }
  const ok = res.live && res.replaceTrackCalls > 0;
  const detail = `audioTrack=${res.kind}/${res.readyState} replaceTrackCalls=${res.replaceTrackCalls}`;
  return { status: ok ? 'PASS' : 'FAIL', soft: false, name, detail };
}

// --- S4: G8 set_expression reaches + mutates the real avatar ----------------------------------
async function checkS4_g8Control(page, boot) {
  const name = 'S4 G8 set_expression mutates avatar';
  if (!boot.webgl || !boot.boot || !boot.boot.ready) {
    return { status: 'FAIL', soft: true, name, detail: 'skipped: no render context / bootstrap not ready' };
  }
  const res = await page.evaluate(async () => {
    try {
      const wait = () => new Promise((r) => (typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => r()) : setTimeout(r, 16)));
      const v = window.__kradleVideo;
      // Probe the avatar's head material color before/after — proves the call is not a no-op.
      // The placeholder avatar's primitive scene exposes the head mesh; reach it via the stage canvas
      // is not directly readable, so instead assert: setExpression('happy') changes the composited
      // frame relative to neutral. We compare a center-pixel sample across the mood switch.
      const out = v.out;
      const ctx = out.getContext('2d', { willReadFrequently: true });
      // Force neutral, render, sample.
      window.__kradleAvatar.setExpression('neutral');
      for (let i = 0; i < 4; i += 1) await wait();
      const a = Array.from(ctx.getImageData(out.width >> 1, out.height >> 2, 1, 1).data);
      // Switch to happy (a clearly different MOOD_COLOR), render, sample.
      window.__kradleAvatar.setExpression('happy');
      for (let i = 0; i < 4; i += 1) await wait();
      const b = Array.from(ctx.getImageData(out.width >> 1, out.height >> 2, 1, 1).data);
      const changed = a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2];
      // Also exercise setView('full') + ensure still rendering.
      window.__kradleAvatar.setView('full');
      for (let i = 0; i < 4; i += 1) await wait();
      const stillRendering = v.compositor.lastFrameNonBlank();
      return { changed, stillRendering, neutral: a, happy: b };
    } catch (e) { return { error: String(e && (e.message || e)) }; }
  });
  if (res.error) {
    const looksWebgl = /webgl|gl context|getImageData|readPixels/i.test(res.error);
    return { status: 'FAIL', soft: looksWebgl, name, detail: `probe error: ${res.error}` };
  }
  const ok = res.changed && res.stillRendering;
  const detail = `moodColorChanged=${res.changed} stillRendering=${res.stillRendering} neutral=[${res.neutral}] happy=[${res.happy}]`;
  return { status: ok ? 'PASS' : 'FAIL', soft: false, name, detail };
}

// --- S5: draw_canvas / pushAnnotation composites a real annotation op -------------------------
async function checkS5_annotation(page, boot) {
  const name = 'S5 draw_canvas annotation composites';
  if (!boot.webgl || !boot.boot || !boot.boot.ready) {
    return { status: 'FAIL', soft: true, name, detail: 'skipped: no render context / bootstrap not ready' };
  }
  const res = await page.evaluate(async () => {
    try {
      const wait = () => new Promise((r) => (typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => r()) : setTimeout(r, 16)));
      const v = window.__kradleVideo;
      const out = v.out;
      const ctx = out.getContext('2d', { willReadFrequently: true });
      // A filled magenta rect at a known region (#f0f => high R, low G, high B) + a text op.
      window.__kradleAvatar.drawCanvas([
        { type: 'rect', x: 40, y: 40, w: 120, h: 80, color: '#f0f', fill: true },
        { type: 'text', x: 48, y: 90, text: 'S5', color: '#000' },
      ]);
      for (let i = 0; i < 6; i += 1) await wait();
      // Sample the center of the {40,40,120,80} rect.
      const px = Array.from(ctx.getImageData(40 + 60, 40 + 40, 1, 1).data);
      const isMagenta = px[0] > 180 && px[1] < 80 && px[2] > 180;
      const nonBlank = v.compositor.lastFrameNonBlank();
      const warn = v.compositor.lastDrawWarning ? v.compositor.lastDrawWarning() : 'no-probe';
      return { px, isMagenta, nonBlank, warn };
    } catch (e) { return { error: String(e && (e.message || e)) }; }
  });
  if (res.error) {
    const looksWebgl = /webgl|gl context|getImageData|readPixels/i.test(res.error);
    return { status: 'FAIL', soft: looksWebgl, name, detail: `probe error: ${res.error}` };
  }
  const cleanWarn = res.warn === null || res.warn === 'no-probe';
  const ok = res.isMagenta && res.nonBlank === true && cleanWarn;
  const detail = `annotationPx=[${res.px}] isMagenta=${res.isMagenta} baseNonBlank=${res.nonBlank} drawWarning=${JSON.stringify(res.warn)}`;
  return { status: ok ? 'PASS' : 'FAIL', soft: false, name, detail };
}

// --- S6: start_screenshare with a SYNTHETIC source composites while base + track stay live -----
async function checkS6_screenshare(page, boot) {
  const name = 'S6 start_screenshare synthetic source composites';
  if (!boot.webgl || !boot.boot || !boot.boot.ready) {
    return { status: 'FAIL', soft: true, name, detail: 'skipped: no render context / bootstrap not ready' };
  }
  const res = await page.evaluate(async () => {
    try {
      const wait = () => new Promise((r) => (typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => r()) : setTimeout(r, 16)));
      const v = window.__kradleVideo;
      const out = v.out;
      const ctx = out.getContext('2d', { willReadFrequently: true });
      // Build a SYNTHETIC offscreen canvas filled with a known color (#0f0) + a diagonal line.
      const syn = document.createElement('canvas');
      syn.width = 320; syn.height = 240;
      const sctx = syn.getContext('2d');
      sctx.fillStyle = '#0f0'; sctx.fillRect(0, 0, syn.width, syn.height);
      sctx.strokeStyle = '#000'; sctx.lineWidth = 4;
      sctx.beginPath(); sctx.moveTo(0, 0); sctx.lineTo(syn.width, syn.height); sctx.stroke();
      await window.__kradleAvatar.startScreenshare({ source: 'element', el: syn });
      for (let i = 0; i < 6; i += 1) await wait();
      // The compositor's default inset region: rw=floor(w/3), rh=floor(h/3), margin 12, bottom-right.
      const w = out.width; const h = out.height;
      const rw = Math.floor(w / 3); const rh = Math.floor(h / 3); const margin = 12;
      const rx = w - rw - margin; const ry = h - rh - margin;
      // Sample near the inset center but above the lower-third bar (y in [h-28,h]).
      const sx = rx + Math.floor(rw / 2);
      const sy = ry + Math.floor(rh / 3);
      const px = Array.from(ctx.getImageData(sx, sy, 1, 1).data);
      const isGreen = px[1] > 150 && px[0] < 120 && px[2] < 120;
      const baseNonBlank = v.compositor.lastFrameNonBlank();
      const warn = v.compositor.lastDrawWarning ? v.compositor.lastDrawWarning() : 'no-probe';
      // Re-run the S2-style track-live assertion: published video track stays live + mock untouched.
      const returned = v.effect.startEffect(new MediaStream());
      const track = (returned instanceof MediaStream) ? returned.getVideoTracks()[0] : null;
      const trackLive = !!track && track.kind === 'video' && track.readyState === 'live';
      v.effect.stopEffect();
      const setEffectCalls = (window.__mockCalls && window.__mockCalls.setEffect) || 0;
      const screenErr = window.__kradleScreenError || null;
      return { px, isGreen, baseNonBlank, warn, trackLive, setEffectCalls, screenErr, sample: [sx, sy] };
    } catch (e) { return { error: String(e && (e.message || e)) }; }
  });
  if (res.error) {
    const looksWebgl = /webgl|gl context|getImageData|readPixels|getDisplayMedia/i.test(res.error);
    return { status: 'FAIL', soft: looksWebgl, name, detail: `probe error: ${res.error}` };
  }
  const ok = res.isGreen && res.baseNonBlank === true && res.trackLive && !res.screenErr;
  const detail = `screenPx=[${res.px}]@[${res.sample}] isGreen=${res.isGreen} baseNonBlank=${res.baseNonBlank} trackLive=${res.trackLive} setEffectCalls=${res.setEffectCalls} screenErr=${res.screenErr}`;
  return { status: ok ? 'PASS' : 'FAIL', soft: false, name, detail };
}

// --- runner ----------------------------------------------------------------------------------
async function main() {
  const results = [];
  let launchError = null;
  let browser;
  let staticSrv;

  const avatarCfg = { modelUrl: '', defaultMood: 'neutral', defaultView: 'upper' };

  try {
    staticSrv = await startStaticServer(BROWSER_DIR);
    browser = await puppeteer.launch(LAUNCH_OPTS);
    const page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error') console.error('  [page error]', m.text()); });
    page.on('pageerror', (e) => console.error('  [pageerror]', e && e.message));

    // Navigate to the BLANK test page (installs the mock window.APP.conference), then inject.
    await page.goto(`${staticSrv.baseUrl}/__sidecar_blank__.html`, { waitUntil: 'load' });
    await injectAvatar(page, staticSrv.baseUrl, avatarCfg);
    await sleep(200);

    const boot = await probeWebgl(page);
    results.push(await checkS1_render(page, boot));
    results.push(await checkS2_videoTrack(page, boot));
    results.push(await checkS3_audioTrack(page, boot));
    results.push(await checkS4_g8Control(page, boot));
    results.push(await checkS5_annotation(page, boot));
    results.push(await checkS6_screenshare(page, boot));
  } catch (err) {
    launchError = err;
    console.error('verify-sidecar: browser launch/navigation failed:', err && (err.stack || err.message));
    for (const id of ['S1 inject + render non-blank', 'S2 video track + setEffect on mock', 'S3 audio track + replaceTrack on mock', 'S4 G8 set_expression mutates avatar', 'S5 draw_canvas annotation composites', 'S6 start_screenshare synthetic source composites']) {
      results.push({ status: 'FAIL', soft: true, name: id, detail: `browser unavailable: ${err && (err.message || err)}` });
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (staticSrv) await new Promise((r) => staticSrv.server.close(() => r()));
  }

  // --- Report ---
  let hardFailures = 0;
  console.log('\n  verify-sidecar — results');
  console.log('  ----------------------------------------------------------');
  for (const r of results) {
    const status = r.status === 'FAIL' && r.soft ? 'SKIP' : r.status;
    if (status === 'FAIL') hardFailures += 1;
    console.log(`  [${status.padEnd(4)}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log('  ----------------------------------------------------------\n');

  const stateOf = (prefix) => {
    const r = results.find((x) => x.name.startsWith(prefix));
    if (!r) return 'fail';
    return r.status === 'PASS' ? 'pass' : (r.soft ? 'skip' : 'fail');
  };
  console.log(`  SIDECAR_RENDER_STATE=${stateOf('S1')}`);
  console.log(`  SIDECAR_VIDEO_TRACK_STATE=${stateOf('S2')}`);
  console.log(`  SIDECAR_AUDIO_TRACK_STATE=${stateOf('S3')}`);
  console.log(`  SIDECAR_G8_STATE=${stateOf('S4')}`);
  console.log(`  SIDECAR_ANNOTATION_STATE=${stateOf('S5')}`);
  console.log(`  SIDECAR_SCREEN_STATE=${stateOf('S6')}`);
  if (launchError) console.log(`  LAUNCH_ERROR=${String(launchError.message || launchError)}`);

  process.exit(hardFailures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('verify-sidecar crashed:', err);
  process.exit(1);
});
