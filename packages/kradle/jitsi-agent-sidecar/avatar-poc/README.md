# Avatar Render PoC

A self-contained, **install-free** proof-of-concept that lives entirely under
`packages/kradle/jitsi-agent-sidecar/avatar-poc/`. It proves three gaps of the video-agent
harness, plus the A/V-sync fix:

- **G1 — render an avatar in-browser.** `avatar.js` drives `@met4citizen/TalkingHead` in
  scene-owned mode onto a WebGL canvas.
- **G2 — publish a generated video track.** `compositor.js` composites onto a single `#out`
  canvas; `publish-effect.js` turns it into a `MediaStream` via `canvas.captureStream(fps)`
  conforming to lib-jitsi-meet's stream-effect interface.
- **G4 — lipsync.** `lipsync.js` builds a deterministic viseme schedule and runs it against a
  single shared `AudioContext` clock (the **X1** A/V-sync fix: audio + visemes originate from
  one page / one clock → bounded drift).

> **Status: SKELETON.** Every module is currently a documented stub (`throw new Error(... not
> implemented ...)`). This commit is config/layout only — no rendering, publish, or lipsync
> logic yet.

## No-install design

- **Browser libraries are CDN-only**, pinned in the ESM `<importmap>` in `index.html`. There is
  **no `package.json` inside `avatar-poc/`**, no bundler, and **no lockfile change**.
- **Verification reuses the sidecar's existing `puppeteer-core`** (declared in
  `../package.json`, hoisted to the workspace root `node_modules`). `verify.mjs` imports it via
  standard node resolution.

### Pinned CDN versions (in `index.html`)

| Library | Pinned URL |
|---|---|
| `three` | `https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js` |
| `three/addons/` | `https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/` |
| `@met4citizen/talkinghead` | `https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.5/modules/talkinghead.mjs` |
| `es-module-shims` (importmap polyfill) | `https://cdn.jsdelivr.net/npm/es-module-shims@1.7.1/dist/es-module-shims.js` |

> **`three` is pinned to 0.170.0, not ~0.180.** TalkingHead 1.5's own reference importmap pins
> `three@0.170.0`; pinning to match TalkingHead avoids API drift against the version it was built
> against. Bump both together if you upgrade TalkingHead.

## Avatar asset — CC-BY-NC WARNING

TalkingHead ships a sample avatar (`brunette.glb`) that is licensed **CC BY-NC**
(non-commercial), and its sample animations carry redistribution restrictions. **This PoC ships
NO GLB and must not commit one** (risk **X8**).

- **Default (out of the box):** `AVATAR_GLB_URL` is undefined, so `avatar.js` renders a
  license-clean **primitive placeholder** (a simple head-proxy mesh with one mouth-open morph).
  This is an explicit, documented PoC placeholder — not a hidden production fallback.
- **To use a real avatar:** export your **own** Ready Player Me (RPM) avatar GLB from your own RPM
  account (or supply any GLB you own), drop it at `avatar-poc/assets/avatar.glb`, and set
  `AVATAR_GLB_URL` to it. A real RPM/ARKit GLB carries the viseme morphs TalkingHead expects.

## How to run

### Headless verification (the CI-shaped checks)

```bash
# A Chromium/Chrome must be available; point the harness at it:
export PUPPETEER_EXECUTABLE_PATH=/path/to/chrome      # or CHROMIUM_PATH; default 'chromium'
node packages/kradle/jitsi-agent-sidecar/avatar-poc/verify.mjs
```

`verify.mjs` launches Chromium with **`--headless=new`** (the new headless required for
`captureStream`) plus SwiftShader GL flags, then runs:

| # | Check | Determinism |
|---|---|---|
| **V1** | Pure `buildVisemeSchedule()` scheduler unit test (node-only, no browser). | **Hard CI gate — fully deterministic, no GPU/audio/browser.** |
| **V2** | `out.captureStream(25)` yields a live video track. | Deterministic given a working browser. |
| **V3** | `CanvasPublishEffect` shape (`isEnabled`/`startEffect`/`stopEffect`), no LJM. | Deterministic. |
| **V4** | `#out` renders non-blank frames (pixel sample). | **Conditional on headless WebGL (X2) — best-effort, may SKIP.** |

V1 is the hard gate; V2/V3 should pass under `--headless=new` on most boxes; V4 is best-effort.
(All checks currently report `not implemented` until the modules carry logic.)

### Visual inspection in a normal browser

Open `index.html` in a desktop browser (serve over `http(s)://` or `file://`; the importmap +
`es-module-shims` handle module loading). Inspect `#out` (the composited/published surface) and
`#avatar-stage` (TalkingHead's renderer). `window.__avatarPoc` exposes the wired modules.

## Manual live-Jitsi + GPU steps (NOT a CI gate)

These require a real Jitsi deployment and ideally a **real-GPU** host (SwiftShader is too slow for
production cadence). They are verified by a human, not by CI:

1. Join a real Jitsi room using the sidecar's puppeteer client (so lib-jitsi-meet is loaded on the
   page as `window.APP` / `JitsiMeetJS`).
2. Inject this PoC's modules into the joined page and construct avatar → compositor → lipsync.
3. Publish video:
   ```js
   await window.__avatarPoc.attachToConference({
     conference: window.APP.conference,
     canvas: document.getElementById('out'),
     fps: 25,
   });
   ```
   (If `setEffect` stalls — risk **X6**, reported multi-second / ~20s delays / null-old-track — use
   the documented `replaceTrack` variant manually; it is not auto-selected.)
4. Publish the matching audio from the **same** page/clock via the `LipsyncRunner`'s
   `getAudioStream()` so audio and video share one `AudioContext` clock (**X1**).
5. Confirm as a **second participant** that you see the avatar tile and hear synced speech.
6. Assess GPU rendering quality, frame rate, and viseme accuracy on a real-GPU host with
   `--headless=new` + ANGLE / real GPU (risk **X2**), and the perceptual A/V-sync feel over a real
   WebRTC path (**X1**).
