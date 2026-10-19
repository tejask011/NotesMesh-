import { Note, NoteLink, BacklinkItem } from '../domain/note';
import { maskCodeRegions } from './codeRegions';

/**
 * Regex to match [[Wikilinks]] or [[Target|Alias]]
 */
const WIKILINK_REGEX = /\[\[([^[\]]+?)\]\]/g;

/**
 * Regex to match tags like #javascript or #ai/ml
 */
const TAG_REGEX = /(?:^|\s)#([a-zA-Z0-9_\-/]+)/g;

/**
 * Extract all [[wikilinks]] from a note's text content.
 */
export function extractWikilinks(content: string, sourceNoteId: string): NoteLink[] {
  const links: NoteLink[] = [];
  if (!content) return links;
  let match: RegExpExecArray | null;

  const searchable = maskCodeRegions(content);

  // Reset regex state
  WIKILINK_REGEX.lastIndex = 0;

  while ((match = WIKILINK_REGEX.exec(searchable)) !== null) {
    const rawInner = match[1].trim();
    // Support alias syntax: [[Target Note|Displayed Alias]]
    const parts = rawInner.split('|');
    const targetTitle = parts[0].trim();

    links.push({
      sourceNoteId,
      targetTitle,
      rawText: match[0],
    });
  }

  return links;
}

/**
 * Extract hashtags from markdown content.
 */
export function extractTags(content: string): string[] {
  const tags = new Set<string>();
  if (!content) return [];
  let match: RegExpExecArray | null;

  const searchable = maskCodeRegions(content);

  TAG_REGEX.lastIndex = 0;
  while ((match = TAG_REGEX.exec(searchable)) !== null) {
    const tag = match[1].trim();
    if (tag) {
      tags.add(tag);
    }
  }

  return Array.from(tags);
}

/**
 * Resolve targetNoteId for each wikilink by matching against existing note titles (case-insensitive).
 */
export function resolveWikilinks(links: NoteLink[], allNotes: Note[]): NoteLink[] {
  const titleToNoteMap = new Map<string, Note>();
  for (const note of allNotes) {
    titleToNoteMap.set(note.title.toLowerCase().trim(), note);
  }

  return links.map(link => {
    const matched = titleToNoteMap.get(link.targetTitle.toLowerCase().trim());
    return {
      ...link,
      targetNoteId: matched ? matched.id : undefined,
    };
  });
}

/**
 * Find all backlinks targeting a given note.
 */
export function buildBacklinks(targetNote: Note, allNotes: Note[]): BacklinkItem[] {
  const backlinks: BacklinkItem[] = [];
  const targetTitleLower = targetNote.title.toLowerCase().trim();

  for (const note of allNotes) {
    // Avoid self-references in backlinks list
    if (note.id === targetNote.id) continue;

    const links = extractWikilinks(note.content, note.id);
    const mentionsTarget = links.some(
      l => l.targetTitle.toLowerCase().trim() === targetTitleLower
    ) || (note.linkedNoteIds && note.linkedNoteIds.includes(targetNote.id));

    if (mentionsTarget) {
      const snippet = extractSnippet(note.content, targetNote.title);
      backlinks.push({
        sourceNoteId: note.id,
        sourceNoteTitle: note.title,
        previewSnippet: snippet,
      });
    }
  }

  return backlinks;
}

function extractSnippet(content: string, query: string): string {
  if (!content) return '';
  const index = content.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return content.slice(0, 100);

  const start = Math.max(0, index - 40);
  const end = Math.min(content.length, index + query.length + 60);
  let snippet = content.slice(start, end).replace(/\n/g, ' ');
  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';
  return snippet;
}
