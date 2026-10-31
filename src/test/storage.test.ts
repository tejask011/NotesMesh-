import { describe, it, expect, vi } from 'vitest';
import { CanvasDocument } from '../core/domain/canvas';
import { Note } from '../core/domain/note';
import { IndexedDbBackend } from '../core/storage/indexedDbAdapter';
import { LocalStorageBackend, WORKSPACE_KEY } from '../core/storage/localStorageAdapter';
import { parseBackup, serializeBackup } from '../core/storage/migrations';
import { CURRENT_SCHEMA_VERSION, validateWorkspace } from '../core/storage/schema';
import { StorageBackend } from '../core/storage/storageInterface';
import { WorkspaceStorage } from '../core/storage/workspaceStorage';

let dbCounter = 0;

const openIdb = () => IndexedDbBackend.open(indexedDB, `test-db-${++dbCounter}`);

const note = (overrides: Partial<Note> = {}): Note => ({
  id: 'note-1',
  title: 'A note',
  content: 'Body',
  tags: [],
  folder: 'General',
  createdAt: 1000,
  updatedAt: 2000,
  ...overrides,
});

const canvas = (overrides: Partial<CanvasDocument> = {}): CanvasDocument => ({
  id: 'canvas-1',
  title: 'Board',
  elements: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  gridEnabled: true,
  createdAt: 1000,
  updatedAt: 2000,
  ...overrides,
});

// Text the old save path corrupted: emoji, ZWJ sequences, Devanagari conjuncts, dingbats, Windows newlines.
const TRICKY_TEXT =
  'Launch 🚀 👩‍💻\nक्‍ष र्‍य\n✓ done © 2026\r\nLine with\ttab and "quotes" <b>&</b>';

const backends: [string, () => Promise<StorageBackend>][] = [
  ['IndexedDB', openIdb],
  ['localStorage', async () => new LocalStorageBackend()],
];

const openStorage = async (createBackend: () => Promise<StorageBackend>) => {
  const storage = new WorkspaceStorage(createBackend);
  const result = await storage.open();
  return { storage, result };
};

