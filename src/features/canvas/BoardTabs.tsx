import React, { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { CanvasDocument } from '../../core/domain/canvas';

interface BoardTabsProps {
  boards: CanvasDocument[];
  activeBoardId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export const BoardTabs: React.FC<BoardTabsProps> = ({
  boards,
  activeBoardId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}) => {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const startRename = (board: CanvasDocument) => {
    setRenamingId(board.id);
    setDraft(board.title);
  };

  const commitRename = () => {
    if (renamingId && draft.trim()) onRename(renamingId, draft.trim());
    setRenamingId(null);
  };

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border dark:border-slate-800/80 bg-surface dark:bg-[#0c101d] shrink-0 overflow-x-auto select-none">
      <div role="tablist" aria-label="Canvas boards" className="flex items-center gap-1">
        {boards.map(board => {
          const isActive = board.id === activeBoardId;

          if (renamingId === board.id) {
            return (
              <input
                key={board.id}
                autoFocus
                value={draft}
                aria-label="Board name"
                onChange={e => setDraft(e.target.value)}
                onBlur={commitRename}
                onFocus={e => e.currentTarget.select()}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                className="w-40 px-2 py-1 rounded-lg text-xs font-semibold bg-slate-800 border border-indigo-500 focus:outline-none text-slate-200"
              />
            );
          }

          return (
            <div
              key={board.id}
              className={`flex items-center rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                  : 'text-slate-400 border border-transparent hover:bg-slate-800/60'
              }`}
            >
              <button
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelect(board.id)}
                onDoubleClick={() => startRename(board)}
                title={`${board.title} (double-click to rename)`}
                className="px-2.5 py-1 max-w-[12rem] truncate"
              >
                {board.title || 'Untitled Board'}
              </button>
              {isActive && (
                <>
                  <button
                    onClick={() => startRename(board)}
                    title="Rename board"
                    aria-label={`Rename board ${board.title}`}
                    className="p-1 text-slate-400 hover:text-indigo-400"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onDelete(board.id)}
                    disabled={boards.length <= 1}
                    title={
                      boards.length <= 1 ? 'A workspace needs at least one board' : 'Delete board'
                    }
                    aria-label={`Delete board ${board.title}`}
                    className="p-1 pr-1.5 text-slate-400 hover:text-rose-400 disabled:opacity-30 disabled:hover:text-slate-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={onCreate}
        title="New board"
        className="flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-indigo-400 hover:bg-slate-800/60 whitespace-nowrap transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>New board</span>
      </button>
    </div>
  );
};
