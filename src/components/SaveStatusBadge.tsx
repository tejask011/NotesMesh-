import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2, PencilLine } from 'lucide-react';
import { SaveStatus } from '../core/storage/saveQueue';

interface SaveStatusBadgeProps {
  status: SaveStatus;
  onRetry: () => void;
}

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const SaveStatusBadge: React.FC<SaveStatusBadgeProps> = ({ status, onRetry }) => {
  if (status.state === 'error') {
    return (
      <button
        onClick={onRetry}
        title={status.error ?? undefined}
        className="flex items-center space-x-1 text-xs font-semibold text-rose-400 hover:text-rose-300"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>Not saved · Retry</span>
      </button>
    );
  }

  if (status.state === 'pending') {
    return (
      <span
        className="flex items-center space-x-1 text-xs font-medium text-amber-400"
        role="status"
      >
        <PencilLine className="w-3.5 h-3.5" />
        <span>Unsaved changes</span>
      </span>
    );
  }

  if (status.state === 'saving') {
    return (
      <span
        className="flex items-center space-x-1 text-xs font-medium text-slate-400"
        role="status"
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Saving...</span>
      </span>
    );
  }

  return (
    <span
      className="flex items-center space-x-1 text-xs font-medium text-emerald-400"
      role="status"
      title={
        status.lastSavedAt
          ? `Last saved at ${formatTime(status.lastSavedAt)}`
          : 'All changes are saved on this device'
      }
    >
      <CheckCircle2 className="w-3.5 h-3.5" />
      <span>Saved</span>
    </span>
  );
};
