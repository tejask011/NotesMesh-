import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Note } from '../core/domain/note';
import {
  JOURNAL_KEY,
  SaveQueue,
  SaveTarget,
  describeStorageError,
} from '../core/storage/saveQueue';

const note = (id: string, content = 'x', updatedAt = 1): Note => ({
  id,
  title: id,
  content,
  tags: [],
  createdAt: 0,
  updatedAt,
});

const createTarget = (): SaveTarget & { saved: string[] } => {
  const saved: string[] = [];
  return {
    saved,
    saveNote: vi.fn(async (n: Note) => {
      saved.push(`${n.id}:${n.content}`);
    }),
    deleteNote: vi.fn(async (id: string) => {
      saved.push(`delete:${id}`);
    }),
    saveCanvas: vi.fn(async () => {}),
    deleteCanvas: vi.fn(async () => {}),
  };
};

describe('SaveQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports pending, then saved, without claiming success before the write', async () => {
    const target = createTarget();
    const queue = new SaveQueue(target, 400);
    expect(queue.getStatus().state).toBe('saved');

    queue.enqueue({ kind: 'putNote', note: note('a') });
    expect(queue.getStatus().state).toBe('pending');
    expect(target.saved).toEqual([]);

    await vi.advanceTimersByTimeAsync(400);
    expect(target.saved).toEqual(['a:x']);
    expect(queue.getStatus().state).toBe('saved');
    expect(queue.getStatus().lastSavedAt).not.toBeNull();
  });

  it('coalesces rapid edits to one note into a single write of the latest text', async () => {
    const target = createTarget();
    const queue = new SaveQueue(target, 400);
    for (const content of ['h', 'he', 'hel', 'hell', 'hello']) {
      queue.enqueue({ kind: 'putNote', note: note('a', content) });
      await vi.advanceTimersByTimeAsync(100);
    }
    await vi.advanceTimersByTimeAsync(400);
    expect(target.saved).toEqual(['a:hello']);
  });

  it('does not lose edits to different notes made at the same time', async () => {
    const target = createTarget();
    const queue = new SaveQueue(target, 100);
    queue.enqueue({ kind: 'putNote', note: note('a') });
    queue.enqueue({ kind: 'putNote', note: note('b') });
    await queue.flush();
    expect(target.saved.sort()).toEqual(['a:x', 'b:x']);
  });

  it('runs writes one at a time, so read-modify-write storage cannot interleave', async () => {
    let active = 0;
    let maxActive = 0;
    const target = createTarget();
    target.saveNote = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 10));
      active -= 1;
    });
    const queue = new SaveQueue(target, 0);
    ['a', 'b', 'c'].forEach(id => queue.enqueue({ kind: 'putNote', note: note(id) }));
    const done = queue.flush();
    await vi.advanceTimersByTimeAsync(100);
    await done;
    expect(maxActive).toBe(1);
  });

  it('lets a delete override a queued save of the same note', async () => {
    const target = createTarget();
    const queue = new SaveQueue(target, 100);
    queue.enqueue({ kind: 'putNote', note: note('a') });
    queue.enqueue({ kind: 'deleteNote', id: 'a' });
    await queue.flush();
    expect(target.saved).toEqual(['delete:a']);
  });

  it('keeps an edit that arrives while its previous version is being written', async () => {
    const target = createTarget();
    let release = () => {};
    target.saveNote = vi.fn(
      (n: Note) =>
        new Promise<void>(resolve => {
          target.saved.push(`${n.id}:${n.content}`);
          release = resolve;
        })
    );
    const queue = new SaveQueue(target, 0);
    queue.enqueue({ kind: 'putNote', note: note('a', 'first') });
    await vi.advanceTimersByTimeAsync(0);
    queue.enqueue({ kind: 'putNote', note: note('a', 'second') });
    release();
    await vi.advanceTimersByTimeAsync(0);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(target.saved).toEqual(['a:first', 'a:second']);
    expect(queue.getStatus().state).toBe('saved');
  });

  it('surfaces failures, keeps the data, and succeeds on retry', async () => {
    const target = createTarget();
    const failure = new DOMException('full', 'QuotaExceededError');
    const saveNote = vi
      .fn<(n: Note) => Promise<void>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined);
    target.saveNote = saveNote;
    const queue = new SaveQueue(target, 0);

    queue.enqueue({ kind: 'putNote', note: note('a', 'precious') });
    expect(await queue.flush()).toBe(false);
    expect(queue.getStatus().state).toBe('error');
    expect(queue.getStatus().error).toMatch(/storage is full/i);
    expect(queue.hasPending('note:a')).toBe(true);

    // The journal protects the edit if the tab is closed before storage recovers.
    expect(localStorage.getItem(JOURNAL_KEY)).toContain('precious');

    expect(await queue.retry()).toBe(true);
    expect(saveNote.mock.calls[1][0].content).toBe('precious');
    expect(queue.getStatus().state).toBe('saved');
    expect(localStorage.getItem(JOURNAL_KEY)).toBeNull();
  });

  it('retries automatically after a failure', async () => {
    const target = createTarget();
    target.saveNote = vi
      .fn<(n: Note) => Promise<void>>()
      .mockRejectedValueOnce(new Error('busy'))
      .mockResolvedValue(undefined);
    const queue = new SaveQueue(target, 0);
    queue.enqueue({ kind: 'putNote', note: note('a') });
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.getStatus().state).toBe('error');
    await vi.advanceTimersByTimeAsync(2000);
    expect(queue.getStatus().state).toBe('saved');
  });

  it('notifies subscribers of each status change', async () => {
    const queue = new SaveQueue(createTarget(), 0);
    const states: string[] = [];
    queue.subscribe(() => states.push(queue.getStatus().state));
    queue.enqueue({ kind: 'putNote', note: note('a') });
    await queue.flush();
    expect(states).toEqual(['pending', 'saving', 'saved']);
  });

  it('explains quota errors in plain language', () => {
    expect(describeStorageError(new DOMException('x', 'QuotaExceededError'))).toMatch(/full/);
    expect(describeStorageError(new Error('Disk on fire'))).toBe('Disk on fire');
  });
});

