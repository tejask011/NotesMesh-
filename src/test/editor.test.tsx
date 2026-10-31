import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Note } from '../core/domain/note';
import {
  continueList,
  indentSelection,
  insertCodeBlock,
  TextEdit,
  toggleBulletList,
  toggleHeading,
  toggleWrap,
} from '../core/markdown/formatting';
import { NoteEditor } from '../features/notes/NoteEditor';
import { matchesCombo } from '../core/shortcuts';

const apply = (text: string, edit: TextEdit) =>
  text.slice(0, edit.from) + edit.insert + text.slice(edit.to);

describe('formatting transforms', () => {
  it('wraps a selection and leaves it selected', () => {
    const edit = toggleWrap('a word b', 2, 6, '**', '**', 'x');
    expect(apply('a word b', edit)).toBe('a **word** b');
    expect([edit.selectionStart, edit.selectionEnd]).toEqual([4, 8]);
  });

  it('inserts a selected placeholder when nothing is selected', () => {
    const edit = toggleWrap('ab', 1, 1, '**', '**', 'bold');
    expect(apply('ab', edit)).toBe('a**bold**b');
    expect('a**bold**b'.slice(edit.selectionStart, edit.selectionEnd)).toBe('bold');
  });

  it('toggles a wrap off whether the selection includes the markers or not', () => {
    expect(apply('**word**', toggleWrap('**word**', 2, 6, '**', '**', 'x'))).toBe('word');
    expect(apply('**word**', toggleWrap('**word**', 0, 8, '**', '**', 'x'))).toBe('word');
  });

  it('applies line prefixes to the start of the line, not at the caret', () => {
    expect(apply('hello world', toggleHeading('hello world', 5, 5, 1))).toBe('# hello world');
  });

  it('replaces rather than stacks heading levels, and toggles off', () => {
    expect(apply('# Title', toggleHeading('# Title', 2, 2, 2))).toBe('## Title');
    expect(apply('## Title', toggleHeading('## Title', 2, 2, 2))).toBe('Title');
  });

  it('applies a bullet to every selected line', () => {
    const text = 'one\ntwo\nthree';
    expect(apply(text, toggleBulletList(text, 1, 9))).toBe('- one\n- two\n- three');
  });

  it('does not touch a line the selection only reaches the start of', () => {
    const text = 'one\ntwo';
    expect(apply(text, toggleBulletList(text, 0, 4))).toBe('- one\ntwo');
  });

  it('puts code fences on their own lines', () => {
    expect(apply('a b', insertCodeBlock('a b', 2, 3))).toBe('a \n```\nb\n```');
  });

  it('continues lists on Enter', () => {
    const cases: [string, string][] = [
      ['- item', '- item\n- '],
      ['  * nested', '  * nested\n  * '],
      ['1. first', '1. first\n2. '],
      ['- [x] done', '- [x] done\n- [ ] '],
    ];
    for (const [text, expected] of cases) {
      const edit = continueList(text, text.length) as TextEdit;
      expect(apply(text, edit)).toBe(expected);
      expect(edit.selectionStart).toBe(expected.length);
    }
  });

  it('ends a list when Enter is pressed on an empty item', () => {
    expect(apply('- item\n- ', continueList('- item\n- ', 9) as TextEdit)).toBe('- item\n');
  });

  it('leaves Enter alone outside a list', () => {
    expect(continueList('just text', 9)).toBeNull();
  });

  it('indents and outdents every selected line', () => {
    const text = 'a\nb';
    expect(apply(text, indentSelection(text, 0, 3, false))).toBe('  a\n  b');
    expect(apply('  a\n  b', indentSelection('  a\n  b', 0, 7, true))).toBe('a\nb');
  });
});

describe('shortcut matching', () => {
  const press = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

  it('matches exact modifiers only', () => {
    expect(matchesCombo(press({ key: 'b', ctrlKey: true }), 'Ctrl+B')).toBe(true);
    expect(matchesCombo(press({ key: 'b', metaKey: true }), 'Ctrl+B')).toBe(true);
    expect(matchesCombo(press({ key: 'b', ctrlKey: true, shiftKey: true }), 'Ctrl+B')).toBe(false);
    expect(matchesCombo(press({ key: 'b' }), 'Ctrl+B')).toBe(false);
  });

  it('matches by physical key when Shift or Alt changes the character', () => {
    expect(
      matchesCombo(
        press({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true }),
        'Ctrl+Shift+1'
      )
    ).toBe(true);
    expect(
      matchesCombo(press({ key: '†', code: 'KeyT', altKey: true, shiftKey: true }), 'Alt+Shift+T')
    ).toBe(true);
  });
});

const baseNote: Note = {
  id: 'n1',
  title: 'Title',
  content: 'hello world',
  tags: ['manual'],
  folder: 'General',
  createdAt: 0,
  updatedAt: 0,
};

const Harness: React.FC<{
  initial?: Partial<Note>;
  onChange?: (note: Note) => void;
  others?: Note[];
}> = ({ initial, onChange, others = [] }) => {
  const [note, setNote] = useState({ ...baseNote, ...initial });
  return (
    <NoteEditor
      note={note}
      onUpdateNote={updated => {
        setNote(updated);
        onChange?.(updated);
      }}
      allNotes={[...others, note]}
      backlinks={[]}
      relatedNotes={[]}
      onNavigateNote={() => {}}
      onCreateNoteFromLink={() => {}}
      saveStatus={{ state: 'saved', lastSavedAt: null, error: null, pendingCount: 0 }}
      onRetrySave={() => {}}
      onToggleSidebar={() => {}}
    />
  );
};

