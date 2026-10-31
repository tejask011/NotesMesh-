import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Note, BacklinkItem } from '../../core/domain/note';
import { MarkdownPreview } from './MarkdownPreview';
import { BacklinksPanel } from './BacklinksPanel';
import { RelatedNotesPanel, RelatedNote } from './RelatedNotesPanel';
import { SaveStatusBadge } from '../../components/SaveStatusBadge';
import { BUILT_IN_TEMPLATES } from '../../core/templates/builtInTemplates';
import { SaveStatus } from '../../core/storage/saveQueue';
import { DEFAULT_FOLDER, listFolderPaths, normalizeFolderPath } from '../../core/notes/folders';
import { getInlineOnlyTags } from '../../core/notes/tags';
import { buildTitleIndex } from '../../core/markdown/wikilinks';
import {
  TextEdit,
  continueList,
  indentSelection,
  insertCodeBlock,
  toggleBulletList,
  toggleHeading,
  toggleWrap,
} from '../../core/markdown/formatting';
import { ShortcutId, matchShortcut } from '../../core/shortcuts';
import { localDateString } from '../../core/util/ids';
import { downloadText, safeFileName } from '../../core/util/files';
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
  Download,
  FileSpreadsheet,
  Folder,
  Eraser,
  ChevronRight,
  PanelLeft,
  Plus,
} from 'lucide-react';

interface NoteEditorProps {
  note: Note;
  onUpdateNote: (updated: Note) => void;
  allNotes: Note[];
  backlinks: BacklinkItem[];
  relatedNotes: RelatedNote[];
  onNavigateNote: (noteId: string) => void;
  onCreateNoteFromLink: (title: string) => void;
  saveStatus: SaveStatus;
  onRetrySave: () => void;
  onToggleSidebar: () => void;
}

type EditorViewMode = 'split' | 'edit' | 'preview';

const VIEW_MODE_KEY = 'notemesh_editor_view';

const loadViewMode = (): EditorViewMode => {
  // Two side-by-side panes are too narrow to read on a phone.
  const fallback = window.innerWidth < 768 ? 'edit' : 'split';
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    return stored === 'edit' || stored === 'preview' || stored === 'split' ? stored : fallback;
  } catch {
    return fallback;
  }
};

const FORMAT_SHORTCUTS: {
  id: ShortcutId;
  edit: (text: string, start: number, end: number) => TextEdit;
}[] = [
  { id: 'bold', edit: (t, s, e) => toggleWrap(t, s, e, '**', '**', 'bold text') },
  { id: 'italic', edit: (t, s, e) => toggleWrap(t, s, e, '*', '*', 'italic text') },
  { id: 'inlineCode', edit: (t, s, e) => toggleWrap(t, s, e, '`', '`', 'code') },
  { id: 'wikilink', edit: (t, s, e) => toggleWrap(t, s, e, '[[', ']]', 'Note Title') },
  { id: 'heading1', edit: (t, s, e) => toggleHeading(t, s, e, 1) },
  { id: 'heading2', edit: (t, s, e) => toggleHeading(t, s, e, 2) },
  { id: 'bulletList', edit: toggleBulletList },
];

