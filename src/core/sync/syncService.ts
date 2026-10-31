import { parseBackup, serializeBackup } from '../storage/migrations';
import { WorkspaceData } from '../storage/schema';
import { localDateString } from '../util/ids';
import { EMPTY_BASE, MergeResult, SyncBase, mergeWorkspaces } from './syncEngine';

/**
 * Opt-in sync with a file in a folder the user picks. NoteMesh makes no network
 * calls: moving that file between devices is left to whatever syncs the folder
 * (Syncthing, Dropbox, iCloud Drive, a USB stick...). Nothing runs unless the
 * user presses "Sync now".
 */
export const SYNC_FILE_NAME = 'notemesh-sync.json';
const BASE_KEY = 'notemesh_sync_base';
const HANDLE_DB = 'notemesh-sync';

// The File System Access API isn't in TypeScript's DOM library yet.
type PermissionMode = { mode: 'readwrite' };
export interface SyncDirectoryHandle {
  name: string;
  getFileHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<{
    getFile(): Promise<File>;
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  }>;
  queryPermission(options: PermissionMode): Promise<PermissionState>;
  requestPermission(options: PermissionMode): Promise<PermissionState>;
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: PermissionMode) => Promise<SyncDirectoryHandle>;
  }
}

export const isFolderSyncSupported = (): boolean =>
  typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

export function loadSyncBase(): SyncBase {
  try {
    const raw = localStorage.getItem(BASE_KEY);
    return raw ? { ...EMPTY_BASE, ...JSON.parse(raw) } : EMPTY_BASE;
  } catch {
    return EMPTY_BASE; // Worst case: the next sync treats differences as conflicts and keeps both.
  }
}

export function saveSyncBase(base: SyncBase): void {
  localStorage.setItem(BASE_KEY, JSON.stringify(base));
}

export function clearSyncBase(): void {
  localStorage.removeItem(BASE_KEY);
}

const openHandleDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('handles');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** Directory handles can't go in localStorage, but IndexedDB can store them across reloads. */
export async function loadSavedFolder(): Promise<SyncDirectoryHandle | null> {
  try {
    const db = await openHandleDb();
    return await new Promise(resolve => {
      const request = db.transaction('handles').objectStore('handles').get('folder');
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveFolder(handle: SyncDirectoryHandle | null): Promise<void> {
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    if (handle) tx.objectStore('handles').put(handle, 'folder');
    else tx.objectStore('handles').delete('folder');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Merge the given remote backup text into local data. Throws, changing nothing, if it's invalid. */
export function mergeWithRemoteText(
  local: WorkspaceData,
  remoteText: string,
  base: SyncBase,
  now = new Date()
): MergeResult {
  const parsed = parseBackup(remoteText);
  if (!parsed.ok) {
    throw new Error(
      `The sync file was not changed or merged because it is invalid: ${parsed.errors[0]}`
    );
  }
  return mergeWorkspaces(local, parsed.data, base, localDateString(now));
}

export const describeMerge = (result: MergeResult): string => {
  const { fromRemote, deletedLocally, toRemote } = result.stats;
  const conflictText = result.conflicts.length
    ? ` ${result.conflicts.length} conflict${result.conflicts.length === 1 ? '' : 's'}: both versions were kept.`
    : '';
  return `${fromRemote} received, ${toRemote} sent, ${deletedLocally} removed.${conflictText}`;
};

/** Pull the sync file (if any), merge, and push the result back. */
export async function syncWithFolder(
  folder: SyncDirectoryHandle,
  local: WorkspaceData,
  applyMerged: (data: WorkspaceData) => Promise<void>
): Promise<MergeResult> {
  if ((await folder.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    const permission = await folder.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') throw new Error('Permission to use the sync folder was denied.');
  }

  const fileHandle = await folder.getFileHandle(SYNC_FILE_NAME, { create: true });
  const file = await fileHandle.getFile();
  const remoteText = await file.text();

  // A newly created file is empty: this device simply publishes its workspace.
  const result = remoteText.trim()
    ? mergeWithRemoteText(local, remoteText, loadSyncBase())
    : mergeWorkspaces(local, { notes: [], canvases: [] }, EMPTY_BASE, localDateString());

  await applyMerged(result.data);

  // createWritable writes to a temp file and swaps on close, so a failure can't truncate the file.
  const writable = await fileHandle.createWritable();
  await writable.write(serializeBackup(result.data));
  await writable.close();

  // Recorded last: if pushing failed, the next sync re-merges against the old base.
  saveSyncBase(result.base);
  return result;
}
