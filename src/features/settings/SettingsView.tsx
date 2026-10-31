import React, { useCallback, useEffect, useRef, useState } from 'react';
import { saveQueue, storage } from '../../core/storage';
import { parseBackup } from '../../core/storage/migrations';
import { SnapshotSummary } from '../../core/storage/storageInterface';
import { Note } from '../../core/domain/note';
import { CanvasDocument } from '../../core/domain/canvas';
import { buildMarkdownArchive } from '../../core/notes/importExport';
import { collectAllTags } from '../../core/notes/tags';
import { CANVAS_SHORTCUTS, GRAPH_SHORTCUTS, SHORTCUTS } from '../../core/shortcuts';
import { pluginManager } from '../../core/plugins/pluginManager';
import { downloadBlob, downloadText, readFileText } from '../../core/util/files';
import { localDateString } from '../../core/util/ids';
import { ToastKind } from '../../components/Toasts';
import { SyncPanel } from './SyncPanel';
import {
  Settings,
  Moon,
  Sun,
  Database,
  Download,
  Upload,
  RotateCcw,
  ShieldCheck,
  Keyboard,
  FileText,
  FileArchive,
  History,
  Share2,
  Layout,
  HardDrive,
  Trash2,
} from 'lucide-react';

interface SettingsViewProps {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  notes: Note[];
  canvases: CanvasDocument[];
  onDataReload: () => Promise<void>;
  onFlushSave: () => Promise<boolean>;
  notify: (kind: ToastKind, message: string) => void;
  onOpenNote: (noteId: string) => void;
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ShortcutRow: React.FC<{ description: string; combo: string }> = ({ description, combo }) => (
  <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-hover/30 dark:bg-slate-900/40 border border-border dark:border-slate-800">
    <span className="text-slate-700 dark:text-slate-300 font-semibold">{description}</span>
    <kbd className="px-2 py-1 rounded-lg bg-surface dark:bg-slate-800 border border-border dark:border-slate-700 text-xs font-mono font-bold text-slate-300 whitespace-nowrap">
      {combo}
    </kbd>
  </div>
);

export const SettingsView: React.FC<SettingsViewProps> = ({
  isDarkMode,
  toggleDarkMode,
  notes,
  canvases,
  onDataReload,
  onFlushSave,
  notify,
  onOpenNote,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [usage, setUsage] = useState<string | null>(null);
  const [isPersisted, setIsPersisted] = useState<boolean | null>(null);

  const refreshStorageInfo = useCallback(async () => {
    setSnapshots(await storage.listSnapshots());
    if (navigator.storage?.estimate) {
      const { usage: used, quota } = await navigator.storage.estimate();
      if (used !== undefined && quota !== undefined) {
        setUsage(`${formatBytes(used)} of ${formatBytes(quota)} available to this site`);
      }
    }
    if (navigator.storage?.persisted) setIsPersisted(await navigator.storage.persisted());
  }, []);

  useEffect(() => {
    refreshStorageInfo().catch(error => console.error(error));
  }, [refreshStorageInfo]);

  const totalWords = notes.reduce((acc, n) => {
    return acc + (n.content.trim() ? n.content.trim().split(/\s+/).length : 0);
  }, 0);

  const totalTags = collectAllTags(notes).length;

  const dateStamp = localDateString();

  const handleExportJson = async () => {
    if (!(await onFlushSave())) {
      notify(
        'error',
        'Your latest changes are not saved yet. Use "Download backup" in the red banner to include them.'
      );
      return;
    }
    downloadText(
      await storage.exportAll(),
      `notemesh-backup-${dateStamp}.json`,
      'application/json'
    );
    notify('success', `Backup downloaded: ${notes.length} notes and ${canvases.length} boards.`);
  };

  const handleExportMarkdown = () => {
    const archive = buildMarkdownArchive(notes);
    downloadBlob(
      new Blob([archive as BlobPart], { type: 'application/zip' }),
      `notemesh-notes-${dateStamp}.zip`
    );
    notify(
      'info',
      `Exported ${notes.length} notes as Markdown files. Use the JSON backup to keep tags, pins and boards too.`
    );
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    let text: string;
    try {
      text = await readFileText(file);
    } catch (error) {
      notify('error', `Could not read ${file.name}: ${(error as Error).message}`);
      return;
    }

    const parsed = parseBackup(text);
    if (!parsed.ok) {
      const more =
        parsed.errors.length > 3 ? ` (and ${parsed.errors.length - 3} more problems)` : '';
      notify(
        'error',
        `${file.name} was not restored, and nothing was changed. ${parsed.errors.slice(0, 3).join('; ')}${more}`
      );
      return;
    }

    const { noteCount, canvasCount, exportedAt } = parsed.info;
    const when = exportedAt ? ` from ${new Date(exportedAt).toLocaleString()}` : '';
    if (
      !confirm(
        `Replace this workspace (${notes.length} notes, ${canvases.length} boards) with the backup${when} (${noteCount} notes, ${canvasCount} boards)?\n\nA snapshot of the current workspace is saved first, so you can undo this.`
      )
    ) {
      return;
    }

    await onFlushSave();
    const result = await storage.importAll(text);
    if (result.ok) {
      saveQueue.discardPending();
      await onDataReload();
      await refreshStorageInfo();
      notify(
        'success',
        `Restored ${noteCount} ${noteCount === 1 ? 'note' : 'notes'} and ${canvasCount} ${canvasCount === 1 ? 'board' : 'boards'}.`
      );
    } else {
      notify('error', `Restore failed, and nothing was changed. ${result.errors[0]}`);
    }
  };

  const handleRestoreSnapshot = async (snapshot: SnapshotSummary) => {
    if (
      !confirm(
        `Replace the current workspace with the snapshot from ${new Date(snapshot.createdAt).toLocaleString()}? The current workspace is snapshotted first.`
      )
    ) {
      return;
    }
    await onFlushSave();
    const result = await storage.restoreSnapshot(snapshot.id);
    if (result.ok) {
      saveQueue.discardPending();
      await onDataReload();
      await refreshStorageInfo();
      notify('success', 'Snapshot restored.');
    } else {
      notify('error', `Could not restore that snapshot. ${result.errors[0]}`);
    }
  };

  const handleDownloadSnapshot = async (snapshot: SnapshotSummary) => {
    const payload = await storage.getSnapshotPayload(snapshot.id);
    if (payload !== null) {
      const stamp = localDateString(new Date(snapshot.createdAt));
      downloadText(payload, `notemesh-snapshot-${stamp}.json`, 'application/json');
    }
  };

  const handleDeleteSnapshot = async (snapshot: SnapshotSummary) => {
    if (!confirm(`Permanently delete this snapshot ("${snapshot.reason}")?`)) return;
    await storage.deleteSnapshot(snapshot.id);
    await refreshStorageInfo();
  };

  const handleRequestPersistence = async () => {
    const granted = await navigator.storage.persist();
    setIsPersisted(granted);
    notify(
      granted ? 'success' : 'info',
      granted
        ? 'The browser will not clear this workspace on its own.'
        : 'The browser declined for now. It often allows this after you bookmark or use the site more. Keep regular backups.'
    );
  };

  const handleResetData = async () => {
    if (
      confirm(
        'Are you sure you want to reset all data back to the clean default workspace? A snapshot is saved first, so you can undo this.'
      )
    ) {
      await onFlushSave();
      saveQueue.discardPending();
      await storage.resetWorkspace();
      await onDataReload();
      await refreshStorageInfo();
    }
  };

  const pluginShortcuts = pluginManager.getCommands().filter(command => command.shortcut);

  return (
    <div className="flex-1 flex h-full min-h-0 bg-background overflow-y-auto p-4 sm:p-8">
      <div className="max-w-4xl mx-auto w-full space-y-8 pb-8">
        {/* Header */}
        <div>
          <div className="flex items-center space-x-2.5 text-indigo-400 font-extrabold text-2xl tracking-tight">
            <Settings className="w-6 h-6" />
            <span>Workspace Settings</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1.5 font-medium">
            Configure appearance, review local storage metrics, and manage backups.
          </p>
        </div>

        {/* Workspace Health & Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-[#111827]/70 shadow-xl">
            <div className="flex items-center space-x-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
              <FileText className="w-4 h-4" />
              <span>Notes</span>
            </div>
            <div className="text-3xl font-extrabold mt-2 text-slate-900 dark:text-white">
              {notes.length}
            </div>
            <p className="text-xs text-slate-400 mt-1 font-medium">Markdown files</p>
          </div>

          <div className="p-5 rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-[#111827]/70 shadow-xl">
            <div className="flex items-center space-x-2 text-purple-400 text-xs font-bold uppercase tracking-wider">
              <Share2 className="w-4 h-4" />
              <span>Word Count</span>
            </div>
            <div className="text-3xl font-extrabold mt-2 text-slate-900 dark:text-white">
              {totalWords.toLocaleString()}
            </div>
            <p className="text-xs text-slate-400 mt-1 font-medium">Total written words</p>
          </div>

          <div className="p-5 rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-[#111827]/70 shadow-xl">
            <div className="flex items-center space-x-2 text-cyan-400 text-xs font-bold uppercase tracking-wider">
              <Layout className="w-4 h-4" />
              <span>Canvases</span>
            </div>
            <div className="text-3xl font-extrabold mt-2 text-slate-900 dark:text-white">
              {canvases.length}
            </div>
            <p className="text-xs text-slate-400 mt-1 font-medium">Visual boards</p>
          </div>

          <div className="p-5 rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-[#111827]/70 shadow-xl">
            <div className="flex items-center space-x-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <HardDrive className="w-4 h-4" />
              <span>Tags</span>
            </div>
            <div className="text-3xl font-extrabold mt-2 text-slate-900 dark:text-white">
              {totalTags}
            </div>
            <p className="text-xs text-slate-400 mt-1 font-medium">Active categories</p>
          </div>
        </div>

        {/* Appearance Settings */}
        <div className="p-6 rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-[#111827]/70 space-y-4 shadow-xl">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Appearance & Dual-Tone Theme
          </h3>
          <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-border dark:border-slate-800 bg-surface-hover/30 dark:bg-slate-900/40">
            <div className="flex items-center space-x-3.5">
              {isDarkMode ? (
                <Moon className="w-5 h-5 text-indigo-400" />
              ) : (
                <Sun className="w-5 h-5 text-amber-500" />
              )}
              <div>
                <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100">
                  {isDarkMode ? 'Dark Dual-Tone Theme (Default)' : 'Light Theme'}
                </span>
                <p className="text-xs text-slate-400 mt-0.5 font-medium">
                  Deep obsidian/slate background with high-contrast text and vibrant indigo accents.
                </p>
              </div>
            </div>
            <button
              onClick={toggleDarkMode}
              className="px-4 py-2 rounded-xl border border-border dark:border-slate-700 bg-surface dark:bg-slate-800 hover:bg-surface-hover text-xs sm:text-sm font-semibold text-indigo-400 transition-colors shrink-0"
            >
              Switch Theme
            </button>
          </div>
        </div>

        {/* Local Storage & Data Management */}
        <div className="p-6 rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-[#111827]/70 space-y-4 shadow-xl">
          <div className="flex items-center space-x-2.5">
            <Database className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Local Storage & Data Sovereignty
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 font-medium">
            All notes, relationships, and canvas layouts are stored entirely on your local machine
            using browser-managed persistence. No accounts, no telemetry, no tracking.
          </p>

          <div className="text-xs text-slate-400 font-medium space-y-1">
            <p>
              Storage engine:{' '}
              <span className="text-slate-300 font-semibold">
                {storage.kind === 'indexeddb'
                  ? 'IndexedDB'
                  : 'localStorage (limited to about 5 MB)'}
              </span>
            </p>
            {usage && <p>Using {usage}.</p>}
            {isPersisted !== null && (
              <p className="flex flex-wrap items-center gap-2">
                <span>
                  {isPersisted
                    ? 'Protected: the browser will not clear this workspace to free up space.'
                    : 'Not protected: the browser may clear this workspace if the device runs low on space.'}
                </span>
                {!isPersisted && (
                  <button
                    onClick={() => void handleRequestPersistence()}
                    className="font-bold text-indigo-400 underline"
                  >
                    Ask browser to protect it
                  </button>
                )}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <button
              onClick={() => void handleExportJson()}
              className="flex items-center justify-center space-x-2 p-3.5 rounded-xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-800/80 hover:bg-surface-hover text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors"
            >
              <Download className="w-4 h-4 text-indigo-400" />
              <span>Export Full Workspace (JSON)</span>
            </button>

            <button
              onClick={handleExportMarkdown}
              className="flex items-center justify-center space-x-2 p-3.5 rounded-xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-800/80 hover:bg-surface-hover text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors"
            >
              <FileArchive className="w-4 h-4 text-purple-400" />
              <span>Export Notes as Markdown (.zip)</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center space-x-2 p-3.5 rounded-xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-800/80 hover:bg-surface-hover text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors"
            >
              <Upload className="w-4 h-4 text-emerald-400" />
              <span>Import Workspace Backup (JSON)</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              aria-label="Workspace backup file"
              onChange={e => void handleImportJson(e)}
              className="hidden"
            />
          </div>

          <div className="pt-2">
            <button
              onClick={() => void handleResetData()}
              className="flex items-center justify-center space-x-2 p-3 w-full rounded-xl text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 text-xs sm:text-sm font-semibold transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset to Clean Default Workspace</span>
            </button>
          </div>
        </div>

        {/* Recovery Snapshots */}
        <div className="p-6 rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-[#111827]/70 space-y-3 shadow-xl">
          <div className="flex items-center space-x-2.5">
            <History className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Recovery Snapshots
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 font-medium">
            Saved automatically before a restore, reset, upgrade or sync, and whenever damaged data
            is set aside.
          </p>
          {snapshots.length === 0 ? (
            <p className="text-xs text-slate-500">No snapshots yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {snapshots.map(snapshot => (
                <li
                  key={snapshot.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-hover/30 dark:bg-slate-900/40 border border-border dark:border-slate-800 text-xs"
                >
                  <span className="font-medium text-slate-300">
                    {snapshot.reason} · {new Date(snapshot.createdAt).toLocaleString()} ·{' '}
                    {formatBytes(snapshot.size)}
                  </span>
                  <span className="flex items-center gap-3">
                    {snapshot.kind === 'workspace' && (
                      <button
                        onClick={() => void handleRestoreSnapshot(snapshot)}
                        className="font-bold text-indigo-400 hover:underline"
                      >
                        Restore
                      </button>
                    )}
                    <button
                      onClick={() => void handleDownloadSnapshot(snapshot)}
                      className="font-bold text-slate-300 hover:underline"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => void handleDeleteSnapshot(snapshot)}
                      title="Delete snapshot"
                      aria-label="Delete snapshot"
                      className="text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <SyncPanel
          notes={notes}
          canvases={canvases}
          onDataReload={async () => {
            await onDataReload();
            await refreshStorageInfo();
          }}
          onFlushSave={onFlushSave}
          notify={notify}
          onOpenNote={onOpenNote}
        />

        {/* Keyboard Shortcuts Reference */}
        <div className="p-6 rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-[#111827]/70 space-y-4 shadow-xl">
          <div className="flex items-center space-x-2.5">
            <Keyboard className="w-5 h-5 text-purple-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Keyboard Shortcuts
            </h3>
          </div>

          {[
            {
              title: 'Global & Editor',
              rows: SHORTCUTS.map(s => ({ combo: s.combo, description: s.description })),
            },
            {
              title: 'Plugins',
              rows: pluginShortcuts.map(c => ({
                combo: c.shortcut as string,
                description: c.title,
              })),
            },
            { title: 'Canvas', rows: CANVAS_SHORTCUTS },
            { title: 'Knowledge Graph', rows: GRAPH_SHORTCUTS },
          ]
            .filter(section => section.rows.length > 0)
            .map(section => (
              <div key={section.title} className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {section.title}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                  {section.rows.map(row => (
                    <ShortcutRow
                      key={`${row.combo}-${row.description}`}
                      combo={row.combo}
                      description={row.description}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>

        {/* Privacy & Governance Badge */}
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-slate-400 flex items-start space-x-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-emerald-400 text-xs sm:text-sm">
              Open-Source & Local-First Commitment
            </span>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              NoteMesh does not require accounts, cookies, or cloud servers. Built in alignment with
              open-source privacy ethics.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
