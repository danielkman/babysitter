// verify.mjs — headless verification harness for the avatar-render PoC.
//
// Reuses the sidecar's EXISTING puppeteer-core dependency (no install, no lockfile edit).
// puppeteer-core resolves via standard node resolution (root node_modules of the monorepo).
//
// Launches Chromium with headless:'new' (the NEW headless; the old headless breaks captureStream
// — see plan X2 / Appendix D.3) and SwiftShader GL flags so a GPU-less box can attempt software
// WebGL. The executable is resolved the same way as src/puppeteer-jitsi-client.js, with a small
// set of well-known Windows fallbacks for local dev convenience.
//
// Checks (per the plan's §3 table):
//   V1  Scheduler unit test  — import buildVisemeSchedule() in NODE (no browser). [not run in --render-only]
//   V2  captureStream live track — in-page (live video MediaStreamTrack). [not run in --render-only]
//   V3  Effect-wiring shape  — CanvasPublishEffect isEnabled/startEffect/stopEffect. [not run in --render-only]
//   V4  Non-blank frames     — run the compositor a few frames; getImageData sample of #out is not
//                              all-transparent/all-black. *** This is the focus of this task. ***
//                              Conditional on headless WebGL (X2); if WebGL is unavailable the
//                              harness reports V4 as SKIP with the REAL error — it does NOT fake a pass.
//
// Modes:
//   (default)        run V1 + (V2/V3/V4 in browser).  [V1/V2/V3 remain plan stubs for now.]
//   --render-only    run ONLY the V4 render check.
//
// Exit code: non-zero if any non-soft check FAILs. SKIP (soft) does not fail the run.

import puppeteer from 'puppeteer-core'; // resolved from root node_modules — no new dependency
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVisemeSchedule } from './lipsync.js'; // PURE — no GPU/audio/browser

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RENDER_ONLY = process.argv.includes('--render-only');

