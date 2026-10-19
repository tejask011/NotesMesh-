import React, { useRef } from 'react';
import { storage } from '../../core/storage/localStorageAdapter';
import { Note } from '../../core/domain/note';
import { CanvasDocument } from '../../core/domain/canvas';
import { toLocalDateKey } from '../../core/date/localDate';
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
  Share2, 
  Layout, 
  HardDrive
} from 'lucide-react';

interface SettingsViewProps {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  notes: Note[];
  canvases: CanvasDocument[];
  onDataReload: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  isDarkMode,
  toggleDarkMode,
  notes,
  canvases,
  onDataReload,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalWords = notes.reduce((acc, n) => {
    return acc + (n.content.trim() ? n.content.trim().split(/\s+/).length : 0);
  }, 0);

  const totalTags = Array.from(new Set(notes.flatMap(n => n.tags))).length;

  const handleExportJson = async () => {
    const data = await storage.exportAll();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notemesh-backup-${toLocalDateKey()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async event => {
      const content = event.target?.result as string;
      const success = await storage.importAll(content);
      if (success) {
        onDataReload();
        alert('Workspace imported successfully!');
      } else {
        alert('Failed to import workspace JSON. Please check file format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleResetData = async () => {
    if (confirm('Are you sure you want to reset all data back to the clean default workspace?')) {
      localStorage.clear();
      onDataReload();
    }
  };

  return (
    <div className="flex-1 flex h-[calc(100vh-5.5rem)] bg-background overflow-y-auto p-8 select-none">
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
          <div className="flex items-center justify-between p-4 rounded-xl border border-border dark:border-slate-800 bg-surface-hover/30 dark:bg-slate-900/40">
            <div className="flex items-center space-x-3.5">
              {isDarkMode ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
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
              className="px-4 py-2 rounded-xl border border-border dark:border-slate-700 bg-surface dark:bg-slate-800 hover:bg-surface-hover text-xs sm:text-sm font-semibold text-indigo-400 transition-colors"
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
            All notes, relationships, and canvas layouts are stored entirely on your local machine using browser-managed persistence. No accounts, no telemetry, no tracking.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleExportJson}
              className="flex items-center justify-center space-x-2 p-3.5 rounded-xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-800/80 hover:bg-surface-hover text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors"
            >
              <Download className="w-4 h-4 text-indigo-400" />
              <span>Export Full Workspace (JSON)</span>
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
              onChange={handleImportJson}
              className="hidden"
            />
          </div>

          <div className="pt-2">
            <button
              onClick={handleResetData}
              className="flex items-center justify-center space-x-2 p-3 w-full rounded-xl text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 text-xs sm:text-sm font-semibold transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset to Clean Default Workspace</span>
            </button>
          </div>
        </div>

        {/* Keyboard Shortcuts Reference */}
        <div className="p-6 rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-[#111827]/70 space-y-4 shadow-xl">
          <div className="flex items-center space-x-2.5">
            <Keyboard className="w-5 h-5 text-purple-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Keyboard Shortcuts
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-hover/30 dark:bg-slate-900/40 border border-border dark:border-slate-800">
              <span className="text-slate-700 dark:text-slate-300 font-semibold">Command Palette / Quick Search</span>
              <kbd className="px-2 py-1 rounded-lg bg-surface dark:bg-slate-800 border border-border dark:border-slate-700 text-xs font-mono font-bold text-slate-300">Ctrl + K</kbd>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-hover/30 dark:bg-slate-900/40 border border-border dark:border-slate-800">
              <span className="text-slate-700 dark:text-slate-300 font-semibold">Export Active Note as Markdown</span>
              <kbd className="px-2 py-1 rounded-lg bg-surface dark:bg-slate-800 border border-border dark:border-slate-700 text-xs font-mono font-bold text-slate-300">Ctrl + Shift + E</kbd>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-hover/30 dark:bg-slate-900/40 border border-border dark:border-slate-800">
              <span className="text-slate-700 dark:text-slate-300 font-semibold">Copy Table of Contents</span>
              <kbd className="px-2 py-1 rounded-lg bg-surface dark:bg-slate-800 border border-border dark:border-slate-700 text-xs font-mono font-bold text-slate-300">Ctrl + Shift + T</kbd>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-hover/30 dark:bg-slate-900/40 border border-border dark:border-slate-800">
              <span className="text-slate-700 dark:text-slate-300 font-semibold">Canvas Undo / Redo</span>
              <kbd className="px-2 py-1 rounded-lg bg-surface dark:bg-slate-800 border border-border dark:border-slate-700 text-xs font-mono font-bold text-slate-300">Ctrl + Z / Y</kbd>
            </div>
          </div>
        </div>

        {/* Privacy & Governance Badge */}
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-slate-400 flex items-start space-x-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-emerald-400 text-xs sm:text-sm">
              Open-Source & Local-First Commitment
            </span>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              NoteMesh does not require accounts, cookies, or cloud servers. Built in alignment with open-source privacy ethics.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
