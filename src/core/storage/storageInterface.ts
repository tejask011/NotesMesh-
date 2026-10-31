import { Note } from '../domain/note';
import { CanvasDocument } from '../domain/canvas';
import { BackupInfo, RawWorkspace } from './migrations';
import { WorkspaceData } from './schema';

export type StorageKind = 'indexeddb' | 'localstorage';

export type LoadStatus =
  | 'ok' // Workspace read normally
  | 'fresh' // First run: sample workspace was created
  | 'migrated' // Older data was upgraded to the current schema
  | 'salvaged' // Some records were damaged and moved aside; the rest loaded
  | 'corrupted' // Nothing readable: writes are locked until the user recovers
  | 'newer-version'; // Data is from a newer app: writes are locked

export interface LoadResult extends WorkspaceData {
  status: LoadStatus;
  message?: string;
  /** Number of records moved to quarantine by this load. */
  quarantined: number;
}

export type SnapshotKind = 'workspace' | 'quarantine';

/** A point-in-time copy kept inside browser storage so risky operations can be undone. */
export interface Snapshot {
  id: string;
  createdAt: number;
  kind: SnapshotKind;
  reason: string;
  /** Workspace snapshots hold a backup file; quarantine snapshots hold the raw unreadable data. */
  payload: string;
}

export type SnapshotSummary = Omit<Snapshot, 'payload'> & { size: number };

export type ImportResult = { ok: true; info: BackupInfo } | { ok: false; errors: string[] };

/** What the app talks to. Everything above this line is storage-engine agnostic. */
export interface StorageAdapter {
  readonly kind: StorageKind;
  open(): Promise<LoadResult>;
  isLocked(): boolean;

  // Notes
  getNotes(): Promise<Note[]>;
  saveNote(note: Note): Promise<void>;
  deleteNote(id: string): Promise<void>;

  // Canvases
  getCanvases(): Promise<CanvasDocument[]>;
  saveCanvas(canvas: CanvasDocument): Promise<void>;
  deleteCanvas(id: string): Promise<void>;

  // Export / Import
  exportAll(): Promise<string>;
  importAll(jsonString: string): Promise<ImportResult>;
  /** Replace the workspace with validated data, taking a safety snapshot first. */
  replaceWorkspace(data: WorkspaceData, reason: string): Promise<void>;
  resetWorkspace(): Promise<WorkspaceData>;

  // Recovery
  listSnapshots(): Promise<SnapshotSummary[]>;
  getSnapshotPayload(id: string): Promise<string | null>;
  restoreSnapshot(id: string): Promise<ImportResult>;
}

/** The small surface a storage engine must implement. See indexedDbAdapter / localStorageAdapter. */
export interface StorageBackend {
  readonly kind: StorageKind;
  /** Raw records and their schema version; `schemaVersion` is null if nothing has been stored yet. */
  read(): Promise<RawWorkspace & { schemaVersion: number | null }>;
  putNote(note: Note): Promise<void>;
  removeNote(id: string): Promise<void>;
  putCanvas(canvas: CanvasDocument): Promise<void>;
  removeCanvas(id: string): Promise<void>;
  /** Atomically replace the whole workspace. */
  replaceAll(data: WorkspaceData, schemaVersion: number): Promise<void>;
  /** Remove individually damaged records by id. */
  removeRaw(noteIds: string[], canvasIds: string[]): Promise<void>;
  putSnapshot(snapshot: Snapshot): Promise<void>;
  listSnapshots(): Promise<Snapshot[]>;
  removeSnapshot(id: string): Promise<void>;
  readonly maxWorkspaceSnapshots: number;
}

/** Thrown by the local-storage engine when its stored blob can no longer be parsed. */
export class UnreadableStorageError extends Error {
  constructor(
    public readonly raw: string,
    message: string
  ) {
    super(message);
    this.name = 'UnreadableStorageError';
  }
}
