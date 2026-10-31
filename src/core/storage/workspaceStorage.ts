import { Note } from '../domain/note';
import { CanvasDocument } from '../domain/canvas';
import { createId } from '../util/ids';
import { IndexedDbBackend } from './indexedDbAdapter';
import { LEGACY_KEYS, LocalStorageBackend, WORKSPACE_KEY } from './localStorageAdapter';
import { RawWorkspace, migrateWorkspace, parseBackup, serializeBackup } from './migrations';
import { SAMPLE_CANVAS, SAMPLE_NOTES } from './sampleData';
import { CURRENT_SCHEMA_VERSION, WorkspaceData, salvageWorkspace } from './schema';
import {
  ImportResult,
  LoadResult,
  Snapshot,
  SnapshotKind,
  SnapshotSummary,
  StorageAdapter,
  StorageBackend,
  StorageKind,
  UnreadableStorageError,
} from './storageInterface';

const CHANNEL_NAME = 'notemesh-workspace';

export const sampleWorkspace = (): WorkspaceData => ({
  notes: SAMPLE_NOTES.map(note => ({ ...note })),
  canvases: [{ ...SAMPLE_CANVAS, elements: SAMPLE_CANVAS.elements.map(el => ({ ...el })) }],
});

const safeLocalStorage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

type LegacyRead =
  | { kind: 'none' }
  | { kind: 'found'; data: RawWorkspace; version: number; raw: string; keys: string[] }
  | { kind: 'unreadable'; raw: string; message: string };

/**
 * Read a workspace written by an older app version without changing it.
 * Keys are only removed once their contents are safely in the new store.
 */
function readLegacyData(store: Storage | null): LegacyRead {
  if (!store) return { kind: 'none' };

  // A blob left behind by the fallback engine, e.g. IndexedDB became available later.
  const blob = store.getItem(WORKSPACE_KEY);
  if (blob !== null) {
    try {
      const parsed = JSON.parse(blob);
      if (Array.isArray(parsed?.notes) && Array.isArray(parsed?.canvases)) {
        return {
          kind: 'found',
          data: { notes: parsed.notes, canvases: parsed.canvases },
          version: Number.isInteger(parsed.schemaVersion) ? parsed.schemaVersion : 4,
          raw: blob,
          keys: [WORKSPACE_KEY],
        };
      }
    } catch {
      // Fall through to the shared unreadable path below.
    }
    return { kind: 'unreadable', raw: blob, message: 'The saved workspace could not be read.' };
  }

  for (const { version, notes: notesKey, canvases: canvasesKey } of LEGACY_KEYS) {
    const rawNotes = store.getItem(notesKey);
    const rawCanvases = store.getItem(canvasesKey);
    if (rawNotes === null && rawCanvases === null) continue;

    const raw = JSON.stringify({ [notesKey]: rawNotes, [canvasesKey]: rawCanvases });
    try {
      const notes = rawNotes === null ? [] : JSON.parse(rawNotes);
      const canvases = rawCanvases === null ? [] : JSON.parse(rawCanvases);
      if (Array.isArray(notes) && Array.isArray(canvases)) {
        return {
          kind: 'found',
          data: { notes, canvases },
          version,
          raw,
          keys: [notesKey, canvasesKey],
        };
      }
    } catch {
      // Fall through to the shared unreadable path below.
    }
    return {
      kind: 'unreadable',
      raw,
      message: `Your saved notes (format v${version}) could not be read.`,
    };
  }

  return { kind: 'none' };
}

export type BackendFactory = () => Promise<StorageBackend>;

/** Prefer IndexedDB; fall back to localStorage where it's blocked (e.g. some private modes). */
export const defaultBackendFactory: BackendFactory = async () => {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable');
    return await IndexedDbBackend.open();
  } catch (error) {
    console.warn('Falling back to localStorage:', error);
    return new LocalStorageBackend();
  }
};

export class WorkspaceStorage implements StorageAdapter {
  private backend: StorageBackend | null = null;
  private locked = false;
  private channel: BroadcastChannel | null = null;

  constructor(
    private readonly createBackend: BackendFactory = defaultBackendFactory,
    private readonly legacyStore: () => Storage | null = safeLocalStorage
  ) {}

