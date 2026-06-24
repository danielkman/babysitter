# Realtime agent harness — gap register (voice + video/avatar)

> **Status:** Living gap map for the realtime audio+video avatar agent harness on kradle.
> **Date:** 2026-06-23.
> **Companions:** [`realtime-voice-agent-stack.md`](./realtime-voice-agent-stack.md) (architecture), [`voice-governance-bridge-spec.md`](./voice-governance-bridge-spec.md) (bridge + CRD + UX flow).
> **Legend:** **HAS** = real & usable · **PARTIAL** = real but incomplete/unwired · **LACKS** = absent/stub. Seams are `file:line` in `packages/…`.

## 0. The shape of the problem

kradle's **control plane is real and fairly complete**; the **media plane is almost entirely stub**. The harness can already model a meeting agent, dispatch it as a K8s Job with a headless-Chromium Jitsi sidecar, render the agent as a participant tile in the web UI, and expose meeting MCP tools — but the agent currently publishes only Chrome's **fake spinning-ball video + beep** (`--use-fake-device-for-media-stream`), and the agent's reasoning never actually reaches the sidecar at runtime. Closing the harness = (1) fix the **load-bearing runtime gap** (agent↔sidecar socket client), then (2) build the **media plane** (avatar render, real A/V tracks, lipsync, screen-share, tool-driven visuals), then (3) extend the **CRD/UX** surface to declare & drive video capability.

---

## 1. LOAD-BEARING gap (everything else depends on it)

| # | Gap | State | Seam / evidence | Notes |
|---|---|---|---|---|
| **G0** | **Agent→sidecar socket client at runtime** | **DONE (impl) · live-pending** | Implemented `jitsi-agent-sidecar/src/ipc-client.js` (`createAgentIpcClient`: connect → NDJSON `command` → `command_result` correlation → `onEvent` stream; no silent fallback) + `bin/agent-ipc-client.mjs` CLI consuming the MCP `{socketPath,command}` descriptor (`kradle/cli/src/mcp-server.js:724-732`). Verified via `runtime.test.js` (9/9, non-socket) + `ipc-client.test.js` (real AF_UNIX socket, runs on Linux CI; platform-skips where AF_UNIX is unbindable). | **Was the load-bearing gap; now built + unit-verified.** Residual = wire it into the in-pod agent wrapper so a dispatched agent actually invokes it (and the live G0-RT meeting boot). |
| **G0-RT** | **Agent-Job runtime substrate** | **HAS (board) / UNPROVEN (meeting-sidecar)** | Main container runs `node packages/adapters/cli/kradle-agent-entrypoint.mjs` with `KRADLE_AGENT_IMAGE` (`adapters-client.js:491-496`) + emptyDir/PVC workspace (`:467-474`); board→agent E2E verified live (memory `project_dispatch_emptydir_agentimage_task`; supersedes the older "no Job ever ran"). Meeting dispatch attaches the sidecar as a 2nd container + `agent-socket` emptyDir (`:477,507`). | **Reconciled:** the Job runtime now WORKS for board/text dispatch — it is NOT the bottleneck. Residual: (a) the sidecar uses a **separate image** `kradle/jitsi-agent-sidecar:latest` (`:123`) that must be built/published; (b) **no live E2E of the meeting-sidecar dispatch** (2nd container actually starting + joining); (c) the sidecar's main command isn't the agent entrypoint, so G0 is how the agent reaches it. Verify the sidecar container boots in a real dispatch before relying on the media plane. |

---

## 2. Media plane — sidecar (`packages/kradle/jitsi-agent-sidecar/src`)

