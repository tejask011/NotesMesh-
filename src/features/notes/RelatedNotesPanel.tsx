import React from 'react';
import { Sparkles } from 'lucide-react';

export interface RelatedNote {
  id: string;
  title: string;
}

interface RelatedNotesPanelProps {
  related: RelatedNote[];
  onOpenNote: (noteId: string) => void;
}

export const RelatedNotesPanel: React.FC<RelatedNotesPanelProps> = ({ related, onOpenNote }) => {
  if (related.length === 0) return null;

  return (
    <div className="border-t border-border dark:border-slate-800/80 bg-surface dark:bg-[#090d18] px-4 sm:px-6 py-2 shrink-0 flex items-center gap-2 overflow-x-auto font-sans">
      <span
        className="flex items-center space-x-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 shrink-0"
        title="Notes that share distinctive words with this one. Computed on this device."
      >
        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
        <span>Related</span>
      </span>
      {related.map(note => (
        <button
          key={note.id}
          onClick={() => onOpenNote(note.id)}
          className="text-xs font-medium px-2 py-0.5 rounded-md border border-border dark:border-slate-700/60 text-slate-300 hover:text-indigo-400 hover:border-indigo-500/60 whitespace-nowrap transition-colors"
        >
          {note.title || 'Untitled'}
        </button>
      ))}
    </div>
  );
};
