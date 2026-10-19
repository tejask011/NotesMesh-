import { describe, it, expect } from 'vitest';
import {
  prefixLines,
  resolveEditorShortcut,
  wrapSelection,
} from '../core/markdown/editorFormatting';

describe('editor formatting', () => {
  it('wraps a selection and keeps the inner text selected', () => {
    const result = wrapSelection({ text: 'hello world', start: 6, end: 11 }, '**');

    expect(result.text).toBe('hello **world**');
    expect(result.text.slice(result.start, result.end)).toBe('world');
  });

  it('inserts and selects a placeholder for a collapsed caret', () => {
    const result = wrapSelection({ text: 'hello', start: 5, end: 5 }, '**');

    expect(result.text).toBe('hello**text**');
    expect(result.text.slice(result.start, result.end)).toBe('text');
  });

  it('supports different prefix and suffix markers', () => {
    const result = wrapSelection({ text: 'let x = 1;', start: 0, end: 10 }, '```\n', '\n```');

    expect(result.text).toBe('```\nlet x = 1;\n```');
    expect(result.text.slice(result.start, result.end)).toBe('let x = 1;');
  });

  it('clamps out-of-range selections', () => {
    const result = wrapSelection({ text: 'abc', start: -5, end: 99 }, '**');

    expect(result.text).toBe('**abc**');
    expect(result.text.slice(result.start, result.end)).toBe('abc');
  });

  it('prefixes the current line and moves a collapsed caret past the prefix', () => {
    const result = prefixLines({ text: 'hello', start: 2, end: 2 }, '- ');

    expect(result.text).toBe('- hello');
    expect(result.start).toBe(4);
    expect(result.end).toBe(4);
  });

  it('prefixes every line in a multi-line selection and selects the block', () => {
    const text = 'one\ntwo\nthree';
    const result = prefixLines({ text, start: 0, end: text.length }, '- ');

    expect(result.text).toBe('- one\n- two\n- three');
    expect(result.text.slice(result.start, result.end)).toBe('- one\n- two\n- three');
  });

  it('expands a partial multi-line selection to the touched lines', () => {
    const result = prefixLines({ text: 'one\ntwo\nthree', start: 1, end: 6 }, '- ');

    expect(result.text).toBe('- one\n- two\nthree');
    expect(result.text.slice(result.start, result.end)).toBe('- one\n- two');
  });

  it('does not prefix the following line when the selection ends on a newline', () => {
    const result = prefixLines({ text: 'one\ntwo', start: 0, end: 4 }, '# ');

    expect(result.text).toBe('# one\ntwo');
    expect(result.start).toBe(0);
    expect(result.end).toBe(5);
  });

  it('prefixes an empty note and leaves the caret after the marker', () => {
    const result = prefixLines({ text: '', start: 0, end: 0 }, '# ');

    expect(result.text).toBe('# ');
    expect(result.start).toBe(2);
    expect(result.end).toBe(2);
  });

  it('prefixes only the caret line when the selection is collapsed at the start', () => {
    const result = prefixLines({ text: 'one\ntwo', start: 0, end: 0 }, '# ');

    expect(result.text).toBe('# one\ntwo');
    expect(result.start).toBe(2);
    expect(result.end).toBe(2);
  });
});

describe('editor shortcut resolver', () => {
  const base = {
    key: 'b',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
  };

  it('maps Ctrl+B and Cmd+B to bold', () => {
    expect(resolveEditorShortcut({ ...base, ctrlKey: true })).toBe('bold');
    expect(resolveEditorShortcut({ ...base, metaKey: true })).toBe('bold');
  });

  it('maps Ctrl+I and Cmd+I to italic', () => {
    expect(resolveEditorShortcut({ ...base, key: 'i', ctrlKey: true })).toBe('italic');
    expect(resolveEditorShortcut({ ...base, key: 'I', metaKey: true })).toBe('italic');
  });

  it('ignores plain letters and unrelated modifiers', () => {
    expect(resolveEditorShortcut(base)).toBeNull();
    expect(resolveEditorShortcut({ ...base, key: 'x', ctrlKey: true })).toBeNull();
    expect(resolveEditorShortcut({ ...base, ctrlKey: true, shiftKey: true })).toBeNull();
    expect(resolveEditorShortcut({ ...base, metaKey: true, altKey: true })).toBeNull();
  });
});
