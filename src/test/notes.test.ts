import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { Note } from '../core/domain/note';
import {
  buildFolderTree,
  isInFolder,
  listFolderPaths,
  normalizeFolderPath,
  renameFolderPath,
} from '../core/notes/folders';
import {
  collectAllTags,
  getEffectiveTags,
  getInlineOnlyTags,
  noteHasTag,
} from '../core/notes/tags';
import { uniqueTitle } from '../core/notes/titles';
import {
  MAX_IMPORT_BYTES,
  buildExportPaths,
  buildImportedNotes,
  buildMarkdownArchive,
  decodeImportedFile,
  describeImport,
} from '../core/notes/importExport';
import {
  extractTags,
  extractWikilinks,
  resolveWikilinks,
  buildTitleIndex,
} from '../core/markdown/wikilinks';
import { renderMarkdown } from '../core/markdown/parser';
import { safeFileName } from '../core/util/files';
import { localDateString } from '../core/util/ids';

const note = (overrides: Partial<Note> = {}): Note => ({
  id: overrides.title ?? 'n',
  title: 'Note',
  content: '',
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

describe('folders', () => {
  it('normalizes paths and defaults to General', () => {
    expect(normalizeFolderPath(' Research / AI//Papers/ ')).toBe('Research/AI/Papers');
    expect(normalizeFolderPath('')).toBe('General');
    expect(normalizeFolderPath(undefined)).toBe('General');
    expect(normalizeFolderPath('///')).toBe('General');
  });

  it('builds a sorted hierarchy with direct notes and rolled-up counts', () => {
    const tree = buildFolderTree([
      note({ title: 'Paper', folder: 'Research/AI/Papers' }),
      note({ title: 'Overview', folder: 'Research/AI' }),
      note({ title: 'Plan', folder: 'Research' }),
      note({ title: 'Misc' }),
    ]);

    expect(tree.map(f => f.name)).toEqual(['General', 'Research']);
    const research = tree[1];
    expect(research.totalCount).toBe(3);
    expect(research.notes.map(n => n.title)).toEqual(['Plan']);
    const ai = research.children[0];
    expect(ai.path).toBe('Research/AI');
    expect(ai.totalCount).toBe(2);
    expect(ai.children[0].path).toBe('Research/AI/Papers');
  });

  it('lists intermediate folders for autocomplete', () => {
    expect(listFolderPaths([note({ folder: 'A/B/C' })])).toEqual(['A', 'A/B', 'A/B/C']);
  });

  it('treats folder membership by path segment, not string prefix', () => {
    expect(isInFolder(note({ folder: 'Research/AI' }), 'Research')).toBe(true);
    expect(isInFolder(note({ folder: 'Researchers' }), 'Research')).toBe(false);
  });

  it('renames a folder along with its subfolders only', () => {
    expect(renameFolderPath('A/B', 'A', 'X/Y')).toBe('X/Y/B');
    expect(renameFolderPath('A', 'A', 'Z')).toBe('Z');
    expect(renameFolderPath('AB', 'A', 'Z')).toBe('AB');
  });
});

describe('tags', () => {
  it('unions assigned and inline tags, case-insensitively, keeping assigned spelling', () => {
    const n = note({ tags: ['AI'], content: 'about #ai and #ml' });
    expect(getEffectiveTags(n)).toEqual(['AI', 'ml']);
    expect(getInlineOnlyTags(n)).toEqual(['ml']);
  });

  it('matches parent tags and any case', () => {
    const n = note({ content: 'see #ai/vision' });
    expect(noteHasTag(n, 'AI')).toBe(true);
    expect(noteHasTag(n, 'ai/vision')).toBe(true);
    expect(noteHasTag(n, 'a')).toBe(false);
  });

  it('collects all tags without case duplicates', () => {
    expect(collectAllTags([note({ tags: ['Beta'] }), note({ content: '#beta #alpha' })])).toEqual([
      'alpha',
      'Beta',
    ]);
  });

  it('supports non-Latin tags and ignores issue references', () => {
    expect(extractTags('#日本語 #हिंदी #123 #v2')).toEqual(['日本語', 'हिंदी', 'v2']);
  });

  it('ignores text in code', () => {
    expect(extractTags('real #tag\n```\n#include <x>\n```\n`#notatag`')).toEqual(['tag']);
  });
});

describe('wikilinks in code', () => {
  it('does not count links inside code blocks or spans', () => {
    const links = extractWikilinks('[[Real]] `[[Inline]]`\n```\n[[Fenced]]\n```\n[[After]]', 'x');
    expect(links.map(l => l.targetTitle)).toEqual(['Real', 'After']);
  });

  it('handles an unclosed fence by treating the rest as code', () => {
    expect(extractWikilinks('[[Real]]\n```\n[[Code]]', 'x').map(l => l.targetTitle)).toEqual([
      'Real',
    ]);
  });
});

describe('duplicate titles', () => {
  it('generates the next free title', () => {
    expect(uniqueTitle('Plan', [])).toBe('Plan');
    expect(uniqueTitle('Plan', ['plan '])).toBe('Plan (2)');
    expect(uniqueTitle('Plan', ['Plan', 'Plan (2)'])).toBe('Plan (3)');
  });

  it('resolves [[Title]] to the first match consistently', () => {
    const notes = [note({ id: 'first', title: 'Same' }), note({ id: 'second', title: 'same' })];
    expect(buildTitleIndex(notes).get('same')?.id).toBe('first');
    const [link] = resolveWikilinks(
      [{ sourceNoteId: 'x', targetTitle: 'SAME', rawText: '' }],
      notes
    );
    expect(link.targetNoteId).toBe('first');
  });
});

describe('markdown import', () => {
  it('imports text files, keeping content verbatim and extracting tags', () => {
    const content = 'Hello 🚀 #tag\r\nLine two';
    const summary = buildImportedNotes([{ name: 'My Note.md', bytes: bytes(content) }], []);
    expect(summary.skipped).toEqual([]);
    expect(summary.notes[0]).toMatchObject({
      title: 'My Note',
      content,
      tags: ['tag'],
      folder: 'Imported',
    });
  });

  it('strips a byte-order mark', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('# Hi')]);
    const result = decodeImportedFile('a.md', withBom.buffer as ArrayBuffer);
    expect(result).toEqual({ content: '# Hi' });
  });

  it('avoids duplicate titles against the workspace and within the batch', () => {
    const summary = buildImportedNotes(
      [
        { name: 'Plan.md', bytes: bytes('1') },
        { name: 'Plan.txt', bytes: bytes('2') },
        { name: 'New.md', bytes: bytes('3') },
      ],
      ['plan']
    );
    expect(summary.notes.map(n => n.title)).toEqual(['Plan (2)', 'Plan (3)', 'New']);
    expect(summary.renamed).toHaveLength(2);
  });

  it('gives every note a unique id, even in the same millisecond', () => {
    const files = Array.from({ length: 50 }, (_, i) => ({ name: `n${i}.md`, bytes: bytes('x') }));
    const ids = buildImportedNotes(files, [], 12345).notes.map(n => n.id);
    expect(new Set(ids).size).toBe(50);
  });

  it.each([
    ['photo.png', bytes('x'), /Unsupported file type/],
    ['report.pdf', bytes('x'), /Unsupported file type/],
    ['fake.md', new Uint8Array([0x48, 0x00, 0x49]).buffer as ArrayBuffer, /binary/],
    ['latin1.md', new Uint8Array([0x63, 0x61, 0x66, 0xe9]).buffer as ArrayBuffer, /UTF-8/],
    ['huge.md', new ArrayBuffer(MAX_IMPORT_BYTES + 1), /limit/],
  ])('skips %s with a reason', (name, data, reason) => {
    const summary = buildImportedNotes([{ name, bytes: data }], []);
    expect(summary.notes).toEqual([]);
    expect(summary.skipped[0].reason).toMatch(reason);
  });

  it('imports what it can and reports what it could not', () => {
    const summary = buildImportedNotes(
      [
        { name: 'ok.md', bytes: bytes('x') },
        { name: 'no.png', bytes: bytes('x') },
      ],
      []
    );
    expect(summary.notes).toHaveLength(1);
    const message = describeImport(summary);
    expect(message).toContain('Imported 1 note');
    expect(message).toContain('no.png');
  });
});

