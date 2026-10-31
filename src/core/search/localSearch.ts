import { Note } from '../domain/note';

/**
 * Relevance search and related-note suggestions that run entirely on this
 * device: TF-IDF vectors compared by cosine similarity, with typo tolerance.
 *
 * This matches on shared and similar words, not on meaning: it won't connect
 * "car" to "automobile". True embeddings need a model download, which would
 * belong behind an explicit opt-in (see docs/roadmap.md). The app's `search` and
 * `relatedNotes` signatures are what such a model would plug in behind.
 */
const STOP_WORDS = new Set(
  `a an and are as at be but by for from has have he her his i if in into is it its me my no not of on or our she
  so that the their them then there these they this to was we were what when which who will with you your`.split(
    /\s+/
  )
);

function stem(token: string): string {
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

export function tokenize(text: string): string[] {
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}_-]*/gu) ?? [];
  return tokens.filter(token => !STOP_WORDS.has(token)).map(stem);
}

type Vector = Map<string, number>;

export interface SearchIndex {
  vectors: Map<string, Vector>;
  idf: Map<string, number>;
}

const TITLE_WEIGHT = 3;
const TAG_WEIGHT = 2;

const termFrequencyCache = new WeakMap<Note, Map<string, number>>();

function termFrequencies(note: Note): Map<string, number> {
  const cached = termFrequencyCache.get(note);
  if (cached) return cached;

  const counts = new Map<string, number>();
  const add = (text: string, weight: number) => {
    for (const token of tokenize(text)) counts.set(token, (counts.get(token) ?? 0) + weight);
  };
  add(note.title, TITLE_WEIGHT);
  add(note.tags.join(' '), TAG_WEIGHT);
  add(note.content, 1);
  termFrequencyCache.set(note, counts);
  return counts;
}

function normalize(vector: Vector): Vector {
  let sum = 0;
  vector.forEach(value => {
    sum += value * value;
  });
  const length = Math.sqrt(sum) || 1;
  vector.forEach((value, key) => vector.set(key, value / length));
  return vector;
}

function cosine(a: Vector, b: Vector): number {
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let total = 0;
  small.forEach((value, key) => {
    total += value * (large.get(key) ?? 0);
  });
  return total;
}

export function buildSearchIndex(notes: Note[]): SearchIndex {
  const frequencies = notes.map(note => ({ id: note.id, counts: termFrequencies(note) }));

  const documentFrequency = new Map<string, number>();
  for (const { counts } of frequencies) {
    counts.forEach((_, term) =>
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
    );
  }

  const idf = new Map<string, number>();
  documentFrequency.forEach((count, term) => idf.set(term, Math.log(1 + notes.length / count)));

  const vectors = new Map<string, Vector>();
  for (const { id, counts } of frequencies) {
    const vector: Vector = new Map();
    counts.forEach((count, term) =>
      vector.set(term, (1 + Math.log(count)) * (idf.get(term) as number))
    );
    vectors.set(id, normalize(vector));
  }

  return { vectors, idf };
}

function trigrams(token: string): Set<string> {
  const padded = `  ${token} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) grams.add(padded.slice(i, i + 3));
  return grams;
}

/** Closest indexed words to a term the index doesn't contain, for typos and word variants. */
function expandTerm(term: string, idf: Map<string, number>): string[] {
  const grams = trigrams(term);
  const matches: { term: string; score: number }[] = [];
  idf.forEach((_, candidate) => {
    if (Math.abs(candidate.length - term.length) > 3) return;
    const other = trigrams(candidate);
    let shared = 0;
    grams.forEach(gram => {
      if (other.has(gram)) shared += 1;
    });
    const score = shared / (grams.size + other.size - shared);
    if (score >= 0.35) matches.push({ term: candidate, score });
  });
  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(match => match.term);
}

export interface SearchHit {
  noteId: string;
  score: number;
}

const rank = (
  index: SearchIndex,
  query: Vector,
  excludeId: string | null,
  limit: number
): SearchHit[] => {
  const hits: SearchHit[] = [];
  index.vectors.forEach((vector, noteId) => {
    if (noteId === excludeId) return;
    const score = cosine(query, vector);
    if (score > 0.01) hits.push({ noteId, score });
  });
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
};

export function search(index: SearchIndex, query: string, limit = 10): SearchHit[] {
  const vector: Vector = new Map();
  for (const term of tokenize(query)) {
    const known = index.idf.get(term);
    if (known !== undefined) {
      vector.set(term, known);
    } else {
      for (const expanded of expandTerm(term, index.idf)) {
        vector.set(expanded, index.idf.get(expanded) as number);
      }
    }
  }
  if (vector.size === 0) return [];
  return rank(index, normalize(vector), null, limit);
}

export function relatedNotes(index: SearchIndex, noteId: string, limit = 5): SearchHit[] {
  const vector = index.vectors.get(noteId);
  if (!vector || vector.size === 0) return [];
  // Below this, notes usually share only an incidental word.
  return rank(index, vector, noteId, limit).filter(hit => hit.score >= 0.08);
}

const MAX_NOTE_RESULTS = 8;

/** Literal title and text matches first, then notes that are merely similar to the query. */
export function rankNotes(
  notes: Note[],
  index: SearchIndex | null,
  query: string
): { note: Note; isFuzzy: boolean }[] {
  const q = query.trim().toLowerCase();
  if (!q) return notes.slice(0, 5).map(note => ({ note, isFuzzy: false }));

  const titleMatches = notes.filter(n => n.title.toLowerCase().includes(q));
  const textMatches = notes.filter(
    n => !n.title.toLowerCase().includes(q) && n.content.toLowerCase().includes(q)
  );
  const results = [...titleMatches, ...textMatches].map(note => ({ note, isFuzzy: false }));

  if (index && results.length < MAX_NOTE_RESULTS) {
    const byId = new Map(notes.map(note => [note.id, note]));
    const seen = new Set(results.map(result => result.note.id));
    for (const hit of search(index, q, MAX_NOTE_RESULTS)) {
      const note = byId.get(hit.noteId);
      if (note && !seen.has(hit.noteId)) results.push({ note, isFuzzy: true });
    }
  }
  return results.slice(0, MAX_NOTE_RESULTS);
}
