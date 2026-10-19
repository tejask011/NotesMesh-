import React, { useRef } from 'react';
import { storage } from '../../core/storage/localStorageAdapter';
import { toLocalDateKey } from '../../core/date/localDate';
import { 
  Settings, 
  Download, 
  Upload, 
  RotateCcw, 
  ShieldCheck, 
  Moon, 
  Sun, 
  X,
  Database
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onDataReload: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  isDarkMode,
  toggleDarkMode,
  onDataReload,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

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
        alert('Workspace restored successfully!');
        onDataReload();
        onClose();
      } else {
        alert('Invalid NoteMesh workspace JSON file.');
      }
    };
    reader.readAsText(file);
  };

  const handleResetData = async () => {
    if (confirm('Are you sure you want to reset all data back to the default sample workspace? Any unexported changes will be cleared.')) {
      localStorage.clear();
      onDataReload();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div 
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg bg-surface border border-border rounded-xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-gray-500/10 text-gray-700 dark:text-gray-300">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                Workspace Settings
              </h3>
              <p className="text-xs text-gray-500">
                Manage appearance, storage, and local data backups.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-surface-hover"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 text-xs">
          {/* Theme */}
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Appearance
            </h4>
            <button
              onClick={toggleDarkMode}
              className="flex items-center justify-between w-full p-3 rounded-lg border border-border bg-surface-hover/40 hover:bg-surface-hover transition-colors"
            >
              <div className="flex items-center space-x-2">
                {isDarkMode ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  Current Theme: {isDarkMode ? 'Dark Mode' : 'Light Mode'}
                </span>
              </div>
              <span className="text-primary font-semibold">Toggle</span>
            </button>
          </div>

          {/* Data Portability */}
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center space-x-1.5">
              <Database className="w-4 h-4 text-primary" />
              <span>Local-First Data & Backup</span>
            </h4>
            <p className="text-gray-500 mb-3">
              NoteMesh never transmits your notes to an external server. You have 100% data sovereignty.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleExportJson}
                className="flex items-center justify-center space-x-2 p-2.5 rounded-lg border border-border bg-surface hover:bg-surface-hover font-medium text-gray-800 dark:text-gray-200 transition-colors"
              >
                <Download className="w-4 h-4 text-primary" />
                <span>Export JSON</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center space-x-2 p-2.5 rounded-lg border border-border bg-surface hover:bg-surface-hover font-medium text-gray-800 dark:text-gray-200 transition-colors"
              >
                <Upload className="w-4 h-4 text-emerald-500" />
                <span>Import JSON</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportJson}
                className="hidden"
              />
            </div>

            <div className="mt-3">
              <button
                onClick={handleResetData}
                className="w-full flex items-center justify-center space-x-2 p-2 rounded-lg text-rose-500 hover:bg-rose-500/10 border border-rose-500/20 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Default Demo Notes & Canvas</span>
              </button>
            </div>
          </div>

          {/* Privacy & Governance notice */}
          <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-gray-600 dark:text-gray-300 flex items-start space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Local-First & Open Source
              </span>
              <p className="text-[11px] text-gray-500">
                Built strictly adhering to the Contributor Covenant and Open Source ethics. No telemetries, no tracking cookies, no accounts required.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
