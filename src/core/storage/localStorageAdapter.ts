import { Note } from '../domain/note';
import { CanvasDocument } from '../domain/canvas';
import { RawWorkspace } from './migrations';
import { WorkspaceData } from './schema';
import { Snapshot, StorageBackend, UnreadableStorageError } from './storageInterface';

export const WORKSPACE_KEY = 'notemesh_workspace';
const SNAPSHOT_PREFIX = 'notemesh_snapshot_';

/** Key pairs written by app versions before schema 5, newest first. */
export const LEGACY_KEYS = [4, 3, 2, 1].map(version => ({
  version,
  notes: `notemesh_notes_v${version}`,
  canvases: `notemesh_canvases_v${version}`,
}));

interface StoredWorkspace extends WorkspaceData {
  schemaVersion: number;
}

/**
 * Fallback engine for browsers where IndexedDB is unavailable. The workspace is
 * one JSON blob under one key, so every write is atomic (a failed setItem leaves
 * the previous value intact).
 */
export class LocalStorageBackend implements StorageBackend {
  readonly kind = 'localstorage' as const;
  readonly maxWorkspaceSnapshots = 2;

  constructor(private readonly store: Storage = localStorage) {}

  async read(): Promise<RawWorkspace & { schemaVersion: number | null }> {
    const raw = this.store.getItem(WORKSPACE_KEY);
    if (raw === null) return { notes: [], canvases: [], schemaVersion: null };

    let parsed: Partial<StoredWorkspace> | null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new UnreadableStorageError(raw, 'The saved workspace is not valid JSON.');
    }
    if (
      !parsed ||
      !Array.isArray(parsed.notes) ||
      !Array.isArray(parsed.canvases) ||
      !Number.isInteger(parsed.schemaVersion)
    ) {
      throw new UnreadableStorageError(raw, 'The saved workspace has an unexpected structure.');
    }
    return {
      notes: parsed.notes,
      canvases: parsed.canvases,
      schemaVersion: parsed.schemaVersion as number,
    };
  }

  private async update(mutate: (workspace: StoredWorkspace) => void): Promise<void> {
    const current = await this.read();
    const workspace = current as unknown as StoredWorkspace;
    mutate(workspace);
    this.store.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
  }

  putNote(note: Note): Promise<void> {
    return this.update(workspace => {
      const index = workspace.notes.findIndex(n => n.id === note.id);
      if (index >= 0) workspace.notes[index] = note;
      else workspace.notes.unshift(note);
    });
  }

  removeNote(id: string): Promise<void> {
    return this.update(workspace => {
      workspace.notes = workspace.notes.filter(n => n.id !== id);
    });
  }

  putCanvas(canvas: CanvasDocument): Promise<void> {
    return this.update(workspace => {
      const index = workspace.canvases.findIndex(c => c.id === canvas.id);
      if (index >= 0) workspace.canvases[index] = canvas;
      else workspace.canvases.unshift(canvas);
    });
  }

  removeCanvas(id: string): Promise<void> {
    return this.update(workspace => {
      workspace.canvases = workspace.canvases.filter(c => c.id !== id);
    });
  }

  async replaceAll(data: WorkspaceData, schemaVersion: number): Promise<void> {
    this.store.setItem(WORKSPACE_KEY, JSON.stringify({ schemaVersion, ...data }));
  }

  removeRaw(noteIds: string[], canvasIds: string[]): Promise<void> {
    return this.update(workspace => {
      workspace.notes = workspace.notes.filter(n => !noteIds.includes(n?.id));
      workspace.canvases = workspace.canvases.filter(c => !canvasIds.includes(c?.id));
    });
  }

  async putSnapshot(snapshot: Snapshot): Promise<void> {
    this.store.setItem(`${SNAPSHOT_PREFIX}${snapshot.id}`, JSON.stringify(snapshot));
  }

  async listSnapshots(): Promise<Snapshot[]> {
    const snapshots: Snapshot[] = [];
    for (let i = 0; i < this.store.length; i++) {
      const key = this.store.key(i);
      if (!key?.startsWith(SNAPSHOT_PREFIX)) continue;
      try {
        snapshots.push(JSON.parse(this.store.getItem(key) as string));
      } catch {
        // A damaged snapshot cannot be offered for restore; leave it alone.
      }
    }
    return snapshots;
  }

  async removeSnapshot(id: string): Promise<void> {
    this.store.removeItem(`${SNAPSHOT_PREFIX}${id}`);
  }
}