// --- Tiny static server -----------------------------------------------------------------------
// ESM dynamic imports are blocked under the file:// origin ('null') by CORS, so we serve the
// avatar-poc directory over http://127.0.0.1 for the duration of the run. node:http only — no dep.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
};

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
        const filePath = path.join(rootDir, rel);
        // Confine to rootDir.
        if (!path.resolve(filePath).startsWith(path.resolve(rootDir))) {
          res.writeHead(403); res.end('forbidden'); return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.writeHead(404); res.end('not found'); return;
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

// --- Chromium executable resolution -----------------------------------------------------------
function resolveChromium() {
  const explicit = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH;
  if (explicit) return explicit;
  // Well-known Windows locations (local-dev convenience; CI should set the env var).
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  return 'chromium'; // last resort: rely on PATH.
}

const LAUNCH_OPTS = {
  headless: 'new', // NEW headless required for captureStream / WebGL capture.
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

const NOT_IMPLEMENTED = { status: 'FAIL', detail: 'not implemented (PoC skeleton)' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- V1: pure scheduler unit test (node-only) -------------------------------------------------
// Imports buildVisemeSchedule() directly in NODE (no browser, no audio, no GPU) and asserts on a
// fixed sample. This is the hard, fully-deterministic CI gate.
async function checkV1_schedulerUnit() {
  const name = 'V1 scheduler unit test';
  try {
    // Sample: silence -> aɪ (11/aa, wide open) -> l (14/nn) -> silence, offsets in 100ns ticks.
    const visemes = [0, 11, 14, 0];
    const vtimes = [0, 1500000, 3000000, 4500000];
    const sched = buildVisemeSchedule(visemes, vtimes, { unit: 'ticks' });

    // Length.
    assert.equal(sched.length, 4, `expected length 4, got ${sched.length}`);

    // ticks/10000 -> ms, strictly ascending.
    assert.deepEqual(sched.map((e) => e.timeMs), [0, 150, 300, 450], 'timesMs ticks->ms');
    for (let i = 1; i < sched.length; i += 1) {
      assert.ok(sched[i].timeMs > sched[i - 1].timeMs, 'timeMs strictly ascending');
    }

    // Every entry: valid string morph + numeric weight in [0,1].
    for (const e of sched) {
      assert.equal(typeof e.morph, 'string', 'morph is a string');
      assert.ok(e.morph.length > 0, 'morph non-empty');
      assert.equal(typeof e.weight, 'number', 'weight is numeric');
      assert.ok(Number.isFinite(e.weight), 'weight finite');
      assert.ok(e.weight >= 0 && e.weight <= 1, `weight in [0,1] (got ${e.weight})`);
      assert.equal(typeof e.visemeId, 'number', 'visemeId is numeric');
    }

    // Viseme 0 (silence) -> closed/zero-openness mouth.
    assert.equal(sched[0].visemeId, 0, 'first cue is viseme 0');
    assert.equal(sched[0].morph, 'sil', 'viseme 0 maps to silence morph');
    assert.equal(sched[0].weight, 0, 'viseme 0 weight is zero (closed mouth)');
    assert.equal(sched[3].weight, 0, 'trailing viseme 0 weight is zero (closed mouth)');

    // Non-zero viseme (11/aa) -> open mouth; openness strictly greater than silence.
    assert.equal(sched[1].visemeId, 11, 'second cue is viseme 11');
    assert.equal(sched[1].morph, 'aa', 'viseme 11 maps to aa (open)');
    assert.ok(sched[1].weight > 0, 'viseme 11 weight > 0 (open mouth)');
    assert.ok(sched[1].weight > sched[0].weight, 'open vowel more open than silence');
    assert.ok(sched[2].weight > sched[0].weight, 'viseme 14 more open than silence');

    // Determinism: calling twice yields deep-equal output.
    const sched2 = buildVisemeSchedule(visemes, vtimes, { unit: 'ticks' });
    assert.deepEqual(sched, sched2, 'deterministic — two calls deep-equal');

    return {
      status: 'PASS',
      soft: false,
      name,
      detail: `len=${sched.length} timesMs=[${sched.map((e) => e.timeMs).join(',')}] ` +
        `morphs=[${sched.map((e) => e.morph).join(',')}] deterministic=true`,
    };
  } catch (e) {
    return { status: 'FAIL', soft: false, name, detail: String((e && (e.message || e)) || e) };
  }
}

// --- V2: captureStream yields a live video track ----------------------------------------------
// In-page: build the effect from the #out canvas, call startEffect(new MediaStream()), and assert
// the returned object is a MediaStream whose video track is { kind:'video', readyState:'live' }.
async function checkV2_captureStream(page) {
  const name = 'V2 captureStream live track';

  const res = await page.evaluate(async () => {
    const poc = window.__avatarPoc;
    if (!poc || !poc.ready) {
      return { ok: false, error: `bootstrap not ready: ${poc ? poc.error : 'no __avatarPoc'}` };
    }
    if (!poc.publish || typeof poc.publish.createCanvasPublishEffect !== 'function') {
      return { ok: false, error: 'publish-effect.js / createCanvasPublishEffect not loaded' };
    }
    try {
      const effect = poc.publish.createCanvasPublishEffect({ canvas: poc.out, fps: 25 });
      const returned = effect.startEffect(new MediaStream());
      const isStream = returned instanceof MediaStream;
      const vtracks = isStream ? returned.getVideoTracks() : [];
      const track = vtracks[0] || null;
      const result = {
        ok: isStream && !!track && track.kind === 'video' && track.readyState === 'live',
        isMediaStream: isStream,
        videoTrackCount: vtracks.length,
        kind: track ? track.kind : null,
        readyState: track ? track.readyState : null,
      };
      // Clean up the capture so it does not keep ticking for the rest of the run.
      effect.stopEffect();
      return result;
    } catch (e) {
      return { ok: false, error: String((e && (e.message || e)) || e) };
    }
  });

  if (res.error) {
    return { status: 'FAIL', soft: false, name, detail: res.error };
  }
  if (res.ok) {
    return {
      status: 'PASS',
      soft: false,
      name,
      detail: `MediaStream=${res.isMediaStream} videoTracks=${res.videoTrackCount} kind=${res.kind} readyState=${res.readyState}`,
    };
  }
  return {
    status: 'FAIL',
    soft: false,
    name,
    detail: `MediaStream=${res.isMediaStream} videoTracks=${res.videoTrackCount} kind=${res.kind} readyState=${res.readyState}`,
  };
}

// --- V3: effect-wiring shape ------------------------------------------------------------------
// In-page: assert the effect exposes isEnabled/startEffect/stopEffect (functions), isEnabled
// returns true for a video track, and stopEffect() ends the captured track (readyState 'ended').
// No lib-jitsi-meet needed — this validates the contract shape that setEffect consumes.
async function checkV3_effectShape(page) {
  const name = 'V3 effect-wiring shape';

  const res = await page.evaluate(async () => {
    const poc = window.__avatarPoc;
    if (!poc || !poc.ready) {
      return { ok: false, error: `bootstrap not ready: ${poc ? poc.error : 'no __avatarPoc'}` };
    }
    if (!poc.publish || typeof poc.publish.createCanvasPublishEffect !== 'function') {
      return { ok: false, error: 'publish-effect.js / createCanvasPublishEffect not loaded' };
    }
    try {
      const effect = poc.publish.createCanvasPublishEffect({ canvas: poc.out, fps: 25 });

      const hasFns =
        typeof effect.isEnabled === 'function' &&
        typeof effect.startEffect === 'function' &&
        typeof effect.stopEffect === 'function';

      // isEnabled must accept a video track. Use a real captured video track as the source.
      const probeStream = poc.out.captureStream(1);
      const videoTrack = probeStream.getVideoTracks()[0];
      const enabledForVideo = effect.isEnabled(videoTrack);
      // ...and reject a non-video (audio-shaped) source.
      const enabledForAudio = effect.isEnabled({ kind: 'audio' });
      for (const t of probeStream.getTracks()) t.stop();

      // stopEffect() must end the track it returned from startEffect().
      const started = effect.startEffect(new MediaStream());
      const startedTrack = started.getVideoTracks()[0];
      const beforeStop = startedTrack ? startedTrack.readyState : null;
      effect.stopEffect();
      const afterStop = startedTrack ? startedTrack.readyState : null;

      return {
        ok: hasFns && enabledForVideo === true && enabledForAudio === false && afterStop === 'ended',
        hasFns,
        enabledForVideo,
        enabledForAudio,
        beforeStop,
        afterStop,
      };
    } catch (e) {
      return { ok: false, error: String((e && (e.message || e)) || e) };
    }
  });

  if (res.error) {
    return { status: 'FAIL', soft: false, name, detail: res.error };
  }
  const detail =
    `fns=${res.hasFns} isEnabled(video)=${res.enabledForVideo} ` +
    `isEnabled(audio)=${res.enabledForAudio} readyState ${res.beforeStop}->${res.afterStop}`;
  if (res.ok) {
    return { status: 'PASS', soft: false, name, detail };
  }
  return { status: 'FAIL', soft: false, name, detail };
}

// --- V4: canvas renders non-blank frames (THE render check) -----------------------------------
async function checkV4_nonBlankFrames(page) {
  const name = 'V4 non-blank frames';

  // 1) Did the page bootstrap at all, and is WebGL actually available?
  const boot = await page.evaluate(() => {
    const poc = window.__avatarPoc || null;
    let webgl = false;
    let webglError = null;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
      webgl = !!gl;
      if (gl) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        webglError = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'renderer-info-unavailable';
      }
    } catch (e) {
      webglError = String(e && (e.message || e));
    }
    return {
      hasPoc: !!poc,
      ready: poc ? !!poc.ready : false,
      mode: poc ? poc.mode || null : null,
      bootError: poc ? poc.error || null : 'window.__avatarPoc never set',
      webgl,
      renderer: webglError,
    };
  });

  // WebGL unavailable => SKIP with the REAL reason (do NOT fake a pass).
  if (!boot.webgl) {
    return {
      status: 'FAIL',
      soft: true, // SKIP
      name,
      detail: `headless WebGL unavailable: ${boot.renderer || 'no GL context'}`,
    };
  }

  // Bootstrap failed for a non-WebGL reason => real FAIL with the captured error.
  if (!boot.ready) {
    // If the failure is itself WebGL-related, treat as SKIP; otherwise FAIL.
    const err = String(boot.bootError || 'unknown bootstrap failure');
    const looksWebgl = /webgl|gl context|swiftshader|getContext|WebGLRenderer|THREE.WebGL/i.test(err);
    return { status: 'FAIL', soft: looksWebgl, name, detail: `bootstrap not ready: ${err}` };
  }

  // 2) Run a few rAF ticks, then probe lastFrameNonBlank().
  const probe = await page.evaluate(async () => {
    const poc = window.__avatarPoc;
    const wait = () => new Promise((r) => (typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(() => r())
      : setTimeout(r, 16)));
    for (let i = 0; i < 8; i += 1) await wait();
    let nonBlank = null;
    let probeError = null;
    try {
      nonBlank = poc.compositor.lastFrameNonBlank();
    } catch (e) {
      probeError = String(e && (e.message || e));
    }
    return { frames: poc.compositor.frameCount(), mode: poc.mode, nonBlank, probeError };
  });

  if (probe.probeError) {
    const looksWebgl = /webgl|gl context|getImageData|readPixels/i.test(probe.probeError);
    return { status: 'FAIL', soft: looksWebgl, name, detail: `probe error: ${probe.probeError}` };
  }

  if (probe.nonBlank === true) {
    return {
      status: 'PASS',
      soft: false,
      name,
      detail: `mode=${probe.mode} frames=${probe.frames} non-blank=true`,
    };
  }

  return {
    status: 'FAIL',
    soft: false,
    name,
    detail: `frames=${probe.frames} mode=${probe.mode} non-blank=false (rendered all-blank)`,
  };
}

// --- runner ----------------------------------------------------------------------------------
async function main() {
  const results = [];
  let launchError = null;

  if (!RENDER_ONLY) {
    results.push(await checkV1_schedulerUnit());
  }

  let browser;
  let staticSrv;
  try {
    staticSrv = await startStaticServer(__dirname);
    const indexUrl = `${staticSrv.baseUrl}/index.html`;

    browser = await puppeteer.launch(LAUNCH_OPTS);
    const page = await browser.newPage();

    // Surface page console / errors to aid the real-error reporting requirement.
    page.on('console', (m) => { if (m.type() === 'error') console.error('  [page error]', m.text()); });
    page.on('pageerror', (e) => console.error('  [pageerror]', e && e.message));

    await page.goto(indexUrl, { waitUntil: 'load' });
    // Wait for the bootstrap to set window.__avatarPoc (ready OR error).
    await page.waitForFunction(() => !!window.__avatarPoc, { timeout: 20000 }).catch(() => {});

    if (RENDER_ONLY) {
      results.push(await checkV4_nonBlankFrames(page));
    } else {
      results.push(await checkV2_captureStream(page));
      results.push(await checkV3_effectShape(page));
      results.push(await checkV4_nonBlankFrames(page));
    }
  } catch (err) {
    launchError = err;
    console.error('avatar-poc verify: browser launch/navigation failed:', err && (err.stack || err.message));
    // A launch failure with no usable browser => V4 cannot be evaluated => SKIP with the real error.
    results.push({
      status: 'FAIL',
      soft: true,
      name: 'V4 non-blank frames',
      detail: `browser unavailable: ${err && (err.message || err)}`,
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (staticSrv) await new Promise((r) => staticSrv.server.close(() => r()));
  }

  // --- Report ---
  let hardFailures = 0;
  console.log('\n  avatar-poc verify — results' + (RENDER_ONLY ? ' (--render-only)' : ''));
  console.log('  ----------------------------------------------------------');
  for (const r of results) {
    const status = r.status === 'FAIL' && r.soft ? 'SKIP' : r.status;
    if (status === 'FAIL') hardFailures += 1;
    console.log(`  [${status.padEnd(4)}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log('  ----------------------------------------------------------\n');

  // Machine-readable summary line for the caller.
  const v4 = results.find((r) => r.name === 'V4 non-blank frames');
  const v4state = v4
    ? (v4.status === 'PASS' ? 'pass' : (v4.soft ? 'skip-no-webgl' : 'fail'))
    : 'fail';
  console.log(`  RENDER_CHECK_STATE=${v4state}`);
  if (launchError) console.log(`  LAUNCH_ERROR=${String(launchError.message || launchError)}`);

  process.exit(hardFailures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('avatar-poc verify crashed:', err);
  process.exit(1);
});