export const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  onUpdateNote,
  allNotes,
  backlinks,
  relatedNotes,
  onNavigateNote,
  onCreateNoteFromLink,
  saveStatus,
  onRetrySave,
  onToggleSidebar,
}) => {
  const [viewMode, setViewModeState] = useState<EditorViewMode>(loadViewMode);
  const [newTagInput, setNewTagInput] = useState('');
  const [isTagInputOpen, setIsTagInputOpen] = useState(false);
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);
  const [folderDraft, setFolderDraft] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const tabLeavesEditor = useRef(false);

  const titleIndex = useMemo(() => buildTitleIndex(allNotes), [allNotes]);
  const existingTitles = useMemo(() => new Set(titleIndex.keys()), [titleIndex]);
  const folderPaths = useMemo(() => listFolderPaths(allNotes), [allNotes]);
  const inlineTags = useMemo(() => getInlineOnlyTags(note), [note]);

  // The index trails typing slightly, so "not found" just means this title is new.
  const titleMatch = titleIndex.get(note.title.toLowerCase().trim());
  const isDuplicateTitle =
    note.title.trim() !== '' && titleMatch !== undefined && titleMatch.id !== note.id;

  const setViewMode = (mode: EditorViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // Only a preference; the app works without it.
    }
  };

  // Restore the selection after React commits a programmatic content change.
  useLayoutEffect(() => {
    if (pendingSelection.current && textareaRef.current) {
      const { start, end } = pendingSelection.current;
      textareaRef.current.setSelectionRange(start, end);
      pendingSelection.current = null;
    }
  });

  const handleTitleChange = (newTitle: string) => {
    onUpdateNote({ ...note, title: newTitle });
  };

  const handleContentChange = (newContent: string) => {
    onUpdateNote({ ...note, content: newContent });
  };

  const commitFolder = () => {
    if (folderDraft === null) return;
    const folder = normalizeFolderPath(folderDraft);
    setFolderDraft(null);
    if (folder !== normalizeFolderPath(note.folder)) {
      onUpdateNote({ ...note, folder });
    }
  };

  const handleClearNoteContent = () => {
    if (confirm('Clear note text and keep workspace clean?')) {
      onUpdateNote({ ...note, content: '' });
    }
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTagInput.trim()) {
      e.preventDefault();
      const clean = newTagInput.trim().replace(/^#/, '');
      if (clean && !note.tags.some(tag => tag.toLowerCase() === clean.toLowerCase())) {
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
    setIsTemplateMenuOpen(false);

    if (
      note.content.trim() &&
      !confirm(`Replace this note's text with the "${tpl.name}" template?`)
    ) {
      return;
    }

    const generated = tpl.templateContent({
      title: note.title,
      dateStr: localDateString(),
    });

    const mergedTags = Array.from(new Set([...note.tags, ...tpl.tags]));
    onUpdateNote({
      ...note,
      content: generated,
      // Applying a template to existing text shouldn't also move the note.
      folder: note.content.trim() ? note.folder : tpl.folder,
      tags: mergedTags,
    });
  };

  const handleDownloadMarkdown = () => {
    downloadText(
      note.content,
      `${safeFileName(note.title, 'note')}.md`,
      'text/markdown;charset=utf-8'
    );
  };

  /**
   * Apply an edit through the browser's insert command when possible: unlike
   * assigning to value, that keeps Ctrl+Z working for formatting changes.
   */
  const applyEdit = (edit: TextEdit) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.focus();
    textarea.setSelectionRange(edit.from, edit.to);

    let applied = false;
    if (typeof document.execCommand === 'function') {
      applied = edit.insert
        ? document.execCommand('insertText', false, edit.insert)
        : document.execCommand('delete');
    }

    if (applied) {
      textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    } else {
      pendingSelection.current = { start: edit.selectionStart, end: edit.selectionEnd };
      handleContentChange(
        textarea.value.slice(0, edit.from) + edit.insert + textarea.value.slice(edit.to)
      );
    }
  };

  const runFormat = (edit: (text: string, start: number, end: number) => TextEdit) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    applyEdit(edit(textarea.value, textarea.selectionStart, textarea.selectionEnd));
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const native = e.nativeEvent;
    const { value, selectionStart, selectionEnd } = e.currentTarget;

    for (const shortcut of FORMAT_SHORTCUTS) {
      if (matchShortcut(native, shortcut.id)) {
        e.preventDefault();
        runFormat(shortcut.edit);
        return;
      }
    }

    // Tab indents, so Esc gives keyboard users a way out of the text area.
    if (e.key === 'Escape') {
      tabLeavesEditor.current = true;
      return;
    }

    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (tabLeavesEditor.current) return;
      e.preventDefault();
      applyEdit(indentSelection(value, selectionStart, selectionEnd, e.shiftKey));
      return;
    }

    tabLeavesEditor.current = false;

    // During IME composition, Enter confirms the candidate rather than adding a line.
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !native.isComposing &&
      selectionStart === selectionEnd
    ) {
      const edit = continueList(value, selectionStart);
      if (edit) {
        e.preventDefault();
        applyEdit(edit);
      }
    }
  };

  const handleWikilinkNavigation = (targetTitle: string) => {
    const found = titleIndex.get(targetTitle.toLowerCase().trim());
    if (found) {
      onNavigateNote(found.id);
    } else if (confirm(`Note "${targetTitle}" does not exist yet. Would you like to create it?`)) {
      onCreateNoteFromLink(targetTitle);
    }
  };

  const toolButtonClass = 'p-1 rounded hover:bg-slate-800 hover:text-white transition-colors';

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full min-h-0 bg-background overflow-hidden font-sans">
      {/* Clean Unified Top Bar (No messy multi-row clutter) */}
      <div className="px-4 sm:px-6 py-3 border-b border-border dark:border-slate-800/80 bg-surface dark:bg-[#0c101d] shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-2">
          {/* Breadcrumb Path (GitHub / VS Code Style) */}
          <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-medium min-w-0">
            <button
              onClick={onToggleSidebar}
              title="Show notes list"
              aria-label="Show notes list"
              className="md:hidden p-1 rounded hover:bg-slate-800 shrink-0"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <input
              type="text"
              list="notemesh-folder-paths"
              value={folderDraft ?? normalizeFolderPath(note.folder)}
              onChange={e => setFolderDraft(e.target.value)}
              onBlur={commitFolder}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setFolderDraft(null);
              }}
              className="bg-transparent border-none focus:outline-none text-xs font-semibold text-slate-300 w-28 sm:w-40 hover:text-white transition-colors"
              placeholder={DEFAULT_FOLDER}
              aria-label="Folder path"
              title='Folder for this note. Use "/" to nest, like Research/AI. Press Enter to move it.'
            />
            <datalist id="notemesh-folder-paths">
              {folderPaths.map(path => (
                <option key={path} value={path} />
              ))}
            </datalist>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0 hidden sm:block" />
            <span className="truncate text-slate-200 font-semibold hidden sm:block">
              {note.title || 'Untitled'}
            </span>
          </div>

          {/* Right Action Tools */}
          <div className="flex items-center space-x-2 shrink-0 ml-auto">
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
                    Apply Template
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

            {/* Save Status */}
            <div className="hidden lg:block pl-1">
              <SaveStatusBadge status={saveStatus} onRetry={onRetrySave} />
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
            aria-label="Note title"
            className="text-2xl sm:text-3xl font-extrabold bg-transparent border-none focus:outline-none text-slate-100 placeholder:text-slate-600 w-full tracking-tight"
          />
          {isDuplicateTitle && (
            <p className="text-xs font-medium text-amber-400 mt-1" role="status">
              Another note already has this title, so [[{note.title.trim()}]] links open that note
              instead of this one.
            </p>
          )}
        </div>

        {/* Sleek Subbar: Formatting Tools + Tactile Tags */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2.5 mt-2 border-t border-slate-800/80">
          {/* Formatting Tools */}
          {(viewMode === 'split' || viewMode === 'edit') && (
            <div className="flex items-center space-x-1 text-slate-400">
              <button
                onClick={() => runFormat(FORMAT_SHORTCUTS[0].edit)}
                title="Bold (Ctrl+B)"
                className={toolButtonClass}
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                onClick={() => runFormat(FORMAT_SHORTCUTS[1].edit)}
                title="Italic (Ctrl+I)"
                className={toolButtonClass}
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                onClick={() => runFormat(FORMAT_SHORTCUTS[4].edit)}
                title="Heading 1 (Ctrl+Shift+1)"
                className={toolButtonClass}
              >
                <Heading1 className="w-4 h-4" />
              </button>
              <button
                onClick={() => runFormat(FORMAT_SHORTCUTS[5].edit)}
                title="Heading 2 (Ctrl+Shift+2)"
                className={toolButtonClass}
              >
                <Heading2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => runFormat(FORMAT_SHORTCUTS[3].edit)}
                title="Insert Wikilink (Ctrl+Shift+K)"
                className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-slate-800 text-indigo-400 font-mono text-xs font-bold transition-colors"
              >
                <Link className="w-3.5 h-3.5" />
                <span>[[]]</span>
              </button>
              <button
                onClick={() => runFormat(FORMAT_SHORTCUTS[6].edit)}
                title="Bullet List (Ctrl+Shift+L)"
                className={toolButtonClass}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => runFormat(insertCodeBlock)}
                title="Code Block"
                className={toolButtonClass}
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
                title="Assigned tag"
                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-800/90 text-slate-300 border border-slate-700/60"
              >
                <span>#{tag}</span>
                <button
                  onClick={() => handleRemoveTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                  className="hover:text-rose-400 font-bold ml-1"
                >
                  ×
                </button>
              </span>
            ))}

            {inlineTags.map(tag => (
              <span
                key={tag}
                title="From the note text. Edit the text to remove it."
                className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium text-slate-400 border border-dashed border-slate-700/60"
              >
                #{tag}
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
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left Textarea (Clean, distraction-free space) */}
        {(viewMode === 'split' || viewMode === 'edit') && (
          <div
            className={`flex flex-col h-full ${viewMode === 'split' ? 'w-1/2 border-r border-border dark:border-slate-800/80' : 'w-full'}`}
          >
            <textarea
              ref={textareaRef}
              value={note.content}
              onChange={e => handleContentChange(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              onBlur={() => {
                tabLeavesEditor.current = false;
              }}
              placeholder="Write your note here... Use [[Note Title]] to connect ideas seamlessly."
              aria-label="Note text"
              className="flex-1 p-4 sm:p-6 bg-transparent text-slate-200 font-mono text-sm leading-relaxed resize-none focus:outline-none overflow-y-auto selection:bg-indigo-500/25 placeholder:text-slate-600"
            />
          </div>
        )}

        {/* Right Preview */}
        {(viewMode === 'split' || viewMode === 'preview') && (
          <div
            className={`flex flex-col h-full bg-slate-900/10 ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}
          >
            <MarkdownPreview
              content={note.content}
              existingTitles={existingTitles}
              onNavigateWikilink={handleWikilinkNavigation}
            />
          </div>
        )}
      </div>

      {/* Backlinks Panel (Sophisticated Card Design with Animation) */}
      <BacklinksPanel backlinks={backlinks} onOpenNote={onNavigateNote} />

      <RelatedNotesPanel related={relatedNotes} onOpenNote={onNavigateNote} />
    </div>
  );
};
