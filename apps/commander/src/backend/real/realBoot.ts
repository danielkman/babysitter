/**
 * Real-mode boot binding (SPEC-LIVE-BACKEND §7.2). The additive companion to
 * `bindBackendToStore` for the live path: it mirrors ONLY the frame half (the
 * gateway streams `run.event`/`hook.request` frames) and deliberately omits the
 * mock-only sim-view half, which has no v1 gateway source (§6).
 *
 * This module is NOT used in mock mode. `bindBackendToStore` (the load-bearing
 * mock binding) is untouched — mock mode stays byte-identical (AC3/AC4).
 *
 * It exports:
 *   - `bootReal(store, backend)` → `{ flush, orders, views, dispose }`, the same
 *     shape `App.tsx` consumes from `bindBackendToStore` plus a `SimViews` stub;
 *   - `realViewsStub` — a `SimViews` implementation returning empty/null (the §6
 *     view-method gap) so `<WarRoom views=... />`'s prop type is satisfied with
 *     no UI change.
 */

import type { ServerFrame } from '../../contracts/gateway-protocol';
import type { CommanderBackend } from '../types';
import type {
  SimFileTreeNode,
  SimGitCommitView,
  SimMemoryIOView,
  SimProcessTemplateView,
  SimRosterAgentView,
  SimRunObservationView,
  SimRunView,
  SimSessionDetailView,
  SimSessionView,
  SimStackView,
  SimWorkspaceSummaryView,
  SimWorkspaceView,
  SimCardView,
} from '../mock/simulation';
import type { SimViews } from '../../game/views';
import type { BackendBinding, CommanderStore, Orders } from '../../game/store';

/**
 * Real-mode `SimViews`: every read returns the empty/null equivalent (§6). The
 * gateway exposes no sim-derived view surface in v1; these degrade gracefully
 * until the corresponding kradle/gateway surfaces exist.
 */
export const realViewsStub: SimViews = {
  getWorkspaceView(): SimWorkspaceView | null {
    return null;
  },
  getRunObservation(): SimRunObservationView | null {
    return null;
  },
  listStacks(): SimStackView[] {
    return [];
  },
  listRosterAgents(): SimRosterAgentView[] {
    return [];
  },
  listRuns(): SimRunView[] {
    return [];
  },
  listProcessTemplates(): SimProcessTemplateView[] {
    return [];
  },
  getMemoryIO(): SimMemoryIOView {
    return { read: [], written: [] };
  },
  getWorkspaceTree(): SimFileTreeNode | null {
    return null;
  },
  getFileContent(): string | null {
    return null;
  },
  getGitLog(): SimGitCommitView[] {
    return [];
  },
  listSessions(): SimSessionView[] {
    return [];
  },
  getSession(): SimSessionDetailView | null {
    return null;
  },
  listCardViews(): SimCardView[] {
    return [];
  },
  listWorkspaces(): SimWorkspaceSummaryView[] {
    return [];
  },
};

/**
 * Real-mode `Orders`: frame-bearing verbs (abort/steer/decide/answerInquiry)
 * ride real `ClientFrame`s through the gateway; board / sim-local / editor /
 * roster verbs are documented v1 no-ops (§6/AC7) — type-appropriate empties.
 */
function makeRealOrders(backend: CommanderBackend, flush: () => void): Orders {
  return {
    abort(unitIds) {
      for (const unitId of unitIds) {
        backend.send({ type: 'session.message', sessionId: unitId, prompt: '/abort' });
      }
      flush();
    },
    steer(unitIds, prompt) {
      for (const unitId of unitIds) {
        backend.send({ type: 'session.message', sessionId: unitId, prompt });
      }
      flush();
    },
    decide(hookRequestId, decision) {
      backend.send({ type: 'hook.decision', hookRequestId, decision });
      flush();
    },
    answerInquiry(hookRequestId, optionId) {
      backend.send({
        type: 'hook.decision',
        hookRequestId,
        decision: 'allow',
        ...(optionId !== null ? { optionId } : {}),
      });
      flush();
    },
    // --- sim-local / board verbs: no v1 gateway frame (documented §6 gap) ----
    pauseUnits() {
      /* v1 gap: no gateway verb */
    },
    resumeUnits() {
      /* v1 gap: no gateway verb */
    },
    prioritize() {
      /* v1 gap: no gateway verb */
    },
    toggleSim() {
      /* v1 gap: no gateway verb */
    },
    moveCard() {
      /* v1 gap: no gateway verb */
    },
    setYolo() {
      /* v1 gap: no gateway verb */
    },
    createTask() {
      return null;
    },
    revertCard() {
      /* v1 gap: no gateway verb */
    },
    release() {
      return null;
    },
    rollbackCard() {
      /* v1 gap: no gateway verb */
    },
    setSpeed() {
      return false;
    },
    updateTask() {
      return false;
    },
    upsertStack() {
      return null;
    },
    updateProcessTemplate() {
      return null;
    },
    writeFile() {
      return false;
    },
    createRosterAgent() {
      return null;
    },
    deleteRosterAgent() {
      /* v1 gap: no gateway verb */
    },
    assignTaskAgent() {
      /* v1 gap: no gateway verb */
    },
    assignTaskHuman() {
      /* v1 gap: no gateway verb */
    },
    focusInquiryCard() {
      /* navigation is UI-local; no-op until real cards stream */
    },
  };
}

export interface RealBootBinding extends BackendBinding {
  /** The `SimViews` surface passed to `<WarRoom views=... />` in real mode. */
  views: SimViews;
}

/**
 * Bind a live `CommanderBackend` to the store via the frame half only (§7.2).
 * Frames are buffered and coalesced into one `commitTick` per microtask burst,
 * mirroring `bindBackendToStore`'s batching — but with empty sim-view payloads
 * (the live board population from frames is the NEXT deliverable; this ships the
 * transport binding).
 */
export function bootReal(store: CommanderStore, backend: CommanderBackend): RealBootBinding {
  let pending: ServerFrame[] = [];
  let scheduled = false;
  let disposed = false;
  let tickIndex = 0;

  const flush = (): void => {
    if (disposed) return;
    if (pending.length === 0) return;
    const frames = pending;
    pending = [];
    tickIndex += 1;
    store.getState().commitTick({
      frames,
      units: [],
      tasks: [],
      hooks: [],
      cards: [],
      agents: [],
      inquiries: [],
      runStages: {},
      rosterAgents: [],
      // Real path MAY use wall-clock time — determinism is the mock's contract
      // only (AC2). The store tolerates a monotonic-ish nowMs.
      nowMs: Date.now(),
      tickIndex,
      paused: false,
    });
  };

  const unsubscribe = backend.onFrame((frame) => {
    pending.push(frame);
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        flush();
      });
    }
  });

  const orders = makeRealOrders(backend, flush);

  return {
    flush,
    orders,
    views: realViewsStub,
    dispose() {
      disposed = true;
      unsubscribe();
    },
  };
}
