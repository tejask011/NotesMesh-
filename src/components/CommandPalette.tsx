import React, { useState, useEffect, useRef } from 'react';
import { Note } from '../core/domain/note';
import { ActiveTab } from './Navbar';
import { pluginManager, RegisteredCommand } from '../core/plugins/pluginManager';
import { clampActiveIndex, moveActiveIndex } from '../core/commandPalette/navigation';
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
  Moon 
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  notes: Note[];
  onOpenNote: (noteId: string) => void;
  onNewNote: () => void;
  onSelectTab: (tab: ActiveTab) => void;
  onToggleTheme: () => void;
  isDarkMode: boolean;
}

type PaletteGroup = 'Notes' | 'Plugin Commands' | 'Navigation & Actions';

interface PaletteItem {
  id: string;
  group: PaletteGroup;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  hintIsShortcut?: boolean;
  run: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onOpen,
  onClose,
  notes,
  onOpenNote,
  onNewNote,
  onSelectTab,
  onToggleTheme,
  isDarkMode,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [pluginCommands, setPluginCommands] = useState<RegisteredCommand[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    setQuery('');
    setActiveIndex(0);
    setPluginCommands(pluginManager.getCommands());
    inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          onOpen();
        }
        return;
      }

      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onOpen]);

  const normalizedQuery = query.trim().toLowerCase();
  const matches = (value: string) =>
    normalizedQuery.length === 0 || value.toLowerCase().includes(normalizedQuery);

  const noteItems: PaletteItem[] = notes
    .filter(n => matches(n.title) || matches(n.content))
    .slice(0, 5)
    .map(n => ({
      id: `note:${n.id}`,
      group: 'Notes',
      icon: <FileText className="w-4 h-4 text-indigo-400" />,
      label: n.title,
      hint: 'Jump to note',
      run: () => {
        onOpenNote(n.id);
        onClose();
      },
    }));

  const commandItems: PaletteItem[] = pluginCommands
    .filter(c => matches(c.title))
    .map(c => ({
      id: `command:${c.id}`,
      group: 'Plugin Commands',
      icon: <Terminal className="w-4 h-4 text-cyan-400" />,
      label: c.title,
      hint: c.shortcut,
      hintIsShortcut: true,
      run: () => {
        c.handler();
        onClose();
      },
    }));

  const actionDefinitions: PaletteItem[] = [
    {
      id: 'action:new-note',
      group: 'Navigation & Actions',
      icon: <Plus className="w-4 h-4 text-emerald-400" />,
      label: 'Create New Note',
      run: () => {
        onNewNote();
        onClose();
      },
    },
    {
      id: 'action:graph',
      group: 'Navigation & Actions',
      icon: <Share2 className="w-4 h-4 text-indigo-400" />,
      label: 'Open Knowledge Graph',
      run: () => {
        onSelectTab('graph');
        onClose();
      },
    },
    {
      id: 'action:canvas',
      group: 'Navigation & Actions',
      icon: <Layout className="w-4 h-4 text-purple-400" />,
      label: 'Open Visual Canvas',
      run: () => {
        onSelectTab('canvas');
        onClose();
      },
    },
    {
      id: 'action:templates',
      group: 'Navigation & Actions',
      icon: <FileSpreadsheet className="w-4 h-4 text-cyan-400" />,
      label: 'Open Note Templates',
      run: () => {
        onSelectTab('templates');
        onClose();
      },
    },
    {
      id: 'action:settings',
      group: 'Navigation & Actions',
      icon: <Settings className="w-4 h-4 text-slate-400" />,
      label: 'Open Workspace Settings',
      run: () => {
        onSelectTab('settings');
        onClose();
      },
    },
    {
      id: 'action:theme',
      group: 'Navigation & Actions',
      icon: isDarkMode
        ? <Sun className="w-4 h-4 text-amber-400" />
        : <Moon className="w-4 h-4 text-indigo-400" />,
      label: isDarkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme',
      run: () => {
        onToggleTheme();
        onClose();
      },
    },
  ];

  const actionItems = actionDefinitions.filter(item => matches(item.label));

  const items = [...noteItems, ...commandItems, ...actionItems];

  useEffect(() => {
    setActiveIndex(current => clampActiveIndex(current, items.length));
  }, [items.length]);

  useEffect(() => {
    if (!isOpen) return;
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  const runItem = (index: number) => {
    const item = items[index];
    if (item) item.run();
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (items.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(current => moveActiveIndex(current, items.length, 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(current => moveActiveIndex(current, items.length, -1));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      runItem(activeIndex);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-start justify-center pt-20 p-4">
      <div 
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xl bg-surface dark:bg-[#111827] border border-border dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
      >
        {/* Search input */}
        <div className="flex items-center px-4 py-3.5 border-b border-border dark:border-slate-800 space-x-3">
          <Search className="w-5 h-5 text-indigo-400" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={true}
            aria-controls="command-palette-results"
            aria-activedescendant={items.length > 0 ? `command-palette-item-${activeIndex}` : undefined}
            placeholder="Search notes or run commands..."
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            className="w-full bg-transparent text-sm sm:text-base font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="text-xs font-mono font-bold bg-surface-hover dark:bg-slate-800 border border-border dark:border-slate-700 px-2 py-0.5 rounded text-slate-300">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-slate-400">
              No results for &quot;{query}&quot;
            </div>
          ) : (
            <div
              id="command-palette-results"
              role="listbox"
              aria-label="Command palette results"
              className="space-y-1"
            >
              {items.map((item, index) => (
                <React.Fragment key={item.id}>
                  {(index === 0 || items[index - 1].group !== item.group) && (
                    <div className="px-2 pt-2 pb-1 text-xs font-bold text-slate-400 uppercase tracking-wider first:pt-0">
                      {item.group}
                    </div>
                  )}
                  <div
                    ref={el => {
                      itemRefs.current[index] = el;
                    }}
                    id={`command-palette-item-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runItem(index)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-xs sm:text-sm transition-colors ${
                      index === activeIndex
                        ? 'bg-indigo-500/15 text-slate-900 dark:text-white ring-1 ring-inset ring-indigo-500/40'
                        : 'hover:bg-surface-hover dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      {item.icon}
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{item.label}</span>
                    </div>
                    {item.hint && (
                      item.hintIsShortcut ? (
                        <kbd className="text-xs font-mono font-bold bg-surface-hover dark:bg-slate-800 border border-border dark:border-slate-700 px-2 py-0.5 rounded text-slate-300">
                          {item.hint}
                        </kbd>
                      ) : (
                        <span className="text-xs font-medium text-slate-400">{item.hint}</span>
                      )
                    )}
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
