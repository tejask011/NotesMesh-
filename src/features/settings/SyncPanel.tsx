import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CloudOff, FileUp, FolderSync, RefreshCw, Unplug } from 'lucide-react';
import { CanvasDocument } from '../../core/domain/canvas';
import { Note } from '../../core/domain/note';
import { storage } from '../../core/storage';
import { serializeBackup } from '../../core/storage/migrations';
import { WorkspaceData } from '../../core/storage/schema';
import { MergeResult, SyncConflict } from '../../core/sync/syncEngine';
import {
  SYNC_FILE_NAME,
  SyncDirectoryHandle,
  clearSyncBase,
  describeMerge,
  isFolderSyncSupported,
  loadSavedFolder,
  loadSyncBase,
  mergeWithRemoteText,
  saveFolder,
  saveSyncBase,
  syncWithFolder,
} from '../../core/sync/syncService';
import { downloadText, readFileText } from '../../core/util/files';
import { localDateString } from '../../core/util/ids';
import { ToastKind } from '../../components/Toasts';

interface SyncPanelProps {
  notes: Note[];
  canvases: CanvasDocument[];
  onDataReload: () => Promise<void>;
  onFlushSave: () => Promise<boolean>;
  notify: (kind: ToastKind, message: string) => void;
  onOpenNote: (noteId: string) => void;
}

const LAST_SYNC_KEY = 'notemesh_sync_last';