describe('markdown export', () => {
  it('keeps non-Latin titles in file names and removes only illegal characters', () => {
    expect(safeFileName('हिंदी नोट')).toBe('हिंदी नोट');
    expect(safeFileName('日本語')).toBe('日本語');
    expect(safeFileName('a/b:c*?.')).toBe('abc');
    expect(safeFileName('???', 'fallback')).toBe('fallback');
  });

  it('mirrors folders and de-duplicates paths case-insensitively', () => {
    const notes = [
      note({ id: '1', title: 'Plan', folder: 'A/B' }),
      note({ id: '2', title: 'plan', folder: 'A/B' }),
      note({ id: '3', title: '', folder: 'A/B' }),
    ];
    const paths = buildExportPaths(notes);
    expect(paths.get('1')).toBe('A/B/Plan.md');
    expect(paths.get('2')).toBe('A/B/plan (2).md');
    expect(paths.get('3')).toBe('A/B/Untitled.md');
  });

  it('builds a real zip that preserves note text', () => {
    const archive = buildMarkdownArchive([
      note({ id: '1', title: 'Hi', folder: 'X', content: 'Body 🚀' }),
    ]);
    const files = unzipSync(archive);
    expect(strFromU8(files['X/Hi.md'])).toBe('Body 🚀');
  });
});

