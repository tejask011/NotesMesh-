import { Note } from '../domain/note';

export const DEFAULT_FOLDER = 'General';

/**
 * Folder names are virtual: they are derived from the notes that use them.
 * Sorting keeps the tree stable between renders.
 */
export function uniqueFolders(notes: Note[]): string[] {
  return Array.from(new Set(notes.map(n => n.folder || DEFAULT_FOLDER))).sort();
}

export function notesInFolder(notes: Note[], folder: string): Note[] {
  return notes.filter(n => (n.folder || DEFAULT_FOLDER) === folder);
}

/**
 * Message shown under a folder header when no rows can be rendered. Pinned
 * notes live in their own section, so a folder with only pinned notes is not
 * empty even though the tree branch is.
 */
export function folderEmptyMessage(
  totalInFolder: number,
  visibleInFolder: number,
  isFiltering: boolean
): string | null {
  if (visibleInFolder > 0) return null;
  if (totalInFolder === 0) return 'No notes';
  if (isFiltering) return 'No matching notes';
  return 'All notes are pinned';
}