  get kind(): StorageKind {
    return this.backend?.kind ?? 'localstorage';
  }

  isLocked(): boolean {
    return this.locked;
  }

  private get engine(): StorageBackend {
    if (!this.backend) throw new Error('Storage has not been opened yet.');
    return this.backend;
  }

  private assertWritable(): void {
    if (this.locked) {
      throw new Error(
        'Saving is paused until your workspace is recovered, so nothing gets overwritten.'
      );
    }
  }

  private lock(status: 'corrupted' | 'newer-version', message: string): LoadResult {
    this.locked = true;
    return { status, message, notes: [], canvases: [], quarantined: 0 };
  }

  async open(): Promise<LoadResult> {
    this.backend = await this.createBackend();

    let stored: Awaited<ReturnType<StorageBackend['read']>>;
    try {
      stored = await this.backend.read();
    } catch (error) {
      if (error instanceof UnreadableStorageError) {
        // Quarantining can fail if storage is full; the raw value stays under its key regardless.
        await this.quarantine(error.raw, 'Unreadable workspace').catch(e => console.error(e));
        return this.lock('corrupted', error.message);
      }
      throw error;
    }

    if (stored.schemaVersion !== null) {
      if (stored.schemaVersion > CURRENT_SCHEMA_VERSION) {
        await this.quarantine(JSON.stringify(stored), 'Workspace from a newer app version').catch(
          e => console.error(e)
        );
        return this.lock(
          'newer-version',
          `This workspace was saved by a newer version of NoteMesh (schema ${stored.schemaVersion}). Update the app to open it.`
        );
      }
      return this.loadStored(stored, stored.schemaVersion);
    }

    // Nothing in the primary store yet: look for data from an older app version.
    const store = this.legacyStore();
    const legacy = readLegacyData(store);

    if (legacy.kind === 'unreadable') {
      await this.quarantine(legacy.raw, 'Unreadable workspace').catch(e => console.error(e));
      return this.lock('corrupted', legacy.message);
    }

    if (legacy.kind === 'found') {
      await this.quarantine(legacy.raw, 'Original data before upgrade');
      const result = await this.loadStored(legacy.data, legacy.version, true);
      // Only forget the old keys once the new store demonstrably has the data.
      const verified = await this.engine.read();
      if (verified.schemaVersion === CURRENT_SCHEMA_VERSION) {
        legacy.keys.forEach(key => store?.removeItem(key));
      }
      return result;
    }

    const fresh = sampleWorkspace();
    await this.engine.replaceAll(fresh, CURRENT_SCHEMA_VERSION);
    return { ...fresh, status: 'fresh', quarantined: 0 };
  }

  private async loadStored(
    raw: RawWorkspace,
    version: number,
    forceWrite = false
  ): Promise<LoadResult> {
    const needsMigration = version < CURRENT_SCHEMA_VERSION;

    let migrated: RawWorkspace;
    try {
      migrated = needsMigration ? migrateWorkspace(raw, version) : raw;
    } catch (error) {
      await this.quarantine(JSON.stringify(raw), 'Failed schema migration');
      return this.lock('corrupted', (error as Error).message);
    }

    const { data, rejected } = salvageWorkspace(migrated);

    if (rejected.length > 0) {
      await this.quarantine(
        JSON.stringify(rejected, null, 2),
        `${rejected.length} damaged record(s)`
      );
    }

    if (needsMigration || forceWrite) {
      if (needsMigration && !forceWrite) {
        await this.quarantine(
          JSON.stringify(raw),
          `Original data before upgrade from schema ${version}`
        );
      }
      await this.engine.replaceAll(data, CURRENT_SCHEMA_VERSION);
    } else if (rejected.length > 0) {
      const idOf = (record: unknown) => (record as { id?: unknown } | null)?.id;
      const badNoteIds = raw.notes.filter(n => rejected.includes(n)).map(idOf);
      const badCanvasIds = raw.canvases.filter(c => rejected.includes(c)).map(idOf);
      const isId = (id: unknown): id is string => typeof id === 'string';
      await this.engine.removeRaw(badNoteIds.filter(isId), badCanvasIds.filter(isId));
    }

    if (rejected.length > 0) {
      return {
        ...data,
        status: 'salvaged',
        quarantined: rejected.length,
        message: `${rejected.length} damaged record(s) could not be loaded and were set aside. Everything else is intact.`,
      };
    }
    return { ...data, status: needsMigration ? 'migrated' : 'ok', quarantined: 0 };
  }