describe('dates', () => {
  it('uses the local calendar date, not the UTC one', () => {
    // 23:30 local on Jan 5, regardless of the timezone running the test.
    expect(localDateString(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

describe('markdown rendering', () => {
  const render = (text: string) => renderMarkdown(text, new Set());

  it('removes scripts and event handlers from imported notes', () => {
    const html = render(
      '<img src=x onerror="alert(1)"> <script>alert(2)</script> [x](javascript:alert(3))'
    );
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
  });

  it('opens links in a new tab without leaking the opener', () => {
    const html = render('[site](https://example.com)');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('still renders wikilinks after sanitizing', () => {
    expect(render('[[Target]]')).toContain('data-wikilink="Target"');
  });

  it('does not rewrite # inside code fences', () => {
    const html = render('```c\n#include <stdio.h>\n##define\n```');
    expect(html).toContain('#include');
    expect(html).toContain('##define');
    expect(html).not.toContain('<h');
  });

  it('keeps ##heading convenience but treats #word as a tag, not a heading', () => {
    expect(render('##Heading')).toContain('<h2');
    expect(render('#tag')).not.toContain('<h1');
  });

  it('marks up inline and block math for the renderer', () => {
    const html = render('Euler $e^{i\\pi}=-1$ here\n\n$$\n\\int_0^1 x\\,dx\n$$');
    expect(html).toContain('<span class="math-inline">e^{i\\pi}=-1</span>');
    expect(html).toMatch(/<div class="math-block">\\int_0\^1 x\\,dx<\/div>/);
  });

  it('handles one-character and escaped math', () => {
    expect(render('$x$')).toContain('<span class="math-inline">x</span>');
    expect(render('$a\\$b$')).toContain('math-inline');
  });

  it('does not treat prices as math', () => {
    for (const text of ['costs $5 and $10 total', 'pay $5 now', 'from $ 5 to $ 6']) {
      expect(render(text)).not.toContain('math-inline');
    }
  });

  it('does not treat math syntax in code as math', () => {
    expect(render('`$x$`')).toContain('<code>$x$</code>');
  });

  it('keeps diagram source intact through the sanitizer', () => {
    const html = render('```mermaid\ngraph TD\n  A-->B\n  B["x<y"]\n```');
    expect(html).toContain('class="mermaid-block"');
    const container = document.createElement('div');
    container.innerHTML = html;
    expect(container.querySelector('.mermaid-block')?.textContent).toContain('A-->B');
    expect(container.querySelector('.mermaid-block')?.textContent).toContain('x<y');
  });

  it('escapes HTML inside math so it cannot inject markup', () => {
    const html = render('$<img src=x onerror=alert(1)>$');
    expect(html).not.toContain('<img');
  });
});