describe('unsaved-changes journal', () => {
  it('writes pending edits synchronously for use when a page closes', () => {
    const queue = new SaveQueue(createTarget(), 100000);
    queue.enqueue({ kind: 'putNote', note: note('a', 'unsaved') });
    queue.writeJournal();
    expect(JSON.parse(localStorage.getItem(JOURNAL_KEY) as string)[0].note.content).toBe('unsaved');
    queue.discardPending();
  });

  it('replays edits newer than what storage has, on the next launch', async () => {
    const target = createTarget();
    localStorage.setItem(
      JOURNAL_KEY,
      JSON.stringify([{ kind: 'putNote', note: note('a', 'newer', 200) }])
    );

    const queue = new SaveQueue(target, 0);
    const replayed = await queue.replayJournal({ notes: [note('a', 'stored', 100)], canvases: [] });
    expect(replayed).toBe(true);
    expect(target.saved).toEqual(['a:newer']);
    expect(localStorage.getItem(JOURNAL_KEY)).toBeNull();
  });

  it('ignores a journal older than what storage already has', async () => {
    const target = createTarget();
    localStorage.setItem(
      JOURNAL_KEY,
      JSON.stringify([{ kind: 'putNote', note: note('a', 'stale', 50) }])
    );

    const queue = new SaveQueue(target, 0);
    await queue.replayJournal({ notes: [note('a', 'stored', 100)], canvases: [] });
    expect(target.saved).toEqual([]);
  });

  it('ignores corrupt or invalid journal entries', async () => {
    const target = createTarget();
    localStorage.setItem(JOURNAL_KEY, '{broken');
    expect(await new SaveQueue(target, 0).replayJournal({ notes: [], canvases: [] })).toBe(false);

    localStorage.setItem(
      JOURNAL_KEY,
      JSON.stringify([{ kind: 'putNote', note: { id: 'bad' } }, { kind: 'mystery' }])
    );
    expect(await new SaveQueue(target, 0).replayJournal({ notes: [], canvases: [] })).toBe(false);
    expect(target.saved).toEqual([]);
  });
});
