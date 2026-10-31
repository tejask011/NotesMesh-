import React, { memo, useMemo, useState, useRef } from 'react';
import { Note } from '../core/domain/note';
import { FolderNode, buildFolderTree } from '../core/notes/folders';
import { IMPORT_EXTENSIONS } from '../core/notes/importExport';
import { collectAllTags, noteHasTag } from '../core/notes/tags';
import { StorageKind } from '../core/storage/storageInterface';
import {
  FileText,
  Pin,
  Trash2,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Search,
  Plus,
  Calendar,
  Upload,
  Pencil,
  Tag as TagIcon,
} from 'lucide-react';

interface SidebarProps {
  notes: Note[];
  activeNoteId: string | null;
  onSelectNote: (id: string) => void;
  onNewNote: (folder?: string) => void;
  onDeleteNote: (id: string) => void;
  onTogglePin: (id: string) => void;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  onOpenDailyNote: () => void;
  onImportFiles: (files: File[]) => void;
  onRenameFolder: (path: string) => void;
  storageKind: StorageKind;
  isOpenOnMobile: boolean;
  onCloseOnMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = memo(
  ({
    notes,
    activeNoteId,
    onSelectNote,
    onNewNote,
    onDeleteNote,
    onTogglePin,
    selectedTag,
    onSelectTag,
    onOpenDailyNote,
    onImportFiles,
    onRenameFolder,
    storageKind,
    isOpenOnMobile,
    onCloseOnMobile,
  }) => {
    const [search, setSearch] = useState('');
    const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
    const [tagsOpen, setTagsOpen] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const toggleFolder = (path: string) => {
      setCollapsedFolders(prev => ({
        ...prev,
        [path]: !prev[path],
      }));
    };

    const allTags = useMemo(() => collectAllTags(notes), [notes]);

    const filteredNotes = useMemo(() => {
      const query = search.toLowerCase();
      return notes.filter(n => {
        const matchesSearch =
          !query ||
          n.title.toLowerCase().includes(query) ||
          n.content.toLowerCase().includes(query);
        const matchesTag = selectedTag ? noteHasTag(n, selectedTag) : true;
        return matchesSearch && matchesTag;
      });
    }, [notes, search, selectedTag]);

    const folderTree = useMemo(() => buildFolderTree(filteredNotes), [filteredNotes]);
    const pinnedNotes = filteredNotes.filter(n => n.isPinned);

    const selectAndClose = (id: string) => {
      onSelectNote(id);
      onCloseOnMobile();
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = '';
      if (files.length > 0) onImportFiles(files);
    };

    const renderFolder = (folder: FolderNode): React.ReactNode => {
      const isCollapsed = collapsedFolders[folder.path] || false;

      return (
        <div
          key={folder.path}
          className="space-y-0.5"
          role="treeitem"
          aria-expanded={!isCollapsed}
          aria-label={folder.path}
        >
          {/* Folder Header (VS Code / GitHub style) */}
          <div
            onClick={() => toggleFolder(folder.path)}
            className="group flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-surface-hover dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
          >
            <div className="flex items-center space-x-1.5 min-w-0">
              <span className="text-slate-400 group-hover:text-slate-200 transition-transform duration-150">
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </span>
              {isCollapsed ? (
                <Folder className="w-4 h-4 text-amber-400/90 shrink-0" />
              ) : (
                <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span className="truncate">{folder.name}</span>
            </div>
            <div className="flex items-center space-x-1 shrink-0">
              <button
                onClick={e => {
                  e.stopPropagation();
                  onNewNote(folder.path);
                }}
                title={`New note in ${folder.path}`}
                className="p-0.5 text-slate-400 hover:text-indigo-400 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition-opacity"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                onClick={e => {
                  e.stopPropagation();
                  onRenameFolder(folder.path);
                }}
                title={`Rename or move ${folder.path}`}
                className="p-0.5 text-slate-400 hover:text-indigo-400 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition-opacity"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <span
                title={`${folder.totalCount} note${folder.totalCount === 1 ? '' : 's'}, including subfolders`}
                className="text-xs font-mono font-medium text-slate-500 bg-slate-800/80 px-1.5 py-0.2 rounded border border-slate-700/40"
              >
                {folder.totalCount}
              </span>
            </div>
          </div>

          {/* Nested Tree Branch with vertical guide line (GitHub/VS Code tree indicator) */}
          {!isCollapsed && (
            <div
              className="relative ml-4 pl-3.5 my-0.5 space-y-0.5 border-l border-indigo-500/25"
              role="group"
            >
              {folder.children.map(renderFolder)}
              {folder.notes.map((note, index) => (
                <TreeNodeItem
                  key={note.id}
                  note={note}
                  isActive={note.id === activeNoteId}
                  isTreeChild
                  isLastChild={index === folder.notes.length - 1}
                  onSelect={() => selectAndClose(note.id)}
                  onDelete={() => onDeleteNote(note.id)}
                  onTogglePin={() => onTogglePin(note.id)}
                />
              ))}
            </div>
          )}
        </div>
      );
    };

    return (
      <>
        {isOpenOnMobile && (
          <div
            className="md:hidden fixed inset-0 z-30 bg-black/50"
            onClick={onCloseOnMobile}
            aria-hidden="true"
          />
        )}
        <aside
          className={`w-72 shrink-0 border-r border-border dark:border-slate-800/80 bg-surface dark:bg-[#0c101d] flex-col h-full min-h-0 select-none ${
            isOpenOnMobile ? 'flex fixed inset-y-0 left-0 z-40' : 'hidden'
          } md:flex md:static md:z-auto`}
        >
          {/* Header Actions */}
          <div className="p-3.5 border-b border-border dark:border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 font-sans">
                  Explorer
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Import Markdown files (.md, .markdown, .txt)"
                  className="p-1.5 hover:bg-surface-hover dark:hover:bg-slate-800/80 rounded-lg text-slate-400 hover:text-indigo-400 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={IMPORT_EXTENSIONS.join(',')}
                  aria-label="Import Markdown files"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => onNewNote()}
                  title="Create New Note"
                  className="p-1.5 hover:bg-surface-hover dark:hover:bg-slate-800/80 rounded-lg text-slate-400 hover:text-indigo-400 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Today's Daily Note Quick Action */}
            <button
              onClick={onOpenDailyNote}
              className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/25 text-xs font-semibold transition-all shadow-sm"
            >
              <Calendar className="w-4 h-4" />
              <span>Today's Daily Note</span>
            </button>

            {/* Filter input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search notes..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs font-medium rounded-xl bg-surface-hover/60 dark:bg-slate-800/50 border border-border dark:border-slate-700/60 focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-200 placeholder:text-slate-500 transition-colors"
              />
            </div>
          </div>

          {/* VS Code / GitHub Tree Explorer */}
          <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-3 font-sans">
            {/* Pinned Section: shortcuts to pinned notes, which also stay in their folder */}
            {pinnedNotes.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center space-x-1.5 px-2 py-0.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <Pin className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pinned Notes</span>
                </div>
                <div className="space-y-0.5">
                  {pinnedNotes.map(note => (
                    <TreeNodeItem
                      key={note.id}
                      note={note}
                      isActive={note.id === activeNoteId}
                      onSelect={() => selectAndClose(note.id)}
                      onDelete={() => onDeleteNote(note.id)}
                      onTogglePin={() => onTogglePin(note.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Folder Hierarchy Tree */}
            <div className="space-y-1" role="tree" aria-label="Folders">
              {folderTree.map(renderFolder)}

              {filteredNotes.length === 0 && (
                <div className="text-center py-6 px-4">
                  <p className="text-xs font-medium text-slate-500">No matching notes found.</p>
                </div>
              )}
            </div>

            {/* Tags Section (Clean Tactile Chips, No Generic AI Pills) */}
            {(allTags.length > 0 || selectedTag) && (
              <div className="pt-3 border-t border-border dark:border-slate-800/80">
                <div
                  onClick={() => setTagsOpen(!tagsOpen)}
                  className="flex items-center justify-between px-2 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center space-x-1.5">
                    {tagsOpen ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    <TagIcon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Tags ({allTags.length})</span>
                  </div>
                </div>

                {tagsOpen && (
                  <div className="flex flex-wrap gap-1.5 px-2 mt-2">
                    {selectedTag && (
                      <button
                        onClick={() => onSelectTag(null)}
                        className="text-xs px-2.5 py-1 rounded-md bg-indigo-600 text-white font-bold hover:bg-indigo-500 shadow-sm transition-colors"
                      >
                        Clear Filter ✕
                      </button>
                    )}
                    {allTags.map(tag => {
                      const isSelected = tag.toLowerCase() === selectedTag?.toLowerCase();
                      return (
                        <button
                          key={tag}
                          onClick={() => onSelectTag(isSelected ? null : tag)}
                          className={`text-xs px-2.5 py-1 rounded-md border transition-all ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-500 font-bold shadow-sm'
                              : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:border-slate-500 hover:text-white font-medium'
                          }`}
                        >
                          #{tag}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Info */}
          <div className="p-3 border-t border-border dark:border-slate-800/80 text-xs font-medium text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>{storageKind === 'indexeddb' ? 'IndexedDB' : 'Local Storage'}</span>
            </span>
            <span className="font-mono text-xs font-semibold text-slate-300">
              {notes.length} notes
            </span>
          </div>
        </aside>
      </>
    );
  }
);

Sidebar.displayName = 'Sidebar';

interface TreeNodeItemProps {
  note: Note;
  isActive: boolean;
  isTreeChild?: boolean;
  isLastChild?: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}

const TreeNodeItem: React.FC<TreeNodeItemProps> = ({
  note,
  isActive,
  isTreeChild,
  onSelect,
  onDelete,
  onTogglePin,
}) => {
  return (
    <div
      onClick={onSelect}
      className={`group relative flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs sm:text-sm cursor-pointer transition-all ${
        isActive
          ? 'bg-indigo-600/20 text-indigo-300 font-semibold border border-indigo-500/40 shadow-sm'
          : 'text-slate-300 hover:bg-surface-hover dark:hover:bg-slate-800/60 hover:text-white font-medium'
      }`}
    >
      <div className="flex items-center space-x-2 truncate min-w-0">
        {/* Branch indicator matching user reference image */}
        {isTreeChild ? (
          <div className="flex items-center justify-center w-3 h-3 shrink-0">
            <span
              className={`w-2 h-2 rounded-full border transition-all ${
                isActive
                  ? 'border-indigo-400 bg-indigo-500 shadow-sm shadow-indigo-500/60 scale-110'
                  : 'border-slate-600 bg-slate-800 group-hover:border-indigo-400'
              }`}
            />
          </div>
        ) : (
          <FileText
            className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`}
          />
        )}
        <span className="truncate">{note.title || 'Untitled'}</span>
      </div>

      {/* Always visible on touch screens, where there is no hover to reveal them */}
      <div className="flex items-center space-x-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          onClick={e => {
            e.stopPropagation();
            onTogglePin();
          }}
          title={note.isPinned ? 'Unpin' : 'Pin note'}
          className="p-1 hover:text-amber-400 text-slate-400 transition-colors"
        >
          <Pin className={`w-3 h-3 ${note.isPinned ? 'fill-amber-400 text-amber-400' : ''}`} />
        </button>
        <button
          onClick={e => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete note"
          className="p-1 hover:text-rose-400 text-slate-400 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