| # | Gap | State | Seam | Fix |
|---|---|---|---|---|
| G1 | Render avatar in-browser | **LACKS** | `puppeteer-jitsi-client.js:25-42` only `goto()`s the room; no canvas/DOM injection | After join, `page.evaluate` to inject a TalkingHead.js (RPM GLB + Three.js) scene + an output `<canvas>` compositor |
| G2 | Publish generated **video** track | **LACKS** | only `--use-fake-device-for-media-stream` (`:32`); no `captureStream`/`replaceTrack` anywhere | In-page `canvas.captureStream(fps)` → publish via lib-jitsi-meet `localVideoTrack.setEffect(effect)` (the `JitsiStreamPresenterEffect` pattern) or `conference.replaceTrack` |
| G3 | Publish **TTS audio** track | **LACKS** | `audio.js:21-31` `speak()` returns text only; never becomes audio in the room | Real TTS → `AudioBuffer` → Web Audio graph → `MediaStreamAudioDestinationNode.captureStream()` → publish as audio track |
| G4 | **Lipsync** (viseme/mouth sync) | **LACKS** | no viseme/phoneme/amplitude code | Azure `VisemeReceived` (ids+tick offsets) or ElevenLabs char-timestamps → schedule morphs against `AudioContext.currentTime`; RMS-envelope fallback. **Same page/same audio clock to bound drift.** |
| G5 | STT (hear the user) | **LACKS (stub)** | `audio.js:33-38` `transcribe()` returns `{transcript:[]}` | Wire Deepgram/Whisper on the inbound meeting audio; emit `transcript` events (already an inbound event type) |
| G6 | VAD / turn detection | **LACKS (stub)** | `audio.js:40-45` `detectVoice()` returns `speechDetected:false` | Silero VAD / framework turn detector on inbound audio |
| G7 | Screen-share / VNC into video | **PARTIAL→LACKS** | `share_screen` IPC action exists (`runtime.js:87-89`) but impl is `window.open(url)` (`:63-65`) — shares nothing | noVNC (RFB/WebSocket via websockify) → canvas layer composited into G2, or `getDisplayMedia` → screen track |
| G8 | New IPC actions for visuals | **DONE (impl) · best-effort** | Added `set_expression/set_posture/play_gesture/look_at/set_view/draw_canvas/start_screenshare/send_video_metadata` to `SUPPORTED_ACTIONS` + `handleCommand` → `jitsi.*` best-effort puppeteer methods. Dispatch verified (`runtime.test.js`, exact args). | Methods are **no-op/log until the media plane lands** (avatar render G1 / video track G2 / screenshare G7) — the avatar-poc proves those in isolation; wiring them into the live sidecar page is the remaining work. |
| G-chat | Inbound `chat` events not emitted | **DONE (impl) · live-pending** | `runtime.js` now emits a normalized `chat` event, and `puppeteer-jitsi-client.connect()` installs the `onEvent` listener it previously **ignored** (the real reason no inbound event flowed). Round-trip verified non-socket. | The in-page Jitsi `message` listener is best-effort/unverified against a live page (real Jitsi API surface) — confirm on a live meeting. |

---

## 3. Control plane — CRDs & controllers (`packages/kradle/core/src`)

| # | Gap | State | Seam | Fix |
|---|---|---|---|---|
| G9 | AgentStack **video capability** | **PARTIAL** | `agent-stack-controller.js:223-257` validates `jitsiConfig.{role,tools,capabilities.audio}` + `jitsiCapability`; **no `capabilities.video`, avatar, or video tools** | Extend schema + `JitsiCapabilityReady` to allow `capabilities.video:'publish'`, `avatarRef`, video tool names; validate role may publish video |
| G10 | Appearance/voice **threaded to sidecar** | **PARTIAL** | `AgentAppearance` (“avatar generation settings”) + `AgentVoiceProfile` exist (`resource-model.js:36-37`), resolved (`agent-persona-controller.js:71-85`) & surfaced to dispatch identity (`agent-dispatch-controller.js:303-309`) — **but never passed to the sidecar** (`adapters-client.js:94-118` reads `jitsi.tts`, ignores `appearance`/`voiceProfile`) | Thread resolved `appearance`/`voiceProfile` through `prepareMeetingContext` (`jitsi-agent-bridge.js:62-99`) → `meetingContext` → `createJitsiSidecarContainer` env (avatar model URL, renderer, TTS provider/voice) |
| G11 | AgentAppearance avatar **model** field | **PARTIAL** | `AgentAppearance` is generation-settings only | Add avatar model/renderer URL + theme to the spec (RPM GLB URL, viseme set) |
| G12 | JitsiMeeting **media/session status** | **PARTIAL** | status tracks only `recording.{active,id}` + `JitsiRecording.transcript.available` (`jitsi-meeting-controller.js:156-174`) | Add `status.media` (published tracks), `status.transcript` (live), `status.session`, per-agent dispatched-participant status, and `governanceRuns` (see bridge spec) |
| G13 | Governance of consequential visual tools | **LACKS** | no policy/approval over screen-share, content writes, external metadata | Route consequential visual tool calls through the babysitter media-governance bridge (see [`voice-governance-bridge-spec.md`](./voice-governance-bridge-spec.md)); cosmetic animation stays fast-path |

---

## 4. Surfaces — web UX & MCP

| # | Gap | State | Seam | Fix |
|---|---|---|---|---|
| G14 | Stack-builder video/meeting section | **LACKS** | `kradle/web/.../stack-builder.jsx` captures baseAgent/adapter/model/prompts/mcp/skills only — zero jitsi/avatar/video fields | Add a “Meeting / Video” section writing `jitsiCapability`/`jitsiConfig`/`jitsiMeetingProviderRef` + avatar & voice pickers (ref `AgentAppearance`/`AgentVoiceProfile`) |
| G15 | Agent overlay/controls in call UI | **PARTIAL (optional)** | iframe embed (`jitsi-embedded-meeting.jsx:104-122`) **already renders the agent's published track as a participant tile** — no new video component needed | Optional: agent-specific overlays/controls in `jitsi-meeting-experience.jsx`/`jitsi-meeting-controls.jsx` |
| G16 | Video MCP tools | **LACKS** | meeting tools cover chat/hand/react/screenshare/tts (`mcp-server.js:539-631`) | Add `kradle_set_expression`/`kradle_play_gesture`/`kradle_draw_canvas`/`kradle_publish_video`/`kradle_share_surface`/`kradle_send_video_metadata`, all consumed by the G0 socket-writer |
| G17 | Agent voice/avatar editor UX | **PARTIAL** | `genty/ui/.../AgentVoiceEditor.tsx` picks TTS voice only | Extend to an avatar/media editor (model, expression set, default pose, view framing) bound to `AgentAppearance` |

