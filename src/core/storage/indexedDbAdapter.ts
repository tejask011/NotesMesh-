import { Note } from '../domain/note';
import { CanvasDocument } from '../domain/canvas';
import { RawWorkspace } from './migrations';
import { WorkspaceData } from './schema';
import { Snapshot, StorageBackend } from './storageInterface';

const DB_NAME = 'notemesh';
const DB_VERSION = 1;
const SCHEMA_KEY = 'schemaVersion';

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const transactionDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });

/**
 * Primary engine. Each note and canvas is its own record, so a save costs the
 * size of one record rather than the size of the workspace, and large
 * workspaces are not limited by the ~5 MB localStorage quota.
 */
export class IndexedDbBackend implements StorageBackend {
  readonly kind = 'indexeddb' as const;
  readonly maxWorkspaceSnapshots = 5;

  private constructor(private readonly db: IDBDatabase) {
    // Let a future version upgrade in another tab proceed instead of blocking on us.
    db.onversionchange = () => db.close();
  }

  static open(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<IndexedDbBackend> {
    return new Promise((resolve, reject) => {
      const request = factory.open(name, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('notes', { keyPath: 'id' });
        db.createObjectStore('canvases', { keyPath: 'id' });
        db.createObjectStore('snapshots', { keyPath: 'id' });
        db.createObjectStore('meta');
      };
      request.onsuccess = () => resolve(new IndexedDbBackend(request.result));
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error('The NoteMesh database is blocked by another tab.'));
    });
  }

  async read(): Promise<RawWorkspace & { schemaVersion: number | null }> {
    const tx = this.db.transaction(['notes', 'canvases', 'meta'], 'readonly');
    const [notes, canvases, schemaVersion] = await Promise.all([
      requestResult(tx.objectStore('notes').getAll()),
      requestResult(tx.objectStore('canvases').getAll()),
      requestResult(tx.objectStore('meta').get(SCHEMA_KEY)),
    ]);
    return { notes, canvases, schemaVersion: schemaVersion ?? null };
  }

  private async write(
    store: 'notes' | 'canvases' | 'snapshots',
    action: (s: IDBObjectStore) => void
  ) {
    const tx = this.db.transaction(store, 'readwrite');
    action(tx.objectStore(store));
    await transactionDone(tx);
  }

  putNote(note: Note): Promise<void> {
    return this.write('notes', s => s.put(note));
  }

  removeNote(id: string): Promise<void> {
    return this.write('notes', s => s.delete(id));
  }

  putCanvas(canvas: CanvasDocument): Promise<void> {
    return this.write('canvases', s => s.put(canvas));
  }

  removeCanvas(id: string): Promise<void> {
    return this.write('canvases', s => s.delete(id));
  }

  async replaceAll(data: WorkspaceData, schemaVersion: number): Promise<void> {
    const tx = this.db.transaction(['notes', 'canvases', 'meta'], 'readwrite');
    const notes = tx.objectStore('notes');
    const canvases = tx.objectStore('canvases');
    notes.clear();
    canvases.clear();
    data.notes.forEach(note => notes.put(note));
    data.canvases.forEach(canvas => canvases.put(canvas));
    tx.objectStore('meta').put(schemaVersion, SCHEMA_KEY);
    await transactionDone(tx);
  }

  async removeRaw(noteIds: string[], canvasIds: string[]): Promise<void> {
    const tx = this.db.transaction(['notes', 'canvases'], 'readwrite');
    noteIds.forEach(id => tx.objectStore('notes').delete(id));
    canvasIds.forEach(id => tx.objectStore('canvases').delete(id));
    await transactionDone(tx);
  }

  putSnapshot(snapshot: Snapshot): Promise<void> {
    return this.write('snapshots', s => s.put(snapshot));
  }

  listSnapshots(): Promise<Snapshot[]> {
    return requestResult(this.db.transaction('snapshots').objectStore('snapshots').getAll());
  }

  removeSnapshot(id: string): Promise<void> {
    return this.write('snapshots', s => s.delete(id));
  }
}
