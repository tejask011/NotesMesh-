import { CanvasDocument, CanvasElement } from '../domain/canvas';
import { createId } from '../util/ids';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Computes optimal attachment points between two shapes */
export function getAutoConnectPoints(
  fromEl: CanvasElement,
  toEl: CanvasElement
): { fromPoint: { x: number; y: number }; toPoint: { x: number; y: number } } {
  const centerA = { x: fromEl.x + fromEl.width / 2, y: fromEl.y + fromEl.height / 2 };
  const centerB = { x: toEl.x + toEl.width / 2, y: toEl.y + toEl.height / 2 };

  const dx = centerB.x - centerA.x;
  const dy = centerB.y - centerA.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0
      ? {
          fromPoint: { x: fromEl.x + fromEl.width, y: centerA.y },
          toPoint: { x: toEl.x, y: centerB.y },
        }
      : {
          fromPoint: { x: fromEl.x, y: centerA.y },
          toPoint: { x: toEl.x + toEl.width, y: centerB.y },
        };
  }
  return dy > 0
    ? {
        fromPoint: { x: centerA.x, y: fromEl.y + fromEl.height },
        toPoint: { x: centerB.x, y: toEl.y },
      }
    : {
        fromPoint: { x: centerA.x, y: fromEl.y },
        toPoint: { x: centerB.x, y: toEl.y + toEl.height },
      };
}

/** Re-route connectors attached to shapes so they follow any moved shapes. */
export function syncConnectors(elements: CanvasElement[]): CanvasElement[] {
  const byId = new Map(elements.map(el => [el.id, el]));
  return elements.map(el => {
    if (el.type !== 'connector' || !el.fromId || !el.toId) return el;
    const source = byId.get(el.fromId);
    const target = byId.get(el.toId);
    if (!source || !target) return el;
    return { ...el, ...getAutoConnectPoints(source, target) };
  });
}

/**
 * Offset `ids` by (dx, dy) relative to `base`, the positions when the move began.
 * Free-standing connectors shift their own endpoints; attached ones follow their shapes.
 */
export function moveElements(
  base: CanvasElement[],
  ids: ReadonlySet<string>,
  dx: number,
  dy: number
): CanvasElement[] {
  const moved = base.map(el => {
    if (!ids.has(el.id)) return el;
    if (el.type === 'connector' && el.fromId && el.toId) return el;
    return {
      ...el,
      x: Math.round(el.x + dx),
      y: Math.round(el.y + dy),
      ...(el.fromPoint && {
        fromPoint: { x: Math.round(el.fromPoint.x + dx), y: Math.round(el.fromPoint.y + dy) },
      }),
      ...(el.toPoint && {
        toPoint: { x: Math.round(el.toPoint.x + dx), y: Math.round(el.toPoint.y + dy) },
      }),
    };
  });
  return syncConnectors(moved);
}

/** Delete elements along with any connector left attached to one of them. */
export function removeElements(
  elements: CanvasElement[],
  ids: ReadonlySet<string>
): CanvasElement[] {
  return elements.filter(el => {
    if (ids.has(el.id)) return false;
    if (
      el.type === 'connector' &&
      ((el.fromId && ids.has(el.fromId)) || (el.toId && ids.has(el.toId)))
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Clone elements with an offset. A connector clone points at its shapes' clones
 * when those were duplicated too; otherwise it detaches, keeping its position,
 * rather than pointing back at the originals.
 */
export function duplicateElements(
  elements: CanvasElement[],
  ids: ReadonlySet<string>,
  offset = 30
): { elements: CanvasElement[]; newIds: Set<string> } {
  const selected = elements.filter(el => ids.has(el.id));
  const idMap = new Map(
    selected.map(el => [el.id, createId(el.type === 'connector' ? 'connector' : 'el')])
  );
  const shift = (point?: { x: number; y: number }) =>
    point && { x: point.x + offset, y: point.y + offset };

  const clones = selected.map(el => {
    const fromId = el.fromId && idMap.get(el.fromId);
    const toId = el.toId && idMap.get(el.toId);
    return {
      ...el,
      id: idMap.get(el.id) as string,
      x: el.x + offset,
      y: el.y + offset,
      fromPoint: shift(el.fromPoint),
      toPoint: shift(el.toPoint),
      fromId: fromId && toId ? fromId : undefined,
      toId: fromId && toId ? toId : undefined,
    };
  });

  return {
    elements: syncConnectors([...elements, ...clones]),
    newIds: new Set(clones.map(clone => clone.id)),
  };
}

const connectorBounds = (el: CanvasElement): Rect => {
  const a = el.fromPoint ?? { x: el.x, y: el.y };
  const b = el.toPoint ?? { x: el.x + el.width, y: el.y + el.height };
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
};

export const elementBounds = (el: CanvasElement): Rect =>
  el.type === 'connector'
    ? connectorBounds(el)
    : { x: el.x, y: el.y, width: el.width, height: el.height };

const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

/** Ids of elements fully inside the rectangle. */
export function elementsInRect(elements: CanvasElement[], rect: Rect): Set<string> {
  return new Set(elements.filter(el => contains(rect, elementBounds(el))).map(el => el.id));
}

export function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function contentBounds(elements: CanvasElement[], padding = 0): Rect {
  if (elements.length === 0) return { x: 0, y: 0, width: padding * 2, height: padding * 2 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const bounds = elementBounds(el);
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

/**
 * Dark or light text, whichever is readable on the given fill. Shapes can be any
 * color in either theme, so text color can't just follow the theme. Colors that
 * can't be parsed (like "transparent") sit on the board, so they get `fallback`.
 */
export function readableTextColor(background: string | undefined, fallback: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(background ?? '');
  if (!match) return fallback;
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  // Perceived brightness (ITU-R BT.601).
  return (red * 299 + green * 587 + blue * 114) / 1000 > 140 ? '#0f172a' : '#f8fafc';
}

export function createBoard(title: string, now = Date.now()): CanvasDocument {
  return {
    id: createId('canvas'),
    title,
    elements: [],
    viewport: { x: 50, y: 50, zoom: 1 },
    gridEnabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function connectorPath(el: CanvasElement): string {
  const x1 = el.fromPoint?.x ?? el.x;
  const y1 = el.fromPoint?.y ?? el.y;
  const x2 = el.toPoint?.x ?? el.x + 100;
  const y2 = el.toPoint?.y ?? el.y + 50;
  const midX = (x1 + x2) / 2;

  switch (el.connectorStyle ?? 'curved') {
    case 'straight':
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    case 'orthogonal':
      return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
    default:
      return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  }
}

export function cylinderBodyPath(width: number, height: number): string {
  return `M 0 16 L 0 ${height - 16} A ${width / 2} 16 0 0 0 ${width} ${height - 16} L ${width} 16 Z`;
}

export const CLOUD_PATH =
  'M 20 45 A 20 20 0 0 1 50 20 A 30 30 0 0 1 110 20 A 25 25 0 0 1 145 45 A 20 20 0 0 1 135 80 L 25 80 A 20 20 0 0 1 20 45 Z';
export const cloudScale = (width: number, height: number) =>
  `scale(${width / 160}, ${height / 95})`;

export const diamondPoints = (width: number, height: number) =>
  `${width / 2},0 ${width},${height / 2} ${width / 2},${height} 0,${height / 2}`;

export const hexagonPoints = (width: number, height: number) =>
  `${width * 0.25},0 ${width * 0.75},0 ${width},${height * 0.5} ${width * 0.75},${height} ${width * 0.25},${height} 0,${height * 0.5}`;
