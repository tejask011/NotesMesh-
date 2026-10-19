import React, { useState } from 'react';
import { BUILT_IN_TEMPLATES } from '../../core/templates/builtInTemplates';
import { NoteTemplate } from '../../core/domain/template';
import { toLocalDateKey } from '../../core/date/localDate';
import { 
  FileSpreadsheet, 
  Folder, 
  Tag as TagIcon, 
  Plus, 
  Check, 
  Copy,
  ArrowRight
} from 'lucide-react';

interface TemplatesViewProps {
  onCreateNoteFromTemplate: (template: NoteTemplate, customTitle?: string) => void;
}

export const TemplatesView: React.FC<TemplatesViewProps> = ({
  onCreateNoteFromTemplate,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<NoteTemplate>(BUILT_IN_TEMPLATES[0]);
  const [noteTitle, setNoteTitle] = useState('');
  const [copied, setCopied] = useState(false);

  const dateStr = toLocalDateKey();
  const previewContent = selectedTemplate.templateContent({
    title: noteTitle || selectedTemplate.name,
    dateStr,
  });

  const handleCreate = () => {
    onCreateNoteFromTemplate(selectedTemplate, noteTitle);
    setNoteTitle('');
  };

  const handleCopyPreview = () => {
    navigator.clipboard.writeText(previewContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex h-[calc(100vh-5.5rem)] bg-background overflow-hidden select-none">
      {/* Templates List Sidebar */}
      <div className="w-80 border-r border-border dark:border-slate-800 bg-surface dark:bg-[#111827]/70 flex flex-col h-full">
        <div className="p-4 border-b border-border dark:border-slate-800">
          <div className="flex items-center space-x-2 text-indigo-400 font-bold text-sm">
            <FileSpreadsheet className="w-4 h-4" />
            <span>Note Templates</span>
          </div>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Pre-structured note formats to standardize knowledge capture.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {BUILT_IN_TEMPLATES.map(tpl => {
            const isSelected = selectedTemplate.id === tpl.id;
            return (
              <div
                key={tpl.id}
                onClick={() => {
                  setSelectedTemplate(tpl);
                  setNoteTitle('');
                }}
                className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                  isSelected
                    ? 'border-indigo-500/50 bg-indigo-500/10 shadow-sm'
                    : 'border-border dark:border-slate-800 bg-surface-hover/40 dark:bg-slate-800/40 hover:bg-surface-hover'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${isSelected ? 'text-indigo-400' : 'text-slate-900 dark:text-slate-100'}`}>
                    {tpl.name}
                  </span>
                  <span className="text-xs text-slate-400 font-mono font-semibold">
                    {tpl.folder}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">
                  {tpl.description}
                </p>
                <div className="flex items-center flex-wrap gap-1 mt-2.5">
                  {tpl.tags.map(tag => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded-full bg-surface dark:bg-slate-900 border border-border dark:border-slate-700 text-slate-300 font-medium"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Template Preview and Configuration Main Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        {/* Header */}
        <div className="p-6 border-b border-border dark:border-slate-800 bg-surface dark:bg-[#111827]/70 shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {selectedTemplate.name}
            </h2>
            <div className="flex items-center space-x-3 text-xs font-semibold text-slate-400 mt-1.5">
              <span className="flex items-center space-x-1.5">
                <Folder className="w-4 h-4 text-amber-400" />
                <span>Target Folder: {selectedTemplate.folder}</span>
              </span>
              <span>•</span>
              <span className="flex items-center space-x-1.5">
                <TagIcon className="w-4 h-4 text-cyan-400" />
                <span>Tags: {selectedTemplate.tags.join(', ')}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleCopyPreview}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-800 hover:bg-surface-hover text-xs font-semibold text-slate-300 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
              <span>{copied ? 'Copied' : 'Copy Template'}</span>
            </button>
            <button
              onClick={handleCreate}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold shadow-md shadow-indigo-600/30 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Create Note</span>
            </button>
          </div>
        </div>

        {/* Content Creation Form & Live Preview */}
        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          <div className="max-w-3xl">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Custom Note Title (Optional)
            </label>
            <div className="flex items-center space-x-3">
              <input
                type="text"
                placeholder={`e.g. ${selectedTemplate.name} - ${dateStr}`}
                value={noteTitle}
                onChange={e => setNoteTitle(e.target.value)}
                className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl bg-surface dark:bg-slate-800/80 border border-border dark:border-slate-700 focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
              />
              <button
                onClick={handleCreate}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold shrink-0 transition-colors"
              >
                <span>Generate</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-w-3xl border border-border dark:border-slate-800 rounded-2xl bg-surface dark:bg-[#111827]/80 overflow-hidden shadow-xl">
            <div className="px-5 py-2.5 border-b border-border dark:border-slate-800 bg-surface-hover/40 dark:bg-slate-900/40 text-xs font-mono font-semibold text-slate-400 flex items-center justify-between">
              <span>Preview: {noteTitle || selectedTemplate.name}.md</span>
              <span>Markdown</span>
            </div>
            <pre className="p-6 font-mono text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed overflow-x-auto whitespace-pre-wrap selection:bg-indigo-500/20">
              {previewContent}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
