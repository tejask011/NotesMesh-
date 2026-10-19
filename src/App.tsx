import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Note } from './core/domain/note';
import { CanvasDocument } from './core/domain/canvas';
import { NoteTemplate } from './core/domain/template';
import { storage } from './core/storage/localStorageAdapter';
import { buildBacklinks, extractTags } from './core/markdown/wikilinks';
import { toLocalDateKey } from './core/date/localDate';
import { pluginManager, StatusBarItem } from './core/plugins/pluginManager';
import { WordCountPlugin, MarkdownExportPlugin, TableOfContentsPlugin } from './core/plugins/samplePlugins';

import { Navbar, ActiveTab } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { NoteEditor } from './features/notes/NoteEditor';
import { KnowledgeGraphView } from './features/graph/KnowledgeGraphView';
import { CanvasWorkspace } from './features/canvas/CanvasWorkspace';
import { TemplatesView } from './features/templates/TemplatesView';
import { SettingsView } from './features/settings/SettingsView';
import { CommandPalette } from './components/CommandPalette';
import { PluginSettingsModal } from './features/plugins/PluginSettingsModal';

export const App: React.FC = () => {
  // Theme state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('notemesh_theme') !== 'light';
  });

  // App navigation state (5 main views)
  const [activeTab, setActiveTab] = useState<ActiveTab>('notes');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isPluginsModalOpen, setIsPluginsModalOpen] = useState(false);

  // Notes & Canvas data
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [canvases, setCanvases] = useState<CanvasDocument[]>([]);
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Plugins status bar items
  const [statusBarItems, setStatusBarItems] = useState<StatusBarItem[]>([]);

  // Toggle theme class on documentElement
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('notemesh_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('notemesh_theme', 'light');
    }
  }, [isDarkMode]);

  // Load initial notes & canvases from storage
  const loadData = useCallback(async () => {
    const loadedNotes = await storage.getNotes();
    const loadedCanvases = await storage.getCanvases();
    setNotes(loadedNotes);
    setCanvases(loadedCanvases);

    if (loadedNotes.length > 0 && !activeNoteId) {
      setActiveNoteId(loadedNotes[0].id);
    }
    if (loadedCanvases.length > 0 && !activeCanvasId) {
      setActiveCanvasId(loadedCanvases[0].id);
    }
  }, [activeNoteId, activeCanvasId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  // Note actions
  const handleCreateNewNote = (title?: string, folder?: string) => {
    const newNote: Note = {
      id: `note-${Date.now()}`,
      title: title || 'Untitled Note',
      content: '', // Completely clean textbox
      tags: [],
      folder: folder || 'General',
      isPinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    storage.saveNote(newNote);
    setNotes(prev => [newNote, ...prev]);
    setActiveNoteId(newNote.id);
    setActiveTab('notes');
  };

  const handleCreateNoteFromTemplate = (template: NoteTemplate, customTitle?: string) => {
    const dateStr = toLocalDateKey();
    const title = customTitle || `${template.name} - ${dateStr}`;
    const content = template.templateContent({ title, dateStr });

    const newNote: Note = {
      id: `note-${Date.now()}`,
      title,
      content,
      tags: [...template.tags],
      folder: template.folder,
      isPinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    storage.saveNote(newNote);
    setNotes(prev => [newNote, ...prev]);
    setActiveNoteId(newNote.id);
    setActiveTab('notes');
  };

  const handleOpenDailyNote = () => {
    const dateStr = toLocalDateKey();
    const dailyTitle = `Daily Note - ${dateStr}`;
    const existing = notes.find(n => n.title === dailyTitle);

    if (existing) {
      setActiveNoteId(existing.id);
      setActiveTab('notes');
    } else {
      const dailyNote: Note = {
        id: `note-daily-${dateStr}`,
        title: dailyTitle,
        content: '', // Completely clean textbox for daily note
        tags: ['daily-log', 'journal'],
        folder: 'Daily Notes',
        isPinned: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      storage.saveNote(dailyNote);
      setNotes(prev => [dailyNote, ...prev]);
      setActiveNoteId(dailyNote.id);
      setActiveTab('notes');
    }
  };

  const handleImportMarkdown = (title: string, content: string) => {
    const tags = extractTags(content);
    const newNote: Note = {
      id: `note-imported-${Date.now()}`,
      title,
      content,
      tags,
      folder: 'Imported',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    storage.saveNote(newNote);
    setNotes(prev => [newNote, ...prev]);
    setActiveNoteId(newNote.id);
    setActiveTab('notes');
  };

  const handleUpdateNote = (updated: Note) => {
    setNotes(prev => prev.map(n => (n.id === updated.id ? updated : n)));
    storage.saveNote(updated);
    pluginManager.notifyNoteChanged(updated.content);
  };

  const handleDeleteNote = async (id: string) => {
    if (notes.length <= 1) {
      alert('You must keep at least one note in your workspace.');
      return;
    }
    if (confirm('Delete this note?')) {
      await storage.deleteNote(id);
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

  const handleNavigateToNote = (noteIdOrTitle: string) => {
    const foundById = notes.find(n => n.id === noteIdOrTitle);
    if (foundById) {
      setActiveNoteId(foundById.id);
      setActiveTab('notes');
      return;
    }

    const foundByTitle = notes.find(
      n => n.title.toLowerCase().trim() === noteIdOrTitle.toLowerCase().trim()
    );
    if (foundByTitle) {
      setActiveNoteId(foundByTitle.id);
      setActiveTab('notes');
      return;
    }

    handleCreateNewNote(noteIdOrTitle);
  };

  // Canvas actions
  const activeCanvas = useMemo(() => {
    return canvases.find(c => c.id === activeCanvasId) || canvases[0] || null;
  }, [canvases, activeCanvasId]);

  const handleUpdateCanvas = (updated: CanvasDocument) => {
    setCanvases(prev => prev.map(c => (c.id === updated.id ? updated : c)));
    storage.saveCanvas(updated);
  };

  // Backlinks for active note
  const currentBacklinks = useMemo(() => {
    if (!activeNote) return [];
    return buildBacklinks(activeNote, notes);
  }, [activeNote, notes]);

  return (
    <div className="flex flex-col h-screen w-screen bg-background overflow-hidden">
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

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'notes' && (
          <>
            <Sidebar
              notes={notes}
              activeNoteId={activeNoteId}
              onSelectNote={id => setActiveNoteId(id)}
              onNewNote={folder => handleCreateNewNote(undefined, folder)}
              onDeleteNote={handleDeleteNote}
              onTogglePin={handleTogglePin}
              selectedTag={selectedTag}
              onSelectTag={setSelectedTag}
              onOpenDailyNote={handleOpenDailyNote}
              onImportMarkdown={handleImportMarkdown}
            />
            {activeNote ? (
              <NoteEditor
                note={activeNote}
                onUpdateNote={handleUpdateNote}
                allNotes={notes}
                backlinks={currentBacklinks}
                onNavigateNote={handleNavigateToNote}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                No note selected.
              </div>
            )}
          </>
        )}

        {activeTab === 'graph' && (
          <KnowledgeGraphView
            notes={notes}
            onOpenNote={handleNavigateToNote}
            isDarkMode={isDarkMode}
          />
        )}

        {activeTab === 'canvas' && activeCanvas && (
          <CanvasWorkspace
            canvasDoc={activeCanvas}
            onUpdateCanvas={handleUpdateCanvas}
            notes={notes}
            onOpenNote={handleNavigateToNote}
            isDarkMode={isDarkMode}
          />
        )}

        {activeTab === 'templates' && (
          <TemplatesView
            onCreateNoteFromTemplate={handleCreateNoteFromTemplate}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            isDarkMode={isDarkMode}
            toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
            notes={notes}
            canvases={canvases}
            onDataReload={loadData}
          />
        )}
      </div>

      {/* Bottom Status Bar for Extensions */}
      <footer className="h-7 border-t border-border dark:border-slate-800 bg-surface dark:bg-[#111827]/90 px-5 flex items-center justify-between text-xs font-semibold text-slate-400 select-none z-20 shrink-0">
        <div className="flex items-center space-x-5">
          <span className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-300">NoteMesh Core · Local-first</span>
          </span>
          {statusBarItems.map(item => (
            <span
              key={item.id}
              onClick={item.onClick}
              title={item.tooltip}
              className={`hover:text-indigo-400 transition-colors ${item.onClick ? 'cursor-pointer' : ''}`}
            >
              {item.text}
            </span>
          ))}
        </div>

        <div className="flex items-center space-x-3 text-xs font-semibold text-slate-400">
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
        onOpenNote={handleNavigateToNote}
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
    </div>
  );
};
