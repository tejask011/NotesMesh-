import { describe, it, expect, vi } from 'vitest';
import { Note } from '../core/domain/note';
import { serializeBackup } from '../core/storage/migrations';
import { WorkspaceData } from '../core/storage/schema';
import {
  EMPTY_BASE,
  fingerprint,
  fingerprintWorkspace,
  mergeWorkspaces,
} from '../core/sync/syncEngine';
import {
  SyncDirectoryHandle,
  loadSyncBase,
  mergeWithRemoteText,
  syncWithFolder,
} from '../core/sync/syncService';

const note = (id: string, content: string, overrides: Partial<Note> = {}): Note => ({
  id,
  title: id,
  content,
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

const ws = (...notes: Note[]): WorkspaceData => ({ notes, canvases: [] });
const merge = (local: WorkspaceData, remote: WorkspaceData, base: WorkspaceData | null) =>
  mergeWorkspaces(local, remote, base ? fingerprintWorkspace(base) : EMPTY_BASE, '2026-10-31');
const contentOf = (data: WorkspaceData, id: string) => data.notes.find(n => n.id === id)?.content;

describe('three-way sync merge', () => {
  const base = ws(note('a', 'original'));

  it('takes the remote edit when only the remote changed', () => {
    const result = merge(base, ws(note('a', 'remote')), base);
    expect(contentOf(result.data, 'a')).toBe('remote');
    expect(result.conflicts).toEqual([]);
    expect(result.stats.fromRemote).toBe(1);
  });

  it('keeps the local edit when only the local changed', () => {
    const result = merge(ws(note('a', 'local')), base, base);
    expect(contentOf(result.data, 'a')).toBe('local');
    expect(result.conflicts).toEqual([]);
    expect(result.stats.toRemote).toBe(1);
  });

  it('keeps both versions when both sides changed, losing no text', () => {
    const result = merge(ws(note('a', 'local')), ws(note('a', 'remote')), base);
    expect(contentOf(result.data, 'a')).toBe('local');

    const copy = result.data.notes.find(n => n.id !== 'a') as Note;
    expect(copy.content).toBe('remote');
    expect(copy.title).toBe('a (sync conflict 2026-10-31)');
    expect(result.conflicts).toEqual([
      { kind: 'both-edited', recordType: 'note', title: 'a', copyId: copy.id },
    ]);
  });

  it('is not a conflict when both sides made the same edit', () => {
    const result = merge(
      ws(note('a', 'same', { updatedAt: 1 })),
      ws(note('a', 'same', { updatedAt: 9 })),
      base
    );
    expect(result.conflicts).toEqual([]);
    expect(result.data.notes).toHaveLength(1);
    expect(result.data.notes[0].updatedAt).toBe(9);
  });

  it('is not fooled by clock skew: timestamps do not decide who changed', () => {
    const local = note('a', 'original', { updatedAt: 999999 });
    const remote = note('a', 'real edit', { updatedAt: 1 });
    const result = merge(ws(local), ws(remote), base);
    expect(contentOf(result.data, 'a')).toBe('real edit');
    expect(result.conflicts).toEqual([]);
  });

  it('propagates a deletion when the other side did not touch the note', () => {
    expect(merge(ws(), base, base).data.notes).toEqual([]);
    expect(merge(base, ws(), base).data.notes).toEqual([]);
  });

  it('keeps an edit over a deletion and reports it', () => {
    const editedHere = merge(ws(note('a', 'edited')), ws(), base);
    expect(contentOf(editedHere.data, 'a')).toBe('edited');
    expect(editedHere.conflicts[0].kind).toBe('edited-vs-deleted');

    const editedThere = merge(ws(), ws(note('a', 'edited')), base);
    expect(contentOf(editedThere.data, 'a')).toBe('edited');
    expect(editedThere.conflicts[0].kind).toBe('edited-vs-deleted');
  });

  it('adds notes created on either side', () => {
    const result = merge(ws(note('mine', '1')), ws(note('theirs', '2')), null);
    expect(result.data.notes.map(n => n.id).sort()).toEqual(['mine', 'theirs']);
    expect(result.conflicts).toEqual([]);
  });

  it('on a first sync with no history, differing notes are kept as a conflict, not overwritten', () => {
    const result = merge(ws(note('a', 'one')), ws(note('a', 'two')), null);
    expect(result.data.notes.map(n => n.content).sort()).toEqual(['one', 'two']);
    expect(result.conflicts).toHaveLength(1);
  });

  it('does not pile up copies when the same conflict syncs again', () => {
    const remote = ws(note('a', 'remote'));
    const first = merge(ws(note('a', 'local')), remote, base);
    const second = merge(first.data, remote, null);
    const copies = second.data.notes.filter(n => n.title.includes('sync conflict'));
    expect(copies).toHaveLength(1);
  });

  it('converges: two devices end up identical after conflicting edits', () => {
    const start = base;
    let fileData = start;
    let baseA = fingerprintWorkspace(start);
    let baseB = fingerprintWorkspace(start);
    let deviceA = ws(note('a', 'edit from A'));
    let deviceB = ws(note('a', 'edit from B'));

    const sync = (local: WorkspaceData, deviceBase: typeof baseA) => {
      const result = mergeWorkspaces(local, fileData, deviceBase, '2026-10-31');
      fileData = result.data;
      return result;
    };

    let r = sync(deviceA, baseA);
    deviceA = r.data;
    baseA = r.base;
    r = sync(deviceB, baseB);
    deviceB = r.data;
    baseB = r.base;
    r = sync(deviceA, baseA);
    deviceA = r.data;
    baseA = r.base;

    const texts = (data: WorkspaceData) => data.notes.map(n => n.content).sort();
    expect(texts(deviceA)).toEqual(texts(deviceB));
    expect(texts(deviceA)).toContain('edit from A');
    expect(texts(deviceA)).toContain('edit from B');
    r = sync(deviceB, baseB);
    expect(r.conflicts).toEqual([]);
  });

  it('merges boards with the same rules, ignoring view position', () => {
    const board = (viewport = { x: 0, y: 0, zoom: 1 }) => ({
      id: 'b',
      title: 'B',
      elements: [],
      viewport,
      gridEnabled: true,
      createdAt: 0,
      updatedAt: 0,
    });
    const start: WorkspaceData = { notes: [], canvases: [board()] };
    const result = merge(
      { notes: [], canvases: [board({ x: 5, y: 5, zoom: 2 })] },
      { notes: [], canvases: [board({ x: 9, y: 9, zoom: 1 })] },
      start
    );
    expect(result.conflicts).toEqual([]);
    expect(result.data.canvases).toHaveLength(1);
  });

  it('does not treat identical notes with different timestamps as a conflict', () => {
    const result = merge(
      ws(note('sample', 'same', { createdAt: 1 })),
      ws(note('sample', 'same', { createdAt: 2 })),
      null
    );
    expect(result.conflicts).toEqual([]);
    expect(result.data.notes).toHaveLength(1);
  });

  it('fingerprints ignore key order and updatedAt', () => {
    const a = note('a', 'x', { updatedAt: 1 });
    const { content, ...rest } = note('a', 'x', { updatedAt: 2 });
    expect(fingerprint(a)).toBe(fingerprint({ content, ...rest } as Note));
    expect(fingerprint(a)).not.toBe(fingerprint(note('a', 'y')));
  });
});

describe('sync with a folder', () => {
  const fakeFolder = (initial: string, permission: PermissionState = 'granted') => {
    const file = { text: initial };
    const handle: SyncDirectoryHandle = {
      name: 'Test',
      queryPermission: vi.fn(async () => permission),
      requestPermission: vi.fn(async () => permission),
      getFileHandle: vi.fn(async () => ({
        getFile: async () => ({ text: async () => file.text }) as File,
        createWritable: async () => ({
          write: async (data: string) => {
            file.text = data;
          },
          close: async () => {},
        }),
      })),
    };
    return { handle, file };
  };

  it('publishes the workspace to a new, empty sync file', async () => {
    const { handle, file } = fakeFolder('');
    const apply = vi.fn(async () => {});
    await syncWithFolder(handle, ws(note('a', 'hello 🚀')), apply);
    expect(JSON.parse(file.text).notes[0].content).toBe('hello 🚀');
    expect(apply).toHaveBeenCalled();
    expect(loadSyncBase().notes.a).toBeTruthy();
  });

  it('merges, pushes the result, and records the new base', async () => {
    const { handle, file } = fakeFolder(serializeBackup(ws(note('remote', 'from file'))));
    const applied: WorkspaceData[] = [];
    await syncWithFolder(handle, ws(note('local', 'from device')), async data => {
      applied.push(data);
    });
    expect(applied[0].notes.map(n => n.id).sort()).toEqual(['local', 'remote']);
    expect(JSON.parse(file.text).notes).toHaveLength(2);
  });

  it('changes nothing if the sync file is invalid', async () => {
    const { handle, file } = fakeFolder('{"notes": "garbage"}');
    const apply = vi.fn(async () => {});
    await expect(syncWithFolder(handle, ws(note('a', 'x')), apply)).rejects.toThrow(/invalid/);
    expect(apply).not.toHaveBeenCalled();
    expect(file.text).toBe('{"notes": "garbage"}');
  });

  it('stops if folder permission is denied', async () => {
    const { handle } = fakeFolder('', 'denied');
    const apply = vi.fn(async () => {});
    await expect(syncWithFolder(handle, ws(), apply)).rejects.toThrow(/denied/);
    expect(apply).not.toHaveBeenCalled();
  });

  it('does not record a new base if pushing the file failed, so nothing gets missed', async () => {
    const handle: SyncDirectoryHandle = {
      name: 'Test',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      getFileHandle: async () => ({
        getFile: async () => ({ text: async () => '' }) as File,
        createWritable: async () => {
          throw new Error('disk full');
        },
      }),
    };
    await expect(syncWithFolder(handle, ws(note('a', 'x')), async () => {})).rejects.toThrow(
      'disk full'
    );
    expect(loadSyncBase().notes.a).toBeUndefined();
  });

  it('merges a file by hand for browsers without folder access', () => {
    const result = mergeWithRemoteText(
      ws(note('a', 'mine')),
      serializeBackup(ws(note('b', 'yours'))),
      EMPTY_BASE
    );
    expect(result.data.notes).toHaveLength(2);
    expect(() => mergeWithRemoteText(ws(), 'nope', EMPTY_BASE)).toThrow(/invalid/);
  });
});
