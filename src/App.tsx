import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useSyncExternalStore,
} from 'react';
import { Note } from './core/domain/note';
import { CanvasDocument } from './core/domain/canvas';
import { NoteTemplate } from './core/domain/template';
import { saveQueue, storage } from './core/storage';
import { LoadResult } from './core/storage/storageInterface';
import { WorkspaceData } from './core/storage/schema';
import { serializeBackup } from './core/storage/migrations';
import { buildBacklinks, buildTitleIndex } from './core/markdown/wikilinks';
import { pluginManager, StatusBarItem } from './core/plugins/pluginManager';
import {
  WordCountPlugin,
  MarkdownExportPlugin,
  TableOfContentsPlugin,
} from './core/plugins/samplePlugins';
import {
  DEFAULT_FOLDER,
  isInFolder,
  normalizeFolderPath,
  renameFolderPath,
} from './core/notes/folders';
import { describeImport, importMarkdownFiles } from './core/notes/importExport';
import { uniqueTitle } from './core/notes/titles';
import { buildSearchIndex, relatedNotes } from './core/search/localSearch';
import { createBoard } from './core/canvas/canvasOps';
import { isEditableTarget, matchShortcut } from './core/shortcuts';
import { createId, localDateString } from './core/util/ids';
import { downloadText } from './core/util/files';

import { Navbar, ActiveTab } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { SaveStatusBadge } from './components/SaveStatusBadge';
import { Toast, ToastKind, Toasts } from './components/Toasts';
import { NoteEditor } from './features/notes/NoteEditor';
import { KnowledgeGraphView } from './features/graph/KnowledgeGraphView';
import { CanvasWorkspace } from './features/canvas/CanvasWorkspace';
import { BoardTabs } from './features/canvas/BoardTabs';
import { TemplatesView } from './features/templates/TemplatesView';
import { SettingsView } from './features/settings/SettingsView';
import { RecoveryScreen } from './features/recovery/RecoveryScreen';
import { CommandPalette } from './components/CommandPalette';
import { PluginSettingsModal } from './features/plugins/PluginSettingsModal';

const ACTIVE_NOTE_KEY = 'notemesh_active_note';
const ACTIVE_CANVAS_KEY = 'notemesh_active_canvas';

const readPreference = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writePreference = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Only a preference; the app works without it.
  }
};

/** IndexedDB returns records by key, so put them back in a useful order. */
const sortNotes = (notes: Note[]) =>
  [...notes].sort(
    (a, b) => Number(b.isPinned ?? false) - Number(a.isPinned ?? false) || b.createdAt - a.createdAt
  );

const sortCanvases = (canvases: CanvasDocument[]) =>
  [...canvases].sort((a, b) => a.createdAt - b.createdAt);

/** Another tab changed the workspace: take its version, except for records with edits still queued here. */
function mergeExternal<T extends { id: string }>(
  stored: T[],
  current: T[],
  kind: 'note' | 'canvas'
): T[] {
  const hasPending = (id: string) => saveQueue.hasPending(`${kind}:${id}`);
  return [
    ...stored.filter(record => !hasPending(record.id)),
    ...current.filter(record => hasPending(record.id)),
  ];
}

async function openWorkspace(): Promise<LoadResult> {
  const result = await storage.open();
  if (storage.isLocked()) return result;
  // Finish any edits a previous session recorded but might not have written.
  const replayed = await saveQueue.replayJournal(result);
  if (!replayed) return result;
  return { ...result, notes: await storage.getNotes(), canvases: await storage.getCanvases() };
}

/** A function whose identity never changes but which always runs the latest render's logic. */
function useStableCallback<Args extends unknown[], Result>(fn: (...args: Args) => Result) {
  const latest = useRef(fn);
  latest.current = fn;
  return useCallback((...args: Args) => latest.current(...args), []);
}

