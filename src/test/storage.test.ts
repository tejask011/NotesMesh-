import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageAdapter } from '../core/storage/localStorageAdapter';
import { SAMPLE_NOTES } from '../core/storage/sampleData';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const validNote = (overrides: Record<string, unknown> = {}) => ({
  id: 'note-alpha',
  title: 'Alpha',
  content: 'Some content with [[Beta]].',
  folder: 'Research',
  tags: ['research', 'draft'],
  createdAt: 1000,
  updatedAt: 2000,
  ...overrides,
});

const validCanvas = (overrides: Record<string, unknown> = {}) => ({
  id: 'canvas-alpha',
  title: 'Architecture Board',
  gridEnabled: true,
  viewport: { x: 20, y: 30, zoom: 1.2 },
  elements: [
    { id: 'el-1', type: 'rectangle', x: 10, y: 20, width: 160, height: 80 },
  ],
  createdAt: 1000,
  updatedAt: 2000,
  ...overrides,
});

let memory: MemoryStorage;
let adapter: LocalStorageAdapter;

beforeEach(() => {
  memory = new MemoryStorage();
  vi.stubGlobal('localStorage', memory);
  vi.stubGlobal('window', { localStorage: memory });
  adapter = new LocalStorageAdapter();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Workspace storage import', () => {
  it('imports a well formed backup and keeps the normalised fields', async () => {
    const raw = JSON.stringify({
      version: '4.0.0',
      exportedAt: '2026-10-19T00:00:00.000Z',
      notes: [validNote()],
      canvases: [validCanvas()],
    });

    expect(await adapter.importAll(raw)).toBe(true);

    const notes = await adapter.getNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe('Alpha');
    expect(notes[0].folder).toBe('Research');

    const canvases = await adapter.getCanvases();
    expect(canvases).toHaveLength(1);
    expect(canvases[0].elements).toHaveLength(1);
    expect(canvases[0].viewport.zoom).toBe(1.2);
  });

  it('rejects a file that is not a workspace backup and leaves data alone', async () => {
    await adapter.importAll(JSON.stringify({ notes: [validNote()], canvases: [validCanvas()] }));

    expect(await adapter.importAll('this is not json')).toBe(false);
    expect(await adapter.importAll(JSON.stringify({ hello: 'world' }))).toBe(false);

    expect(await adapter.getNotes()).toHaveLength(1);
    expect(await adapter.getCanvases()).toHaveLength(1);
  });

  it('skips malformed entries while keeping the usable ones', async () => {
    const raw = JSON.stringify({
      notes: [validNote(), { title: 'Missing id' }, null, 42],
      canvases: [validCanvas(), { title: 'Missing id' }],
    });

    expect(await adapter.importAll(raw)).toBe(true);
    expect(await adapter.getNotes()).toHaveLength(1);
    expect(await adapter.getCanvases()).toHaveLength(1);
  });

  it('fails without clearing the workspace when every entry is malformed', async () => {
    await adapter.importAll(JSON.stringify({ notes: [validNote()] }));

    const raw = JSON.stringify({ notes: [{ title: 'No id here' }, { id: 7 }] });
    expect(await adapter.importAll(raw)).toBe(false);

    const notes = await adapter.getNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe('note-alpha');
  });

  it('keeps canvases when the backup only contains notes', async () => {
    await adapter.importAll(JSON.stringify({ canvases: [validCanvas()] }));
    await adapter.importAll(JSON.stringify({ notes: [validNote()] }));

    const canvases = await adapter.getCanvases();
    expect(canvases).toHaveLength(1);
    expect(canvases[0].id).toBe('canvas-alpha');
  });

  it('fills safe defaults for missing scalar fields', async () => {
    expect(await adapter.importAll(JSON.stringify({ notes: [{ id: 'note-bare' }] }))).toBe(true);

    const notes = await adapter.getNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe('Untitled Note');
    expect(notes[0].content).toBe('');
    expect(notes[0].folder).toBe('General');
    expect(notes[0].tags).toEqual([]);
  });

  it('treats empty arrays as an intentional clear', async () => {
    await adapter.importAll(JSON.stringify({ notes: [validNote()], canvases: [validCanvas()] }));
    expect(await adapter.importAll(JSON.stringify({ notes: [], canvases: [] }))).toBe(true);

    expect(await adapter.getNotes()).toHaveLength(0);
    expect(await adapter.getCanvases()).toHaveLength(0);
  });
});

describe('Workspace storage reads', () => {
  it('falls back to the sample workspace when stored notes are not an array', async () => {
    memory.setItem('notemesh_notes_v4', JSON.stringify({ not: 'an array' }));

    const notes = await adapter.getNotes();
    expect(notes).toHaveLength(SAMPLE_NOTES.length);
  });

  it('drops malformed stored notes instead of passing them to the UI', async () => {
    memory.setItem(
      'notemesh_notes_v4',
      JSON.stringify([validNote(), { title: 'no id' }, 'string entry'])
    );

    const notes = await adapter.getNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe('note-alpha');
  });

  it('drops malformed stored canvases instead of passing them to the canvas view', async () => {
    memory.setItem(
      'notemesh_canvases_v4',
      JSON.stringify([validCanvas(), { elements: 'not an array' }])
    );

    const canvases = await adapter.getCanvases();
    expect(canvases).toHaveLength(1);
    expect(canvases[0].id).toBe('canvas-alpha');
  });
});
