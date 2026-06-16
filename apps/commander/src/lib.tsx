/**
 * A5C Commander — embeddable library entry (Phase 2: kradle/web consumes this as
 * a PREBUILT artifact).
 *
 * Unlike `src/App.tsx` (the standalone app shell, which resolves its config from
 * `import.meta.env` + the URL and constructs the backend at module scope), this
 * entry exports a plain React component `<CommanderRoot/>`. The host owns the
 * React tree; we mount `<WarRoom/>` inside it.
 *
 * Boot sequence mirrors App.tsx (createBackend → createCommanderStore →
 * bind/bootReal → connect), but:
 *   - the config is built EXPLICITLY from props (never `import.meta.env`);
 *   - everything that touches a browser global is gated behind a client-only
 *     effect so this component is SSR-safe (kradle/web renders on the server);
 *   - there is NO `import.meta.hot` block (cleanup rides the effect teardown).
 */

import { useEffect, useState } from 'react';
import { WarRoom } from './components/WarRoom';
import { MockBackend } from './backend/mock/mockBackend';
import { createBackend } from './backend/factory';
import { bootReal } from './backend/real/realBoot';
import type { BackendConfig } from './backend/config';
import type { CommanderBackend } from './backend/types';
import type { SimViews } from './game/views';
import {
  bindBackendToStore,
  COMMANDER_VERSION,
  createCommanderStore,
  type BackendBinding,
  type CommanderStore,
  type Orders,
} from './game/store';

// Pulled into the library CSS bundle (commander.css) by vite.lib.config.ts:
// the Aegis @theme tokens + `.wr-*` styles ship alongside the JS.
import './styles.css';

/**
 * Minimal debug handle exposed on `window.__commander` in mock mode. We do NOT
 * re-`declare global` the `Window.__commander` property here: `App.tsx` already
 * declares it as the richer `CommanderTestApi`, and a second augmentation with a
 * narrower type is a TS2717 conflict at whole-project typecheck. The library only
 * ever needs the store + version, so we write through a structural cast.
 */
interface CommanderDebugHandle {
  store: CommanderStore;
  version: string;
}

/**
 * Props for the embeddable Commander. The host (kradle/web) supplies the org and,
 * for same-origin same-host deploys, an empty `kradleApiUrl` which we resolve to
 * `window.location.origin` on the client (createKradleControllerClient throws on
 * an empty baseUrl, so we must never forward `''`).
 */
export interface CommanderRootProps {
  /** Kradle org slug (real mode). */
  org: string;
  /**
   * Base origin of the kradle BFF. Omit or pass `''` for same-origin — it is then
   * resolved to `window.location.origin` on the client.
   */
  kradleApiUrl?: string;
  /** Force the deterministic in-browser mock instead of the real control plane. */
  mock?: boolean;
  /** Optional adapters-gateway URL (runtime verbs). */
  gatewayUrl?: string;
  /** Bearer token for the kradle BFF. */
  kradleToken?: string;
  /** Default dispatch repository (default `'default'`). */
  kradleRepo?: string;
}

/** The live, client-only boot result (store + WarRoom wiring + teardown). */
interface CommanderInstance {
  store: CommanderStore;
  orders: Orders;
  views: SimViews;
  dispose(): void;
}

/**
 * Build an EXPLICIT BackendConfig from props. Never reads `import.meta.env`.
 * Must run on the client only (it reaches for `window.location.origin` to
 * resolve the same-origin `''` case).
 */
function configFromProps(props: CommanderRootProps): BackendConfig {
  if (props.mock === true) {
    return { mode: 'mock', seed: 42 };
  }
  const kradleApiUrl =
    props.kradleApiUrl !== undefined && props.kradleApiUrl !== ''
      ? props.kradleApiUrl
      : window.location.origin;
  return {
    mode: 'real',
    seed: 42,
    kradleApiUrl,
    kradleOrg: props.org,
    kradleRepo: props.kradleRepo ?? 'default',
    ...(props.kradleToken ? { kradleToken: props.kradleToken } : {}),
    ...(props.gatewayUrl ? { gatewayUrl: props.gatewayUrl } : {}),
  };
}

/**
 * Construct the backend, store, and binding for the resolved config — the
 * client-only mirror of App.tsx's module-scope boot. Returns the instance plus a
 * `dispose` that tears the binding + backend down (and clears `window.__commander`
 * when it was set).
 */
function bootCommander(props: CommanderRootProps): CommanderInstance {
  const config = configFromProps(props);
  const backend: CommanderBackend = createBackend(config);
  const store = createCommanderStore();

  let binding: BackendBinding;
  let views: SimViews;
  let attachedTestApi = false;

  if (backend instanceof MockBackend) {
    binding = bindBackendToStore(store, backend);
    views = backend.sim;
    // Test/debug hooks are exposed ONLY in mock mode (real deploys never touch
    // window.__commander). Kept minimal — the host owns the page.
    if (props.mock === true) {
      const handle: CommanderDebugHandle = { store, version: COMMANDER_VERSION };
      (window as unknown as { __commander?: CommanderDebugHandle }).__commander = handle;
      attachedTestApi = true;
    }
  } else {
    const realBinding = bootReal(store, backend, config);
    binding = realBinding;
    views = realBinding.views;
  }

  backend.connect().catch((error: unknown) => {
    // eslint-disable-next-line no-console -- boot failure is terminal, surface it
    console.error('A5C Commander: backend failed to connect', error);
  });

  return {
    store,
    orders: binding.orders,
    views,
    dispose() {
      binding.dispose();
      backend.disconnect();
      if (attachedTestApi && typeof window !== 'undefined') {
        delete (window as unknown as { __commander?: CommanderDebugHandle }).__commander;
      }
    },
  };
}

/**
 * Embeddable Commander root. Renders a full-viewport placeholder on the server
 * (and the first client paint), then boots the backend/store inside a
 * client-only effect and mounts `<WarRoom/>`.
 */
export function CommanderRoot(props: CommanderRootProps): React.JSX.Element {
  const [instance, setInstance] = useState<CommanderInstance | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const booted = bootCommander(props);
    setInstance(booted);
    return () => {
      booted.dispose();
    };
    // Re-boot when any backend-shaping prop changes (each value is primitive).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.org,
    props.kradleApiUrl,
    props.mock,
    props.gatewayUrl,
    props.kradleToken,
    props.kradleRepo,
  ]);

  if (instance === null) {
    // SSR + first-paint placeholder: no browser globals touched.
    return <div style={{ width: '100vw', height: '100vh' }} />;
  }

  return <WarRoom store={instance.store} orders={instance.orders} views={instance.views} />;
}

export default CommanderRoot;
