import { describe, it, expect } from 'vitest';
import { maskCodeRegions, transformOutsideFences } from '../core/markdown/codeRegions';
import { extractWikilinks, extractTags, buildBacklinks } from '../core/markdown/wikilinks';
import { renderMarkdown } from '../core/markdown/parser';
import { buildGraphData } from '../core/graph/graphBuilder';
import { Note } from '../core/domain/note';
import { GraphFilterConfig } from '../core/domain/graph';

const fencedSample = [
  'Context line with [[Real Note]] and #real-tag.',
  '',
  '```bash',
  '#!/usr/bin/env bash',
  '#docker run --rm image',
  'echo "[[Phantom Link]]"',
  '```',
  '',
  'Inline sample: `[[Inline Phantom]]` and `#inline-tag`.',
].join('\n');

const graphConfig: GraphFilterConfig = {
  showTags: true,
  showOrphans: true,
  showMissingLinks: true,
  searchFilter: '',
  tagFilter: null,
  colorMode: 'type',
  linkDistance: 100,
  repelForce: 300,
  collisionRadius: 20,
};

describe('Markdown code regions', () => {
  it('masks fenced blocks and inline spans while keeping offsets stable', () => {
    const masked = maskCodeRegions(fencedSample);

    expect(masked.length).toBe(fencedSample.length);
    expect(masked).not.toContain('Phantom Link');
    expect(masked).not.toContain('Phantom]]');
    expect(masked).not.toContain('docker');
    expect(masked).toContain('[[Real Note]]');
    expect(masked).toContain('#real-tag');
  });

  it('supports tilde fences and multi-backtick inline spans', () => {
    const source = ['~~~js', 'const a = "[[Hidden]]";', '~~~', 'Text ``[[Also Hidden]]`` end.'].join(
      '\n'
    );
    const masked = maskCodeRegions(source);

    expect(masked).not.toContain('Hidden');
    expect(masked.split('\n')).toHaveLength(4);
  });

  it('applies transforms to prose lines only', () => {
    const source = ['#NeedSpace', '```', '#KeepThis', '```'].join('\n');
    const transformed = transformOutsideFences(source, line => line.replace('#NeedSpace', '# NeedSpace'));

    expect(transformed).toContain('# NeedSpace');
    expect(transformed).toContain('#KeepThis');
    expect(transformed).not.toContain('# KeepThis');
  });

  it('extracts wikilinks and tags from prose only', () => {
    const links = extractWikilinks(fencedSample, 'note-a');
    const tags = extractTags(fencedSample);

    expect(links).toHaveLength(1);
    expect(links[0].targetTitle).toBe('Real Note');
    expect(tags).toEqual(['real-tag']);
  });

  it('ignores code references when building backlinks', () => {
    const target: Note = {
      id: 'phantom',
      title: 'Phantom Link',
      content: '',
      tags: [],
      createdAt: 0,
      updatedAt: 0,
    };
    const source: Note = {
      id: 'source',
      title: 'Source',
      content: fencedSample,
      tags: [],
      createdAt: 0,
      updatedAt: 0,
    };

    expect(buildBacklinks(target, [source, target])).toHaveLength(0);
  });

  it('does not add graph edges or missing nodes for code-only references', () => {
    const notes: Note[] = [
      {
        id: 'source',
        title: 'Source',
        content: 'Prose link to [[Real Note]] and code sample:\n\n```\n[[Phantom Link]]\n```',
        tags: [],
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: 'real',
        title: 'Real Note',
        content: '',
        tags: [],
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    const data = buildGraphData(notes, graphConfig);

    expect(data.edges).toHaveLength(1);
    expect(data.edges[0].source).toBe('source');
    expect(data.edges[0].target).toBe('real');
    expect(data.nodes.find(node => node.id === 'missing:phantom link')).toBeUndefined();
  });

  it('keeps shebangs and hash comments inside code blocks when rendering', () => {
    const markdown = ['##Heading', '', '```bash', '#!/usr/bin/env bash', '#comment stays', '```'].join('\n');
    const html = renderMarkdown(markdown, new Set<string>());

    expect(html).toContain('#!/usr/bin/env bash');
    expect(html).toContain('#comment stays');
    expect(html).toContain('<h2>Heading</h2>');
  });
});
