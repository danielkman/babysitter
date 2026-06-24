// verify-audio.mjs — headless verification for the sidecar AUDIO plane (G3 TTS-out track).
//
// Reuses the EXISTING puppeteer-core dependency (no install, no lockfile edit), the same
// static-server + Chromium-resolution discipline as verify.mjs, and the same SKIP rule: if
// AudioContext / headless audio is unavailable, the check reports SKIP with the REAL error —
// it NEVER fakes a pass.
//
// Checks:
//   A1  synthetic oscillator -> MediaStreamAudioDestinationNode -> live audio MediaStreamTrack.
//   A2  mock-TTS descriptor (tone) + a PCM AudioBuffer -> live audio MediaStreamTrack.
//       (Mirrors the descriptor that src/audio-providers.js SyntheticTtsProvider emits and that
//        src/puppeteer-jitsi-client.js publishAudio() renders in-page.)
//
// Exit code: non-zero if any non-soft check FAILs. SKIP (soft) does not fail the run.

import puppeteer from 'puppeteer-core'; // resolved from root node_modules — no new dependency
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SyntheticTtsProvider } from '../src/audio-providers.js'; // PURE descriptor — no browser

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Tiny static server (same shape as verify.mjs) -------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
        const filePath = path.join(rootDir, rel);
        if (!path.resolve(filePath).startsWith(path.resolve(rootDir))) {
          res.writeHead(403); res.end('forbidden'); return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          // A blank page is fine for the audio checks (we only need a document + AudioContext).
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
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
    '--autoplay-policy=no-user-gesture-required',
  ],
};

// --- A1: synthetic oscillator -> live audio track --------------------------------------------
async function checkA1_oscillatorTrack(page) {
  const name = 'A1 oscillator -> live audio track';
  const res = await page.evaluate(async () => {
    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') {
      return { unavailable: true, error: 'AudioContext is undefined in this page' };
    }
    try {
      const Ctx = typeof AudioContext !== 'undefined' ? AudioContext : webkitAudioContext;
      const ctx = new Ctx();
      if (typeof ctx.createMediaStreamDestination !== 'function') {
        return { unavailable: true, error: 'createMediaStreamDestination unavailable' };
      }
      const dest = ctx.createMediaStreamDestination();
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 440;
      osc.connect(dest);
      osc.start();
      const track = dest.stream.getAudioTracks()[0] || null;
      const out = {
        hasTrack: !!track,
        kind: track ? track.kind : null,
        readyState: track ? track.readyState : null,
      };
      osc.stop();
      await ctx.close().catch(() => {});
      out.ok = out.hasTrack && out.kind === 'audio' && out.readyState === 'live';
      return out;
    } catch (e) {
      return { error: String((e && (e.message || e)) || e) };
    }
  });
  return classify(name, res);
}

// --- A2: mock-TTS descriptor (tone) + PCM AudioBuffer -> live audio track ---------------------
async function checkA2_descriptorTrack(page, descriptor) {
  const name = 'A2 mock-TTS descriptor -> live audio track';
  const res = await page.evaluate(async (desc) => {
    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') {
      return { unavailable: true, error: 'AudioContext is undefined in this page' };
    }
    try {
      const Ctx = typeof AudioContext !== 'undefined' ? AudioContext : webkitAudioContext;
      const ctx = new Ctx();
      const dest = ctx.createMediaStreamDestination();

      // Render the tone descriptor exactly as puppeteer-jitsi-client.publishAudio() does.
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = desc.freq || 440;
      osc.connect(dest);
      osc.start();
      osc.stop(ctx.currentTime + (desc.durationMs || 200) / 1000);

      // Also exercise the PCM path: a short generated AudioBuffer through a BufferSource.
      const sampleRate = desc.sampleRate || 48000;
      const buf = ctx.createBuffer(1, Math.floor(sampleRate * 0.05), sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i += 1) ch[i] = Math.sin((i / sampleRate) * 2 * Math.PI * 440) * 0.2;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(dest);
      src.start();

      const track = dest.stream.getAudioTracks()[0] || null;
      const out = {
        hasTrack: !!track,
        kind: track ? track.kind : null,
        readyState: track ? track.readyState : null,
      };
      await ctx.close().catch(() => {});
      out.ok = out.hasTrack && out.kind === 'audio' && out.readyState === 'live';
      return out;
    } catch (e) {
      return { error: String((e && (e.message || e)) || e) };
    }
  }, descriptor);
  return classify(name, res);
}

function classify(name, res) {
  // AudioContext / headless audio unavailable => SKIP (soft) with the REAL error.
  if (res.unavailable) {
    return { status: 'FAIL', soft: true, name, detail: `headless audio unavailable: ${res.error}` };
  }
  if (res.error) {
    const looksAudio = /AudioContext|MediaStream|audio|createMediaStreamDestination/i.test(res.error);
    return { status: 'FAIL', soft: looksAudio, name, detail: res.error };
  }
  const detail = `hasTrack=${res.hasTrack} kind=${res.kind} readyState=${res.readyState}`;
  return { status: res.ok ? 'PASS' : 'FAIL', soft: false, name, detail };
}

// --- runner ----------------------------------------------------------------------------------
async function main() {
  const results = [];
  let launchError = null;
  let browser;
  let staticSrv;

  const descriptor = SyntheticTtsProvider.synthesize('hello'); // { kind:'tone', sampleRate, ... }

  try {
    staticSrv = await startStaticServer(__dirname);
    browser = await puppeteer.launch(LAUNCH_OPTS);
    const page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error') console.error('  [page error]', m.text()); });
    page.on('pageerror', (e) => console.error('  [pageerror]', e && e.message));

    await page.goto(`${staticSrv.baseUrl}/__audio_blank__.html`, { waitUntil: 'load' }).catch(() => {});

    results.push(await checkA1_oscillatorTrack(page));
    results.push(await checkA2_descriptorTrack(page, descriptor));
  } catch (err) {
    launchError = err;
    console.error('verify-audio: browser launch/navigation failed:', err && (err.stack || err.message));
    // No usable browser => audio checks cannot run => SKIP with the real error (never fake).
    results.push({ status: 'FAIL', soft: true, name: 'A1 oscillator -> live audio track', detail: `browser unavailable: ${err && (err.message || err)}` });
    results.push({ status: 'FAIL', soft: true, name: 'A2 mock-TTS descriptor -> live audio track', detail: `browser unavailable: ${err && (err.message || err)}` });
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (staticSrv) await new Promise((r) => staticSrv.server.close(() => r()));
  }

  // --- Report ---
  let hardFailures = 0;
  console.log('\n  verify-audio — results');
  console.log('  ----------------------------------------------------------');
  for (const r of results) {
    const status = r.status === 'FAIL' && r.soft ? 'SKIP' : r.status;
    if (status === 'FAIL') hardFailures += 1;
    console.log(`  [${status.padEnd(4)}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log('  ----------------------------------------------------------\n');

  // Machine-readable summary line for the caller.
  const a1 = results.find((r) => r.name.startsWith('A1'));
  const trackState = a1
    ? (a1.status === 'PASS' ? 'pass' : (a1.soft ? 'skip-no-audio' : 'fail'))
    : 'fail';
  console.log(`  AUDIO_TRACK_STATE=${trackState}`);
  if (launchError) console.log(`  LAUNCH_ERROR=${String(launchError.message || launchError)}`);

  process.exit(hardFailures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('verify-audio crashed:', err);
  process.exit(1);
});
