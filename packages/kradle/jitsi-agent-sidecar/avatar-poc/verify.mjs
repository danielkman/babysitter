// verify.mjs — headless verification harness for the avatar-render PoC (SKELETON).
//
// Reuses the sidecar's EXISTING puppeteer-core dependency (no install, no lockfile edit).
// puppeteer-core resolves from the parent sidecar package via standard node resolution
// (it is declared in ../package.json and hoisted to the workspace root node_modules).
//
// Launches Chromium with --headless=new (the NEW headless; the old headless breaks
// captureStream — see plan X2 / Appendix D.3) and the same executable-path resolution
// convention as src/puppeteer-jitsi-client.js, plus SwiftShader GL flags so a GPU-less box
// can attempt software WebGL.
//
// Checks (per the plan's §3 table):
//   V1  Scheduler unit test  — import buildVisemeSchedule() in NODE (no browser); assert
//                              ordered [{timeMs,morph,weight}], Azure-id->Oculus-morph map,
//                              ticks->ms, trailing close. *** The hard, fully-deterministic CI gate. ***
//   V2  captureStream live track — in-page: out.captureStream(25).getVideoTracks()[0] is a
//                              live video MediaStreamTrack.
//   V3  Effect-wiring shape  — CanvasPublishEffect has isEnabled/startEffect/stopEffect with the
//                              right return contracts (no lib-jitsi-meet needed).
//   V4  Non-blank frames     — run the compositor a few frames; getImageData sample of #out is
//                              not all-transparent/all-black. *** Conditional on headless WebGL
//                              (X2) — best-effort, may be skipped/soft-failed where WebGL is absent. ***
//
// Exit code: non-zero if any non-soft check fails. Prints a per-check PASS/FAIL/SKIP table.
//
// Currently a SKELETON: all check bodies are TODO stubs that report "not implemented".

import puppeteer from 'puppeteer-core'; // resolved from the sidecar package — no new dependency
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_URL = pathToFileURL(path.join(__dirname, 'index.html')).href;

const CHROMIUM_EXECUTABLE =
  process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || 'chromium';

const LAUNCH_OPTS = {
  // NOTE: '--headless=new' (string) selects the new headless mode required for captureStream.
  headless: 'new',
  executablePath: CHROMIUM_EXECUTABLE,
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

// --- V1: pure scheduler unit test (node-only, no browser) ----------------------------------
async function checkV1_schedulerUnit() {
  // TODO(poc): const { buildVisemeSchedule, ticksToMs } = await import('./lipsync.js');
  //            assert ordered output, Azure-id->Oculus-morph mapping, ticks->ms, trailing weight:0 close.
  return { ...NOT_IMPLEMENTED, name: 'V1 scheduler unit test', soft: false };
}

// --- V2: captureStream yields a live video track (in-page) ---------------------------------
async function checkV2_captureStream(/* page */) {
  // TODO(poc): page.evaluate(() => { const t = out.captureStream(25).getVideoTracks()[0];
  //            return t && t.kind === 'video' && t.readyState === 'live'; }).
  return { ...NOT_IMPLEMENTED, name: 'V2 captureStream live track', soft: false };
}

// --- V3: effect-wiring shape (in-page, no LJM) ---------------------------------------------
async function checkV3_effectShape(/* page */) {
  // TODO(poc): import createCanvasPublishEffect in-page; assert isEnabled(videoTrack)===true,
  //            startEffect(stream) returns a MediaStream with >0 video tracks, stopEffect() ends them.
  return { ...NOT_IMPLEMENTED, name: 'V3 effect-wiring shape', soft: false };
}

// --- V4: canvas renders non-blank frames (in-page, GPU-conditional) ------------------------
async function checkV4_nonBlankFrames(/* page */) {
  // TODO(poc): run compositor a few frames; getImageData sample of #out; assert not all-blank.
  //            SOFT: WebGL may be unavailable headless (X2) -> allowed to SKIP/soft-fail.
  return { ...NOT_IMPLEMENTED, name: 'V4 non-blank frames', soft: true };
}

async function main() {
  const results = [];

  // V1 runs in node without a browser — the reliable gate.
  results.push(await checkV1_schedulerUnit());

  // V2/V3/V4 need a browser page.
  let browser;
  try {
    // TODO(poc): browser = await puppeteer.launch(LAUNCH_OPTS);
    //            const page = await browser.newPage();
    //            await page.goto(INDEX_URL, { waitUntil: 'load' });
    //            await page.waitForFunction(() => !!window.__avatarPoc);
    //            results.push(await checkV2_captureStream(page));
    //            results.push(await checkV3_effectShape(page));
    //            results.push(await checkV4_nonBlankFrames(page));
    void puppeteer; void LAUNCH_OPTS; void INDEX_URL; // referenced; wiring is TODO
    results.push(await checkV2_captureStream(/* page */));
    results.push(await checkV3_effectShape(/* page */));
    results.push(await checkV4_nonBlankFrames(/* page */));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  // --- Report ---
  let hardFailures = 0;
  console.log('\n  avatar-poc verify — results');
  console.log('  ----------------------------------------------------------');
  for (const r of results) {
    const status = r.status === 'FAIL' && r.soft ? 'SKIP' : r.status;
    if (status === 'FAIL') hardFailures += 1;
    console.log(`  [${status.padEnd(4)}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log('  ----------------------------------------------------------\n');

  process.exit(hardFailures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('avatar-poc verify crashed:', err);
  process.exit(1);
});
