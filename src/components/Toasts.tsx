import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastsProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

const ICONS = {
  success: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />,
  error: <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />,
  info: <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />,
};

export const Toasts: React.FC<ToastsProps> = ({ toasts, onDismiss }) => (
  <div
    className="fixed bottom-10 right-4 z-50 flex flex-col space-y-2 w-[calc(100%-2rem)] max-w-sm"
    aria-live="polite"
  >
    {toasts.map(toast => (
      <div
        key={toast.id}
        role={toast.kind === 'error' ? 'alert' : 'status'}
        className="flex items-start space-x-2 p-3 rounded-xl bg-surface dark:bg-slate-900 border border-border dark:border-slate-700 shadow-2xl text-xs font-medium text-slate-200"
      >
        {ICONS[toast.kind]}
        <span className="flex-1 break-words">{toast.message}</span>
        <button
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss"
          className="text-slate-400 hover:text-white"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    ))}
  </div>
);
