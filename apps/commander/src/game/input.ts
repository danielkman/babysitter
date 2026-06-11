/**
 * Interaction grammar (SPEC §5) — the full mouse/keyboard surface:
 *
 *  - Left-click unit/task: select (clears previous); Shift+click add/remove.
 *  - Drag on empty map: marquee select units inside the rect.
 *  - Right-click task node (≥1 unit selected): dispatch order.
 *  - Right-click empty ground (units selected): rally idle units.
 *  - Double-click unit: open Inspector.
 *  - Wheel: zoom toward cursor (clamped). WASD/arrows: pan.
 *  - Middle-drag or Space-drag: pan.
 *  - Esc: close steer modal → close inspector → cancel targeting → clear selection.
 *  - Space (tap): jump camera to most recent alert.
 *  - F: cycle idle units. Ctrl+1..9 assign control groups; 1..9 recall
 *    (recalling the active group again centers the camera).
 *  - Q/W/E/R/A/S/D/F/Z/X/C/V: command card hotkeys — the mode arbiter in
 *    `commands.ts` gives them precedence over the colliding camera-pan
 *    (W/A/S/D) and idle-cycle (F) duties whenever the selection is non-empty;
 *    arrow keys always pan (SPEC §5, HUD-phase contract).
 *
 * Implemented with DOM event delegation: sprites carry `data-entity-id` /
 * `data-entity-kind`; the map viewport element owns all mouse listeners and
 * the window owns keyboard listeners. Returns a cleanup function.
 */

import { screenToWorld, worldToScreen, KEY_PAN_STEP_PX, type Vec2 } from './camera';
import {
  executeIntent,
  findCommandByHotkey,
  hotkeyFromCode,
  hotkeyPrecedence,
  type CommandHotkey,
} from './commands';
import type { CommanderStore, Orders } from './store';

const DRAG_THRESHOLD_PX = 5;

interface EntityHit {
  id: string;
  kind: 'unit' | 'task';
}

type PointerMode = 'maybe-marquee' | 'marquee' | 'pan';

interface PointerSession {
  mode: PointerMode;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  shift: boolean;
}

export interface AttachInputOptions {
  store: CommanderStore;
  orders: Orders;
  element: HTMLElement;
}

