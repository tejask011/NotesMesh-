/**
 * Pure text transforms behind the editor's toolbar and keyboard shortcuts.
 * Each returns one replacement plus where the selection should land, so the
 * editor can apply it through the browser's undo-aware insert command.
 */
export interface TextEdit {
  from: number;
  to: number;
  insert: string;
  selectionStart: number;
  selectionEnd: number;
}

/** Wrap the selection in a marker, or remove the marker if it's already wrapped. */
export function toggleWrap(
  text: string,
  start: number,
  end: number,
  open: string,
  close: string,
  placeholder: string
): TextEdit {
  const selected = text.slice(start, end);

  // The markers are just outside the selection: **[word]**
  if (
    text.slice(start - open.length, start) === open &&
    text.slice(end, end + close.length) === close
  ) {
    return {
      from: start - open.length,
      to: end + close.length,
      insert: selected,
      selectionStart: start - open.length,
      selectionEnd: end - open.length,
    };
  }

  // The markers are part of the selection: [**word**]
  if (
    selected.length >= open.length + close.length &&
    selected.startsWith(open) &&
    selected.endsWith(close)
  ) {
    const inner = selected.slice(open.length, selected.length - close.length);
    return {
      from: start,
      to: end,
      insert: inner,
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  const inner = selected || placeholder;
  return {
    from: start,
    to: end,
    insert: `${open}${inner}${close}`,
    selectionStart: start + open.length,
    selectionEnd: start + open.length + inner.length,
  };
}

const lineStart = (text: string, position: number) => text.lastIndexOf('\n', position - 1) + 1;

const lineEnd = (text: string, position: number) => {
  const index = text.indexOf('\n', position);
  return index === -1 ? text.length : index;
};

const selectedLineRange = (text: string, start: number, end: number) => {
  // A selection ending right after a newline doesn't include the following line.
  const adjustedEnd = end > start && text[end - 1] === '\n' ? end - 1 : end;
  return { from: lineStart(text, start), to: lineEnd(text, adjustedEnd) };
};

/** Apply or remove a line prefix ("- ", "## ") across all selected lines. */
export function toggleLinePrefix(
  text: string,
  start: number,
  end: number,
  prefix: string,
  replaces?: RegExp
): TextEdit {
  const { from, to } = selectedLineRange(text, start, end);
  const lines = text.slice(from, to).split('\n');
  const isApplied = lines.every(line => line.startsWith(prefix));

  const nextLines = lines.map(line => {
    if (isApplied) return line.slice(prefix.length);
    const body = replaces ? line.replace(replaces, '') : line;
    return `${prefix}${body}`;
  });
  const insert = nextLines.join('\n');

  if (start === end) {
    const delta = insert.length - (to - from);
    const caret = Math.max(from, start + delta);
    return { from, to, insert, selectionStart: caret, selectionEnd: caret };
  }
  return { from, to, insert, selectionStart: from, selectionEnd: from + insert.length };
}

const HEADING_PREFIX = /^#{1,6}\s+/;

export const toggleHeading = (text: string, start: number, end: number, level: number): TextEdit =>
  toggleLinePrefix(text, start, end, `${'#'.repeat(level)} `, HEADING_PREFIX);

const LIST_PREFIX = /^(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)/;

export const toggleBulletList = (text: string, start: number, end: number): TextEdit =>
  toggleLinePrefix(text, start, end, '- ', LIST_PREFIX);

/** Fence the selection as a code block, on its own lines. */
export function insertCodeBlock(text: string, start: number, end: number): TextEdit {
  const selected = text.slice(start, end);
  const before = start > 0 && text[start - 1] !== '\n' ? '\n' : '';
  const after = end < text.length && text[end] !== '\n' ? '\n' : '';
  const inner = selected || 'code';
  const open = `${before}\`\`\`\n`;
  return {
    from: start,
    to: end,
    insert: `${open}${inner}\n\`\`\`${after}`,
    selectionStart: start + open.length,
    selectionEnd: start + open.length + inner.length,
  };
}

/** Enter inside a list: start the next item, or end the list if this item is empty. */
export function continueList(text: string, position: number): TextEdit | null {
  const from = lineStart(text, position);
  const match = /^(\s*)(?:([-*+])\s+(\[[ xX]\]\s+)?|(\d+)\.\s+)/.exec(text.slice(from, position));
  if (!match) return null;

  const to = lineEnd(text, position);
  const isEmptyItem = text.slice(from + match[0].length, to).trim() === '';
  if (isEmptyItem) {
    return { from, to, insert: '', selectionStart: from, selectionEnd: from };
  }

  const [, indent, bullet, task, number] = match;
  const marker = number ? `${Number(number) + 1}. ` : `${bullet} ${task ? '[ ] ' : ''}`;
  const insert = `\n${indent}${marker}`;
  const caret = position + insert.length;
  return { from: position, to: position, insert, selectionStart: caret, selectionEnd: caret };
}

const INDENT = '  ';

/** Tab / Shift+Tab: insert indentation at the caret, or shift all selected lines. */
export function indentSelection(
  text: string,
  start: number,
  end: number,
  outdent: boolean
): TextEdit {
  if (start === end && !outdent) {
    const caret = start + INDENT.length;
    return { from: start, to: end, insert: INDENT, selectionStart: caret, selectionEnd: caret };
  }

  const { from, to } = selectedLineRange(text, start, end);
  const lines = text.slice(from, to).split('\n');
  const insert = lines
    .map(line => {
      if (!outdent) return `${INDENT}${line}`;
      return line.startsWith(INDENT) ? line.slice(INDENT.length) : line.replace(/^\s/, '');
    })
    .join('\n');

  if (start === end) {
    const caret = Math.max(from, start + (insert.length - (to - from)));
    return { from, to, insert, selectionStart: caret, selectionEnd: caret };
  }
  return { from, to, insert, selectionStart: from, selectionEnd: from + insert.length };
}
