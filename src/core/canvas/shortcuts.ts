/**
 * Keyboard shortcut resolution for the canvas view.
 *
 * Kept as a pure function so the modifier rules can be tested without a DOM.
 * The caller decides whether the event target is an editable field and passes
 * that in, which keeps the browser-specific tag checks in one component.
 */

export type CanvasShortcut = 'undo' | 'redo' | 'delete' | 'duplicate' | 'cancel';

export interface CanvasShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function resolveCanvasShortcut(
  event: CanvasShortcutEvent,
  isEditableTarget: boolean
): CanvasShortcut | null {
  if (isEditableTarget) return null;

  const key = event.key.toLowerCase();
  const modifier = event.ctrlKey || event.metaKey;

  if (modifier && !event.altKey) {
    if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
    if (key === 'y') return 'redo';
    if (key === 'd') return 'duplicate';
    return null;
  }

  if (!modifier && !event.altKey) {
    if (event.key === 'Delete' || event.key === 'Backspace') return 'delete';
    if (event.key === 'Escape') return 'cancel';
  }

  return null;
}