describe.each(backends)('workspace storage on %s', (_name, createBackend) => {
  it('seeds the sample workspace only on first run', async () => {
    const backend = await createBackend();
    const first = await openStorage(async () => backend);
    expect(first.result.status).toBe('fresh');
    expect(first.result.notes.length).toBeGreaterThan(0);

    await first.storage.deleteNote(first.result.notes[0].id);
    const second = await openStorage(async () => backend);
    expect(second.result.status).toBe('ok');
    expect(second.result.notes).toHaveLength(first.result.notes.length - 1);
  });

  it('saves note text exactly as written', async () => {
    const backend = await createBackend();
    const { storage } = await openStorage(async () => backend);
    await storage.saveNote(note({ title: 'Title 🚀', content: TRICKY_TEXT }));

    const saved = (await storage.getNotes()).find(n => n.id === 'note-1');
    expect(saved?.content).toBe(TRICKY_TEXT);
    expect(saved?.title).toBe('Title 🚀');
  });

  it('does not rewrite timestamps on save', async () => {
    const backend = await createBackend();
    const { storage } = await openStorage(async () => backend);
    await storage.saveNote(note({ createdAt: 111, updatedAt: 222 }));

    const saved = (await storage.getNotes()).find(n => n.id === 'note-1');
    expect(saved?.createdAt).toBe(111);
    expect(saved?.updatedAt).toBe(222);
  });

  it('survives an export and restore round trip with nothing changed', async () => {
    const source = await openStorage(createBackend);
    await source.storage.replaceWorkspace(
      {
        notes: [
          note({
            content: TRICKY_TEXT,
            tags: ['a', 'b/c'],
            isPinned: true,
            linkedNoteIds: ['note-2'],
            folder: 'A/B',
          }),
          note({ id: 'note-2', title: '', content: '' }),
        ],
        canvases: [
          canvas({
            viewport: { x: 12.5, y: -3, zoom: 0.75 },
            elements: [
              { id: 'el-1', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, text: 'Hi 🚀' },
              {
                id: 'el-2',
                type: 'connector',
                x: 0,
                y: 0,
                width: 1,
                height: 1,
                fromId: 'el-1',
                toId: 'el-1',
                fromPoint: { x: 0, y: 0 },
                toPoint: { x: 5, y: 5 },
              },
            ],
          }),
        ],
      },
      'test'
    );

    const exported = await source.storage.exportAll();

    const target = await openStorage(createBackend);
    const result = await target.storage.importAll(exported);
    expect(result.ok).toBe(true);

    const byId = <T extends { id: string }>(records: T[]) =>
      [...records].sort((a, b) => a.id.localeCompare(b.id));
    const original = JSON.parse(exported);
    const reexported = JSON.parse(await target.storage.exportAll());
    expect(byId(reexported.notes)).toEqual(byId(original.notes));
    expect(byId(reexported.canvases)).toEqual(byId(original.canvases));
    expect(reexported.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('rejects an invalid backup without touching existing data', async () => {
    const { storage } = await openStorage(createBackend);
    await storage.saveNote(note());
    const before = await storage.exportAll();

    const results = await Promise.all([
      storage.importAll('not json at all'),
      storage.importAll('{"notes": "nope", "canvases": []}'),
      storage.importAll(JSON.stringify({ notes: [{ id: 'x' }], canvases: [] })),
      storage.importAll(JSON.stringify({ notes: [] })),
    ]);
    results.forEach(result => expect(result.ok).toBe(false));

    expect(JSON.parse(await storage.exportAll()).notes).toEqual(JSON.parse(before).notes);
  });

  it('snapshots the current workspace before a restore so it can be undone', async () => {
    const { storage } = await openStorage(createBackend);
    await storage.replaceWorkspace(
      { notes: [note({ title: 'Original' })], canvases: [canvas()] },
      'setup'
    );

    await storage.importAll(
      serializeBackup({ notes: [note({ title: 'Replacement' })], canvases: [canvas()] })
    );
    expect((await storage.getNotes())[0].title).toBe('Replacement');

    const snapshot = (await storage.listSnapshots()).find(
      s => s.reason === 'Before restoring a backup'
    );
    expect(snapshot).toBeDefined();
    const restored = await storage.restoreSnapshot(snapshot!.id);
    expect(restored.ok).toBe(true);
    expect((await storage.getNotes())[0].title).toBe('Original');
  });

  it('keeps a bounded number of automatic snapshots', async () => {
    const backend = await createBackend();
    const storage = new WorkspaceStorage(async () => backend);
    await storage.open();
    for (let i = 0; i < 8; i++) {
      await storage.replaceWorkspace(
        { notes: [note({ title: `v${i}` })], canvases: [] },
        `step ${i}`
      );
    }
    const snapshots = (await storage.listSnapshots()).filter(s => s.kind === 'workspace');
    expect(snapshots.length).toBeLessThanOrEqual(backend.maxWorkspaceSnapshots);
  });

  it('refuses a workspace written by a newer app version, and locks saving', async () => {
    const backend = await createBackend();
    await backend.replaceAll({ notes: [note()], canvases: [] }, CURRENT_SCHEMA_VERSION + 1);

    const { storage, result } = await openStorage(async () => backend);
    expect(result.status).toBe('newer-version');
    expect(storage.isLocked()).toBe(true);
    await expect(storage.saveNote(note({ id: 'new' }))).rejects.toThrow(/paused/);
  });

  it('sets damaged records aside and loads everything else', async () => {
    const backend = await createBackend();
    await backend.replaceAll(
      { notes: [note(), note({ id: 'note-2' })], canvases: [canvas()] },
      CURRENT_SCHEMA_VERSION
    );
    await backend.putNote({ id: 'broken', title: 42 } as unknown as Note);

    const { storage, result } = await openStorage(async () => backend);
    expect(result.status).toBe('salvaged');
    expect(result.quarantined).toBe(1);
    expect(result.notes.map(n => n.id).sort()).toEqual(['note-1', 'note-2']);

    const quarantine = (await storage.listSnapshots()).find(s => s.kind === 'quarantine');
    expect(await storage.getSnapshotPayload(quarantine!.id)).toContain('broken');

    // The damaged record is out of the way, so it doesn't warn on every launch.
    expect((await openStorage(async () => backend)).result.status).toBe('ok');
  });
});

describe('recovery from corrupted localStorage', () => {
  it('never replaces an unreadable workspace with sample data', async () => {
    localStorage.setItem(WORKSPACE_KEY, '{"notes": [truncated');

    const { storage, result } = await openStorage(async () => new LocalStorageBackend());
    expect(result.status).toBe('corrupted');
    expect(result.notes).toEqual([]);
    expect(storage.isLocked()).toBe(true);
    await expect(storage.saveNote(note())).rejects.toThrow(/paused/);

    // The original bytes are untouched and downloadable.
    expect(localStorage.getItem(WORKSPACE_KEY)).toBe('{"notes": [truncated');
    const quarantine = (await storage.listSnapshots()).find(s => s.kind === 'quarantine');
    expect(await storage.getSnapshotPayload(quarantine!.id)).toBe('{"notes": [truncated');
  });

  it('unlocks once the user restores a backup', async () => {
    localStorage.setItem(WORKSPACE_KEY, 'garbage');
    const { storage } = await openStorage(async () => new LocalStorageBackend());

    const result = await storage.importAll(
      serializeBackup({ notes: [note()], canvases: [canvas()] })
    );
    expect(result.ok).toBe(true);
    expect(storage.isLocked()).toBe(false);
    await storage.saveNote(note({ title: 'Works again' }));
    expect((await storage.getNotes())[0].title).toBe('Works again');
  });
});

describe('migration from older versions', () => {
  const legacyNote = {
    id: 'old',
    title: 'Old 🚀',
    content: 'Kept',
    tags: ['t', 't'],
    createdAt: 5,
    updatedAt: 6,
  };

  it('moves v4 localStorage data into IndexedDB and normalizes it', async () => {
    localStorage.setItem('notemesh_notes_v4', JSON.stringify([legacyNote]));
    localStorage.setItem('notemesh_canvases_v4', JSON.stringify([canvas({ id: 'c' })]));

    const { storage, result } = await openStorage(openIdb);
    expect(result.status).toBe('migrated');
    expect(result.notes[0]).toMatchObject({
      id: 'old',
      title: 'Old 🚀',
      folder: 'General',
      tags: ['t'],
    });
    expect(result.canvases[0].id).toBe('c');

    // Old keys are cleared only after the data is verified, and a copy of the original is kept.
    expect(localStorage.getItem('notemesh_notes_v4')).toBeNull();
    const original = (await storage.listSnapshots()).find(
      s => s.reason === 'Original data before upgrade'
    );
    expect(await storage.getSnapshotPayload(original!.id)).toContain('Old 🚀');
  });

  it('recovers data from v1 keys that older builds would have deleted', async () => {
    localStorage.setItem('notemesh_notes_v1', JSON.stringify([legacyNote]));
    const { result } = await openStorage(openIdb);
    expect(result.status).toBe('migrated');
    expect(result.notes.map(n => n.id)).toEqual(['old']);
  });

  it('quarantines damaged legacy records rather than inventing their missing fields', async () => {
    localStorage.setItem(
      'notemesh_notes_v4',
      JSON.stringify([legacyNote, { id: 'no-content', title: 'x' }])
    );
    const { storage, result } = await openStorage(openIdb);
    expect(result.status).toBe('salvaged');
    expect(result.notes.map(n => n.id)).toEqual(['old']);
    const damaged = (await storage.listSnapshots()).find(s => s.reason === '1 damaged record(s)');
    expect(await storage.getSnapshotPayload(damaged!.id)).toContain('no-content');
  });

  it('locks instead of seeding when the legacy data is unreadable', async () => {
    localStorage.setItem('notemesh_notes_v4', '[{"id": "cut off');
    const { storage, result } = await openStorage(openIdb);
    expect(result.status).toBe('corrupted');
    expect(storage.isLocked()).toBe(true);
    expect(localStorage.getItem('notemesh_notes_v4')).toBe('[{"id": "cut off');
  });

  it('reads backups in the old unversioned-format', () => {
    const parsed = parseBackup(
      JSON.stringify({ version: '4.0.0', exportedAt: 'x', notes: [legacyNote], canvases: [] })
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.info.sourceVersion).toBe(4);
      expect(parsed.info.migrated).toBe(true);
      expect(parsed.data.notes[0].folder).toBe('General');
    }
  });

  it('normalizes messy folder paths during migration', () => {
    const parsed = parseBackup(
      JSON.stringify({ notes: [{ ...legacyNote, folder: ' /A//B/ ' }], canvases: [] })
    );
    expect(parsed.ok && parsed.data.notes[0].folder).toBe('A/B');
  });
});

describe('strict backup validation', () => {
  const validate = (notes: unknown[], canvases: unknown[] = []) =>
    validateWorkspace({ notes, canvases });

  it('accepts a valid workspace', () => {
    expect(validate([note()], [canvas()])).toEqual([]);
  });

  it.each([
    ['non-string content', { content: 5 }],
    ['non-array tags', { tags: 'x' }],
    ['non-string tags', { tags: [1] }],
    ['empty id', { id: '' }],
    ['non-numeric timestamp', { updatedAt: 'yesterday' }],
    ['non-finite timestamp', { createdAt: Number.POSITIVE_INFINITY }],
  ])('rejects a note with %s', (_label, overrides) => {
    expect(validate([note(overrides as Partial<Note>)]).length).toBeGreaterThan(0);
  });

  it('rejects duplicate ids', () => {
    expect(validate([note(), note()]).join()).toMatch(/duplicated/);
  });

  it.each([
    [
      'unknown element type',
      { elements: [{ id: 'a', type: 'blob', x: 0, y: 0, width: 1, height: 1 }] },
    ],
    [
      'a non-numeric coordinate',
      { elements: [{ id: 'a', type: 'text', x: 'left', y: 0, width: 1, height: 1 }] },
    ],
    ['a zero zoom', { viewport: { x: 0, y: 0, zoom: 0 } }],
    [
      'duplicate element ids',
      {
        elements: [
          { id: 'a', type: 'text', x: 0, y: 0, width: 1, height: 1 },
          { id: 'a', type: 'text', x: 0, y: 0, width: 1, height: 1 },
        ],
      },
    ],
  ])('rejects a board with %s', (_label, overrides) => {
    expect(validate([], [canvas(overrides as Partial<CanvasDocument>)]).length).toBeGreaterThan(0);
  });

  it('refuses backups from a newer schema with a clear message', () => {
    const parsed = parseBackup(
      JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION + 1, notes: [], canvases: [] })
    );
    expect(!parsed.ok && parsed.errors[0]).toMatch(/newer version/);
  });

  it('refuses files that are some other JSON format', () => {
    expect(parseBackup(JSON.stringify({ format: 'other-app', notes: [], canvases: [] })).ok).toBe(
      false
    );
    expect(parseBackup('[]').ok).toBe(false);
  });

  it('does not write anything if a storage engine fails mid-restore', async () => {
    const backend = await openIdb();
    const { storage } = await openStorage(async () => backend);
    await storage.replaceWorkspace({ notes: [note({ title: 'Safe' })], canvases: [] }, 'setup');

    const spy = vi
      .spyOn(backend, 'replaceAll')
      .mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'));
    const result = await storage.importAll(
      serializeBackup({ notes: [note({ title: 'New' })], canvases: [] })
    );
    expect(result.ok).toBe(false);
    spy.mockRestore();
    expect((await storage.getNotes())[0].title).toBe('Safe');
  });
});