const textarea = () => screen.getByLabelText('Note text') as HTMLTextAreaElement;

describe('NoteEditor', () => {
  it('stores typed text verbatim, including emoji and joiners', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const text = 'Ship it 🚀 👩‍💻 क्‍ष ✓';
    fireEvent.change(textarea(), { target: { value: text } });
    expect(onChange.mock.calls[0][0].content).toBe(text);
    expect(textarea().value).toBe(text);

    fireEvent.change(screen.getByLabelText('Note title'), { target: { value: 'Title 🎉' } });
    expect((screen.getByLabelText('Note title') as HTMLInputElement).value).toBe('Title 🎉');
  });

  it.each([
    ['Ctrl+B', { key: 'b', ctrlKey: true }, '**hello** world'],
    ['Cmd+B', { key: 'b', metaKey: true }, '**hello** world'],
    ['Ctrl+I', { key: 'i', ctrlKey: true }, '*hello* world'],
    ['Ctrl+E', { key: 'e', ctrlKey: true }, '`hello` world'],
    ['Ctrl+Shift+K', { key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true }, '[[hello]] world'],
    ['Ctrl+Shift+1', { key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true }, '# hello world'],
    ['Ctrl+Shift+2', { key: '@', code: 'Digit2', ctrlKey: true, shiftKey: true }, '## hello world'],
    ['Ctrl+Shift+L', { key: 'L', code: 'KeyL', ctrlKey: true, shiftKey: true }, '- hello world'],
  ])('%s formats the selection', (_name, keys, expected) => {
    render(<Harness />);
    const area = textarea();
    area.focus();
    area.setSelectionRange(0, 5);
    fireEvent.keyDown(area, keys);
    expect(area.value).toBe(expected);
  });

  it('keeps the selection on the formatted word, so shortcuts can toggle', () => {
    render(<Harness />);
    const area = textarea();
    area.focus();
    area.setSelectionRange(0, 5);
    fireEvent.keyDown(area, { key: 'b', ctrlKey: true });
    expect(area.value.slice(area.selectionStart, area.selectionEnd)).toBe('hello');
    fireEvent.keyDown(area, { key: 'b', ctrlKey: true });
    expect(area.value).toBe('hello world');
  });

  it('formats from the toolbar too', () => {
    render(<Harness />);
    const area = textarea();
    area.focus();
    area.setSelectionRange(6, 11);
    fireEvent.click(screen.getByTitle('Bold (Ctrl+B)'));
    expect(area.value).toBe('hello **world**');
  });

  it('continues a list on Enter and places the caret on the new item', () => {
    render(<Harness initial={{ content: '- item' }} />);
    const area = textarea();
    area.focus();
    area.setSelectionRange(6, 6);
    fireEvent.keyDown(area, { key: 'Enter' });
    expect(area.value).toBe('- item\n- ');
    expect(area.selectionStart).toBe(9);
  });

  it('does not continue a list while an IME is composing', () => {
    render(<Harness initial={{ content: '- item' }} />);
    const area = textarea();
    area.focus();
    area.setSelectionRange(6, 6);
    fireEvent.keyDown(area, { key: 'Enter', isComposing: true });
    expect(area.value).toBe('- item');
  });

  it('Tab indents, and Esc then Tab lets keyboard users leave the editor', () => {
    render(<Harness />);
    const area = textarea();
    area.focus();
    area.setSelectionRange(0, 0);
    expect(fireEvent.keyDown(area, { key: 'Tab' })).toBe(false); // default prevented: stays in the editor
    expect(area.value).toBe('  hello world');

    fireEvent.keyDown(area, { key: 'Escape' });
    expect(fireEvent.keyDown(area, { key: 'Tab' })).toBe(true); // default allowed: focus moves on
  });

  it('asks before a template replaces existing text', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Harness />);
    fireEvent.click(screen.getByTitle('Insert Note Template'));
    fireEvent.click(screen.getByText('Daily Note'));
    expect(confirmSpy).toHaveBeenCalled();
    expect(textarea().value).toBe('hello world');
    confirmSpy.mockRestore();
  });

  it('moves the note only when the folder edit is committed, normalizing the path', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByLabelText('Folder path') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Research/' } });
    fireEvent.change(input, { target: { value: ' Research / AI/' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onChange.mock.calls[0][0].folder).toBe('Research/AI');
    expect(input.value).toBe('Research/AI');
  });

  it('warns about duplicate titles', () => {
    render(<Harness others={[{ ...baseNote, id: 'other' }]} initial={{ id: 'second' }} />);
    expect(screen.getByText(/Another note already has this title/)).toBeTruthy();
  });

  it('shows assigned tags as removable and inline tags as read-only', () => {
    render(<Harness initial={{ content: 'text #inline', tags: ['manual'] }} />);
    expect(screen.getByLabelText('Remove tag manual')).toBeTruthy();
    expect(screen.getByText('#inline')).toBeTruthy();
    expect(screen.queryByLabelText('Remove tag inline')).toBeNull();
  });
});
