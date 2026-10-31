import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CanvasDocument, CanvasElement } from '../core/domain/canvas';
import { Note } from '../core/domain/note';
import {
  contentBounds,
  createBoard,
  duplicateElements,
  elementsInRect,
  moveElements,
  readableTextColor,
  rectFromPoints,
  removeElements,
  syncConnectors,
} from '../core/canvas/canvasOps';
import { canvasExportSize, canvasToSvg } from '../core/canvas/canvasExport';
import { CanvasWorkspace } from '../features/canvas/CanvasWorkspace';
import { BoardTabs } from '../features/canvas/BoardTabs';

const shape = (
  id: string,
  x: number,
  y: number,
  extra: Partial<CanvasElement> = {}
): CanvasElement => ({
  id,
  type: 'rectangle',
  x,
  y,
  width: 100,
  height: 50,
  text: id,
  ...extra,
});

const connector = (id: string, fromId: string, toId: string): CanvasElement => ({
  id,
  type: 'connector',
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  fromId,
  toId,
  fromPoint: { x: 100, y: 25 },
  toPoint: { x: 200, y: 25 },
});

describe('canvas operations', () => {
  it('moves only the given elements and reroutes attached connectors', () => {
    const elements = [shape('a', 0, 0), shape('b', 200, 0), connector('c', 'a', 'b')];
    const moved = moveElements(elements, new Set(['b']), 100, 0);
    expect(moved.find(el => el.id === 'a')?.x).toBe(0);
    expect(moved.find(el => el.id === 'b')?.x).toBe(300);
    expect(moved.find(el => el.id === 'c')?.toPoint).toEqual({ x: 300, y: 25 });
  });

  it('moves a free-standing connector by shifting its endpoints', () => {
    const free: CanvasElement = { ...connector('c', '', ''), fromId: undefined, toId: undefined };
    const [moved] = moveElements([free], new Set(['c']), 10, 20);
    expect(moved.fromPoint).toEqual({ x: 110, y: 45 });
    expect(moved.toPoint).toEqual({ x: 210, y: 45 });
  });

  it('removes connectors attached to deleted shapes', () => {
    const elements = [shape('a', 0, 0), shape('b', 200, 0), connector('c', 'a', 'b')];
    expect(removeElements(elements, new Set(['a'])).map(el => el.id)).toEqual(['b']);
  });

  it('duplicating a group rewires connectors to the copies', () => {
    const elements = [shape('a', 0, 0), shape('b', 200, 0), connector('c', 'a', 'b')];
    const { elements: next, newIds } = duplicateElements(elements, new Set(['a', 'b', 'c']));
    expect(next).toHaveLength(6);
    const clones = next.filter(el => newIds.has(el.id));
    const clonedConnector = clones.find(el => el.type === 'connector') as CanvasElement;
    const cloneIds = new Set(clones.map(el => el.id));
    expect(cloneIds.has(clonedConnector.fromId as string)).toBe(true);
    expect(cloneIds.has(clonedConnector.toId as string)).toBe(true);
  });

  it('duplicating a connector alone detaches it rather than linking the originals', () => {
    const elements = [shape('a', 0, 0), shape('b', 200, 0), connector('c', 'a', 'b')];
    const { elements: next, newIds } = duplicateElements(elements, new Set(['c']));
    const clone = next.find(el => newIds.has(el.id)) as CanvasElement;
    expect(clone.fromId).toBeUndefined();
    expect(clone.toPoint).toEqual({ x: 230, y: 55 });
  });

  it('box-selects only elements fully inside, regardless of drag direction', () => {
    const elements = [shape('in', 10, 10), shape('out', 500, 500), shape('partial', 190, 10)];
    const rect = rectFromPoints({ x: 200, y: 100 }, { x: 0, y: 0 });
    expect(Array.from(elementsInRect(elements, rect))).toEqual(['in']);
  });

  it('keeps coordinates of zero when drawing connectors', () => {
    const synced = syncConnectors([
      shape('a', 0, 0, { width: 0, height: 0 }),
      shape('b', 0, 100, { width: 0, height: 0 }),
      connector('c', 'a', 'b'),
    ]);
    expect(synced[2].fromPoint).toEqual({ x: 0, y: 0 });
  });
});

describe('canvas text color', () => {
  it('picks text that contrasts with the fill', () => {
    expect(readableTextColor('#1e293b', 'x')).toBe('#f8fafc');
    expect(readableTextColor('#fef08a', 'x')).toBe('#0f172a');
    expect(readableTextColor('#ffffff', 'x')).toBe('#0f172a');
  });

  it('falls back to the board color for transparent shapes', () => {
    expect(readableTextColor('transparent', 'board')).toBe('board');
    expect(readableTextColor(undefined, 'board')).toBe('board');
  });
});

