import React, { useState, useRef } from 'react';
import { Note, BacklinkItem } from '../../core/domain/note';
import { MarkdownPreview } from './MarkdownPreview';
import { BacklinksPanel } from './BacklinksPanel';
import { BUILT_IN_TEMPLATES } from '../../core/templates/builtInTemplates';
import {
  prefixLines,
  resolveEditorShortcut,
  wrapSelection,
} from '../../core/markdown/editorFormatting';
import { stripAllEmojis } from '../../core/storage/localStorageAdapter';
import { 
  Columns, 
  Eye, 
  Edit3, 
  Bold, 
  Italic, 
  Heading1, 
  Heading2, 
  Link, 
  List, 
  Code, 
  CheckCircle2, 
  Download, 
  FileSpreadsheet, 
  Folder, 
  Eraser,
  ChevronRight,
  Plus
} from 'lucide-react';

interface NoteEditorProps {
  note: Note;
  onUpdateNote: (updated: Note) => void;
  allNotes: Note[];
  backlinks: BacklinkItem[];
  onNavigateNote: (noteIdOrTitle: string) => void;
}

type EditorViewMode = 'split' | 'edit' | 'preview';

export const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  onUpdateNote,
  allNotes,
  backlinks,
  onNavigateNote,
}) => {
  const [viewMode, setViewMode] = useState<EditorViewMode>('split');
  const [newTagInput, setNewTagInput] = useState('');
  const [isTagInputOpen, setIsTagInputOpen] = useState(false);
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const existingTitles = new Set(allNotes.map(n => n.title.toLowerCase().trim()));

  const handleTitleChange = (newTitle: string) => {
    onUpdateNote({ ...note, title: stripAllEmojis(newTitle) });
  };

  const handleContentChange = (newContent: string) => {
    onUpdateNote({ ...note, content: stripAllEmojis(newContent) });
  };

  const handleFolderChange = (folder: string) => {
    onUpdateNote({ ...note, folder: stripAllEmojis(folder) });
  };

  const handleClearNoteContent = () => {
    if (confirm('Clear note text and keep workspace clean?')) {
      onUpdateNote({ ...note, content: '' });
    }
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTagInput.trim()) {
      e.preventDefault();
      const clean = stripAllEmojis(newTagInput.trim().replace(/^#/, ''));
      if (clean && !note.tags.includes(clean)) {
        onUpdateNote({ ...note, tags: [...note.tags, clean] });
      }
      setNewTagInput('');
      setIsTagInputOpen(false);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onUpdateNote({ ...note, tags: note.tags.filter(t => t !== tagToRemove) });
  };

  const handleApplyTemplate = (templateId: string) => {
    const tpl = BUILT_IN_TEMPLATES.find(t => t.id === templateId);
    if (!tpl) return;

    const dateStr = new Date().toISOString().slice(0, 10);
    const generated = stripAllEmojis(tpl.templateContent({
      title: note.title,
      dateStr,
    }));

    const mergedTags = Array.from(new Set([...note.tags, ...tpl.tags]));
    onUpdateNote({
      ...note,
      content: generated,
      folder: tpl.folder,
      tags: mergedTags,
    });
    setIsTemplateMenuOpen(false);
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([note.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${note.title.trim().replace(/[^\w\s-]/g, '') || 'note'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const insertFormatting = (prefix: string, suffix: string = prefix) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const result = wrapSelection(
      {
        text: textarea.value,
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
      },
      prefix,
      suffix
    );

    handleContentChange(result.text);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(result.start, result.end);
    }, 0);
  };

  const insertLinePrefix = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const result = prefixLines(
      {
        text: textarea.value,
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
      },
      prefix
    );

    handleContentChange(result.text);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(result.start, result.end);
    }, 0);
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const shortcut = resolveEditorShortcut(event);
    if (!shortcut) return;

    event.preventDefault();
    if (shortcut === 'bold') {
      insertFormatting('**', '**');
    } else {
      insertFormatting('*', '*');
    }
  };

  const handleWikilinkNavigation = (targetTitle: string) => {
    const found = allNotes.find(
      n => n.title.toLowerCase().trim() === targetTitle.toLowerCase().trim()
    );
    if (found) {
      onNavigateNote(found.id);
    } else {
      if (confirm(`Note "${targetTitle}" does not exist yet. Would you like to create it?`)) {
        onNavigateNote(targetTitle);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-5.5rem)] bg-background overflow-hidden font-sans">
      {/* Clean Unified Top Bar (No messy multi-row clutter) */}
      <div className="px-6 py-3 border-b border-border dark:border-slate-800/80 bg-surface dark:bg-[#0c101d] shrink-0">
        <div className="flex items-center justify-between gap-4">
          {/* Breadcrumb Path (GitHub / VS Code Style) */}
          <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-medium min-w-0">
            <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <input
              type="text"
              value={note.folder || 'General'}
              onChange={e => handleFolderChange(e.target.value)}
              className="bg-transparent border-none focus:outline-none text-xs font-semibold text-slate-300 w-24 hover:text-white transition-colors"
              placeholder="Folder..."
              title="Click to rename folder"
            />
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <span className="truncate text-slate-200 font-semibold">{note.title || 'Untitled'}</span>
          </div>

          {/* Right Action Tools */}
          <div className="flex items-center space-x-2 shrink-0">
            {/* View Mode Segmented Control */}
            <div className="flex items-center bg-slate-900/80 p-0.5 rounded-lg border border-slate-800">
              <button
                onClick={() => setViewMode('edit')}
                title="Edit Mode"
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'edit'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Write</span>
              </button>
              <button
                onClick={() => setViewMode('split')}
                title="Split Mode"
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'split'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Columns className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Split</span>
              </button>
              <button
                onClick={() => setViewMode('preview')}
                title="Preview Mode"
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'preview'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Preview</span>
              </button>
            </div>

            <div className="h-4 w-[1px] bg-slate-800" />

            {/* Template Inserter Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsTemplateMenuOpen(!isTemplateMenuOpen)}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700/60 transition-colors"
                title="Insert Note Template"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden md:inline">Templates</span>
              </button>

              {isTemplateMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-surface dark:bg-slate-900 border border-border dark:border-slate-800 rounded-xl shadow-2xl p-1.5 z-30 space-y-1">
                  <div className="px-2 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Insert Template
                  </div>
                  {BUILT_IN_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.id}
                      onClick={() => handleApplyTemplate(tpl.id)}
                      className="w-full text-left p-2 rounded-lg hover:bg-slate-800 text-xs transition-colors flex flex-col"
                    >
                      <span className="font-bold text-slate-100">{tpl.name}</span>
                      <span className="text-xs text-slate-400 mt-0.5">{tpl.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Clean Note Button */}
            <button
              onClick={handleClearNoteContent}
              title="Clear Note Text"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors"
            >
              <Eraser className="w-4 h-4" />
            </button>

            {/* Download Button */}
            <button
              onClick={handleDownloadMarkdown}
              title="Download Note as .md"
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Saved Indicator */}
            <div className="hidden lg:flex items-center space-x-1 text-xs text-emerald-400 font-medium pl-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Saved</span>
            </div>
          </div>
        </div>

        {/* Note Title Input */}
        <div className="mt-3">
          <input
            type="text"
            value={note.title}
            onChange={e => handleTitleChange(e.target.value)}
            placeholder="Untitled Note..."
            className="text-2xl sm:text-3xl font-extrabold bg-transparent border-none focus:outline-none text-slate-100 placeholder:text-slate-600 w-full tracking-tight"
          />
        </div>

        {/* Sleek Subbar: Formatting Tools + Tactile Tags */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2.5 mt-2 border-t border-slate-800/80">
          {/* Formatting Tools */}
          {(viewMode === 'split' || viewMode === 'edit') && (
            <div className="flex items-center space-x-1 text-slate-400">
              <button
                onClick={() => insertFormatting('**', '**')}
                title="Bold (Ctrl+B)"
                className="p-1 rounded hover:bg-slate-800 hover:text-white transition-colors"
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                onClick={() => insertFormatting('*', '*')}
                title="Italic (Ctrl+I)"
                className="p-1 rounded hover:bg-slate-800 hover:text-white transition-colors"
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                onClick={() => insertLinePrefix('# ')}
                title="Heading 1"
                className="p-1 rounded hover:bg-slate-800 hover:text-white transition-colors"
              >
                <Heading1 className="w-4 h-4" />
              </button>
              <button
                onClick={() => insertLinePrefix('## ')}
                title="Heading 2"
                className="p-1 rounded hover:bg-slate-800 hover:text-white transition-colors"
              >
                <Heading2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => insertFormatting('[[', ']]')}
                title="Insert Wikilink [[Note]]"
                className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-slate-800 text-indigo-400 font-mono text-xs font-bold transition-colors"
              >
                <Link className="w-3.5 h-3.5" />
                <span>[[]]</span>
              </button>
              <button
                onClick={() => insertLinePrefix('- ')}
                title="Bullet List"
                className="p-1 rounded hover:bg-slate-800 hover:text-white transition-colors"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => insertFormatting('```\n', '\n```')}
                title="Code Block"
                className="p-1 rounded hover:bg-slate-800 hover:text-white transition-colors"
              >
                <Code className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Tags Chips (Tactile Rectangular Chips, No AI Pills) */}
          <div className="flex items-center flex-wrap gap-1.5 ml-auto">
            {note.tags.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-800/90 text-slate-300 border border-slate-700/60"
              >
                <span>#{tag}</span>
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:text-rose-400 font-bold ml-1"
                >
                  ×
                </button>
              </span>
            ))}

            {isTagInputOpen ? (
              <input
                type="text"
                autoFocus
                placeholder="Tag name (Enter)..."
                value={newTagInput}
                onChange={e => setNewTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                onBlur={() => setIsTagInputOpen(false)}
                className="text-xs px-2 py-0.5 rounded-md bg-slate-800 border border-indigo-500 focus:outline-none text-slate-200"
              />
            ) : (
              <button
                onClick={() => setIsTagInputOpen(true)}
                className="flex items-center space-x-1 text-xs font-medium px-2 py-0.5 rounded-md text-slate-400 hover:text-indigo-400 hover:bg-slate-800/60 transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>tag</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Editor & Preview Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Textarea (Clean, distraction-free space) */}
        {(viewMode === 'split' || viewMode === 'edit') && (
          <div className={`flex flex-col h-full ${viewMode === 'split' ? 'w-1/2 border-r border-border dark:border-slate-800/80' : 'w-full'}`}>
            <textarea
              ref={textareaRef}
              value={note.content}
              onChange={e => handleContentChange(e.target.value)}
              onKeyDown={handleEditorKeyDown}
              placeholder="Write your note here... Use [[Note Title]] to connect ideas seamlessly."
              className="flex-1 p-6 bg-transparent text-slate-200 font-mono text-sm leading-relaxed resize-none focus:outline-none overflow-y-auto selection:bg-indigo-500/25 placeholder:text-slate-600"
            />
          </div>
        )}

        {/* Right Preview */}
        {(viewMode === 'split' || viewMode === 'preview') && (
          <div className={`flex flex-col h-full bg-slate-900/10 ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}>
            <MarkdownPreview
              content={note.content}
              existingTitles={existingTitles}
              onNavigateWikilink={handleWikilinkNavigation}
            />
          </div>
        )}
      </div>

      {/* Backlinks Panel (Sophisticated Card Design with Animation) */}
      <BacklinksPanel
        backlinks={backlinks}
        onOpenNote={onNavigateNote}
      />
    </div>
  );
};
