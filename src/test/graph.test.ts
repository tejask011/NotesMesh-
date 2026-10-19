import { describe, it, expect } from 'vitest';
import { buildGraphData } from '../core/graph/graphBuilder';
import { Note } from '../core/domain/note';
import { GraphFilterConfig } from '../core/domain/graph';

describe('Knowledge Graph Builder', () => {
  const sampleNotes: Note[] = [
    {
      id: '1',
      title: 'Graph Theory',
      content: 'Refers to [[Algorithms]] and [[Topology]].',
      tags: ['math'],
      createdAt: 0,
      updatedAt: 0,
    },
    {
      id: '2',
      title: 'Algorithms',
      content: 'Core computer science.',
      tags: ['cs'],
      createdAt: 0,
      updatedAt: 0,
    },
    {
      id: '3',
      title: 'Orphan Note',
      content: 'Nothing links to this.',
      tags: [],
      createdAt: 0,
      updatedAt: 0,
    },
  ];

  const defaultConfig: GraphFilterConfig = {
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

  it('generates nodes and edges connecting linked notes', () => {
    const data = buildGraphData(sampleNotes, defaultConfig);

    expect(data.nodes.length).toBeGreaterThanOrEqual(3);
    const edge = data.edges.find(e => e.source === '1' && e.target === '2');
    expect(edge).toBeDefined();
  });

  it('hides orphan nodes when showOrphans is false', () => {
    const configWithoutOrphans = { ...defaultConfig, showOrphans: false };
    const data = buildGraphData(sampleNotes, configWithoutOrphans);

    const orphanNode = data.nodes.find(n => n.id === '3');
    expect(orphanNode).toBeUndefined();
  });

  it('adds missing link nodes when showMissingLinks is true', () => {
    const data = buildGraphData(sampleNotes, defaultConfig);
    const missingNode = data.nodes.find(n => n.id === 'missing:topology');
    expect(missingNode).toBeDefined();
    expect(missingNode?.type).toBe('missing');
  });

  it('creates tag nodes and labelled tag edges when showTags is true', () => {
    const data = buildGraphData(sampleNotes, defaultConfig);

    const tagNode = data.nodes.find(n => n.id === 'tag:math');
    expect(tagNode).toBeDefined();
    expect(tagNode?.type).toBe('tag');
    expect(tagNode?.label).toBe('#math');

    const tagEdge = data.edges.find(e => e.source === '1' && e.target === 'tag:math');
    expect(tagEdge).toBeDefined();
    expect(tagEdge?.label).toBe('tag');
  });

  it('does not create tag nodes when showTags is false', () => {
    const data = buildGraphData(sampleNotes, { ...defaultConfig, showTags: false });

    expect(data.nodes.some(n => n.type === 'tag')).toBe(false);
    expect(data.edges.some(e => e.label === 'tag')).toBe(false);
  });

  it('keeps tags out of orphan detection and note degree', () => {
    const taggedOnly: Note[] = [
      {
        id: 'tagged',
        title: 'Tagged Only',
        content: 'No links here.',
        tags: ['standalone'],
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    const data = buildGraphData(taggedOnly, defaultConfig);
    const noteNode = data.nodes.find(n => n.id === 'tagged');

    expect(noteNode?.isOrphan).toBe(true);
    expect(noteNode?.connectionsCount).toBe(0);
    expect(data.nodes.find(n => n.id === 'tag:standalone')).toBeDefined();
  });

  it('prunes tag nodes that lose their last visible note', () => {
    const orphanWithTag: Note[] = [
      {
        id: 'lonely',
        title: 'Lonely',
        content: 'No links, one tag.',
        tags: ['dangling'],
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    const withOrphans = buildGraphData(orphanWithTag, defaultConfig);
    expect(withOrphans.nodes.find(n => n.id === 'tag:dangling')).toBeDefined();

    const withoutOrphans = buildGraphData(orphanWithTag, { ...defaultConfig, showOrphans: false });
    expect(withoutOrphans.nodes.some(n => n.type === 'tag')).toBe(false);
    expect(withoutOrphans.edges.length).toBe(0);
  });

  it('merges case and whitespace variants of the same tag into one node', () => {
    const mixedTags: Note[] = [
      {
        id: 't1',
        title: 'One',
        content: 'first',
        tags: ['Graph'],
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: 't2',
        title: 'Two',
        content: 'second',
        tags: [' graph '],
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    const data = buildGraphData(mixedTags, defaultConfig);
    const tagNodes = data.nodes.filter(n => n.type === 'tag');

    expect(tagNodes.length).toBe(1);
    expect(tagNodes[0].connectionsCount).toBe(2);
    expect(data.edges.filter(e => e.label === 'tag').length).toBe(2);
  });

  it('ignores self links', () => {
    const selfLink: Note[] = [
      {
        id: 'self',
        title: 'Self Referencing',
        content: 'Points at [[Self Referencing]] and nothing else.',
        tags: [],
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    const data = buildGraphData(selfLink, defaultConfig);
    const noteNode = data.nodes.find(n => n.id === 'self');

    expect(data.edges.length).toBe(0);
    expect(noteNode?.connectionsCount).toBe(0);
    expect(noteNode?.isOrphan).toBe(true);
  });

  it('counts every distinct source of a missing link', () => {
    const missingSources: Note[] = [
      {
        id: 'm1',
        title: 'First',
        content: 'See [[Nowhere]].',
        tags: [],
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: 'm2',
        title: 'Second',
        content: 'Also [[Nowhere]].',
        tags: [],
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: 'm3',
        title: 'Third',
        content: 'And [[nowhere]] once more.',
        tags: [],
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    const data = buildGraphData(missingSources, defaultConfig);
    const missingNode = data.nodes.find(n => n.id === 'missing:nowhere');

    expect(missingNode?.connectionsCount).toBe(3);
    expect(data.edges.filter(e => e.target === 'missing:nowhere').length).toBe(3);
  });
});
