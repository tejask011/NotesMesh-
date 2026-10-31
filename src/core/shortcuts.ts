/**
 * Single source of truth for keyboard shortcuts: the handlers match against
 * these definitions and Settings renders its reference from them, so what's
 * documented can't drift from what's wired.
 *
 * Browsers don't let pages override some combos (Ctrl+N, Ctrl+T, Ctrl+Shift+T,
 * Ctrl+W), so those are deliberately avoided. Ctrl+Alt is too: it means AltGr
 * on Windows keyboards. "Ctrl" also matches Cmd on macOS.
 */
export type ShortcutId =
  | 'palette'
  | 'save'
  | 'newNote'
  | 'dailyNote'
  | 'bold'
  | 'italic'
  | 'inlineCode'
  | 'wikilink'
  | 'heading1'
  | 'heading2'
  | 'bulletList'
  | 'indent'
  | 'outdent';

export interface ShortcutDefinition {
  id: ShortcutId;
  combo: string;
  description: string;
  scope: 'Global' | 'Editor';
}

export const SHORTCUTS: ShortcutDefinition[] = [
  {
    id: 'palette',
    combo: 'Ctrl+K',
    description: 'Command palette / quick search',
    scope: 'Global',
  },
  { id: 'save', combo: 'Ctrl+S', description: 'Save now', scope: 'Global' },
  { id: 'newNote', combo: 'Alt+Shift+N', description: 'New note', scope: 'Global' },
  {
    id: 'dailyNote',
    combo: 'Alt+Shift+D',
    description: "Open today's daily note",
    scope: 'Global',
  },
  { id: 'bold', combo: 'Ctrl+B', description: 'Bold', scope: 'Editor' },
  { id: 'italic', combo: 'Ctrl+I', description: 'Italic', scope: 'Editor' },
  { id: 'inlineCode', combo: 'Ctrl+E', description: 'Inline code', scope: 'Editor' },
  { id: 'wikilink', combo: 'Ctrl+Shift+K', description: 'Insert [[wikilink]]', scope: 'Editor' },
  { id: 'heading1', combo: 'Ctrl+Shift+1', description: 'Heading 1', scope: 'Editor' },
  { id: 'heading2', combo: 'Ctrl+Shift+2', description: 'Heading 2', scope: 'Editor' },
  { id: 'bulletList', combo: 'Ctrl+Shift+L', description: 'Bullet list', scope: 'Editor' },
  {
    id: 'indent',
    combo: 'Tab',
    description: 'Indent (press Esc first to Tab out of the editor)',
    scope: 'Editor',
  },
  { id: 'outdent', combo: 'Shift+Tab', description: 'Outdent', scope: 'Editor' },
];

export const CANVAS_SHORTCUTS: { combo: string; description: string }[] = [
  { combo: 'Ctrl+Z / Ctrl+Y', description: 'Undo / redo' },
  { combo: 'Tab', description: 'Cycle through elements (canvas focused)' },
  { combo: 'Shift+Click or Shift+Drag', description: 'Add to selection / box select' },
  { combo: 'Ctrl+A', description: 'Select all' },
  { combo: 'Ctrl+D', description: 'Duplicate selection' },
  { combo: 'Delete', description: 'Delete selection' },
  { combo: 'Arrow keys', description: 'Nudge selection (Shift for 10x)' },
  { combo: 'Enter', description: 'Edit text of selected element' },
  { combo: 'V / Esc', description: 'Select tool / cancel and clear selection' },
];

export const GRAPH_SHORTCUTS: { combo: string; description: string }[] = [
  { combo: 'Arrow keys', description: 'Pan (graph focused)' },
  { combo: '+ / - / 0', description: 'Zoom in / out / recenter' },
  { combo: '[ / ]', description: 'Previous / next node' },
  { combo: 'Enter', description: 'Open highlighted note' },
];

export function matchesCombo(event: KeyboardEvent, combo: string): boolean {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map(part => part.trim());
  const key = parts[parts.length - 1];

  if (parts.includes('ctrl') !== (event.ctrlKey || event.metaKey)) return false;
  if (parts.includes('shift') !== event.shiftKey) return false;
  if (parts.includes('alt') !== event.altKey) return false;

  if (event.key.toLowerCase() === key) return true;
  // Shift and Alt change the produced character ("!" for 1, "†" for Alt+T on
  // macOS), so with those held fall back to the physical key.
  if (event.shiftKey || event.altKey) {
    return event.code === `Key${key.toUpperCase()}` || event.code === `Digit${key}`;
  }
  return false;
}

export function matchShortcut(event: KeyboardEvent, id: ShortcutId): boolean {
  const definition = SHORTCUTS.find(shortcut => shortcut.id === id);
  return definition ? matchesCombo(event, definition.combo) : false;
}

/** True when keystrokes belong to a text field rather than to app-level commands. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element?.tagName) return false;
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.isContentEditable
  );
}