export const App: React.FC = () => {
  // Theme state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return readPreference('notemesh_theme') !== 'light';
  });

  // Workspace load state: the app renders nothing that can write until this resolves
  const [isLoaded, setIsLoaded] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);

  // App navigation state (5 main views)
  const [activeTab, setActiveTab] = useState<ActiveTab>('notes');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isPluginsModalOpen, setIsPluginsModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Notes & Canvas data
  const [notes, setNotes] = useState<Note[]>([]);
  // Workspace-wide views (sidebar, search, backlinks) are costly at scale, so they follow
  // this copy of the notes: it waits for a pause in typing but updates at once for anything else.
  const [settledNotes, setSettledNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(() =>
    readPreference(ACTIVE_NOTE_KEY)
  );
  const [canvases, setCanvases] = useState<CanvasDocument[]>([]);
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(() =>
    readPreference(ACTIVE_CANVAS_KEY)
  );
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Plugins status bar items
  const [statusBarItems, setStatusBarItems] = useState<StatusBarItem[]>([]);

  const saveStatus = useSyncExternalStore(saveQueue.subscribe, saveQueue.getStatus);

  // Toast notifications
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToastId = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const notify = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextToastId.current++;
      setToasts(prev => [...prev, { id, kind, message }]);
      // Errors stay until dismissed so they can't be missed.
      if (kind !== 'error') setTimeout(() => dismissToast(id), 6000);
    },
    [dismissToast]
  );

  // Toggle theme class on documentElement
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      writePreference('notemesh_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      writePreference('notemesh_theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => writePreference(ACTIVE_NOTE_KEY, activeNoteId), [activeNoteId]);
  useEffect(() => writePreference(ACTIVE_CANVAS_KEY, activeCanvasId), [activeCanvasId]);

  const applyWorkspace = useCallback((data: WorkspaceData) => {
    const sorted = sortNotes(data.notes);
    setNotes(sorted);
    setSettledNotes(sorted); // Together, so the sidebar never renders a commit behind on load.
    setCanvases(sortCanvases(data.canvases));
  }, []);

  /** Re-read everything, e.g. after a restore replaced the workspace. */
  const reloadWorkspace = useCallback(async () => {
    applyWorkspace({ notes: await storage.getNotes(), canvases: await storage.getCanvases() });
    setRecoveryMessage(null);
  }, [applyWorkspace]);

  // Load the workspace exactly once (a ref, since StrictMode runs effects twice in development)
  const openPromise = useRef<Promise<LoadResult> | null>(null);
  useEffect(() => {
    openPromise.current ??= openWorkspace();
    let cancelled = false;
    openPromise.current
      .then(result => {
        if (cancelled) return;
        if (result.status === 'corrupted' || result.status === 'newer-version') {
          setRecoveryMessage(result.message ?? 'The saved workspace could not be read.');
        } else {
          applyWorkspace(result);
          if (result.status === 'salvaged' && result.message) notify('error', result.message);
          if (result.status === 'migrated')
            notify('info', 'Your workspace was upgraded to the latest format.');
        }
        setIsLoaded(true);
      })
      .catch(error => {
        if (cancelled) return;
        console.error('Could not open storage:', error);
        setRecoveryMessage(`Browser storage is not available: ${(error as Error).message}`);
        setIsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [applyWorkspace, notify]);

  // Keep other tabs of this workspace from working on stale data
  useEffect(() => {
    return storage.subscribeExternalChanges(async () => {
      if (storage.isLocked()) return;
      const [storedNotes, storedCanvases] = await Promise.all([
        storage.getNotes(),
        storage.getCanvases(),
      ]);
      setNotes(current => sortNotes(mergeExternal(storedNotes, current, 'note')));
      setCanvases(current => sortCanvases(mergeExternal(storedCanvases, current, 'canvas')));
    });
  }, []);

  // Don't lose queued edits when the page goes away
  useEffect(() => {
    const persistNow = () => {
      // Writes started now may not finish while the page is closing, so record them synchronously too.
      saveQueue.writeJournal();
      void saveQueue.flush();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persistNow();
    };
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveQueue.getStatus().state === 'error') e.preventDefault();
      persistNow();
    };
    window.addEventListener('pagehide', persistNow);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', persistNow);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Register built-in sample plugins on startup
  useEffect(() => {
    pluginManager.registerPlugin(WordCountPlugin);
    pluginManager.registerPlugin(MarkdownExportPlugin);
    pluginManager.registerPlugin(TableOfContentsPlugin);

    const unsubscribe = pluginManager.subscribe(() => {
      setStatusBarItems(pluginManager.getStatusBarItems());
    });

    setStatusBarItems(pluginManager.getStatusBarItems());
    return unsubscribe;
  }, []);

  // Provide current active note content to plugins
  const activeNote = useMemo(() => {
    return notes.find(n => n.id === activeNoteId) || notes[0] || null;
  }, [notes, activeNoteId]);

  useEffect(() => {
    pluginManager.setCurrentContentProvider(() => activeNote?.content || '');
    if (activeNote) {
      pluginManager.notifyNoteChanged(activeNote.content);
    }
  }, [activeNote]);

  const isTypingRef = useRef(false);

  useEffect(() => {
    if (!isTypingRef.current) {
      setSettledNotes(notes);
      return;
    }
    isTypingRef.current = false;
    const timer = setTimeout(() => setSettledNotes(notes), 500);
    return () => clearTimeout(timer);
  }, [notes]);

  const searchIndex = useMemo(() => buildSearchIndex(settledNotes), [settledNotes]);

  // Note actions
  const addNote = (note: Note) => {
    saveQueue.enqueue({ kind: 'putNote', note });
    setNotes(prev => [note, ...prev]);
    setActiveNoteId(note.id);
    setActiveTab('notes');
  };

  const handleCreateNewNote = (title?: string, folder?: string) => {
    const now = Date.now();
    addNote({
      id: createId('note'),
      title: uniqueTitle(
        title || 'Untitled Note',
        notes.map(n => n.title)
      ),
      content: '', // Completely clean textbox
      tags: [],
      folder: normalizeFolderPath(folder),
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    });
  };

  const handleCreateNoteFromTemplate = (template: NoteTemplate, customTitle?: string) => {
    const dateStr = localDateString();
    const title = uniqueTitle(
      customTitle || `${template.name} - ${dateStr}`,
      notes.map(n => n.title)
    );
    const now = Date.now();
    addNote({
      id: createId('note'),
      title,
      content: template.templateContent({ title, dateStr }),
      tags: [...template.tags],
      folder: normalizeFolderPath(template.folder),
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    });
  };

  const handleOpenDailyNote = () => {
    const dateStr = localDateString();
    const dailyTitle = `Daily Note - ${dateStr}`;
    const existing = notes.find(n => n.title === dailyTitle);

    if (existing) {
      setActiveNoteId(existing.id);
      setActiveTab('notes');
    } else {
      const now = Date.now();
      addNote({
        id: `note-daily-${dateStr}`,
        title: dailyTitle,
        content: '', // Completely clean textbox for daily note
        tags: ['daily-log', 'journal'],
        folder: 'Daily Notes',
        isPinned: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  };

  const handleImportFiles = async (files: File[]) => {
    const summary = await importMarkdownFiles(
      files,
      notes.map(n => n.title)
    );
    if (summary.notes.length > 0) {
      summary.notes.forEach(note => saveQueue.enqueue({ kind: 'putNote', note }));
      setNotes(prev => [...summary.notes, ...prev]);
      setActiveNoteId(summary.notes[0].id);
      setActiveTab('notes');
    }
    notify(summary.skipped.length > 0 ? 'error' : 'success', describeImport(summary));
  };

  const handleUpdateNote = (updated: Note) => {
    const note = { ...updated, updatedAt: Date.now() };
    const previous = notes.find(n => n.id === note.id);
    isTypingRef.current =
      previous !== undefined &&
      (previous.content !== note.content || previous.title !== note.title);
    setNotes(prev => prev.map(n => (n.id === note.id ? note : n)));
    saveQueue.enqueue({ kind: 'putNote', note });
  };

  const handleDeleteNote = (id: string) => {
    if (notes.length <= 1) {
      notify('info', 'You must keep at least one note in your workspace.');
      return;
    }
    if (confirm('Delete this note?')) {
      saveQueue.enqueue({ kind: 'deleteNote', id });
      const remaining = notes.filter(n => n.id !== id);
      setNotes(remaining);
      if (activeNoteId === id) {
        setActiveNoteId(remaining[0]?.id || null);
      }
    }
  };

  const handleTogglePin = (id: string) => {
    const target = notes.find(n => n.id === id);
    if (target) {
      handleUpdateNote({ ...target, isPinned: !target.isPinned });
    }
  };

  const handleRenameFolder = (path: string) => {
    const next = prompt(`Rename or move "${path}" (use "/" to nest):`, path);
    if (next === null) return;
    const target = normalizeFolderPath(next);
    if (target === path) return;
    if (target.startsWith(`${path}/`)) {
      notify('error', 'A folder cannot be moved inside itself.');
      return;
    }

    const now = Date.now();
    const updated = new Map<string, Note>();
    notes
      .filter(note => isInFolder(note, path))
      .forEach(note => {
        const moved = {
          ...note,
          folder: renameFolderPath(note.folder, path, target),
          updatedAt: now,
        };
        updated.set(note.id, moved);
        saveQueue.enqueue({ kind: 'putNote', note: moved });
      });
    setNotes(prev => prev.map(note => updated.get(note.id) ?? note));
  };

  const handleOpenNote = useCallback(
    (noteId: string) => {
      if (notes.some(n => n.id === noteId)) {
        setActiveNoteId(noteId);
        setActiveTab('notes');
      } else {
        notify('info', 'That note no longer exists.');
      }
    },
    [notes, notify]
  );

  const handleCreateNoteFromLink = (title: string) => {
    const existing = buildTitleIndex(notes).get(title.toLowerCase().trim());
    if (existing) handleOpenNote(existing.id);
    else handleCreateNewNote(title);
  };

  const handleFlushSave = useCallback(async () => {
    const saved = await saveQueue.flush();
    if (saved) notify('success', 'All changes saved.');
    return saved;
  }, [notify]);

  const handleRetrySave = () => {
    void saveQueue.retry();
  };

  /** Doesn't touch storage, so it still works when storage is what's failing. */
  const handleDownloadFromMemory = () => {
    downloadText(
      serializeBackup({ notes, canvases }),
      `notemesh-backup-${localDateString()}.json`,
      'application/json'
    );
  };

  // Canvas actions
  const activeCanvas = useMemo(() => {
    return canvases.find(c => c.id === activeCanvasId) || canvases[0] || null;
  }, [canvases, activeCanvasId]);

  const handleUpdateCanvas = useCallback((updated: CanvasDocument) => {
    const canvas = { ...updated, updatedAt: Date.now() };
    setCanvases(prev => prev.map(c => (c.id === canvas.id ? canvas : c)));
    saveQueue.enqueue({ kind: 'putCanvas', canvas });
  }, []);

  const handleCreateBoard = () => {
    const board = createBoard(
      uniqueTitle(
        'Untitled Board',
        canvases.map(c => c.title)
      )
    );
    setCanvases(prev => [...prev, board]);
    setActiveCanvasId(board.id);
    saveQueue.enqueue({ kind: 'putCanvas', canvas: board });
  };

  const handleRenameBoard = (id: string, title: string) => {
    const board = canvases.find(c => c.id === id);
    if (board) handleUpdateCanvas({ ...board, title });
  };

  const handleDeleteBoard = (id: string) => {
    const board = canvases.find(c => c.id === id);
    if (!board || canvases.length <= 1) return;
    const detail = board.elements.length > 0 ? ` and its ${board.elements.length} elements` : '';
    if (!confirm(`Delete the board "${board.title}"${detail}?`)) return;

    const remaining = canvases.filter(c => c.id !== id);
    setCanvases(remaining);
    if (activeCanvas?.id === id) setActiveCanvasId(remaining[0].id);
    saveQueue.enqueue({ kind: 'deleteCanvas', id });
  };

  // Global keyboard shortcuts. The ref lets the listener stay attached across renders.
  const shortcutHandlers = useRef({ handleCreateNewNote, handleOpenDailyNote, handleFlushSave });
  shortcutHandlers.current = { handleCreateNewNote, handleOpenDailyNote, handleFlushSave };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchShortcut(e, 'palette')) {
        e.preventDefault();
        setIsCommandPaletteOpen(open => !open);
      } else if (matchShortcut(e, 'save')) {
        e.preventDefault();
        void shortcutHandlers.current.handleFlushSave();
      } else if (matchShortcut(e, 'newNote')) {
        e.preventDefault();
        shortcutHandlers.current.handleCreateNewNote();
      } else if (matchShortcut(e, 'dailyNote')) {
        e.preventDefault();
        shortcutHandlers.current.handleOpenDailyNote();
      } else if (
        (e.ctrlKey || e.metaKey || e.altKey || !isEditableTarget(e.target)) &&
        pluginManager.runShortcut(e)
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Backlinks and suggestions for active note
  const activeNoteSettledId = activeNote?.id;
  const currentBacklinks = useMemo(() => {
    const target = settledNotes.find(n => n.id === activeNoteSettledId);
    return target ? buildBacklinks(target, settledNotes) : [];
  }, [activeNoteSettledId, settledNotes]);

  const currentRelated = useMemo(() => {
    if (!activeNoteSettledId) return [];
    const linked = new Set(currentBacklinks.map(item => item.sourceNoteId));
    const byId = new Map(settledNotes.map(note => [note.id, note]));
    return relatedNotes(searchIndex, activeNoteSettledId)
      .filter(hit => !linked.has(hit.noteId) && byId.has(hit.noteId))
      .map(hit => ({ id: hit.noteId, title: (byId.get(hit.noteId) as Note).title }));
  }, [activeNoteSettledId, currentBacklinks, searchIndex, settledNotes]);

  // Stable identities let the memoized sidebar skip rendering while the user types.
  const sidebarNewNote = useStableCallback((folder?: string) =>
    handleCreateNewNote(undefined, folder ?? DEFAULT_FOLDER)
  );
  const sidebarDeleteNote = useStableCallback(handleDeleteNote);
  const sidebarTogglePin = useStableCallback(handleTogglePin);
  const sidebarOpenDaily = useStableCallback(handleOpenDailyNote);
  const sidebarImport = useStableCallback((files: File[]) => void handleImportFiles(files));
  const sidebarRenameFolder = useStableCallback(handleRenameFolder);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  if (!isLoaded) {
    return (
      <div
        className="h-dvh w-screen flex items-center justify-center bg-background text-sm font-medium text-slate-400"
        role="status"
      >
        Opening your workspace...
      </div>
    );
  }

  if (recoveryMessage !== null) {
    return <RecoveryScreen message={recoveryMessage} onRecovered={() => void reloadWorkspace()} />;
  }

  return (
    <div className="flex flex-col h-dvh w-screen bg-background overflow-hidden">
      {/* Top Navigation Bar with 5 main views */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isDarkMode={isDarkMode}
        toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        onNewNote={() => handleCreateNewNote()}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenPlugins={() => setIsPluginsModalOpen(true)}
      />

      {/* Save failures are never just a toast: this stays until the data is safe */}
      {saveStatus.state === 'error' && (
        <div
          role="alert"
          className="mx-4 sm:mx-6 mb-2 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/40 text-xs font-medium text-rose-300 flex flex-wrap items-center gap-3 shrink-0"
        >
          <span className="flex-1 min-w-[12rem]">{saveStatus.error}</span>
          <button onClick={handleRetrySave} className="font-bold underline hover:text-white">
            Retry now
          </button>
          <button
            onClick={handleDownloadFromMemory}
            className="font-bold underline hover:text-white"
          >
            Download backup
          </button>
        </div>
      )}

      {/* Main Workspace Body */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {activeTab === 'notes' && (
          <>
            <Sidebar
              notes={settledNotes}
              activeNoteId={activeNote?.id ?? null}
              onSelectNote={setActiveNoteId}
              onNewNote={sidebarNewNote}
              onDeleteNote={sidebarDeleteNote}
              onTogglePin={sidebarTogglePin}
              selectedTag={selectedTag}
              onSelectTag={setSelectedTag}
              onOpenDailyNote={sidebarOpenDaily}
              onImportFiles={sidebarImport}
              onRenameFolder={sidebarRenameFolder}
              storageKind={storage.kind}
              isOpenOnMobile={isSidebarOpen}
              onCloseOnMobile={closeSidebar}
            />
            {activeNote ? (
              // Keyed so the text area's undo history and selection never leak between notes.
              <NoteEditor
                key={activeNote.id}
                note={activeNote}
                onUpdateNote={handleUpdateNote}
                allNotes={settledNotes}
                backlinks={currentBacklinks}
                relatedNotes={currentRelated}
                onNavigateNote={handleOpenNote}
                onCreateNoteFromLink={handleCreateNoteFromLink}
                saveStatus={saveStatus}
                onRetrySave={handleRetrySave}
                onToggleSidebar={() => setIsSidebarOpen(open => !open)}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center space-y-3 text-gray-400">
                <span>No note selected.</span>
                <button
                  onClick={() => handleCreateNewNote()}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
                >
                  Create a note
                </button>
              </div>
            )}
          </>
        )}

        {activeTab === 'graph' && (
          <KnowledgeGraphView
            notes={notes}
            activeNoteId={activeNote?.id ?? null}
            onOpenNote={handleOpenNote}
            isDarkMode={isDarkMode}
          />
        )}

        {activeTab === 'canvas' && (
          <div className="flex-1 min-w-0 flex flex-col h-full min-h-0">
            <BoardTabs
              boards={canvases}
              activeBoardId={activeCanvas?.id ?? null}
              onSelect={setActiveCanvasId}
              onCreate={handleCreateBoard}
              onRename={handleRenameBoard}
              onDelete={handleDeleteBoard}
            />
            {activeCanvas ? (
              // Keyed so undo history, selection and pan belong to one board.
              <CanvasWorkspace
                key={activeCanvas.id}
                canvasDoc={activeCanvas}
                onUpdateCanvas={handleUpdateCanvas}
                notes={notes}
                onOpenNote={handleOpenNote}
                isDarkMode={isDarkMode}
                onExportError={message => notify('error', message)}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                No boards yet. Use the + button to create one.
              </div>
            )}
          </div>
        )}

        {activeTab === 'templates' && (
          <TemplatesView onCreateNoteFromTemplate={handleCreateNoteFromTemplate} />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            isDarkMode={isDarkMode}
            toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
            notes={notes}
            canvases={canvases}
            onDataReload={reloadWorkspace}
            onFlushSave={() => saveQueue.flush()}
            notify={notify}
            onOpenNote={handleOpenNote}
          />
        )}
      </div>

      {/* Bottom Status Bar for Extensions */}
      <footer className="h-7 border-t border-border dark:border-slate-800 bg-surface dark:bg-[#111827]/90 px-5 flex items-center justify-between text-xs font-semibold text-slate-400 select-none z-20 shrink-0 overflow-hidden">
        <div className="flex items-center space-x-5 min-w-0">
          <SaveStatusBadge status={saveStatus} onRetry={handleRetrySave} />
          <span className="hidden sm:flex items-center space-x-2">
            <span className="text-slate-300">NoteMesh Core · Local-first</span>
          </span>
          {statusBarItems.map(item => (
            <span
              key={item.id}
              onClick={item.onClick}
              title={item.tooltip}
              className={`hover:text-indigo-400 transition-colors truncate ${item.onClick ? 'cursor-pointer' : ''}`}
            >
              {item.text}
            </span>
          ))}
        </div>

        <div className="hidden md:flex items-center space-x-3 text-xs font-semibold text-slate-400 shrink-0">
          <span>Markdown GFM</span>
          <span>•</span>
          <span>Open Source</span>
        </div>
      </footer>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        notes={notes}
        searchIndex={searchIndex}
        onOpenNote={handleOpenNote}
        onNewNote={() => handleCreateNewNote()}
        onSelectTab={setActiveTab}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
        isDarkMode={isDarkMode}
      />

      {/* Plugins Modal */}
      <PluginSettingsModal
        isOpen={isPluginsModalOpen}
        onClose={() => setIsPluginsModalOpen(false)}
      />

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
