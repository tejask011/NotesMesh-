/**
 * Viewport math for the knowledge graph canvas.
 *
 * The canvas is drawn with translate(x, y) followed by scale(zoom), so screen
 * coordinates map to world coordinates as:
 *
 *   screen = world * zoom + offset
 *   world  = (screen - offset) / zoom
 *
 * Keeping this in one place makes cursor anchored zoom and resize handling
 * testable without a DOM.
 */

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 2.5;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function screenToWorld(viewport: Viewport, screenX: number, screenY: number) {
  return {
    x: (screenX - viewport.x) / viewport.zoom,
    y: (screenY - viewport.y) / viewport.zoom,
  };
}

/**
 * Zooms around a screen point. The world coordinate under that point stays
 * under it after the zoom, both for wheel input and for button zooming.
 */
export function zoomViewportAt(
  viewport: Viewport,
  screenX: number,
  screenY: number,
  factor: number
): Viewport {
  const zoom = clampZoom(viewport.zoom * factor);
  if (zoom === viewport.zoom) return viewport;

  const world = screenToWorld(viewport, screenX, screenY);

  return {
    x: screenX - world.x * zoom,
    y: screenY - world.y * zoom,
    zoom,
  };
}

/**
 * Keeps the world point at the canvas center fixed when the canvas changes
 * size. The canvas top left stays at the same page position, so the center
 * moves by half of each size delta.
 */
export function resizeViewport(
  viewport: Viewport,
  previousWidth: number,
  previousHeight: number,
  width: number,
  height: number
): Viewport {
  const dx = (width - previousWidth) / 2;
  const dy = (height - previousHeight) / 2;

  if (dx === 0 && dy === 0) return viewport;

  return {
    ...viewport,
    x: viewport.x + dx,
    y: viewport.y + dy,
  };
}
