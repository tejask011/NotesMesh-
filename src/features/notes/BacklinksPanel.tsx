import React, { useState } from 'react';
import { BacklinkItem } from '../../core/domain/note';
import { GitFork, ArrowUpRight, ChevronDown, ChevronRight, FileText } from 'lucide-react';

interface BacklinksPanelProps {
  backlinks: BacklinkItem[];
  onOpenNote: (noteId: string) => void;
}

export const BacklinksPanel: React.FC<BacklinksPanelProps> = ({ backlinks, onOpenNote }) => {
  // It would take most of a phone screen, so there it starts collapsed.
  const [isOpen, setIsOpen] = useState(() => window.innerWidth >= 768);

  if (backlinks.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-border dark:border-slate-800/80 bg-surface dark:bg-[#090d18] px-6 py-3 shrink-0 select-none font-sans">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between cursor-pointer group py-1"
      >
        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 rounded-md bg-indigo-500/10 flex items-center justify-center text-indigo-400">
            <GitFork className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 group-hover:text-white transition-colors">
            Bidirectional Connections ({backlinks.length})
          </span>
        </div>
        <button className="text-slate-400 group-hover:text-slate-200 p-1 transition-colors">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {isOpen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-2.5 pb-2 max-h-44 overflow-y-auto">
          {backlinks.map(item => (
            <div
              key={item.sourceNoteId}
              onClick={() => onOpenNote(item.sourceNoteId)}
              className="group relative p-3 rounded-xl border border-border dark:border-slate-800 bg-surface dark:bg-[#0f1524] hover:border-indigo-500/60 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-950/20 cursor-pointer transition-all duration-200"
            >
              {/* Left accent indicator */}
              <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r bg-indigo-500/40 group-hover:bg-indigo-500 transition-colors" />

              <div className="pl-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="text-xs font-bold text-slate-200 group-hover:text-white truncate">
                      {item.sourceNoteTitle}
                    </span>
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0 ml-1.5" />
                </div>

                {item.previewSnippet ? (
                  <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 font-body font-normal italic bg-slate-900/60 px-2 py-1 rounded-md border border-slate-800/80">
                    "{item.previewSnippet}"
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 mt-1 font-sans">
                    Connected via bidirectional link
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
