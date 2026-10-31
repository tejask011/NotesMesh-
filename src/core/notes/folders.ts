import { Note } from '../domain/note';

/**
 * Folders are not stored records. A note's `folder` is a "/"-separated path
 * ("Research/AI/Papers"), and the tree is derived from the paths in use, so a
 * folder exists exactly as long as a note is in it.
 */
export const DEFAULT_FOLDER = 'General';

export function normalizeFolderPath(path: string | undefined): string {
  const segments = (path ?? '')
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean);
  return segments.join('/') || DEFAULT_FOLDER;
}

export interface FolderNode {
  /** Last path segment, e.g. "Papers". */
  name: string;
  /** Full path, e.g. "Research/AI/Papers". */
  path: string;
  children: FolderNode[];
  /** Notes directly in this folder. */
  notes: Note[];
  /** Notes in this folder and every descendant. */
  totalCount: number;
}

export function buildFolderTree(notes: Note[]): FolderNode[] {
  const root: FolderNode = { name: '', path: '', children: [], notes: [], totalCount: 0 };
  const byPath = new Map<string, FolderNode>([['', root]]);

  for (const note of notes) {
    let parent = root;
    let path = '';
    for (const segment of normalizeFolderPath(note.folder).split('/')) {
      path = path ? `${path}/${segment}` : segment;
      let node = byPath.get(path);
      if (!node) {
        node = { name: segment, path, children: [], notes: [], totalCount: 0 };
        byPath.set(path, node);
        parent.children.push(node);
      }
      node.totalCount += 1;
      parent = node;
    }
    parent.notes.push(note);
  }

  const sortChildren = (node: FolderNode) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.children.forEach(sortChildren);
  };
  sortChildren(root);
  return root.children;
}

/** Every folder path in use, including parents, for autocomplete. */
export function listFolderPaths(notes: Note[]): string[] {
  const paths = new Set<string>();
  for (const note of notes) {
    const segments = normalizeFolderPath(note.folder).split('/');
    segments.forEach((_, index) => paths.add(segments.slice(0, index + 1).join('/')));
  }
  return Array.from(paths).sort((a, b) => a.localeCompare(b));
}

export function isInFolder(note: Note, folderPath: string): boolean {
  const path = normalizeFolderPath(note.folder);
  return path === folderPath || path.startsWith(`${folderPath}/`);
}

/** Path after renaming/moving `from` to `to`, keeping any nested remainder. */
export function renameFolderPath(path: string | undefined, from: string, to: string): string {
  const current = normalizeFolderPath(path);
  if (current === from) return normalizeFolderPath(to);
  if (current.startsWith(`${from}/`))
    return normalizeFolderPath(`${to}/${current.slice(from.length + 1)}`);
  return current;
}
