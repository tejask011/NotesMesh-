import { zipSync, strToU8 } from 'fflate';
import { Note } from '../domain/note';
import { extractTags } from '../markdown/wikilinks';
import { createId } from '../util/ids';
import { readFileBytes, safeFileName } from '../util/files';
import { normalizeFolderPath } from './folders';
import { uniqueTitle } from './titles';

export const IMPORT_EXTENSIONS = ['.md', '.markdown', '.txt'];
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const IMPORT_FOLDER = 'Imported';

export interface SkippedFile {
  name: string;
  reason: string;
}

export interface ImportSummary {
  notes: Note[];
  skipped: SkippedFile[];
  /** Files whose title was already taken, with the title they were given. */
  renamed: { from: string; to: string }[];
}

/** Decode bytes as text, or explain why this isn't an importable text file. */
export function decodeImportedFile(
  name: string,
  bytes: ArrayBuffer
): { content: string } | { reason: string } {
  const lower = name.toLowerCase();
  if (!IMPORT_EXTENSIONS.some(extension => lower.endsWith(extension))) {
    return {
      reason: `Unsupported file type (only ${IMPORT_EXTENSIONS.join(', ')} can be imported)`,
    };
  }
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    return { reason: `Larger than the ${MAX_IMPORT_BYTES / (1024 * 1024)} MB import limit` };
  }

  // A NUL byte means a binary file that was merely renamed to .md, or UTF-16 text.
  if (new Uint8Array(bytes).includes(0)) {
    return { reason: 'This looks like a binary file, not UTF-8 text' };
  }
  try {
    // ignoreBOM: false (default) strips a leading byte-order mark.
    return { content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { reason: 'This file is not valid UTF-8 text' };
  }
}

/** Turn already-read files into notes. Pure, so the policy is testable without a browser. */
export function buildImportedNotes(
  files: { name: string; bytes: ArrayBuffer }[],
  existingTitles: string[],
  now = Date.now()
): ImportSummary {
  const summary: ImportSummary = { notes: [], skipped: [], renamed: [] };
  const titles = [...existingTitles];

  for (const file of files) {
    const decoded = decodeImportedFile(file.name, file.bytes);
    if ('reason' in decoded) {
      summary.skipped.push({ name: file.name, reason: decoded.reason });
      continue;
    }

    const baseTitle = file.name.replace(/\.[^/.]+$/, '').trim() || 'Untitled Note';
    const title = uniqueTitle(baseTitle, titles);
    if (title !== baseTitle) summary.renamed.push({ from: baseTitle, to: title });
    titles.push(title);

    summary.notes.push({
      id: createId('note'),
      title,
      content: decoded.content,
      tags: extractTags(decoded.content),
      folder: IMPORT_FOLDER,
      createdAt: now,
      updatedAt: now,
    });
  }

  return summary;
}

export async function importMarkdownFiles(
  files: File[],
  existingTitles: string[]
): Promise<ImportSummary> {
  const skipped: SkippedFile[] = [];
  const read: { name: string; bytes: ArrayBuffer }[] = [];

  for (const file of files) {
    // Checked before reading, so a huge file isn't pulled into memory just to be refused.
    if (file.size > MAX_IMPORT_BYTES) {
      skipped.push({
        name: file.name,
        reason: `Larger than the ${MAX_IMPORT_BYTES / (1024 * 1024)} MB import limit`,
      });
      continue;
    }
    try {
      read.push({ name: file.name, bytes: await readFileBytes(file) });
    } catch (error) {
      skipped.push({
        name: file.name,
        reason: (error as Error).message || 'The file could not be read',
      });
    }
  }

  const summary = buildImportedNotes(read, existingTitles);
  return { ...summary, skipped: [...skipped, ...summary.skipped] };
}

export function describeImport(summary: ImportSummary): string {
  const parts: string[] = [];
  if (summary.notes.length > 0) {
    parts.push(
      `Imported ${summary.notes.length} note${summary.notes.length === 1 ? '' : 's'} into "${IMPORT_FOLDER}".`
    );
  }
  if (summary.renamed.length > 0) {
    parts.push(`Renamed to avoid duplicates: ${summary.renamed.map(r => `"${r.to}"`).join(', ')}.`);
  }
  if (summary.skipped.length > 0) {
    parts.push(`Skipped: ${summary.skipped.map(s => `${s.name} (${s.reason})`).join('; ')}.`);
  }
  return parts.join(' ') || 'No files were selected.';
}

/**
 * Map each note to a unique path inside an export archive, mirroring folders.
 * Windows and macOS file systems are case-insensitive, so paths compare that way.
 */
export function buildExportPaths(notes: Note[]): Map<string, string> {
  const paths = new Map<string, string>();
  const used = new Set<string>();

  for (const note of notes) {
    const folder = normalizeFolderPath(note.folder)
      .split('/')
      .map(segment => safeFileName(segment, 'folder'))
      .join('/');
    const base = `${folder}/${safeFileName(note.title, 'Untitled')}`;
    let path = `${base}.md`;
    for (let suffix = 2; used.has(path.toLowerCase()); suffix += 1) {
      path = `${base} (${suffix}).md`;
    }
    used.add(path.toLowerCase());
    paths.set(note.id, path);
  }

  return paths;
}

/** All notes as a .zip of plain Markdown files, so data can leave NoteMesh without any tooling. */
export function buildMarkdownArchive(notes: Note[]): Uint8Array {
  const paths = buildExportPaths(notes);
  const files: Record<string, Uint8Array> = {};
  for (const note of notes) {
    files[paths.get(note.id) as string] = strToU8(note.content);
  }
  return zipSync(files);
}
