/**
 * Camera math tests (SPEC §5/§6, AC9): clamped zoom/pan bounds,
 * zoom-toward-cursor anchor invariance, screen/world round-trips.
 */
import { describe, expect, it } from 'vitest';

import {
  centerOn,
  clampCamera,
  clampZoom,
  createDefaultCamera,
  panByScreen,
  screenToWorld,
  worldToScreen,
  zoomAtPoint,
  ZOOM_MAX,
  ZOOM_MIN,
  type CameraState,
  type Size,
} from '../camera';
import { WORLD } from '../layout';

const VIEWPORT: Size = { width: 1280, height: 720 };

describe('clamping', () => {
  it('clamps zoom to [ZOOM_MIN, ZOOM_MAX]', () => {
    expect(clampZoom(0.0001)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(Number.NaN)).toBe(ZOOM_MIN);
  });

  it('clamps the camera center inside the world rect', () => {
    const clamped = clampCamera({ x: -500, y: 99_999, zoom: 1 }, WORLD);
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(WORLD.height);
  });

  it('returns the same reference when nothing changes', () => {
    const camera: CameraState = { x: 100, y: 100, zoom: 1 };
    expect(clampCamera(camera, WORLD)).toBe(camera);
  });
});

describe('screen/world transforms', () => {
  it('round-trips world → screen → world', () => {
    const camera = createDefaultCamera(WORLD);
    const point = { x: 321, y: 654 };
    const back = screenToWorld(worldToScreen(point, camera, VIEWPORT), camera, VIEWPORT);
    expect(back.x).toBeCloseTo(point.x, 8);
    expect(back.y).toBeCloseTo(point.y, 8);
  });

  it('maps the camera center to the viewport center', () => {
    const camera: CameraState = { x: 700, y: 400, zoom: 1.3 };
    const screen = worldToScreen({ x: 700, y: 400 }, camera, VIEWPORT);
    expect(screen.x).toBe(VIEWPORT.width / 2);
    expect(screen.y).toBe(VIEWPORT.height / 2);
  });
});

describe('panByScreen', () => {
  it('moves the camera by screen-delta / zoom', () => {
    const camera: CameraState = { x: 1000, y: 550, zoom: 2 };
    const panned = panByScreen(camera, 100, -50, WORLD);
    expect(panned.x).toBe(1050);
    expect(panned.y).toBe(525);
  });

  it('clamps at the world edge', () => {
    const camera: CameraState = { x: WORLD.width - 1, y: 550, zoom: 1 };
    const panned = panByScreen(camera, 10_000, 0, WORLD);
    expect(panned.x).toBe(WORLD.width);
  });
});

describe('zoomAtPoint (zoom toward cursor)', () => {
  it('keeps the world point under the cursor fixed', () => {
    const camera = createDefaultCamera(WORLD);
    const cursor = { x: 900, y: 200 };
    const anchorBefore = screenToWorld(cursor, camera, VIEWPORT);
    const zoomed = zoomAtPoint(camera, cursor, -240, VIEWPORT, WORLD);
    expect(zoomed.zoom).toBeGreaterThan(camera.zoom);
    const anchorAfter = screenToWorld(cursor, zoomed, VIEWPORT);
    expect(anchorAfter.x).toBeCloseTo(anchorBefore.x, 6);
    expect(anchorAfter.y).toBeCloseTo(anchorBefore.y, 6);
  });

  it('is a strict no-op (same reference) once zoom is clamped at the max', () => {
    let camera = createDefaultCamera(WORLD);
    for (let i = 0; i < 60; i += 1) {
      camera = zoomAtPoint(camera, { x: 640, y: 360 }, -240, VIEWPORT, WORLD);
    }
    expect(camera.zoom).toBe(ZOOM_MAX);
    const again = zoomAtPoint(camera, { x: 640, y: 360 }, -240, VIEWPORT, WORLD);
    expect(again).toBe(camera);
  });

  it('is a strict no-op once zoom is clamped at the min', () => {
    let camera = createDefaultCamera(WORLD);
    for (let i = 0; i < 120; i += 1) {
      camera = zoomAtPoint(camera, { x: 640, y: 360 }, 240, VIEWPORT, WORLD);
    }
    expect(camera.zoom).toBe(ZOOM_MIN);
    const again = zoomAtPoint(camera, { x: 640, y: 360 }, 240, VIEWPORT, WORLD);
    expect(again).toBe(camera);
  });
});

describe('centerOn', () => {
  it('centers on the point, clamped to world bounds', () => {
    const camera = createDefaultCamera(WORLD);
    const centered = centerOn(camera, { x: -100, y: 480 }, WORLD);
    expect(centered.x).toBe(0);
    expect(centered.y).toBe(480);
    expect(centered.zoom).toBe(camera.zoom);
  });
});
