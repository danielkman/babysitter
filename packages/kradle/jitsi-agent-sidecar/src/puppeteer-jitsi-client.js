function roomUrlWithJwt(roomUrl, jwt) {
  if (!jwt) return roomUrl;
  const url = new URL(roomUrl);
  url.searchParams.set('jwt', jwt);
  return url.toString();
}

export function createPuppeteerJitsiClient(config = {}) {
  let browser = null;
  let page = null;

  async function evaluateBestEffort(fn, ...args) {
    if (!page) return;
    try {
      await page.evaluate(fn, ...args);
    } catch {
      // Jitsi UI APIs vary by deployment; IPC command acknowledgement should not crash the sidecar.
    }
  }

  return {
    async connect(overrides = {}) {
      const runtimeConfig = { ...config, ...overrides };
      const onEvent = runtimeConfig.onEvent;
      const puppeteer = await import('puppeteer-core');
      browser = await puppeteer.launch({
        headless: runtimeConfig.headless ?? true,
        executablePath: runtimeConfig.chromiumExecutablePath || process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || 'chromium',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--use-fake-ui-for-media-stream',
          '--use-fake-device-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
        ],
      });
      page = await browser.newPage();
      await page.goto(roomUrlWithJwt(runtimeConfig.roomUrl, runtimeConfig.jwt), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await evaluateBestEffort((name) => {
        window.localStorage.setItem('displayname', name || 'Kradle Agent');
      }, runtimeConfig.participantName);
      // Best-effort inbound chat listener. Jitsi message APIs vary by deployment, so the
      // in-page subscription is wrapped in evaluateBestEffort and silently no-ops if absent.
      if (typeof onEvent === 'function') {
        try {
          await page.exposeFunction('__kradleEmit', (event) => onEvent(event));
          await evaluateBestEffort(() => {
            const room = window.APP?.conference?.room;
            room?.on?.('message', (id, text) => {
              window.__kradleEmit?.({ type: 'chat', sender: id, text });
            });
            // G5/G6 inbound-audio tap (best-effort). Jitsi remote-track APIs vary by deployment;
            // when a remote audio track arrives, signal the sidecar so it can pull/transcribe
            // frames. The actual PCM extraction (MediaStreamTrackProcessor/AudioWorklet) is the
            // manual/live part; here we surface the signal only and never crash if unsupported.
            const conf = window.APP?.conference;
            const onRemoteTrack = (track) => {
              try {
                if (track && (track.getType?.() === 'audio' || track.kind === 'audio')) {
                  window.__kradleEmit?.({ type: 'inbound_audio', participantId: track.getParticipantId?.() });
                }
              } catch { /* tolerate */ }
            };
            conf?.addEventListener?.('TRACK_ADDED', onRemoteTrack);
            conf?.on?.('track.trackAdded', onRemoteTrack);
          });
        } catch {
          // exposeFunction can throw if the binding already exists; never crash connect.
        }
      }
      return { connected: true, participants: [{ id: 'agent', name: runtimeConfig.participantName || 'Kradle Agent' }] };
    },

    // G3 audio publish: turn a TTS descriptor into a live audio MediaStreamTrack in the page
    // (shared AudioContext + MediaStreamAudioDestinationNode, mirroring avatar-poc/lipsync.js),
    // then publish it into the conference in place of the fake mic. Best-effort: on a headless
    // page with no live conference this no-ops gracefully and never throws.
    async publishAudio(descriptor) {
      await evaluateBestEffort((desc) => {
        if (!desc || typeof AudioContext === 'undefined') return;
        // One shared AudioContext + destination for the page lifetime (stable published track).
        const w = window;
        if (!w.__kradleAudio) {
          const ctx = new AudioContext();
          w.__kradleAudio = { ctx, dest: ctx.createMediaStreamDestination() };
        }
        const { ctx, dest } = w.__kradleAudio;
        if (desc.kind === 'tone') {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = desc.freq || 440;
          osc.connect(dest);
          const startAt = ctx.currentTime;
          osc.start(startAt);
          osc.stop(startAt + (desc.durationMs || 200) / 1000);
        } else if (desc.kind === 'pcm' && desc.bytes) {
          const sampleRate = desc.sampleRate || 48000;
          const channels = desc.channels || 1;
          const i16 = new Int16Array(
            desc.bytes.buffer || new Uint8Array(desc.bytes).buffer,
          );
          const frames = Math.floor(i16.length / channels);
          const buf = ctx.createBuffer(channels, frames, sampleRate);
          for (let ch = 0; ch < channels; ch += 1) {
            const data = buf.getChannelData(ch);
            for (let i = 0; i < frames; i += 1) data[i] = i16[i * channels + ch] / 32768;
          }
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(dest);
          src.start();
        } else {
          return;
        }
        // Publish the generated audio track into the conference, replacing the fake mic.
        try {
          const track = dest.stream.getAudioTracks()[0];
          const conf = window.APP?.conference;
          const localAudio = conf?.getLocalAudioTrack?.()
            || conf?.getLocalTracks?.().find((t) => t.getType?.() === 'audio');
          if (track && localAudio?.track && conf?.replaceTrack) {
            conf.replaceTrack(localAudio, track);
          }
        } catch { /* no live conference in headless harness — track still exists locally */ }
      }, descriptor);
    },

    async sendChat(text) {
      await evaluateBestEffort((message) => {
        const api = window.APP?.conference;
        if (api?.sendMessage) api.sendMessage(message);
      }, text);
    },

    async raiseHand() {
      await evaluateBestEffort(() => window.APP?.conference?.room?.setRaisedHand?.(true));
    },

    async lowerHand() {
      await evaluateBestEffort(() => window.APP?.conference?.room?.setRaisedHand?.(false));
    },

    async react(emoji) {
      await evaluateBestEffort((value) => window.APP?.conference?.sendEndpointMessage?.('', { type: 'reaction', emoji: value }), emoji);
    },

    async shareScreen(url) {
      await evaluateBestEffort((value) => window.open(value, '_blank'), url);
    },

    async setExpression(expression, options = {}) {
      await evaluateBestEffort((value, opts) => window.__kradleAvatar?.setExpression?.(value, opts), expression, options);
    },

    async setPosture(posture) {
      await evaluateBestEffort((value) => window.__kradleAvatar?.setPosture?.(value), posture);
    },

    async playGesture(gesture, options = {}) {
      await evaluateBestEffort((value, opts) => window.__kradleAvatar?.playGesture?.(value, opts), gesture, options);
    },

    async lookAt(target) {
      await evaluateBestEffort((value) => window.__kradleAvatar?.lookAt?.(value), target);
    },

    async setView(view) {
      await evaluateBestEffort((value) => window.__kradleAvatar?.setView?.(value), view);
    },

    async drawCanvas(ops) {
      await evaluateBestEffort((value) => window.__kradleAvatar?.drawCanvas?.(value), ops);
    },

    async startScreenshare(options = {}) {
      await evaluateBestEffort((opts) => window.__kradleAvatar?.startScreenshare?.(opts), options);
    },

    async sendVideoMetadata(metadata) {
      await evaluateBestEffort((value) => window.__kradleAvatar?.sendVideoMetadata?.(value), metadata);
    },

    async disconnect() {
      if (page) {
        await evaluateBestEffort(() => window.APP?.conference?.hangup?.());
        await page.close().catch(() => {});
        page = null;
      }
      if (browser) {
        await browser.close().catch(() => {});
        browser = null;
      }
    },
  };
}
