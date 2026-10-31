import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, RotateCcw, Upload, Sparkles } from 'lucide-react';
import { storage } from '../../core/storage';
import { SnapshotSummary } from '../../core/storage/storageInterface';
import { downloadText, readFileText } from '../../core/util/files';

interface RecoveryScreenProps {
  message: string;
  onRecovered: () => void;
}

/**
 * Shown instead of the app when storage can't be read. Saving is locked while
 * this is up, so the only way to overwrite the unreadable data is to ask to.
 */
export const RecoveryScreen: React.FC<RecoveryScreenProps> = ({ message, onRecovered }) => {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    storage
      .listSnapshots()
      .then(setSnapshots)
      .catch(() => setSnapshots([]));
  }, []);

  const raw = snapshots.find(snapshot => snapshot.kind === 'quarantine');
  const restorable = snapshots.filter(snapshot => snapshot.kind === 'workspace');

  const handleDownloadRaw = async () => {
    if (!raw) return;
    const payload = await storage.getSnapshotPayload(raw.id);
    if (payload !== null) downloadText(payload, 'notemesh-recovered-data.txt', 'text/plain');
  };

  const finish = (result: { ok: true } | { ok: false; errors: string[] }) => {
    if (result.ok) onRecovered();
    else setError(result.errors.slice(0, 3).join(' '));
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      finish(await storage.importAll(await readFileText(file)));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleStartFresh = async () => {
    const warning = raw
      ? 'Start a new workspace? The unreadable data stays available under Settings > Recovery snapshots.'
      : 'Start a new workspace? The unreadable data could not be set aside, so download anything you need first.';
    if (!confirm(warning)) return;
    try {
      await storage.resetWorkspace();
      onRecovered();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const optionClass =
    'w-full flex items-center space-x-2.5 p-3 rounded-xl border border-border dark:border-slate-700 bg-surface dark:bg-slate-800/80 hover:bg-surface-hover text-sm font-semibold text-slate-200 transition-colors';

  return (
    <div className="h-dvh w-screen flex items-center justify-center bg-background p-4 overflow-y-auto">
      <div className="w-full max-w-lg p-6 rounded-2xl border border-rose-500/30 bg-surface dark:bg-[#111827] shadow-2xl space-y-4">
        <div className="flex items-center space-x-2.5 text-rose-400 font-extrabold text-lg">
          <AlertTriangle className="w-5 h-5" />
          <span>Your workspace couldn't be opened</span>
        </div>
        <p className="text-sm text-slate-300">{message}</p>
        <p className="text-sm text-slate-400">
          Nothing has been overwritten. Saving is paused until you choose one of these options.
        </p>

        {error && (
          <p
            role="alert"
            className="text-xs font-medium text-rose-400 bg-rose-500/10 p-2 rounded-lg"
          >
            {error}
          </p>
        )}

        <div className="space-y-2">
          <button onClick={() => fileInputRef.current?.click()} className={optionClass}>
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>Restore from a backup file</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            aria-label="Backup file"
            onChange={handleRestoreFile}
            className="hidden"
          />

          {restorable.map(snapshot => (
            <button
              key={snapshot.id}
              onClick={() => storage.restoreSnapshot(snapshot.id).then(finish)}
              className={optionClass}
            >
              <RotateCcw className="w-4 h-4 text-indigo-400" />
              <span>
                Restore automatic snapshot from {new Date(snapshot.createdAt).toLocaleString()}
              </span>
            </button>
          ))}

          {raw && (
            <button onClick={handleDownloadRaw} className={optionClass}>
              <Download className="w-4 h-4 text-indigo-400" />
              <span>Download the unreadable data (for manual repair)</span>
            </button>
          )}

          <button onClick={handleStartFresh} className={optionClass}>
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Start a new workspace</span>
          </button>
        </div>
      </div>
    </div>
  );
};
