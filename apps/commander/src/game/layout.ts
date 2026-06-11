/**
 * Seeded deterministic world layout (SPEC §6).
 *
 * - Tasks (objectives) cluster around workspace zones in the upper band of the
 *   world (one ring per zone; second ring when a workspace holds >6 tasks).
 * - Units sit in a staging area (rows below the objectives) when idle, or in
 *   an orbit slot around their assigned task when dispatched.
 * - Everything derives from entity ids via FNV-1a hashing (`hashString`) or
 *   sorted-id ordering — same world, same ids ⇒ same layout (AC12/AC13).
 *
 * UI-only metadata lives here, OUTSIDE the mirrored contracts (SPEC §2).
 */

import { hashString } from '../backend/mock/prng';
import type { SimTaskView } from '../backend/mock/simulation';
import type { Size, Vec2 } from './camera';

/** World bounds in world units. Camera centers clamp to this rect. */
export const WORLD: Size = { width: 2000, height: 1100 };

/** Staging grid (idle units) — centered low-middle, rows of 8. */
const STAGING_CENTER: Vec2 = { x: 1000, y: 620 };
const STAGING_COLS = 8;
const STAGING_SPACING_X = 90;
const STAGING_SPACING_Y = 84;

/** Orbit radius for units parked on an assigned task. */
const TASK_ORBIT_RADIUS = 82;

export interface WorldLayout {
  /** workspaceId → zone center. */
  zoneCenters: Record<string, Vec2>;
  /** taskId → fixed structure position. */
  taskPositions: Record<string, Vec2>;
  /** Cache key: sorted task ids. */
  signature: string;
}

/** Compute the static objective layout for the current task set. */
export function computeLayout(tasks: readonly SimTaskView[]): WorldLayout {
  const sorted = [...tasks].sort((a, b) => a.taskId.localeCompare(b.taskId));
  const signature = sorted.map((t) => t.taskId).join('|');

  const workspaceIds = [...new Set(sorted.map((t) => t.workspaceId))].sort();
  const zoneCenters: Record<string, Vec2> = {};
  const zoneCount = Math.max(workspaceIds.length, 1);
  workspaceIds.forEach((ws, index) => {
    const x = zoneCount === 1 ? WORLD.width / 2 : 500 + (1000 * index) / (zoneCount - 1);
    zoneCenters[ws] = { x: Math.round(x), y: 300 };
  });

  const perZoneIndex: Record<string, number> = {};
  const taskPositions: Record<string, Vec2> = {};
  for (const task of sorted) {
    const slotIndex = perZoneIndex[task.workspaceId] ?? 0;
    perZoneIndex[task.workspaceId] = slotIndex + 1;
    const center = zoneCenters[task.workspaceId] ?? { x: WORLD.width / 2, y: 300 };
    const ring = Math.floor(slotIndex / 6);
    const slot = slotIndex % 6;
    const radius = 170 + ring * 115;
    const angle = -Math.PI / 2 + slot * ((Math.PI * 2) / 6) + ring * 0.45;
    taskPositions[task.taskId] = {
      x: Math.round(center.x + radius * Math.cos(angle)),
      y: Math.round(center.y + radius * Math.sin(angle)),
    };
  }

  return { zoneCenters, taskPositions, signature };
}

/** Layout signature for the current task set (cache invalidation key). */
export function layoutSignature(tasks: readonly SimTaskView[]): string {
  return tasks
    .map((t) => t.taskId)
    .sort()
    .join('|');
}

/** Staging slot for the unit at `index` in the sorted-unit-id order. */
export function stagingSlot(index: number): Vec2 {
  const col = index % STAGING_COLS;
  const row = Math.floor(index / STAGING_COLS);
  return {
    x: Math.round(STAGING_CENTER.x + (col - (STAGING_COLS - 1) / 2) * STAGING_SPACING_X),
    y: Math.round(STAGING_CENTER.y + row * STAGING_SPACING_Y),
  };
}

/** Deterministic orbit slot around an assigned task, keyed by unit+task ids. */
export function taskOrbitSlot(taskPosition: Vec2, unitId: string, taskId: string): Vec2 {
  const angleDeg = hashString(`${unitId}:${taskId}`) % 360;
  const angle = (angleDeg * Math.PI) / 180;
  return {
    x: Math.round(taskPosition.x + TASK_ORBIT_RADIUS * Math.cos(angle)),
    y: Math.round(taskPosition.y + TASK_ORBIT_RADIUS * Math.sin(angle)),
  };
}

/** Spread offset for rally orders so grouped units do not stack exactly. */
export function rallyOffset(orderIndex: number): Vec2 {
  const col = orderIndex % 3;
  const row = Math.floor(orderIndex / 3);
  return { x: (col - 1) * 70, y: row * 70 };
}

/** Clamp a world point inside the world rect (rally clicks near edges). */
export function clampToWorld(point: Vec2): Vec2 {
  return {
    x: Math.min(WORLD.width - 40, Math.max(40, Math.round(point.x))),
    y: Math.min(WORLD.height - 40, Math.max(40, Math.round(point.y))),
  };
}
