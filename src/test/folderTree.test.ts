import { describe, it, expect } from 'vitest';
import { Note } from '../core/domain/note';
import {
  DEFAULT_FOLDER,
  folderEmptyMessage,
  notesInFolder,
  uniqueFolders,
} from '../core/notes/folderTree';

function makeNote(id: string, folder?: string, isPinned = false): Note {
  return {
    id,
    title: `Note ${id}`,
    content: '',
    folder,
    tags: [],
    isPinned,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('folder tree', () => {
  const notes: Note[] = [
    makeNote('1', 'Research'),
    makeNote('2', 'General'),
    makeNote('3', undefined),
    makeNote('4', 'Research'),
    makeNote('5', 'Guides', true),
  ];

  it('lists unique folders sorted by name', () => {
    expect(uniqueFolders(notes)).toEqual(['General', 'Guides', 'Research']);
  });

  it('uses General for notes without a folder', () => {
    expect(notesInFolder(notes, DEFAULT_FOLDER).map(n => n.id)).toEqual(['2', '3']);
  });

  it('returns only the notes of the requested folder', () => {
    expect(notesInFolder(notes, 'Research').map(n => n.id)).toEqual(['1', '4']);
    expect(notesInFolder(notes, 'Missing')).toEqual([]);
  });

  it('returns no message when rows are visible', () => {
    expect(folderEmptyMessage(2, 2, false)).toBeNull();
  });

  it('explains that a folder has no notes at all', () => {
    expect(folderEmptyMessage(0, 0, false)).toBe('No notes');
  });

  it('explains that a filter hides every note', () => {
    expect(folderEmptyMessage(3, 0, true)).toBe('No matching notes');
  });

  it('explains that every note is pinned', () => {
    expect(folderEmptyMessage(3, 0, false)).toBe('All notes are pinned');
  });
});
