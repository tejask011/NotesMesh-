import { Note } from '../domain/note';
import { CanvasDocument, CanvasElementType } from '../domain/canvas';

/**
 * On-disk workspace schema. Bump this and add an entry to `MIGRATIONS`
 * (see migrations.ts) whenever the persisted shape changes.
 */
export const CURRENT_SCHEMA_VERSION = 5;
export const BACKUP_FORMAT = 'notemesh-backup';

export interface WorkspaceData {
  notes: Note[];
  canvases: CanvasDocument[];
}

export interface BackupFile extends WorkspaceData {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
}

const CANVAS_ELEMENT_TYPES: readonly CanvasElementType[] = [
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');

const isPoint = (value: unknown): boolean =>
  isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);

export function validateNote(value: unknown, path = 'note'): string[] {
  if (!isRecord(value)) return [`${path} is not an object`];
  const errors: string[] = [];

  if (typeof value.id !== 'string' || !value.id)
    errors.push(`${path}.id must be a non-empty string`);
  if (typeof value.title !== 'string') errors.push(`${path}.title must be a string`);
  if (typeof value.content !== 'string') errors.push(`${path}.content must be a string`);
  if (!isStringArray(value.tags)) errors.push(`${path}.tags must be an array of strings`);
  if (value.folder !== undefined && typeof value.folder !== 'string') {
    errors.push(`${path}.folder must be a string`);
  }
  if (value.linkedNoteIds !== undefined && !isStringArray(value.linkedNoteIds)) {
    errors.push(`${path}.linkedNoteIds must be an array of strings`);
  }
  if (!isFiniteNumber(value.createdAt)) errors.push(`${path}.createdAt must be a number`);
  if (!isFiniteNumber(value.updatedAt)) errors.push(`${path}.updatedAt must be a number`);

  return errors;
}

function validateElement(value: unknown, path: string): string[] {
  if (!isRecord(value)) return [`${path} is not an object`];
  const errors: string[] = [];

  if (typeof value.id !== 'string' || !value.id)
    errors.push(`${path}.id must be a non-empty string`);
  if (!CANVAS_ELEMENT_TYPES.includes(value.type as CanvasElementType)) {
    errors.push(`${path}.type "${String(value.type)}" is not a known element type`);
  }
  for (const key of ['x', 'y', 'width', 'height']) {
    if (!isFiniteNumber(value[key])) errors.push(`${path}.${key} must be a number`);
  }
  for (const key of ['fromPoint', 'toPoint']) {
    if (value[key] !== undefined && !isPoint(value[key])) {
      errors.push(`${path}.${key} must be an {x, y} point`);
    }
  }

  return errors;
}

export function validateCanvas(value: unknown, path = 'canvas'): string[] {
  if (!isRecord(value)) return [`${path} is not an object`];
  const errors: string[] = [];

  if (typeof value.id !== 'string' || !value.id)
    errors.push(`${path}.id must be a non-empty string`);
  if (typeof value.title !== 'string') errors.push(`${path}.title must be a string`);
  if (typeof value.gridEnabled !== 'boolean') errors.push(`${path}.gridEnabled must be a boolean`);
  if (!isFiniteNumber(value.createdAt)) errors.push(`${path}.createdAt must be a number`);
  if (!isFiniteNumber(value.updatedAt)) errors.push(`${path}.updatedAt must be a number`);

  const viewport = value.viewport;
  if (
    !isRecord(viewport) ||
    !isFiniteNumber(viewport.x) ||
    !isFiniteNumber(viewport.y) ||
    !isFiniteNumber(viewport.zoom) ||
    viewport.zoom <= 0
  ) {
    errors.push(`${path}.viewport must be {x, y, zoom} with a positive zoom`);
  }

  if (!Array.isArray(value.elements)) {
    errors.push(`${path}.elements must be an array`);
  } else {
    const seen = new Set<unknown>();
    value.elements.forEach((element, index) => {
      const elementPath = `${path}.elements[${index}]`;
      errors.push(...validateElement(element, elementPath));
      const id = isRecord(element) ? element.id : undefined;
      if (seen.has(id)) errors.push(`${elementPath}.id "${String(id)}" is duplicated`);
      seen.add(id);
    });
  }

  return errors;
}

/** All-or-nothing check used for restores: one bad record rejects the file. */
export function validateWorkspace(data: unknown): string[] {
  if (!isRecord(data)) return ['Workspace is not an object'];
  if (!Array.isArray(data.notes)) return ['"notes" must be an array'];
  if (!Array.isArray(data.canvases)) return ['"canvases" must be an array'];

  const errors: string[] = [];
  const check = (
    records: unknown[],
    label: string,
    validate: (v: unknown, p: string) => string[]
  ) => {
    const seen = new Set<unknown>();
    records.forEach((record, index) => {
      const path = `${label}[${index}]`;
      errors.push(...validate(record, path));
      const id = isRecord(record) ? record.id : undefined;
      if (seen.has(id)) errors.push(`${path}.id "${String(id)}" is duplicated`);
      seen.add(id);
    });
  };
  check(data.notes, 'notes', validateNote);
  check(data.canvases, 'canvases', validateCanvas);

  return errors;
}

/**
 * Keep every record that validates and hand back the rest. Used when loading
 * from storage, where one damaged record must not cost the user everything else.
 */
export function salvageWorkspace(data: { notes: unknown[]; canvases: unknown[] }): {
  data: WorkspaceData;
  rejected: unknown[];
} {
  const rejected: unknown[] = [];
  const seenNotes = new Set<string>();
  const seenCanvases = new Set<string>();

  const notes = data.notes.filter((note): note is Note => {
    const valid = validateNote(note).length === 0 && !seenNotes.has((note as Note).id);
    if (valid) seenNotes.add((note as Note).id);
    else rejected.push(note);
    return valid;
  });

  const canvases = data.canvases.filter((canvas): canvas is CanvasDocument => {
    const valid =
      validateCanvas(canvas).length === 0 && !seenCanvases.has((canvas as CanvasDocument).id);
    if (valid) seenCanvases.add((canvas as CanvasDocument).id);
    else rejected.push(canvas);
    return valid;
  });

  return { data: { notes, canvases }, rejected };
}
