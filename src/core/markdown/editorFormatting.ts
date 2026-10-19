/**
 * Text transformations for the note editor toolbar and shortcuts.
 *
 * Every helper returns the new text together with the selection range that
 * should be restored after React applies the value. Keeping the offsets here
 * avoids duplicating index math in the component.
 */

export interface TextRange {
  text: string;
  start: number;
  end: number;
}

export interface FormattedText {
  text: string;
  start: number;
  end: number;
}

export type EditorShortcut = 'bold' | 'italic';

function clampRange(range: TextRange): { start: number; end: number } {
  const start = Math.max(0, Math.min(range.start, range.text.length));
  const end = Math.max(start, Math.min(range.end, range.text.length));
  return { start, end };
}

/**
 * Wraps the selected text, or inserts a selected placeholder when the caret is
 * collapsed. The markers stay outside the returned selection.
 */
export function wrapSelection(
  range: TextRange,
  prefix: string,
  suffix: string = prefix,
  placeholder: string = 'text'
): FormattedText {
  const { start, end } = clampRange(range);
  const selected = range.text.slice(start, end);
  const inner = selected.length > 0 ? selected : placeholder;

  return {
    text: range.text.slice(0, start) + prefix + inner + suffix + range.text.slice(end),
    start: start + prefix.length,
    end: start + prefix.length + inner.length,
  };
}

/**
 * Prefixes every line touched by the selection. A collapsed caret only gets
 * the prefix before it; a real selection expands to the full formatted block.
 */
export function prefixLines(range: TextRange, prefix: string): FormattedText {
  const { start, end } = clampRange(range);
  const text = range.text;

  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const probe = end > start && text[end - 1] === '\n' ? end - 1 : end;
  const nextNewline = text.indexOf('\n', probe);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;

  const block = text.slice(lineStart, lineEnd);
  const prefixed = block
    .split('\n')
    .map(line => `${prefix}${line}`)
    .join('\n');

  const nextText = text.slice(0, lineStart) + prefixed + text.slice(lineEnd);

  if (start === end) {
    const caret = start + prefix.length;
    return { text: nextText, start: caret, end: caret };
  }

  return { text: nextText, start: lineStart, end: lineStart + prefixed.length };
}

/**
 * Ctrl/Cmd+B and Ctrl/Cmd+I. Shift and Alt combinations are left to the
 * browser, and the component only calls this from the note textarea.
 */
export function resolveEditorShortcut(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): EditorShortcut | null {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return null;

  const key = event.key.toLowerCase();
  if (key === 'b') return 'bold';
  if (key === 'i') return 'italic';
  return null;
}
