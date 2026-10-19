import { Note } from '../domain/note';
import {
  ArrowHeadType,
  CanvasDocument,
  CanvasElement,
  CanvasElementType,
  ConnectorStyle,
} from '../domain/canvas';

export interface WorkspaceBackup {
  notes: Note[] | null;
  canvases: CanvasDocument[] | null;
  skipped: number;
}

const CANVAS_ELEMENT_TYPES: CanvasElementType[] = [
  'rectangle',
  'diamond',
  'circle',
  'cylinder',
  'cloud',
  'hexagon',
  'parallelogram',
  'actor',
  'sticky',
  'text',
  'note-card',
  'connector',
];

const CONNECTOR_STYLES: ConnectorStyle[] = ['curved', 'orthogonal', 'straight', 'dashed'];
const ARROW_HEAD_TYPES: ArrowHeadType[] = ['end', 'both', 'none'];

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function asId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function normalizePoint(value: unknown): { x: number; y: number } | null {
  if (!isRecord(value)) return null;
  const x = asNumber(value.x, NaN);
  const y = asNumber(value.y, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

export function normalizeNote(value: unknown): Note | null {
  if (!isRecord(value)) return null;
  const id = asId(value.id);
  if (!id) return null;

  const now = Date.now();
  const linkedNoteIds = asStringArray(value.linkedNoteIds);

  return {
    id,
    title: asString(value.title, 'Untitled Note') || 'Untitled Note',
    content: asString(value.content, ''),
    folder: asString(value.folder, 'General') || 'General',
    tags: asStringArray(value.tags),
    isPinned: asBoolean(value.isPinned, false),
    isFavorite: asBoolean(value.isFavorite, false),
    linkedNoteIds: linkedNoteIds.length > 0 ? linkedNoteIds : undefined,
    createdAt: asNumber(value.createdAt, now),
    updatedAt: asNumber(value.updatedAt, now),
  };
}

export function normalizeCanvasElement(value: unknown): CanvasElement | null {
  if (!isRecord(value)) return null;

  const id = asId(value.id);
  const type = value.type;
  if (!id || typeof type !== 'string' || !CANVAS_ELEMENT_TYPES.includes(type as CanvasElementType)) {
    return null;
  }

  const element: CanvasElement = {
    id,
    type: type as CanvasElementType,
    x: asNumber(value.x, 0),
    y: asNumber(value.y, 0),
    width: asNumber(value.width, 120),
    height: asNumber(value.height, 60),
  };

  if (typeof value.text === 'string') element.text = value.text;
  if (typeof value.color === 'string') element.color = value.color;
  if (typeof value.strokeColor === 'string') element.strokeColor = value.strokeColor;
  if (typeof value.linkedNoteId === 'string') element.linkedNoteId = value.linkedNoteId;
  if (typeof value.linkedNoteTitle === 'string') element.linkedNoteTitle = value.linkedNoteTitle;
  if (typeof value.fromId === 'string') element.fromId = value.fromId;
  if (typeof value.toId === 'string') element.toId = value.toId;

  const fromPoint = normalizePoint(value.fromPoint);
  if (fromPoint) element.fromPoint = fromPoint;
  const toPoint = normalizePoint(value.toPoint);
  if (toPoint) element.toPoint = toPoint;

  if (typeof value.connectorStyle === 'string' && CONNECTOR_STYLES.includes(value.connectorStyle as ConnectorStyle)) {
    element.connectorStyle = value.connectorStyle as ConnectorStyle;
  }
  if (typeof value.arrowHeadType === 'string' && ARROW_HEAD_TYPES.includes(value.arrowHeadType as ArrowHeadType)) {
    element.arrowHeadType = value.arrowHeadType as ArrowHeadType;
  }

  return element;
}

export function normalizeCanvas(value: unknown): CanvasDocument | null {
  if (!isRecord(value)) return null;
  const id = asId(value.id);
  if (!id) return null;

  const viewport = isRecord(value.viewport) ? value.viewport : {};
  const elements = Array.isArray(value.elements)
    ? value.elements
        .map(normalizeCanvasElement)
        .filter((element): element is CanvasElement => element !== null)
    : [];
  const now = Date.now();

  return {
    id,
    title: asString(value.title, 'Untitled Canvas') || 'Untitled Canvas',
    elements,
    viewport: {
      x: asNumber(viewport.x, 0),
      y: asNumber(viewport.y, 0),
      zoom: Math.min(4, Math.max(0.1, asNumber(viewport.zoom, 1))),
    },
    gridEnabled: asBoolean(value.gridEnabled, true),
    createdAt: asNumber(value.createdAt, now),
    updatedAt: asNumber(value.updatedAt, now),
  };
}

/**
 * Parse a workspace backup without touching storage. A null section means the
 * backup did not contain that key, which lets a notes only backup keep the
 * existing canvases and the other way around.
 */
export function parseWorkspaceBackup(raw: string): WorkspaceBackup | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(data)) return null;

  const hasNotes = Array.isArray(data.notes);
  const hasCanvases = Array.isArray(data.canvases);
  if (!hasNotes && !hasCanvases) return null;

  let skipped = 0;
  let notes: Note[] | null = null;
  let canvases: CanvasDocument[] | null = null;

  if (hasNotes) {
    notes = [];
    for (const entry of data.notes as unknown[]) {
      const note = normalizeNote(entry);
      if (note) {
        notes.push(note);
      } else {
        skipped += 1;
      }
    }
  }

  if (hasCanvases) {
    canvases = [];
    for (const entry of data.canvases as unknown[]) {
      const canvas = normalizeCanvas(entry);
      if (canvas) {
        canvases.push(canvas);
      } else {
        skipped += 1;
      }
    }
  }

  return { notes, canvases, skipped };
}