function entityFromTarget(target: EventTarget | null, root: HTMLElement): EntityHit | null {
  if (!(target instanceof Element)) return null;
  const node = target.closest('[data-entity-id]');
  if (node === null || !root.contains(node)) return null;
  const id = node.getAttribute('data-entity-id');
  const kind = node.getAttribute('data-entity-kind');
  if (id === null || (kind !== 'unit' && kind !== 'task')) return null;
  return { id, kind };
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function isButtonLike(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button, a, [role="button"]') !== null;
}

export function attachInput({ store, orders, element }: AttachInputOptions): () => void {
  let pointer: PointerSession | null = null;
  let spaceHeld = false;
  let spaceUsedForDrag = false;

  const localPoint = (e: MouseEvent): Vec2 => {
    const rect = element.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const toWorld = (screen: Vec2): Vec2 => {
    const state = store.getState();
    return screenToWorld(screen, state.camera, state.meta.viewport);
  };

  /** Unit ids whose world position projects inside the screen-space rect. */
  const unitsInScreenRect = (x0: number, y0: number, x1: number, y1: number): string[] => {
    const state = store.getState();
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    const pad = 14; // half a sprite, screen px — forgiving marquee edges
    const out: string[] = [];
    for (const id of state.world.unitIds) {
      const pos = state.world.positions[id];
      if (pos === undefined) continue;
      const screen = worldToScreen(pos, state.camera, state.meta.viewport);
      if (
        screen.x >= minX - pad &&
        screen.x <= maxX + pad &&
        screen.y >= minY - pad &&
        screen.y <= maxY + pad
      ) {
        out.push(id);
      }
    }
    return out;
  };

  const dispatchSelectionToTask = (taskId: string): boolean => {
    const state = store.getState();
    const unitIds = state.selection.ids.filter((id) => state.world.units[id] !== undefined);
    if (unitIds.length === 0) return false;
    orders.dispatchToTask(unitIds, taskId);
    return true;
  };

  const rallySelectionAt = (world: Vec2): void => {
    const state = store.getState();
    const unitIds = state.selection.ids.filter((id) => state.world.units[id] !== undefined);
    if (unitIds.length === 0) return;
    orders.rally(unitIds, world);
  };

  // --- mouse -----------------------------------------------------------------

  const onMouseDown = (e: MouseEvent): void => {
    const point = localPoint(e);
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      pointer = { mode: 'pan', startX: point.x, startY: point.y, lastX: point.x, lastY: point.y, shift: e.shiftKey };
      if (spaceHeld) spaceUsedForDrag = true;
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    const hit = entityFromTarget(e.target, element);
    const state = store.getState();

    if (hit !== null) {
      // Targeting mode: a primed "Dispatch…" click on a task fires the order.
      if (state.meta.targeting === 'dispatch' && hit.kind === 'task') {
        if (dispatchSelectionToTask(hit.id)) {
          store.getState().setTargeting(null);
          return;
        }
      }
      store.getState().clickSelect(hit.id, e.shiftKey);
      return;
    }

    // Empty ground: candidate marquee (or click-to-clear on mouseup).
    pointer = {
      mode: 'maybe-marquee',
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      shift: e.shiftKey,
    };
  };

  const onMouseMove = (e: MouseEvent): void => {
    if (pointer === null) return;
    const point = localPoint(e);
    const dx = point.x - pointer.lastX;
    const dy = point.y - pointer.lastY;
    pointer.lastX = point.x;
    pointer.lastY = point.y;

    if (pointer.mode === 'pan') {
      store.getState().panBy(-dx, -dy);
      return;
    }
    if (
      pointer.mode === 'maybe-marquee' &&
      (Math.abs(point.x - pointer.startX) > DRAG_THRESHOLD_PX ||
        Math.abs(point.y - pointer.startY) > DRAG_THRESHOLD_PX)
    ) {
      pointer.mode = 'marquee';
    }
    if (pointer.mode === 'marquee') {
      store.getState().setMarquee({ x0: pointer.startX, y0: pointer.startY, x1: point.x, y1: point.y });
    }
  };

  const onMouseUp = (e: MouseEvent): void => {
    if (pointer === null) return;
    const session = pointer;
    pointer = null;
    const point = localPoint(e);

    if (session.mode === 'marquee') {
      const ids = unitsInScreenRect(session.startX, session.startY, point.x, point.y);
      store.getState().setMarquee(null);
      store.getState().marqueeSelect(ids, session.shift || e.shiftKey);
      return;
    }
    if (session.mode === 'maybe-marquee') {
      const state = store.getState();
      if (state.meta.targeting === 'rally') {
        rallySelectionAt(toWorld(point));
        store.getState().setTargeting(null);
        return;
      }
      if (state.meta.targeting === 'dispatch') {
        store.getState().setTargeting(null);
        return;
      }
      if (!session.shift && !e.shiftKey) {
        store.getState().clearSelection();
      }
    }
  };

  const onDblClick = (e: MouseEvent): void => {
    const hit = entityFromTarget(e.target, element);
    if (hit !== null && hit.kind === 'unit') {
      store.getState().openInspector(hit.id);
    }
  };

  const onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    const hit = entityFromTarget(e.target, element);
    if (hit !== null && hit.kind === 'task') {
      dispatchSelectionToTask(hit.id);
      return;
    }
    if (hit !== null && hit.kind === 'unit') {
      return; // right-click on a unit is a no-op in v1
    }
    rallySelectionAt(toWorld(localPoint(e)));
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    store.getState().zoomAt(localPoint(e), e.deltaY);
  };

  // --- keyboard -----------------------------------------------------------------

  /** Screen-space pan delta for the WASD letters (camera-pan domain). */
  const panDeltaFor = (letter: CommandHotkey): Vec2 | null => {
    switch (letter) {
      case 'W':
        return { x: 0, y: -KEY_PAN_STEP_PX };
      case 'S':
        return { x: 0, y: KEY_PAN_STEP_PX };
      case 'A':
        return { x: -KEY_PAN_STEP_PX, y: 0 };
      case 'D':
        return { x: KEY_PAN_STEP_PX, y: 0 };
      default:
        return null;
    }
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (isTextEntry(e.target)) return;

    switch (e.code) {
      case 'Space':
        if (isButtonLike(e.target)) return; // let focused buttons receive Space
        if (!e.repeat) spaceUsedForDrag = false;
        spaceHeld = true;
        e.preventDefault();
        return;
      case 'Escape':
        store.getState().escape();
        return;
      // Arrow keys always pan — they never collide with command hotkeys (SPEC §5).
      case 'ArrowUp':
        store.getState().panBy(0, -KEY_PAN_STEP_PX);
        e.preventDefault();
        return;
      case 'ArrowDown':
        store.getState().panBy(0, KEY_PAN_STEP_PX);
        e.preventDefault();
        return;
      case 'ArrowLeft':
        store.getState().panBy(-KEY_PAN_STEP_PX, 0);
        e.preventDefault();
        return;
      case 'ArrowRight':
        store.getState().panBy(KEY_PAN_STEP_PX, 0);
        e.preventDefault();
        return;
      default:
        break;
    }

    const digitMatch = /^Digit([1-9])$/.exec(e.code);
    if (digitMatch !== null) {
      const digit = digitMatch[1];
      if (digit === undefined) return;
      if (e.ctrlKey || e.metaKey) {
        store.getState().assignGroup(digit);
        e.preventDefault();
      } else {
        store.getState().recallGroup(digit);
      }
      return;
    }

    // Command hotkeys (Q/W/E/R/A/S/D/F/Z/X/C/V) through the mode arbiter.
    // Modified letters (Ctrl+C, Cmd+R, …) stay with the browser.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const letter = hotkeyFromCode(e.code);
    if (letter === null) return;
    const state = store.getState();
    const domains = hotkeyPrecedence(letter, state.selection.ids.length > 0);
    for (const domain of domains) {
      if (domain === 'command') {
        const spec = findCommandByHotkey(state, letter);
        if (spec !== undefined) {
          // A visible cell claims the key even when disabled or auto-repeating —
          // it must not leak through to camera pan mid-press.
          if (!e.repeat && spec.enabled) executeIntent(spec.intent, store, orders);
          e.preventDefault();
          return;
        }
      } else if (domain === 'camera-pan') {
        const delta = panDeltaFor(letter);
        if (delta !== null) {
          store.getState().panBy(delta.x, delta.y);
          e.preventDefault();
          return;
        }
      } else {
        store.getState().cycleIdle();
        return;
      }
    }
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.code !== 'Space') return;
    if (isTextEntry(e.target) || isButtonLike(e.target)) return;
    const wasDrag = spaceUsedForDrag;
    spaceHeld = false;
    spaceUsedForDrag = false;
    if (!wasDrag) {
      store.getState().jumpToLatestAlert();
    }
  };

  const onBlur = (): void => {
    spaceHeld = false;
    spaceUsedForDrag = false;
    pointer = null;
    store.getState().setMarquee(null);
  };

  element.addEventListener('mousedown', onMouseDown);
  element.addEventListener('dblclick', onDblClick);
  element.addEventListener('contextmenu', onContextMenu);
  element.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return () => {
    element.removeEventListener('mousedown', onMouseDown);
    element.removeEventListener('dblclick', onDblClick);
    element.removeEventListener('contextmenu', onContextMenu);
    element.removeEventListener('wheel', onWheel);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}