---

## 5. External components to integrate (not in repo — must add)

| # | Component | State | Source / choice |
|---|---|---|---|
| G18 | Realtime media server + SIP | **LACKS** | LiveKit server + `livekit/sip` **or** the existing Jitsi (already wired) — Jitsi is the path of least resistance since the sidecar+CRDs target it |
| G19 | Avatar renderer | **LACKS** | TalkingHead.js (RPM GLB + Three.js) in headless Chromium; Live2D alt (Cubism Core proprietary) |
| G20 | STT / TTS providers | **LACKS** | Deepgram / faster-whisper (STT); Azure (visemes) / ElevenLabs / Cartesia (TTS) |
| G21 | noVNC + websockify | **LACKS** | screen-share/desktop-into-video |
| G22 | (optional) server-side face anim | **LACKS** | NVIDIA Audio2Face-3D (MIT SDK, audio→blendshapes; still needs a renderer) for higher-fidelity lipsync on GPU |

---

## 6. Cross-cutting hard problems / unknowns

| # | Risk | Why it's hard |
|---|---|---|
| X1 | **Cross-track A/V sync drift** | Audio + canvas video are separate WebRTC tracks; not auto-lip-synced beyond RTCP. Must originate both from one page/one audio clock; network jitter buffers still add offset. Budget testing. |
| X2 | **Headless WebGL + WebRTC** | Headless Chromium needs real GPU/ANGLE (SwiftShader is slow); older headless modes broke `mediaDevices`/`captureStream`. Verify under `--headless=new` + GPU on the sidecar host. |
| X3 | **GPU cost** | One GPU box per concurrent video bot (WebGL composite readback; worse if Audio2Face). Capacity/scheduling concern for the kradle scheduler. |
| X4 | **Lipsync retargeting accuracy** | Azure ARKit blendshapes are tuned for ARKit, not Oculus/TalkingHead rigs; TalkingHead's rule-based EN mapping ~80%. Retarget quality varies. |
| X5 | **Governance latency budget** | babysitter governance round-trip (seconds) must hide behind filler speech + async tools; never on the audio/animation hot path. Unbenchmarked — measure `create→iterate→commit` on target disk. |
| X6 | **lib-jitsi-meet `setEffect`/`replaceTrack` reliability** | Reported multi-second/20s delays, null-old-track failures. Pin a known-good LJM version; test the effect path. |
| X7 | **noVNC throughput** | Full-desktop RFB over WebSocket at video frame rate is bandwidth-heavy; rate-limit / dirty-region. |
| X8 | **Licensing** | Live2D Cubism Core proprietary (revenue-gated); RPM sample avatar CC BY-NC; Mixamo raw files no-redistribute; Audio2Face NIM under NVIDIA AI license (not OSS); HeyGen/D-ID closed SaaS. Ship own-licensed assets. |

---

## 7. Recommended build order (dependency-aware)

0. **G0-RT** — confirm the meeting-sidecar dispatch actually boots (the Job runtime already works for board dispatch; build/publish `kradle/jitsi-agent-sidecar:latest` and prove the 2nd container joins a room). Precondition for everything below.
1. **G0** — the agent↔sidecar socket client (unblocks everything; makes today's text chat actually work).
2. **G3 + G5 + G-chat** — real audio out (TTS) + audio in (STT) + chat events → a working **voice** agent in a meeting (the [voice stack](./realtime-voice-agent-stack.md) MVP).
3. **G1 + G2 + G4** — avatar render + video-track publish + lipsync → a working **talking-avatar** agent.
4. **G8 + G16 + G17** — visual tool calls (expression/posture/gesture/canvas) end-to-end (IPC actions + MCP tools + editor).
5. **G7 + G21** — screen-share / VNC into the video.
6. **G9 + G10 + G11 + G12 + G14** — CRD video capability + appearance/voice threading + status + stack-builder UX (the full declarative flow).
7. **G13** — babysitter governance over consequential visual tools (canvas content, screen-share, external metadata).
8. **X-items** — harden sync/GPU/latency/licensing as each lands.

Prior **voice gaps** (STT/TTS/VAD/WebRTC/SIP from the original voice research) are absorbed here as G3/G5/G6/G18/G20 — they are the same media-plane gaps, now grounded in the kradle sidecar.
