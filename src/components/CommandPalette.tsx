import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Note } from '../core/domain/note';
import { ActiveTab } from './Navbar';
import { pluginManager, RegisteredCommand } from '../core/plugins/pluginManager';
import { SearchIndex, rankNotes } from '../core/search/localSearch';
import {
  Search,
  FileText,
  Share2,
  Layout,
  FileSpreadsheet,
  Settings,
  Plus,
  Terminal,
  Sun,
  Moon,
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  searchIndex: SearchIndex | null;
  onOpenNote: (noteId: string) => void;
  onNewNote: () => void;
  onSelectTab: (tab: ActiveTab) => void;
  onToggleTheme: () => void;
  isDarkMode: boolean;
}

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  notes,
  searchIndex,
  onOpenNote,
  onNewNote,
  onSelectTab,
  onToggleTheme,
  isDarkMode,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [pluginCommands, setPluginCommands] = useState<RegisteredCommand[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setPluginCommands(pluginManager.getCommands());
    }
  }, [isOpen]);

  // On the window, since focus can be anywhere: e.g. Esc right after opening, or after clicking away.
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const items = useMemo<PaletteItem[]>(() => {
    if (!isOpen) return [];
    const q = query.toLowerCase();

    const noteItems: PaletteItem[] = rankNotes(notes, searchIndex, query).map(
      ({ note, isFuzzy }) => ({
        id: `note:${note.id}`,
        group: 'Notes',
        label: note.title || 'Untitled',
        hint: isFuzzy ? 'Similar' : 'Jump to note',
        icon: <FileText className="w-4 h-4 text-indigo-400" />,
        run: () => onOpenNote(note.id),
      })
    );

    const commandItems: PaletteItem[] = pluginCommands
      .filter(c => c.title.toLowerCase().includes(q))
      .map(cmd => ({
        id: `command:${cmd.pluginId}:${cmd.id}`,
        group: 'Plugin Commands',
        label: cmd.title,
        hint: cmd.shortcut,
        icon: <Terminal className="w-4 h-4 text-cyan-400" />,
        run: cmd.handler,
      }));

    const actions: PaletteItem[] = [
      {
        id: 'new',
        label: 'Create New Note',
        icon: <Plus className="w-4 h-4 text-emerald-400" />,
        run: onNewNote,
      },
      {
        id: 'graph',
        label: 'Open Knowledge Graph',
        icon: <Share2 className="w-4 h-4 text-indigo-400" />,
        run: () => onSelectTab('graph'),
      },
      {
        id: 'canvas',
        label: 'Open Visual Canvas',
        icon: <Layout className="w-4 h-4 text-purple-400" />,
        run: () => onSelectTab('canvas'),
      },
      {
        id: 'templates',
        label: 'Open Note Templates',
        icon: <FileSpreadsheet className="w-4 h-4 text-cyan-400" />,
        run: () => onSelectTab('templates'),
      },
      {
        id: 'settings',
        label: 'Open Workspace Settings',
        icon: <Settings className="w-4 h-4 text-slate-400" />,
        run: () => onSelectTab('settings'),
      },
      {
        id: 'theme',
        label: isDarkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme',
        icon: isDarkMode ? (
          <Sun className="w-4 h-4 text-amber-400" />
        ) : (
          <Moon className="w-4 h-4 text-indigo-400" />
        ),
        run: onToggleTheme,
      },
    ]
      .filter(action => action.label.toLowerCase().includes(q))
      .map(action => ({ ...action, group: 'Navigation & Actions' }));

    return [...noteItems, ...commandItems, ...actions];
  }, [
    isOpen,
    query,
    notes,
    searchIndex,
    pluginCommands,
    isDarkMode,
    onOpenNote,
    onNewNote,
    onSelectTab,
    onToggleTheme,
  ]);

  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  if (!isOpen) return null;

  const runItem = (item: PaletteItem | undefined) => {
    if (!item) return;
    item.run();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(index => (items.length ? (index + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(index => (items.length ? (index - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runItem(items[activeIndex]);
    }
  };

  const groups = Array.from(new Set(items.map(item => item.group)));

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-start justify-center pt-20 p-4"
    >
      <div
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-label="Command palette"
        className="w-full max-w-xl bg-surface dark:bg-[#111827] border border-border dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
      >
        {/* Search input */}
        <div className="flex items-center px-4 py-3.5 border-b border-border dark:border-slate-800 space-x-3">
          <Search className="w-5 h-5 text-indigo-400" />
          <input
            autoFocus
            type="text"
            placeholder="Search notes or run commands..."
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            aria-label="Search notes or run commands"
            className="w-full bg-transparent text-sm sm:text-base font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="text-xs font-mono font-bold bg-surface-hover dark:bg-slate-800 border border-border dark:border-slate-700 px-2 py-0.5 rounded text-slate-300">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} role="listbox" className="max-h-80 overflow-y-auto p-3 space-y-3">
          {items.length === 0 && (
            <p className="px-2 py-4 text-center text-xs font-medium text-slate-500">No results.</p>
          )}
          {groups.map(group => (
            <div key={group}>
              <div className="px-2 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
                {group}
              </div>
              <div className="space-y-1 mt-1">
                {items
                  .filter(item => item.group === group)
                  .map(item => {
                    const index = items.indexOf(item);
                    const isActive = index === activeIndex;
                    return (
                      <div
                        key={item.id}
                        role="option"
                        aria-selected={isActive}
                        onClick={() => runItem(item)}
                        onMouseMove={() => setActiveIndex(index)}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-xs sm:text-sm transition-colors ${
                          isActive ? 'bg-surface-hover dark:bg-slate-800' : ''
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <span className="shrink-0">{item.icon}</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {item.label}
                          </span>
                        </div>
                        {item.hint && (
                          <span className="text-xs font-medium text-slate-400 shrink-0 ml-2">
                            {item.hint}
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
