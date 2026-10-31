import { Note } from '../domain/note';
import { extractTags } from '../markdown/wikilinks';

const effectiveTagsCache = new WeakMap<Note, string[]>();

/**
 * A note's tags are the union of two sources:
 *  - assigned tags, stored in `note.tags` and removable from the editor
 *  - inline tags, written as #tag in the body and removed by editing the text
 * Tags compare case-insensitively, and "#ai" also matches its children ("#ai/ml").
 */
export function getEffectiveTags(note: Note): string[] {
  const cached = effectiveTagsCache.get(note);
  if (cached) return cached;

  const seen = new Map<string, string>();
  for (const tag of [...note.tags, ...extractTags(note.content)]) {
    const key = tag.toLowerCase();
    if (!seen.has(key)) seen.set(key, tag);
  }
  const tags = Array.from(seen.values());
  effectiveTagsCache.set(note, tags);
  return tags;
}

export function getInlineOnlyTags(note: Note): string[] {
  const assigned = new Set(note.tags.map(tag => tag.toLowerCase()));
  return getEffectiveTags(note).filter(tag => !assigned.has(tag.toLowerCase()));
}

export function noteHasTag(note: Note, tag: string): boolean {
  const wanted = tag.toLowerCase();
  return getEffectiveTags(note).some(candidate => {
    const value = candidate.toLowerCase();
    return value === wanted || value.startsWith(`${wanted}/`);
  });
}

export function collectAllTags(notes: Note[]): string[] {
  const seen = new Map<string, string>();
  for (const note of notes) {
    for (const tag of getEffectiveTags(note)) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) seen.set(key, tag);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}
