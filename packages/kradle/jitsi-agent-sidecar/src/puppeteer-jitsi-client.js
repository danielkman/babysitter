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
          });
        } catch {
          // exposeFunction can throw if the binding already exists; never crash connect.
        }
      }
      return { connected: true, participants: [{ id: 'agent', name: runtimeConfig.participantName || 'Kradle Agent' }] };
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
