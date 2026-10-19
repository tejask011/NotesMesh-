import { describe, it, expect } from 'vitest';
import {
  Viewport,
  clampZoom,
  screenToWorld,
  zoomViewportAt,
  resizeViewport,
  MIN_ZOOM,
  MAX_ZOOM,
} from '../core/graph/viewport';

describe('graph viewport', () => {
  const base: Viewport = { x: 120, y: 80, zoom: 1 };

  it('clamps zoom to the supported range', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(9)).toBe(MAX_ZOOM);
    expect(clampZoom(1.4)).toBe(1.4);
  });

  it('keeps the point under the cursor fixed while zooming in', () => {
    const cursor = { x: 420, y: 310 };
    const before = screenToWorld(base, cursor.x, cursor.y);
    const next = zoomViewportAt(base, cursor.x, cursor.y, 1.5);
    const after = screenToWorld(next, cursor.x, cursor.y);

    expect(next.zoom).toBe(1.5);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('keeps the point under the cursor fixed while zooming out to the lower clamp', () => {
    const viewport: Viewport = { x: 40, y: 25, zoom: 0.5 };
    const cursor = { x: 200, y: 150 };
    const before = screenToWorld(viewport, cursor.x, cursor.y);
    const next = zoomViewportAt(viewport, cursor.x, cursor.y, 0.1);

    expect(next.zoom).toBe(MIN_ZOOM);
    const after = screenToWorld(next, cursor.x, cursor.y);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('does not move the viewport once the zoom limit is reached', () => {
    const maxed: Viewport = { x: 10, y: 20, zoom: MAX_ZOOM };
    expect(zoomViewportAt(maxed, 300, 200, 1.2)).toBe(maxed);

    const minned: Viewport = { x: 10, y: 20, zoom: MIN_ZOOM };
    expect(zoomViewportAt(minned, 300, 200, 0.8)).toBe(minned);
  });

  it('returns to the original view after zooming in and out at the same point', () => {
    const cursor = { x: 333, y: 222 };
    const zoomedIn = zoomViewportAt(base, cursor.x, cursor.y, 1.25);
    const restored = zoomViewportAt(zoomedIn, cursor.x, cursor.y, 1 / 1.25);

    expect(restored.zoom).toBeCloseTo(base.zoom, 6);
    expect(restored.x).toBeCloseTo(base.x, 6);
    expect(restored.y).toBeCloseTo(base.y, 6);
  });

  it('keeps the center world point fixed when the canvas grows', () => {
    const beforeW = 800;
    const beforeH = 600;
    const afterW = 1000;
    const afterH = 700;

    const centerBefore = screenToWorld(base, beforeW / 2, beforeH / 2);
    const next = resizeViewport(base, beforeW, beforeH, afterW, afterH);
    const centerAfter = screenToWorld(next, afterW / 2, afterH / 2);

    expect(centerAfter.x).toBeCloseTo(centerBefore.x, 6);
    expect(centerAfter.y).toBeCloseTo(centerBefore.y, 6);
    expect(next.zoom).toBe(base.zoom);
  });

  it('keeps the center world point fixed when the canvas shrinks', () => {
    const viewport: Viewport = { x: 250, y: 175, zoom: 1.6 };
    const beforeW = 1200;
    const beforeH = 800;
    const afterW = 700;
    const afterH = 500;

    const centerBefore = screenToWorld(viewport, beforeW / 2, beforeH / 2);
    const next = resizeViewport(viewport, beforeW, beforeH, afterW, afterH);
    const centerAfter = screenToWorld(next, afterW / 2, afterH / 2);

    expect(centerAfter.x).toBeCloseTo(centerBefore.x, 6);
    expect(centerAfter.y).toBeCloseTo(centerBefore.y, 6);
  });

  it('leaves the viewport untouched when the size does not change', () => {
    expect(resizeViewport(base, 800, 600, 800, 600)).toBe(base);
  });
});