describe('canvas export', () => {
  const doc = (elements: CanvasElement[]): CanvasDocument => ({
    ...createBoard('Board <1>'),
    elements,
  });

  it('covers the whole board, not just the current viewport', () => {
    const svg = canvasToSvg(doc([shape('a', 1000, 2000)]), true);
    const bounds = contentBounds([shape('a', 1000, 2000)], 40);
    expect(svg).toContain(`viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}"`);
  });

  it('is a well-formed standalone SVG with no app classes or embedded HTML', () => {
    const svg = canvasToSvg(
      doc([shape('a', 0, 0, { text: 'A & B <c>' }), shape('b', 300, 0), connector('c', 'a', 'b')]),
      false
    );
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(parsed.querySelector('parsererror')).toBeNull();
    expect(svg).not.toContain('foreignObject');
    expect(svg).not.toContain('class=');
    expect(parsed.querySelector('text')?.textContent).toBe('A & B <c>');
    expect(parsed.querySelector('title')?.textContent).toBe('Board <1>');
  });

  it('exports an empty board without failing', () => {
    expect(canvasExportSize(doc([])).width).toBeGreaterThan(0);
    expect(canvasToSvg(doc([]), true)).toContain('<svg');
  });
});

const Harness: React.FC<{
  initial: CanvasElement[];
  notes?: Note[];
  onOpenNote?: (id: string) => void;
  onUpdate?: (doc: CanvasDocument) => void;
}> = ({ initial, notes = [], onOpenNote = () => {}, onUpdate }) => {
  const [doc, setDoc] = useState<CanvasDocument>({
    ...createBoard('Test'),
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: initial,
  });
  return (
    <CanvasWorkspace
      canvasDoc={doc}
      onUpdateCanvas={updated => {
        setDoc(updated);
        onUpdate?.(updated);
      }}
      notes={notes}
      onOpenNote={onOpenNote}
      isDarkMode
      onExportError={() => {}}
    />
  );
};

