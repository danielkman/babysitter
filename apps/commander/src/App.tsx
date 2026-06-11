/**
 * A5C Commander — root application shell.
 *
 * Boot path (SPEC §7/§9, sim-phase handoff conventions):
 *   1. `createMockBackendFromSearch(window.location.search)` — parses ?seed=
 *      (default 42).
 *   2. A single Zustand store is bound to the backend: frames + sim views
 *      flow into ONE store commit per tick batch.
 *   3. `window.__commander = { sim: { pause, resume, tick, seed }, store,
 *      version }` is exposed BEFORE `connect()` so the e2e pause-on-boot
 *      poller halts the sim before the first auto-tick (deterministic boots).
 *   4. `connect()` emits the hello frame and starts the 250ms auto-tick.
 *
 * Module-scope singleton: React StrictMode double-mounting must not spawn a
 * second backend/interval.
 */

import { WarRoom } from './components/WarRoom';
import { createMockBackendFromSearch } from './backend/mock/mockBackend';
import {
  bindBackendToStore,
  COMMANDER_VERSION,
  createCommanderStore,
  type CommanderStore,
} from './game/store';

interface CommanderTestApi {
  sim: {
    pause(): void;
    resume(): void;
    tick(n: number): void;
    seed: number;
  };
  store: CommanderStore;
  version: string;
}

declare global {
  interface Window {
    __commander?: CommanderTestApi;
  }
}

const backend = createMockBackendFromSearch(window.location.search);
const store = createCommanderStore();
const binding = bindBackendToStore(store, backend);

// SPEC §9 test hooks API — exposed before connect() so pause-on-boot wins the
// race against the first 250ms auto-tick.
window.__commander = {
  sim: {
    pause: () => {
      backend.sim.pause();
      store.getState().setPaused(true);
    },
    resume: () => {
      backend.sim.resume();
      store.getState().setPaused(false);
    },
    tick: (n: number) => {
      backend.sim.tick(n);
      binding.flush();
    },
    seed: backend.sim.seed,
  },
  store,
  version: COMMANDER_VERSION,
};

backend.connect().catch((error: unknown) => {
  // eslint-disable-next-line no-console -- boot failure is terminal
  console.error('A5C Commander: backend failed to connect', error);
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    binding.dispose();
    backend.disconnect();
    delete window.__commander;
  });
}

export default function App(): React.JSX.Element {
  return <WarRoom store={store} orders={binding.orders} />;
}