const readLastSync = (): string | null => {
  try {
    return localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
};

const describeConflict = (conflict: SyncConflict): string =>
  conflict.kind === 'both-edited'
    ? `"${conflict.title}" was edited in both places. Both versions were kept.`
    : `"${conflict.title}" was deleted in one place and edited in the other. The edited version was kept.`;

export const SyncPanel: React.FC<SyncPanelProps> = ({
  notes,
  canvases,
  onDataReload,
  onFlushSave,
  notify,
  onOpenNote,
}) => {
  const [folder, setFolder] = useState<SyncDirectoryHandle | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(readLastSync);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supportsFolders = isFolderSyncSupported();

  useEffect(() => {
    if (supportsFolders) void loadSavedFolder().then(setFolder);
  }, [supportsFolders]);

  const applyMerged = async (data: WorkspaceData) => {
    await storage.replaceWorkspace(data, 'Before syncing');
    await onDataReload();
  };

  const finish = (result: MergeResult) => {
    const summary = describeMerge(result);
    const stamp = `${new Date().toLocaleString()}: ${summary}`;
    localStorage.setItem(LAST_SYNC_KEY, stamp);
    setLastSync(stamp);
    setConflicts(result.conflicts);
    notify(result.conflicts.length ? 'info' : 'success', `Sync finished. ${summary}`);
  };

  /** Wraps every sync: saves first so it merges what's on screen, and never runs twice at once. */
  const runSync = async (work: (local: WorkspaceData) => Promise<void>) => {
    setIsBusy(true);
    try {
      if (!(await onFlushSave())) {
        throw new Error('Your latest changes could not be saved, so sync was not attempted.');
      }
      await work({ notes, canvases });
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') {
        notify(
          'error',
          `Sync failed and your workspace was not changed: ${(error as Error).message}`
        );
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleConnect = () =>
    runSync(async () => {
      const handle = await (
        window.showDirectoryPicker as NonNullable<Window['showDirectoryPicker']>
      )({ mode: 'readwrite' });
      await saveFolder(handle);
      setFolder(handle);
      notify(
        'success',
        `Sync folder "${handle.name}" connected. Press "Sync now" when you're ready.`
      );
    });

  const handleSyncNow = () =>
    runSync(async local => {
      if (folder) finish(await syncWithFolder(folder, local, applyMerged));
    });

  const handleDisconnect = async () => {
    if (
      !confirm(
        'Turn off sync on this device? Your notes stay here, and the sync file is left in its folder.'
      )
    )
      return;
    await saveFolder(null);
    clearSyncBase();
    localStorage.removeItem(LAST_SYNC_KEY);
    setFolder(null);
    setLastSync(null);
    setConflicts([]);
  };

  const handleMergeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void runSync(async local => {
      const result = mergeWithRemoteText(local, await readFileText(file), loadSyncBase());
      await applyMerged(result.data);
      saveSyncBase(result.base);
      finish(result);
      // Without folder access the merged result can only leave as a download.
      downloadText(
        serializeBackup(result.data),
        `${SYNC_FILE_NAME.replace('.json', '')}-${localDateString()}.json`,
        'application/json'
      );
    });
  };

  return (
    <div className="p-6 rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-[#111827]/70 space-y-4 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <FolderSync className="w-5 h-5 text-cyan-400" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Sync (optional)</h3>
        </div>
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded-md border ${
            folder ? 'text-emerald-400 border-emerald-500/40' : 'text-slate-400 border-slate-700/60'
          }`}
        >
          {folder ? `On: ${folder.name}` : 'Off'}
        </span>
      </div>

      <div className="text-xs sm:text-sm text-slate-400 font-medium space-y-2">
        <p className="flex items-start gap-2">
          <CloudOff className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
          <span>
            <strong className="text-slate-300">
              Off unless you turn it on, and manual when it's on.
            </strong>{' '}
            NoteMesh has no sync server and makes no network requests. It only reads and writes one
            file, {SYNC_FILE_NAME}, in a folder you choose, and only when you press Sync now. Moving
            that file between devices is up to whatever syncs the folder, such as Syncthing, Dropbox
            or a USB stick.
          </span>
        </p>
        <p className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <span>
            <strong className="text-slate-300">Privacy:</strong> the sync file is not encrypted. It
            contains your full notes as plain text, so anyone or any service with access to that
            folder can read them.
          </span>
        </p>
        <p className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <span>
            <strong className="text-slate-300">Conflicts never lose text:</strong> if a note changed
            in both places, this device's version stays and the other is added as a separate "(sync
            conflict)" note for you to compare. If a note was deleted in one place and edited in the
            other, the edit is kept. A snapshot is saved before every sync and can be restored
            below.
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {supportsFolders && !folder && (
          <button
            onClick={() => void handleConnect()}
            disabled={isBusy}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold"
          >
            <FolderSync className="w-4 h-4" />
            <span>Choose sync folder</span>
          </button>
        )}
        {folder && (
          <>
            <button
              onClick={() => void handleSyncNow()}
              disabled={isBusy}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold"
            >
              <RefreshCw className={`w-4 h-4 ${isBusy ? 'animate-spin' : ''}`} />
              <span>{isBusy ? 'Syncing...' : 'Sync now'}</span>
            </button>
            <button
              onClick={() => void handleDisconnect()}
              disabled={isBusy}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl border border-border dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-300 hover:bg-slate-800"
            >
              <Unplug className="w-4 h-4" />
              <span>Turn off sync</span>
            </button>
          </>
        )}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isBusy}
          title="Merge a NoteMesh sync file or backup into this workspace, then download the merged result"
          className="flex items-center space-x-2 px-3.5 py-2 rounded-xl border border-border dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-300 hover:bg-slate-800"
        >
          <FileUp className="w-4 h-4" />
          <span>Merge from a file...</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          aria-label="Sync file to merge"
          onChange={handleMergeFile}
          className="hidden"
        />
      </div>

      {!supportsFolders && (
        <p className="text-xs text-slate-400">
          This browser can't connect to a folder, which needs Chrome or Edge. You can still merge
          from a file by hand.
        </p>
      )}

      {lastSync && <p className="text-xs text-slate-400">Last sync: {lastSync}</p>}

      {conflicts.length > 0 && (
        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-1.5">
          <p className="text-xs font-bold text-amber-400">Review these from the last sync:</p>
          {conflicts.map((conflict, index) => (
            <p key={index} className="text-xs text-slate-300">
              {describeConflict(conflict)}{' '}
              {conflict.recordType === 'note' && conflict.copyId && (
                <button
                  onClick={() => onOpenNote(conflict.copyId as string)}
                  className="underline font-semibold hover:text-indigo-400"
                >
                  Open the other version
                </button>
              )}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};