const elementNode = (id: string) => document.querySelector(`[data-element-id="${id}"]`) as Element;
const isSelected = (id: string) => elementNode(id).getAttribute('data-selected') === 'true';
const elementX = (id: string) =>
  /translate\((-?[\d.]+)/.exec(elementNode(id).getAttribute('transform') as string)?.[1];
const key = (init: KeyboardEventInit) => fireEvent.keyDown(window, init);

const down = (target: Element, x: number, y: number, init: PointerEventInit = {}) =>
  fireEvent.pointerDown(target, {
    pointerId: 1,
    pointerType: 'mouse',
    clientX: x,
    clientY: y,
    ...init,
  });
const moveTo = (x: number, y: number, init: PointerEventInit = {}) =>
  fireEvent.pointerMove(window, {
    pointerId: 1,
    pointerType: 'mouse',
    clientX: x,
    clientY: y,
    ...init,
  });
const up = (x: number, y: number, init: PointerEventInit = {}) =>
  fireEvent.pointerUp(window, {
    pointerId: 1,
    pointerType: 'mouse',
    clientX: x,
    clientY: y,
    ...init,
  });

const drag = (target: Element, fromX: number, toX: number, init: PointerEventInit = {}) => {
  down(target, fromX, 0, init);
  moveTo(toX, 0, init);
  up(toX, 0, init);
};

const tap = (target: Element, init: PointerEventInit = {}) => {
  down(target, 10, 10, init);
  up(10, 10, init);
};

describe('canvas keyboard interactions', () => {
  it('Tab cycles through shapes while the board has focus', () => {
    render(<Harness initial={[shape('a', 0, 0), shape('b', 200, 0)]} />);
    act(() => screen.getByTestId('canvas-workspace').focus());
    key({ key: 'Tab' });
    expect(isSelected('a')).toBe(true);
    key({ key: 'Tab' });
    expect(isSelected('b')).toBe(true);
    key({ key: 'Tab', shiftKey: true });
    expect(isSelected('a')).toBe(true);
  });

  it('Ctrl+A selects all, Delete removes them, and Ctrl+Z restores them', () => {
    render(<Harness initial={[shape('a', 0, 0), shape('b', 200, 0)]} />);
    key({ key: 'a', ctrlKey: true });
    expect(isSelected('a') && isSelected('b')).toBe(true);
    expect(screen.getByText('2 selected')).toBeTruthy();

    key({ key: 'Delete' });
    expect(elementNode('a')).toBeNull();

    key({ key: 'z', ctrlKey: true });
    expect(elementNode('a')).not.toBeNull();
    key({ key: 'y', ctrlKey: true });
    expect(elementNode('a')).toBeNull();
    key({ key: 'z', metaKey: true });
    key({ key: 'z', metaKey: true, shiftKey: true });
    expect(elementNode('a')).toBeNull();
  });

  it('arrow keys nudge the selection, and Shift moves further', () => {
    render(<Harness initial={[shape('a', 0, 0)]} />);
    tap(elementNode('a'));
    key({ key: 'ArrowRight' });
    expect(elementX('a')).toBe('1');
    key({ key: 'ArrowRight', shiftKey: true });
    expect(elementX('a')).toBe('11');
    key({ key: 'ArrowLeft' });
    expect(elementX('a')).toBe('10');
  });

  it('Ctrl+D duplicates and selects the copies', () => {
    render(<Harness initial={[shape('a', 0, 0)]} />);
    tap(elementNode('a'));
    key({ key: 'd', ctrlKey: true });
    expect(isSelected('a')).toBe(false);
    expect(document.querySelectorAll('[data-element-id]')).toHaveLength(2);
  });

  it('Enter edits text, and Escape leaves editing without deleting anything', () => {
    render(<Harness initial={[shape('a', 0, 0)]} />);
    tap(elementNode('a'));
    key({ key: 'Enter' });
    const editor = screen.getByLabelText('Element text') as HTMLTextAreaElement;
    expect(editor.value).toBe('a');

    // Editing keys belong to the text field, not to canvas commands.
    fireEvent.keyDown(editor, { key: 'Delete' });
    fireEvent.keyDown(editor, { key: 'Backspace' });
    fireEvent.keyDown(editor, { key: 'a', ctrlKey: true });
    expect(elementNode('a')).not.toBeNull();

    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(screen.queryByLabelText('Element text')).toBeNull();
  });

  it('Escape clears the selection and cancels connect mode; V returns to select', () => {
    render(<Harness initial={[shape('a', 0, 0)]} />);
    fireEvent.click(screen.getByText('Auto-Connect'));
    expect(screen.getByText(/Click first shape/)).toBeTruthy();
    key({ key: 'Escape' });
    expect(screen.queryByText(/Click first shape/)).toBeNull();

    fireEvent.click(screen.getByText('Auto-Connect'));
    key({ key: 'v' });
    expect(screen.queryByText(/Click first shape/)).toBeNull();
  });

  it('picking the select tool leaves connect mode', () => {
    render(<Harness initial={[shape('a', 0, 0)]} />);
    fireEvent.click(screen.getByText('Auto-Connect'));
    fireEvent.click(screen.getByTitle('Select & Move (V)'));
    expect(screen.queryByText(/Click first shape/)).toBeNull();
  });
});

describe('canvas pointer interactions', () => {
  it('dragging a shape moves it and adds exactly one undo step', () => {
    const onUpdate = vi.fn();
    render(<Harness initial={[shape('a', 0, 0)]} onUpdate={onUpdate} />);
    drag(elementNode('a'), 0, 50);
    expect(elementX('a')).toBe('50');

    key({ key: 'z', ctrlKey: true });
    expect(elementX('a')).toBe('0');
    expect((screen.getByTitle('Undo (Ctrl+Z)') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a click without movement adds no undo step', () => {
    render(<Harness initial={[shape('a', 0, 0)]} />);
    tap(elementNode('a'));
    expect((screen.getByTitle('Undo (Ctrl+Z)') as HTMLButtonElement).disabled).toBe(true);
  });

  it('dragging a member of a selection moves the whole group', () => {
    render(<Harness initial={[shape('a', 0, 0), shape('b', 200, 0), shape('c', 400, 0)]} />);
    key({ key: 'a', ctrlKey: true });
    drag(elementNode('b'), 0, 30);
    expect([elementX('a'), elementX('b'), elementX('c')]).toEqual(['30', '230', '430']);
  });

  it('Shift+click adds to and removes from the selection', () => {
    render(<Harness initial={[shape('a', 0, 0), shape('b', 200, 0)]} />);
    tap(elementNode('a'));
    tap(elementNode('b'), { shiftKey: true });
    expect(isSelected('a') && isSelected('b')).toBe(true);
    tap(elementNode('b'), { shiftKey: true });
    expect(isSelected('b')).toBe(false);
  });

  it('Shift+drag on the background box-selects', () => {
    render(<Harness initial={[shape('a', 10, 10), shape('b', 500, 500)]} />);
    const bg = screen.getByTestId('canvas-bg');
    down(bg, 0, 0, { shiftKey: true });
    moveTo(200, 200, { shiftKey: true });
    expect(screen.getByTestId('canvas-marquee')).toBeTruthy();
    up(200, 200);
    expect(screen.queryByTestId('canvas-marquee')).toBeNull();
    expect(isSelected('a')).toBe(true);
    expect(isSelected('b')).toBe(false);
  });

  it('a drag that ends outside the board still finishes', () => {
    render(<Harness initial={[shape('a', 0, 0)]} />);
    down(elementNode('a'), 0, 0);
    moveTo(5000, 0);
    up(5000, 0);
    moveTo(9000, 0); // No button held: must not keep dragging.
    expect(elementX('a')).toBe('5000');
  });

  it('wheel zooms and stops the page scrolling', () => {
    render(<Harness initial={[]} />);
    expect(
      fireEvent.wheel(document.getElementById('notemesh-canvas-svg') as Element, { deltaY: -100 })
    ).toBe(false);
    expect(screen.getByTestId('canvas-zoom').textContent).not.toBe('100%');
  });
});

describe('canvas touch interactions', () => {
  const touch = { pointerType: 'touch' };

  it('one finger drags a shape', () => {
    render(<Harness initial={[shape('a', 0, 0)]} />);
    drag(elementNode('a'), 0, 40, touch);
    expect(elementX('a')).toBe('40');
  });

  it('one finger on the background pans', () => {
    render(<Harness initial={[]} />);
    const bg = screen.getByTestId('canvas-bg');
    down(bg, 0, 0, touch);
    moveTo(60, 20, touch);
    up(60, 20, touch);
    expect(screen.getByTestId('canvas-viewport').getAttribute('transform')).toContain(
      'translate(60, 20)'
    );
  });

  it('the board disables native touch gestures so they reach the app', () => {
    render(<Harness initial={[]} />);
    expect(
      (document.getElementById('notemesh-canvas-svg') as unknown as HTMLElement).style.touchAction
    ).toBe('none');
  });

  it('two fingers pinch-zoom, and a shape under the first finger stays put', () => {
    render(<Harness initial={[shape('a', 0, 0)]} />);
    const bg = screen.getByTestId('canvas-bg');
    fireEvent.pointerDown(elementNode('a'), { pointerId: 1, clientX: 0, clientY: 0, ...touch });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 20, clientY: 0, ...touch });
    expect(elementX('a')).toBe('20');

    fireEvent.pointerDown(bg, { pointerId: 2, clientX: 120, clientY: 0, ...touch });
    expect(elementX('a')).toBe('0');

    fireEvent.pointerMove(window, { pointerId: 2, clientX: 220, clientY: 0, ...touch });
    expect(screen.getByTestId('canvas-zoom').textContent).toBe('200%');
    expect(elementX('a')).toBe('0');

    fireEvent.pointerUp(window, { pointerId: 1, ...touch });
    fireEvent.pointerUp(window, { pointerId: 2, ...touch });
    expect((screen.getByTitle('Undo (Ctrl+Z)') as HTMLButtonElement).disabled).toBe(true);
  });

  it('double-tap edits text', () => {
    render(<Harness initial={[shape('a', 0, 0)]} />);
    tap(elementNode('a'), touch);
    tap(elementNode('a'), touch);
    expect(screen.getByLabelText('Element text')).toBeTruthy();
  });

  it('two slow taps do not start editing', () => {
    const now = vi.spyOn(Date, 'now');
    render(<Harness initial={[shape('a', 0, 0)]} />);
    now.mockReturnValue(1000);
    tap(elementNode('a'), touch);
    now.mockReturnValue(2000);
    tap(elementNode('a'), touch);
    expect(screen.queryByLabelText('Element text')).toBeNull();
    now.mockRestore();
  });

  it('the box-select tool gives touch users multi-select without a Shift key', () => {
    render(<Harness initial={[shape('a', 10, 10), shape('b', 300, 10), shape('c', 600, 600)]} />);
    fireEvent.click(screen.getByTitle(/Box Select/));

    const bg = screen.getByTestId('canvas-bg');
    down(bg, 0, 0, touch);
    moveTo(120, 120, touch);
    up(120, 120, touch);
    expect(isSelected('a')).toBe(true);

    tap(elementNode('b'), touch);
    expect(isSelected('a') && isSelected('b')).toBe(true);
    tap(elementNode('a'), touch);
    expect(isSelected('a')).toBe(false);
  });

  it('a canceled touch puts a dragged shape back', () => {
    render(<Harness initial={[shape('a', 0, 0)]} />);
    down(elementNode('a'), 0, 0, touch);
    moveTo(100, 0, touch);
    fireEvent.pointerCancel(window, { pointerId: 1, ...touch });
    expect(elementX('a')).toBe('0');
  });

  it('tapping Open Note on a card opens the note and does not start a drag', () => {
    const onOpenNote = vi.fn();
    const linked: Note = {
      id: 'n1',
      title: 'Linked',
      content: '',
      tags: [],
      createdAt: 0,
      updatedAt: 0,
    };
    render(
      <Harness
        initial={[
          shape('card', 0, 0, {
            type: 'note-card',
            linkedNoteId: 'n1',
            linkedNoteTitle: 'Old title',
          }),
        ]}
        notes={[linked]}
        onOpenNote={onOpenNote}
      />
    );
    const button = screen.getByText('Open Note').closest('button') as HTMLElement;
    down(button, 0, 0, touch);
    moveTo(100, 0, touch);
    up(100, 0, touch);
    fireEvent.click(button);
    expect(onOpenNote).toHaveBeenCalledWith('n1');
    expect(elementX('card')).toBe('0');
  });
});

describe('note cards', () => {
  it('show the note title as it is now, not as it was when placed', () => {
    const linked: Note = {
      id: 'n1',
      title: 'Renamed',
      content: '',
      tags: [],
      createdAt: 0,
      updatedAt: 0,
    };
    render(
      <Harness
        initial={[
          shape('card', 0, 0, { type: 'note-card', linkedNoteId: 'n1', linkedNoteTitle: 'Old' }),
        ]}
        notes={[linked]}
      />
    );
    expect(elementNode('card').textContent).toContain('Renamed');
    expect(elementNode('card').textContent).not.toContain('Old');
  });

  it('mark a deleted note and offer no way to open it', () => {
    render(
      <Harness
        initial={[
          shape('card', 0, 0, { type: 'note-card', linkedNoteId: 'gone', linkedNoteTitle: 'Old' }),
        ]}
      />
    );
    expect(elementNode('card').textContent).toContain('Old (deleted)');
    expect(screen.queryByText('Open Note')).toBeNull();
  });
});

describe('BoardTabs', () => {
  const boards = [createBoard('First'), createBoard('Second')];
  const setup = (list = boards, activeBoardId = boards[0].id) => {
    const handlers = { onSelect: vi.fn(), onCreate: vi.fn(), onRename: vi.fn(), onDelete: vi.fn() };
    render(<BoardTabs boards={list} activeBoardId={activeBoardId} {...handlers} />);
    return handlers;
  };

  it('switches boards', () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Second' }));
    expect(onSelect).toHaveBeenCalledWith(boards[1].id);
    expect(screen.getByRole('tab', { name: 'First' }).getAttribute('aria-selected')).toBe('true');
  });

  it('creates boards', () => {
    const { onCreate } = setup();
    fireEvent.click(screen.getByText('New board'));
    expect(onCreate).toHaveBeenCalled();
  });

  it('renames with the keyboard, and Escape cancels', () => {
    const { onRename } = setup();
    fireEvent.click(screen.getByLabelText('Rename board First'));
    const input = screen.getByLabelText('Board name');
    fireEvent.change(input, { target: { value: '  Roadmap ' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onRename).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Rename board First'));
    fireEvent.change(screen.getByLabelText('Board name'), { target: { value: '  Roadmap ' } });
    fireEvent.keyDown(screen.getByLabelText('Board name'), { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith(boards[0].id, 'Roadmap');
  });

  it('ignores a blank rename', () => {
    const { onRename } = setup();
    fireEvent.click(screen.getByLabelText('Rename board First'));
    fireEvent.change(screen.getByLabelText('Board name'), { target: { value: '   ' } });
    fireEvent.keyDown(screen.getByLabelText('Board name'), { key: 'Enter' });
    expect(onRename).not.toHaveBeenCalled();
  });

  it('deletes boards, but never the last one', () => {
    const { onDelete } = setup();
    fireEvent.click(screen.getByLabelText('Delete board First'));
    expect(onDelete).toHaveBeenCalledWith(boards[0].id);
  });

  it('disables delete with a single board', () => {
    setup([boards[0]]);
    expect((screen.getByLabelText('Delete board First') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('fake timer safety', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces viewport saves during wheel zoom', () => {
    const onUpdate = vi.fn();
    render(<Harness initial={[]} onUpdate={onUpdate} />);
    const svg = document.getElementById('notemesh-canvas-svg') as Element;
    for (let i = 0; i < 10; i++) fireEvent.wheel(svg, { deltaY: -10 });
    expect(onUpdate).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].viewport.zoom).toBeGreaterThan(1);
  });
});
