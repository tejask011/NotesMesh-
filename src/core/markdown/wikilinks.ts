import { Note, NoteLink, BacklinkItem } from '../domain/note';

/**
 * Regex to match [[Wikilinks]] or [[Target|Alias]]
 */
const WIKILINK_REGEX = /\[\[([^[\]]+?)\]\]/g;

/**
 * Regex to match tags like #javascript, #ai/ml or #日本語
 */
const TAG_REGEX = /(?:^|\s)#([\p{L}\p{M}\p{N}_\-/]+)/gu;

const FENCED_CODE = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[^\n]*$|(?![\s\S]))/gm;
const INLINE_CODE = /(`+)[^\n]*?\1/g;

/** Code samples aren't links or tags: `[[x]]` and `#include` shouldn't count as either. */
function stripCode(content: string): string {
  return content.replace(FENCED_CODE, '').replace(INLINE_CODE, '');
}

/**
 * Extract all [[wikilinks]] from a note's text content.
 */
export function extractWikilinks(content: string, sourceNoteId: string): NoteLink[] {
  const links: NoteLink[] = [];
  if (!content) return links;
  const text = stripCode(content);
  let match: RegExpExecArray | null;

  // Reset regex state
  WIKILINK_REGEX.lastIndex = 0;

  while ((match = WIKILINK_REGEX.exec(text)) !== null) {
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
 * Extract hashtags from markdown content. All-digit "tags" like #123 are references, not tags.
 */
export function extractTags(content: string): string[] {
  const tags = new Set<string>();
  if (!content) return [];
  const text = stripCode(content);
  let match: RegExpExecArray | null;

  TAG_REGEX.lastIndex = 0;
  while ((match = TAG_REGEX.exec(text)) !== null) {
    const tag = match[1].trim();
    if (tag && !/^\d+$/.test(tag)) {
      tags.add(tag);
    }
  }

  return Array.from(tags);
}

/**
 * Case-insensitive title lookup. When titles collide the first note wins, so
 * links, backlinks and navigation all agree on which note [[Title]] means.
 */
export function buildTitleIndex(allNotes: Note[]): Map<string, Note> {
  const index = new Map<string, Note>();
  for (const note of allNotes) {
    const key = note.title.toLowerCase().trim();
    if (!index.has(key)) index.set(key, note);
  }
  return index;
}

/**
 * Resolve targetNoteId for each wikilink by matching against existing note titles (case-insensitive).
 * Pass a prebuilt `titleIndex` when resolving links for many notes.
 */
export function resolveWikilinks(
  links: NoteLink[],
  allNotes: Note[],
  titleIndex: Map<string, Note> = buildTitleIndex(allNotes)
): NoteLink[] {
  return links.map(link => {
    const matched = titleIndex.get(link.targetTitle.toLowerCase().trim());
    return {
      ...link,
      targetNoteId: matched ? matched.id : undefined,
    };
  });
}

/**
 * Find all backlinks targeting a given note.
 */
const noteLinksCache = new WeakMap<Note, NoteLink[]>();

function linksOf(note: Note): NoteLink[] {
  let links = noteLinksCache.get(note);
  if (!links) {
    links = extractWikilinks(note.content, note.id);
    noteLinksCache.set(note, links);
  }
  return links;
}

export function buildBacklinks(targetNote: Note, allNotes: Note[]): BacklinkItem[] {
  const backlinks: BacklinkItem[] = [];
  const targetTitleLower = targetNote.title.toLowerCase().trim();

  for (const note of allNotes) {
    // Avoid self-references in backlinks list
    if (note.id === targetNote.id) continue;

    const links = linksOf(note);
    const mentionsTarget =
      links.some(l => l.targetTitle.toLowerCase().trim() === targetTitleLower) ||
      (note.linkedNoteIds && note.linkedNoteIds.includes(targetNote.id));

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
