import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Note } from '../core/domain/note';
import { GraphFilterConfig, GraphNode } from '../core/domain/graph';
import { applyConnectionDepth, buildGraphData } from '../core/graph/graphBuilder';
import {
  ALPHA_DECAY,
  ALPHA_MIN,
  seedPosition,
  stepSimulation,
} from '../core/graph/forceSimulation';
import {
  buildSearchIndex,
  rankNotes,
  relatedNotes,
  search,
  tokenize,
} from '../core/search/localSearch';
import { KnowledgeGraphView } from '../features/graph/KnowledgeGraphView';

const config: GraphFilterConfig = {
  showTags: true,
  showOrphans: true,
  showMissingLinks: true,
  searchFilter: '',
  tagFilter: null,
  colorMode: 'type',
  linkDistance: 130,
  repelForce: 450,
  collisionRadius: 28,
};

const note = (id: string, content = '', overrides: Partial<Note> = {}): Note => ({
  id,
  title: id,
  content,
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

/** A chain A -> B -> C -> D -> E, plus an unconnected note. */
const chain = [
  note('A', '[[B]]'),
  note('B', '[[C]]'),
  note('C', '[[D]]'),
  note('D', '[[E]]'),
  note('E'),
  note('Island'),
];

const ids = (notes: Note[], overrides: Partial<GraphFilterConfig>) =>
  buildGraphData(notes, { ...config, ...overrides })
    .nodes.map(n => n.id)
    .sort();

describe('connection depth filter', () => {
  it('shows only nodes within the chosen number of links', () => {
    expect(ids(chain, { focusNodeId: 'C', maxDepth: 1 })).toEqual(['B', 'C', 'D']);
    expect(ids(chain, { focusNodeId: 'C', maxDepth: 2 })).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('follows links in both directions', () => {
    expect(ids(chain, { focusNodeId: 'E', maxDepth: 1 })).toEqual(['D', 'E']);
  });

  it('shows everything when no depth is set', () => {
    expect(ids(chain, { focusNodeId: 'C', maxDepth: null })).toHaveLength(6);
  });

  it('keeps only edges between visible nodes', () => {
    const { edges } = buildGraphData(chain, { ...config, focusNodeId: 'C', maxDepth: 1 });
    expect(edges.map(e => e.id).sort()).toEqual(['B->C', 'C->D']);
  });

  it('includes missing-link nodes as neighbors', () => {
    const notes = [note('A', '[[Ghost]]')];
    expect(ids(notes, { focusNodeId: 'A', maxDepth: 1 })).toEqual(['A', 'missing:ghost']);
  });

  it('leaves the graph unfiltered if the focus note is not in it', () => {
    const data = buildGraphData(chain, config);
    expect(applyConnectionDepth(data, 'nope', 1).nodes).toHaveLength(data.nodes.length);
  });

  it('terminates on cycles', () => {
    const notes = [note('A', '[[B]]'), note('B', '[[C]]'), note('C', '[[A]]')];
    expect(ids(notes, { focusNodeId: 'A', maxDepth: 5 })).toEqual(['A', 'B', 'C']);
  });
});

describe('graph tag behavior', () => {
  it('filters on inline tags as well as assigned ones', () => {
    const notes = [
      note('Inline', 'about #ai'),
      note('Assigned', '', { tags: ['ai'] }),
      note('Other'),
    ];
    expect(ids(notes, { tagFilter: 'ai' })).toEqual(['Assigned', 'Inline']);
  });

  it('counts every link to a missing note', () => {
    const notes = [note('A', '[[Ghost]]'), note('B', '[[Ghost]]')];
    const ghost = buildGraphData(notes, config).nodes.find(n => n.id === 'missing:ghost');
    expect(ghost?.connectionsCount).toBe(2);
  });
});

/** ~Realistic workspace: every note links to a few neighbors and shares a word pool. */
function largeWorkspace(count: number): Note[] {
  const words =
    'graph canvas memory learning network theory design system storage search index plugin'.split(
      ' '
    );
  return Array.from({ length: count }, (_, i) =>
    note(
      `Note ${i}`,
      `${words[i % words.length]} ${words[(i * 7) % words.length]} [[Note ${(i + 1) % count}]] [[Note ${(i * 3) % count}]] [[Missing ${i % 50}]]`,
      {
        tags: [`tag${i % 20}`],
        folder: `Area${i % 10}/Sub${i % 5}`,
      }
    )
  );
}

const measure = (work: () => void) => {
  const start = performance.now();
  work();
  return performance.now() - start;
};

// Budgets are several times what a typical machine needs, so they catch a return to
// quadratic behavior (which misses them by orders of magnitude) without flaking on slow CI.
describe('large workspace performance', () => {
  const notes = largeWorkspace(5000);

  it('builds a 5,000-note graph within budget', () => {
    let nodeCount = 0;
    const elapsed = measure(() => {
      nodeCount = buildGraphData(notes, config).nodes.length;
    });
    expect(nodeCount).toBe(5050);
    expect(elapsed).toBeLessThan(2000);
  });

  it('applies a depth filter to a 5,000-note graph within budget', () => {
    let visible = 0;
    const elapsed = measure(() => {
      visible = buildGraphData(notes, { ...config, focusNodeId: 'Note 0', maxDepth: 2 }).nodes
        .length;
    });
    expect(visible).toBeGreaterThan(1);
    expect(visible).toBeLessThan(500);
    expect(elapsed).toBeLessThan(2000);
  });

  it('computes far fewer distances per node than an all-pairs physics loop', () => {
    const data = buildGraphData(notes, config);
    const nodes: GraphNode[] = data.nodes.map((node, i) => ({
      ...node,
      ...seedPosition(i),
      vx: 0,
      vy: 0,
    }));
    const map = new Map(nodes.map(node => [node.id, node]));
    const params = { repelForce: 450, linkDistance: 130, collisionRadius: 28 };

    // Counted rather than timed: seeding is deterministic, so this gives the same result on any
    // machine, at any load. Each distance takes one sqrt.
    const realSqrt = Math.sqrt;
    let distances = 0;
    Math.sqrt = value => {
      distances++;
      return realSqrt(value);
    };
    try {
      stepSimulation(nodes, data.edges, map, params);
    } finally {
      Math.sqrt = realSqrt;
    }

    // This uses about 60 per node. An all-pairs loop needs about 5,050.
    expect(distances / nodes.length).toBeLessThan(1000);
  });

  it('settles: movement stops so the render loop can sleep', () => {
    const small = largeWorkspace(200);
    const data = buildGraphData(small, config);
    const nodes: GraphNode[] = data.nodes.map((node, i) => ({
      ...node,
      ...seedPosition(i),
      vx: 0,
      vy: 0,
    }));
    const map = new Map(nodes.map(node => [node.id, node]));
    const params = { repelForce: 450, linkDistance: 130, collisionRadius: 28 };

    let alpha = 1;
    let energy = Infinity;
    while (alpha >= ALPHA_MIN) {
      energy = stepSimulation(nodes, data.edges, map, { ...params, alpha });
      alpha *= ALPHA_DECAY;
    }
    // At the end of cooling, nodes move by a tiny fraction of a pixel per frame.
    expect(energy / nodes.length).toBeLessThan(0.05);
    nodes.forEach(node => expect(Number.isFinite(node.x)).toBe(true));
    // The layout actually spread out, rather than collapsing or flying apart.
    const radius = Math.max(...nodes.map(node => Math.hypot(node.x as number, node.y as number)));
    expect(radius).toBeGreaterThan(50);
    expect(radius).toBeLessThan(20000);
  });

  it('indexes and searches 5,000 notes within budget', () => {
    let index = buildSearchIndex([]);
    expect(
      measure(() => {
        index = buildSearchIndex(notes);
      })
    ).toBeLessThan(3000);
    expect(measure(() => search(index, 'graph memory'))).toBeLessThan(500);
  });
});

describe('force simulation', () => {
  const params = { repelForce: 450, linkDistance: 130, collisionRadius: 28 };
  const node = (id: string, x: number, y: number): GraphNode => ({
    id,
    label: id,
    type: 'note',
    tags: [],
    connectionsCount: 0,
    isOrphan: false,
    x,
    y,
    vx: 0,
    vy: 0,
  });

  it('pushes nearby nodes apart', () => {
    const a = node('a', -5, 0);
    const b = node('b', 5, 0);
    stepSimulation(
      [a, b],
      [],
      new Map([
        ['a', a],
        ['b', b],
      ]),
      params
    );
    expect(a.x as number).toBeLessThan(-5);
    expect(b.x as number).toBeGreaterThan(5);
  });

  it('separates nodes at exactly the same position', () => {
    const a = node('a', 0, 0);
    const b = node('b', 0, 0);
    stepSimulation(
      [a, b],
      [],
      new Map([
        ['a', a],
        ['b', b],
      ]),
      params
    );
    expect(a.x).not.toBe(b.x);
  });

  it('applies the collision radius setting', () => {
    const push = (collisionRadius: number) => {
      const a = node('a', -10, 0);
      const b = node('b', 10, 0);
      stepSimulation(
        [a, b],
        [],
        new Map([
          ['a', a],
          ['b', b],
        ]),
        { ...params, collisionRadius }
      );
      return (b.x as number) - 10;
    };
    expect(push(60)).toBeGreaterThan(push(10));
  });

  it('does not move a node the user is holding', () => {
    const a = node('a', 0, 0);
    const b = node('b', 5, 0);
    stepSimulation(
      [a, b],
      [],
      new Map([
        ['a', a],
        ['b', b],
      ]),
      { ...params, pinnedNodeId: 'a' }
    );
    expect(a.x).toBe(0);
  });
});

describe('local search', () => {
  const notes = [
    note('Neural Networks', 'Layers of weights trained with backpropagation.', { tags: ['ai'] }),
    note('Deep Learning', 'Training neural networks with many layers.', { tags: ['ai'] }),
    note('Sourdough', 'Flour, water, salt and a long fermentation.'),
  ];
  const index = buildSearchIndex(notes);

  it('normalizes word forms and drops stop words', () => {
    expect(tokenize('The Networks are training')).toEqual(['network', 'train']);
  });

  it('tokenizes non-Latin text', () => {
    expect(tokenize('日本語 ノート')).toEqual(['日本語', 'ノート']);
  });

  it('ranks the relevant note first', () => {
    expect(search(index, 'fermentation flour')[0].noteId).toBe('Sourdough');
  });

  it('tolerates typos', () => {
    expect(search(index, 'backpropogation')[0].noteId).toBe('Neural Networks');
  });

  it('finds related notes and excludes the note itself', () => {
    const related = relatedNotes(index, 'Neural Networks').map(hit => hit.noteId);
    expect(related[0]).toBe('Deep Learning');
    expect(related).not.toContain('Neural Networks');
    expect(related).not.toContain('Sourdough');
  });

  it('returns nothing for an unrelated query or empty note', () => {
    expect(search(index, 'zzzzqqq')).toEqual([]);
    expect(relatedNotes(buildSearchIndex([note('Empty')]), 'Empty')).toEqual([]);
  });

  it('puts literal matches ahead of similar ones in the palette', () => {
    const results = rankNotes(notes, index, 'training');
    expect(results.map(r => r.isFuzzy)).toEqual([false, true]);
    expect(results[0].note.id).toBe('Deep Learning');
    expect(results[1].note.id).toBe('Neural Networks');
  });
});

describe('KnowledgeGraphView interactions', () => {
  const graphNotes = [note('Alpha', '[[Beta]]'), note('Beta')];

  beforeEach(() => {
    // jsdom has no canvas 2D; the interaction logic under test doesn't need real pixels.
    const context = new Proxy({}, { get: () => () => {}, set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as null);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLCanvasElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setup = () => {
    const onOpenNote = vi.fn();
    render(
      <KnowledgeGraphView
        notes={graphNotes}
        activeNoteId="Alpha"
        onOpenNote={onOpenNote}
        isDarkMode
      />
    );
    const canvas = screen.getByTestId('graph-canvas');
    const zoomText = () => screen.getByText(/^\d+%$/).textContent;
    return { canvas, onOpenNote, zoomText };
  };

  // With a viewport centered at (400, 300), the first seeded node is at this screen position.
  const firstNodeScreen = () => {
    const { x, y } = seedPosition(0);
    return { clientX: 400 + x, clientY: 300 + y };
  };

  it('tapping a node with touch opens its note', () => {
    const { canvas, onOpenNote } = setup();
    const at = firstNodeScreen();
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'touch', ...at });
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'touch', ...at });
    expect(onOpenNote).toHaveBeenCalledWith('Alpha');
  });

  it('dragging a node does not open it', () => {
    const { canvas, onOpenNote } = setup();
    const at = firstNodeScreen();
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'touch', ...at });
    fireEvent.pointerMove(canvas, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: at.clientX + 40,
      clientY: at.clientY,
    });
    fireEvent.pointerUp(canvas, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: at.clientX + 40,
      clientY: at.clientY,
    });
    expect(onOpenNote).not.toHaveBeenCalled();
  });

  it('a canceled touch never opens a note', () => {
    const { canvas, onOpenNote } = setup();
    const at = firstNodeScreen();
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'touch', ...at });
    fireEvent.pointerCancel(canvas, { pointerId: 1, pointerType: 'touch', ...at });
    expect(onOpenNote).not.toHaveBeenCalled();
  });

  it('pinching with two fingers zooms', () => {
    const { canvas, zoomText } = setup();
    expect(zoomText()).toBe('100%');
    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerDown(canvas, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 200,
      clientY: 100,
    });
    fireEvent.pointerMove(canvas, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 300,
      clientY: 100,
    });
    expect(zoomText()).toBe('200%');
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(canvas, { pointerId: 2, pointerType: 'touch' });
  });

  it('the wheel zooms and stops the page from scrolling', () => {
    const { canvas, zoomText } = setup();
    expect(fireEvent.wheel(canvas, { deltaY: -100, clientX: 10, clientY: 10 })).toBe(false);
    expect(zoomText()).toBe('108%');
  });

  it('keyboard: +/- zoom, 0 recenters, brackets and Enter open notes', () => {
    const { canvas, onOpenNote, zoomText } = setup();
    fireEvent.keyDown(canvas, { key: '+' });
    expect(zoomText()).toBe('120%');
    fireEvent.keyDown(canvas, { key: '-' });
    expect(zoomText()).toBe('100%');
    fireEvent.keyDown(canvas, { key: '=' });
    fireEvent.keyDown(canvas, { key: '0' });
    expect(zoomText()).toBe('100%');

    fireEvent.keyDown(canvas, { key: ']' });
    fireEvent.keyDown(canvas, { key: 'Enter' });
    expect(onOpenNote).toHaveBeenCalledWith('Alpha');
    fireEvent.keyDown(canvas, { key: ']' });
    fireEvent.keyDown(canvas, { key: 'Enter' });
    expect(onOpenNote).toHaveBeenLastCalledWith('Beta');
  });

  it('the depth control narrows the graph to the active note', () => {
    render(<KnowledgeGraphView notes={chain} activeNoteId="C" onOpenNote={() => {}} isDarkMode />);
    expect(screen.getByText('Showing 6 of 6 notes & links')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    expect(screen.getByText('Showing 3 of 6 notes & links')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Showing 6 of 6 notes & links')).toBeTruthy();
  });

  it('the focus note can be chosen independently of the active note', () => {
    render(<KnowledgeGraphView notes={chain} activeNoteId="C" onOpenNote={() => {}} isDarkMode />);
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.change(screen.getByLabelText('Focus note'), { target: { value: 'E' } });
    expect(screen.getByText('Showing 2 of 6 notes & links')).toBeTruthy();
  });
});
