import React, { useState, useRef } from 'react';
import { Note } from '../core/domain/note';
import {
  DEFAULT_FOLDER,
  folderEmptyMessage,
  notesInFolder,
  uniqueFolders,
} from '../core/notes/folderTree';
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
  Tag as TagIcon
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
  onImportMarkdown: (title: string, content: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  notes,
  activeNoteId,
  onSelectNote,
  onNewNote,
  onDeleteNote,
  onTogglePin,
  selectedTag,
  onSelectTag,
  onOpenDailyNote,
  onImportMarkdown,
}) => {
  const [search, setSearch] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [tagsOpen, setTagsOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleFolder = (folderName: string) => {
    setCollapsedFolders(prev => ({
      ...prev,
      [folderName]: !prev[folderName],
    }));
  };

  const allTags = Array.from(new Set(notes.flatMap(n => n.tags))).sort();

  const allFolders = uniqueFolders(notes);

  const filteredNotes = notes.filter(n => {
    const matchesSearch = 
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase());
    const matchesTag = selectedTag ? n.tags.includes(selectedTag) : true;
    return matchesSearch && matchesTag;
  });

  const isFiltering = search.trim().length > 0 || selectedTag !== null;

  const pinnedNotes = filteredNotes.filter(n => n.isPinned);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      const title = file.name.replace(/\.[^/.]+$/, '');
      onImportMarkdown(title, content);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <aside className="w-72 border-r border-border dark:border-slate-800/80 bg-surface dark:bg-[#0c101d] flex flex-col h-[calc(100vh-5.5rem)] select-none">
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
              title="Import Markdown (.md)"
              className="p-1.5 hover:bg-surface-hover dark:hover:bg-slate-800/80 rounded-lg text-slate-400 hover:text-indigo-400 transition-colors"
            >
              <Upload className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,.txt"
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
        {/* Pinned Section */}
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
                  onSelect={() => onSelectNote(note.id)}
                  onDelete={() => onDeleteNote(note.id)}
                  onTogglePin={() => onTogglePin(note.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Folder Hierarchy Tree */}
        <div className="space-y-1">
          {allFolders.map(folderName => {
            const allInFolder = notesInFolder(notes, folderName);
            const visibleInFolder = filteredNotes.filter(
              n => (n.folder || DEFAULT_FOLDER) === folderName
            );
            const folderNotes = visibleInFolder.filter(n => !n.isPinned);
            const isCollapsed = collapsedFolders[folderName] || false;
            const emptyMessage = folderEmptyMessage(
              allInFolder.length,
              visibleInFolder.length,
              isFiltering
            );

            return (
              <div key={folderName} className="space-y-0.5">
                {/* Folder Header (VS Code / GitHub style) */}
                <div
                  onClick={() => toggleFolder(folderName)}
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
                      <Folder className="w-4 h-4 text-amber-400/90" />
                    ) : (
                      <FolderOpen className="w-4 h-4 text-amber-400" />
                    )}
                    <span className="truncate">{folderName}</span>
                  </div>
                  <div className="flex items-center space-x-1 shrink-0">
                    <span className="text-xs font-mono font-medium text-slate-500 bg-slate-800/80 px-1.5 py-0.2 rounded border border-slate-700/40">
                      {folderNotes.length}
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setCollapsedFolders(prev => ({ ...prev, [folderName]: false }));
                        onNewNote(folderName);
                      }}
                      title={`New note in ${folderName}`}
                      className="p-1 rounded-md text-slate-500 hover:text-indigo-400 hover:bg-slate-700/60 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Nested Tree Branch with vertical guide line (GitHub/VS Code tree indicator) */}
                {!isCollapsed && (
                  <div className="relative ml-4 pl-3.5 my-0.5 space-y-0.5 border-l border-indigo-500/25">
                    {folderNotes.map((note, index) => {
                      const isLast = index === folderNotes.length - 1;
                      return (
                        <TreeNodeItem
                          key={note.id}
                          note={note}
                          isActive={note.id === activeNoteId}
                          isTreeChild
                          isLastChild={isLast}
                          onSelect={() => onSelectNote(note.id)}
                          onDelete={() => onDeleteNote(note.id)}
                          onTogglePin={() => onTogglePin(note.id)}
                        />
                      );
                    })}
                    {emptyMessage && (
                      <div className="px-2 py-1 text-xs italic text-slate-500">
                        {emptyMessage}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {filteredNotes.length === 0 && (
            <div className="text-center py-6 px-4">
              <p className="text-xs font-medium text-slate-500">No matching notes found.</p>
            </div>
          )}
        </div>

        {/* Tags Section (Clean Tactile Chips, No Generic AI Pills) */}
        {allTags.length > 0 && (
          <div className="pt-3 border-t border-border dark:border-slate-800/80">
            <div 
              onClick={() => setTagsOpen(!tagsOpen)}
              className="flex items-center justify-between px-2 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200 transition-colors"
            >
              <div className="flex items-center space-x-1.5">
                {tagsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
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
                  const isSelected = tag === selectedTag;
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
          <span>Local Storage</span>
        </span>
        <span className="font-mono text-xs font-semibold text-slate-300">{notes.length} notes</span>
      </div>
    </aside>
  );
};

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
          <FileText className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
        )}
        <span className="truncate">{note.title || 'Untitled'}</span>
      </div>

      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