  async getNotes(): Promise<Note[]> {
    return salvageWorkspace(await this.engine.read()).data.notes;
  }

  async getCanvases(): Promise<CanvasDocument[]> {
    return salvageWorkspace(await this.engine.read()).data.canvases;
  }

  async saveNote(note: Note): Promise<void> {
    this.assertWritable();
    await this.engine.putNote(note);
    this.announceChange();
  }

  async deleteNote(id: string): Promise<void> {
    this.assertWritable();
    await this.engine.removeNote(id);
    this.announceChange();
  }

  async saveCanvas(canvas: CanvasDocument): Promise<void> {
    this.assertWritable();
    await this.engine.putCanvas(canvas);
    this.announceChange();
  }

  async deleteCanvas(id: string): Promise<void> {
    this.assertWritable();
    await this.engine.removeCanvas(id);
    this.announceChange();
  }

  async exportAll(): Promise<string> {
    const { data } = salvageWorkspace(await this.engine.read());
    return serializeBackup(data);
  }

  async importAll(jsonString: string): Promise<ImportResult> {
    const parsed = parseBackup(jsonString);
    if (!parsed.ok) return parsed;
    try {
      await this.replaceWorkspace(parsed.data, 'Before restoring a backup');
      return { ok: true, info: parsed.info };
    } catch (error) {
      return { ok: false, errors: [(error as Error).message] };
    }
  }

  async replaceWorkspace(data: WorkspaceData, reason: string): Promise<void> {
    if (!this.locked) await this.snapshotCurrent(reason);
    await this.engine.replaceAll(data, CURRENT_SCHEMA_VERSION);
    this.locked = false;
    this.announceChange();
  }

  async resetWorkspace(): Promise<WorkspaceData> {
    const fresh = sampleWorkspace();
    await this.replaceWorkspace(fresh, 'Before resetting the workspace');
    return fresh;
  }

  private async snapshotCurrent(reason: string): Promise<void> {
    await this.addSnapshot('workspace', reason, await this.exportAll());
  }

  private quarantine(payload: string, reason: string): Promise<void> {
    return this.addSnapshot('quarantine', reason, payload);
  }

  private async addSnapshot(kind: SnapshotKind, reason: string, payload: string): Promise<void> {
    const snapshot: Snapshot = {
      id: createId('snapshot'),
      createdAt: Date.now(),
      kind,
      reason,
      payload,
    };
    await this.engine.putSnapshot(snapshot);

    if (kind === 'workspace') {
      const workspaceSnapshots = (await this.engine.listSnapshots())
        .filter(s => s.kind === 'workspace')
        .sort((a, b) => b.createdAt - a.createdAt);
      for (const old of workspaceSnapshots.slice(this.engine.maxWorkspaceSnapshots)) {
        await this.engine.removeSnapshot(old.id);
      }
    }
  }

  async listSnapshots(): Promise<SnapshotSummary[]> {
    return (await this.engine.listSnapshots())
      .map(({ payload, ...summary }) => ({ ...summary, size: payload.length }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getSnapshotPayload(id: string): Promise<string | null> {
    const snapshot = (await this.engine.listSnapshots()).find(s => s.id === id);
    return snapshot?.payload ?? null;
  }

  async restoreSnapshot(id: string): Promise<ImportResult> {
    const payload = await this.getSnapshotPayload(id);
    if (payload === null) return { ok: false, errors: ['That snapshot no longer exists.'] };
    return this.importAll(payload);
  }

  async deleteSnapshot(id: string): Promise<void> {
    await this.engine.removeSnapshot(id);
  }

  private announceChange(): void {
    this.channel?.postMessage({ type: 'workspace-changed' });
  }

  /** Be told when another tab of this browser writes to the workspace. */
  subscribeExternalChanges(listener: () => void): () => void {
    if (typeof BroadcastChannel === 'undefined') return () => {};
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = () => listener();
    this.channel = channel;
    return () => {
      channel.close();
      if (this.channel === channel) this.channel = null;
    };
  }
}
