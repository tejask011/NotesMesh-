import { normalizeFolderPath } from '../notes/folders';
import {
  BACKUP_FORMAT,
  BackupFile,
  CURRENT_SCHEMA_VERSION,
  WorkspaceData,
  validateWorkspace,
} from './schema';

export interface RawWorkspace {
  notes: unknown[];
  canvases: unknown[];
}

interface Migration {
  from: number;
  to: number;
  migrate: (data: RawWorkspace) => RawWorkspace;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * Ordered migration chain. Never edit a shipped migration: add a new one and
 * bump CURRENT_SCHEMA_VERSION. Migrations only change shape: damaged records pass
 * through untouched so validation can report them, rather than being "repaired"
 * with invented values.
 */
const MIGRATIONS: Migration[] = [
  {
    // v1-v4 only differed in their localStorage key names; records are compatible.
    from: 1,
    to: 4,
    migrate: data => data,
  },
  {
    // v5 makes folder a normalized "/"-separated path and tags a set.
    from: 4,
    to: 5,
    migrate: data => ({
      notes: data.notes.map(value => {
        const note = asRecord(value);
        if (!note) return value;
        return {
          ...note,
          folder:
            typeof note.folder === 'string' || note.folder === undefined
              ? normalizeFolderPath(note.folder)
              : note.folder,
          tags: Array.isArray(note.tags) ? Array.from(new Set(note.tags)) : note.tags,
        };
      }),
      canvases: data.canvases,
    }),
  },
];

/** Run every migration needed to bring `data` from `fromVersion` to the current schema. */
export function migrateWorkspace(data: RawWorkspace, fromVersion: number): RawWorkspace {
  let version = fromVersion;
  let current = data;
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS.find(m => m.from <= version && version < m.to);
    if (!step) throw new Error(`No migration path from schema version ${version}`);
    current = step.migrate(current);
    version = step.to;
  }
  return current;
}

/** Work out which schema a backup was written with, including pre-v5 `"version": "4.0.0"` files. */
function detectSchemaVersion(file: Record<string, unknown>): number | null {
  if (file.schemaVersion !== undefined) {
    return Number.isInteger(file.schemaVersion) && (file.schemaVersion as number) >= 1
      ? (file.schemaVersion as number)
      : null;
  }
  if (typeof file.version === 'string') {
    const major = Number.parseInt(file.version, 10);
    return Number.isInteger(major) && major >= 1 ? major : null;
  }
  return 4;
}

export interface BackupInfo {
  sourceVersion: number;
  migrated: boolean;
  exportedAt: string | null;
  noteCount: number;
  canvasCount: number;
}

export type ParsedBackup =
  { ok: true; data: WorkspaceData; info: BackupInfo } | { ok: false; errors: string[] };

/** Parse and strictly validate a backup. Nothing is written unless the whole file passes. */
export function parseBackup(json: string): ParsedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, errors: ['This file is not valid JSON.'] };
  }

  const file = asRecord(parsed);
  if (!file) return { ok: false, errors: ['This file is not a NoteMesh backup.'] };
  if (file.format !== undefined && file.format !== BACKUP_FORMAT) {
    return { ok: false, errors: [`Unknown backup format "${String(file.format)}".`] };
  }
  if (!Array.isArray(file.notes) || !Array.isArray(file.canvases)) {
    return { ok: false, errors: ['A NoteMesh backup must contain "notes" and "canvases" arrays.'] };
  }

  const sourceVersion = detectSchemaVersion(file);
  if (sourceVersion === null) {
    return { ok: false, errors: ['The backup has an unreadable schema version.'] };
  }
  if (sourceVersion > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        `This backup was made by a newer version of NoteMesh (schema ${sourceVersion}, this app reads up to ${CURRENT_SCHEMA_VERSION}). Update the app before restoring it.`,
      ],
    };
  }

  const migrated = migrateWorkspace({ notes: file.notes, canvases: file.canvases }, sourceVersion);
  const errors = validateWorkspace(migrated);
  if (errors.length > 0) return { ok: false, errors };

  const data = migrated as unknown as WorkspaceData;
  return {
    ok: true,
    data,
    info: {
      sourceVersion,
      migrated: sourceVersion < CURRENT_SCHEMA_VERSION,
      exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : null,
      noteCount: data.notes.length,
      canvasCount: data.canvases.length,
    },
  };
}

export function serializeBackup(data: WorkspaceData, now = new Date()): string {
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    notes: data.notes,
    canvases: data.canvases,
  };
  return JSON.stringify(file, null, 2);
}
