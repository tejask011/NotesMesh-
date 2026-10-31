import { Note } from '../domain/note';
import { CanvasDocument } from '../domain/canvas';
import { validateCanvas, validateNote } from './schema';

export type SaveState = 'saved' | 'pending' | 'saving' | 'error';

export interface SaveStatus {
  state: SaveState;
  lastSavedAt: number | null;
  error: string | null;
  pendingCount: number;
}

export type SaveOp =
  | { kind: 'putNote'; note: Note }
  | { kind: 'deleteNote'; id: string }
  | { kind: 'putCanvas'; canvas: CanvasDocument }
  | { kind: 'deleteCanvas'; id: string };

export interface SaveTarget {
  saveNote(note: Note): Promise<void>;
  deleteNote(id: string): Promise<void>;
  saveCanvas(canvas: CanvasDocument): Promise<void>;
  deleteCanvas(id: string): Promise<void>;
}

export const JOURNAL_KEY = 'notemesh_unsaved_journal';
const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000];

const opKey = (op: SaveOp): string => {
  switch (op.kind) {
    case 'putNote':
      return `note:${op.note.id}`;
    case 'deleteNote':
      return `note:${op.id}`;
    case 'putCanvas':
      return `canvas:${op.canvas.id}`;
    case 'deleteCanvas':
      return `canvas:${op.id}`;
  }
};

export function describeStorageError(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return 'Browser storage is full, so your latest changes are not saved. Download a backup and free up space.';
  }
  return (error as Error | null)?.message || 'Your latest changes could not be saved.';
}

/**
 * Sits between the UI and storage: it coalesces rapid edits per record, runs
 * writes strictly one at a time, reports honest status, and retries failures
 * without dropping the pending data.
 */
export class SaveQueue {
  private pending = new Map<string, SaveOp>();
  private status: SaveStatus = { state: 'saved', lastSavedAt: null, error: null, pendingCount: 0 };
  private listeners = new Set<() => void>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private running: Promise<void> | null = null;

  constructor(
    private readonly target: SaveTarget,
    private readonly debounceMs = 400,
    private readonly journal: () => Storage | null = () => {
      try {
        return typeof localStorage === 'undefined' ? null : localStorage;
      } catch {
        return null;
      }
    }
  ) {}

  getStatus = (): SaveStatus => this.status;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  hasPending(key: string): boolean {
    return this.pending.has(key);
  }

  private setStatus(next: Partial<SaveStatus>): void {
    this.status = { ...this.status, ...next, pendingCount: this.pending.size };
    this.listeners.forEach(listener => listener());
  }

  enqueue(op: SaveOp): void {
    this.pending.set(opKey(op), op);
    // Keep showing an unresolved failure until a write actually succeeds.
    this.setStatus(this.status.state === 'error' ? {} : { state: 'pending' });
    if (this.status.state === 'error') return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.drain(), this.debounceMs);
  }

  private drain(): Promise<void> {
    if (this.running) return this.running;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.running = this.runWrites().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runWrites(): Promise<void> {
    while (this.pending.size > 0) {
      this.setStatus({ state: 'saving' });
      for (const [key, op] of Array.from(this.pending.entries())) {
        try {
          await this.apply(op);
        } catch (error) {
          console.error('Save failed:', error);
          this.setStatus({ state: 'error', error: describeStorageError(error) });
          this.writeJournal();
          this.scheduleRetry();
          return;
        }
        // Only clear it if a newer edit didn't arrive while this write was in flight.
        if (this.pending.get(key) === op) this.pending.delete(key);
      }
    }
    this.retryAttempt = 0;
    this.clearJournal();
    this.setStatus({ state: 'saved', error: null, lastSavedAt: Date.now() });
  }

  private apply(op: SaveOp): Promise<void> {
    switch (op.kind) {
      case 'putNote':
        return this.target.saveNote(op.note);
      case 'deleteNote':
        return this.target.deleteNote(op.id);
      case 'putCanvas':
        return this.target.saveCanvas(op.canvas);
      case 'deleteCanvas':
        return this.target.deleteCanvas(op.id);
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay = RETRY_DELAYS_MS[Math.min(this.retryAttempt, RETRY_DELAYS_MS.length - 1)];
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => void this.drain(), delay);
  }

  /** Write everything now. Resolves true only if nothing is left unsaved. */
  async flush(): Promise<boolean> {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    await this.drain();
    // A write queued while the previous run was finishing needs one more pass.
    if (this.pending.size > 0 && this.status.state !== 'error') await this.drain();
    return this.pending.size === 0;
  }

  retry(): Promise<boolean> {
    this.retryAttempt = 0;
    return this.flush();
  }

  /** Forget queued writes; used when the whole workspace is being replaced. */
  discardPending(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.debounceTimer = this.retryTimer = null;
    this.pending.clear();
    this.clearJournal();
    this.setStatus({ state: 'saved', error: null });
  }

  /**
   * Synchronously record unsaved edits. Async storage may not finish while a
   * page is closing, and a failing store can't hold them, so localStorage does.
   */
  writeJournal(): void {
    if (this.pending.size === 0) return;
    try {
      this.journal()?.setItem(JOURNAL_KEY, JSON.stringify(Array.from(this.pending.values())));
    } catch (error) {
      console.warn('Could not write the unsaved-changes journal:', error);
    }
  }

  private clearJournal(): void {
    try {
      this.journal()?.removeItem(JOURNAL_KEY);
    } catch {
      // Nothing useful to do; a stale journal is ignored if it's older than stored data.
    }
  }

  /** Re-apply edits a previous session recorded but may not have finished writing. */
  async replayJournal(current: { notes: Note[]; canvases: CanvasDocument[] }): Promise<boolean> {
    let raw: string | null = null;
    try {
      raw = this.journal()?.getItem(JOURNAL_KEY) ?? null;
    } catch {
      return false;
    }
    if (!raw) return false;

    let ops: SaveOp[];
    try {
      ops = JSON.parse(raw);
      if (!Array.isArray(ops)) throw new Error('Journal is not a list');
    } catch (error) {
      console.warn('Ignoring an unreadable unsaved-changes journal:', error);
      this.clearJournal();
      return false;
    }

    let applied = false;
    for (const op of ops) {
      if (op?.kind === 'putNote' && validateNote(op.note).length === 0) {
        const stored = current.notes.find(n => n.id === op.note.id);
        if (!stored || op.note.updatedAt > stored.updatedAt) {
          await this.target.saveNote(op.note);
          applied = true;
        }
      } else if (op?.kind === 'putCanvas' && validateCanvas(op.canvas).length === 0) {
        const stored = current.canvases.find(c => c.id === op.canvas.id);
        if (!stored || op.canvas.updatedAt > stored.updatedAt) {
          await this.target.saveCanvas(op.canvas);
          applied = true;
        }
      } else if (op?.kind === 'deleteNote' && typeof op.id === 'string') {
        await this.target.deleteNote(op.id);
        applied = true;
      } else if (op?.kind === 'deleteCanvas' && typeof op.id === 'string') {
        await this.target.deleteCanvas(op.id);
        applied = true;
      }
    }
    this.clearJournal();
    return applied;
  }
}
