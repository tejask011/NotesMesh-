import { Note } from '../domain/note';
import { CanvasDocument } from '../domain/canvas';
import { WorkspaceData } from '../storage/schema';

/**
 * Three-way merge between this device and a sync file, relative to what they
 * last agreed on (the "base"). Change detection compares content fingerprints,
 * never timestamps, so a wrong device clock can't make it pick the wrong side.
 *
 * Rule: a merge may keep extra copies but must never lose text. See docs/sync.md.
 */
export interface SyncBase {
  notes: Record<string, string>;
  canvases: Record<string, string>;
}

export const EMPTY_BASE: SyncBase = { notes: {}, canvases: {} };

export type ConflictKind = 'both-edited' | 'edited-vs-deleted';

export interface SyncConflict {
  kind: ConflictKind;
  recordType: 'note' | 'board';
  title: string;
  /** The id of the extra copy created to hold the other side, if one was. */
  copyId?: string;
}

export interface MergeResult {
  data: WorkspaceData;
  base: SyncBase;
  conflicts: SyncConflict[];
  stats: { fromRemote: number; deletedLocally: number; toRemote: number };
}

const VOLATILE_FIELDS = new Set(['createdAt', 'updatedAt', 'viewport']);

/** Compact hash used to notice changes; a collision only delays a sync, it can't corrupt data. */
function hashString(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Fingerprint of a record's content, with a stable key order. It skips when the
 * record was created or changed and, for boards, where the view happens to be
 * panned: none of those are worth a conflict. Two fresh installs in particular
 * have identical sample notes that differ only in their timestamps.
 */
export function fingerprint(record: Note | CanvasDocument): string {
  const stable = Object.entries(record)
    .filter(([key]) => !VOLATILE_FIELDS.has(key))
    .sort(([a], [b]) => a.localeCompare(b));
  return hashString(JSON.stringify(stable));
}

interface MergeRecord {
  id: string;
  title: string;
  updatedAt: number;
}

function mergeRecords<T extends MergeRecord>(
  local: T[],
  remote: T[],
  base: Record<string, string>,
  recordType: SyncConflict['recordType'],
  dateLabel: string
): { merged: T[]; conflicts: SyncConflict[]; stats: MergeResult['stats'] } {
  const fp = fingerprint as unknown as (record: T) => string;
  const localById = new Map(local.map(record => [record.id, record]));
  const remoteById = new Map(remote.map(record => [record.id, record]));
  const conflicts: SyncConflict[] = [];
  const stats = { fromRemote: 0, deletedLocally: 0, toRemote: 0 };
  const merged: T[] = [];
  const copies: T[] = [];

  const makeCopy = (record: T): T => {
    const hash = fp(record);
    return {
      ...record,
      // Derived from content, so repeat syncs reuse one copy instead of piling up new ones.
      id: `${record.id}-conflict-${hash}`,
      title: `${record.title} (sync conflict ${dateLabel})`,
    };
  };

  for (const id of new Set([...localById.keys(), ...remoteById.keys()])) {
    const mine = localById.get(id);
    const theirs = remoteById.get(id);
    const baseFp = base[id];

    if (mine && theirs) {
      const mineFp = fp(mine);
      const theirsFp = fp(theirs);
      if (mineFp === theirsFp) {
        merged.push(mine.updatedAt >= theirs.updatedAt ? mine : theirs);
      } else if (mineFp === baseFp) {
        merged.push(theirs);
        stats.fromRemote += 1;
      } else if (theirsFp === baseFp) {
        merged.push(mine);
        stats.toRemote += 1;
      } else {
        // Changed on both sides (or first sync with no shared history): keep both.
        const copy = makeCopy(theirs);
        merged.push(mine);
        if (!localById.has(copy.id) && !remoteById.has(copy.id)) copies.push(copy);
        conflicts.push({ kind: 'both-edited', recordType, title: mine.title, copyId: copy.id });
      }
    } else if (mine) {
      if (baseFp === undefined) {
        merged.push(mine); // Created here
        stats.toRemote += 1;
      } else if (fp(mine) === baseFp) {
        stats.deletedLocally += 1; // Deleted elsewhere, untouched here
      } else {
        merged.push(mine); // Deleted elsewhere but edited here: the edit survives
        conflicts.push({ kind: 'edited-vs-deleted', recordType, title: mine.title });
      }
    } else if (theirs) {
      if (baseFp === undefined) {
        merged.push(theirs); // Created elsewhere
        stats.fromRemote += 1;
      } else if (fp(theirs) === baseFp) {
        stats.toRemote += 1; // Deleted here, untouched elsewhere
      } else {
        merged.push(theirs); // Deleted here but edited elsewhere: the edit survives
        conflicts.push({ kind: 'edited-vs-deleted', recordType, title: theirs.title });
      }
    }
  }

  return { merged: [...merged, ...copies], conflicts, stats };
}

export function mergeWorkspaces(
  local: WorkspaceData,
  remote: WorkspaceData,
  base: SyncBase,
  dateLabel: string
): MergeResult {
  const notes = mergeRecords(local.notes, remote.notes, base.notes, 'note', dateLabel);
  const canvases = mergeRecords(local.canvases, remote.canvases, base.canvases, 'board', dateLabel);

  return {
    data: { notes: notes.merged, canvases: canvases.merged },
    base: fingerprintWorkspace({ notes: notes.merged, canvases: canvases.merged }),
    conflicts: [...notes.conflicts, ...canvases.conflicts],
    stats: {
      fromRemote: notes.stats.fromRemote + canvases.stats.fromRemote,
      deletedLocally: notes.stats.deletedLocally + canvases.stats.deletedLocally,
      toRemote: notes.stats.toRemote + canvases.stats.toRemote,
    },
  };
}

export function fingerprintWorkspace(data: WorkspaceData): SyncBase {
  return {
    notes: Object.fromEntries(data.notes.map(note => [note.id, fingerprint(note)])),
    canvases: Object.fromEntries(data.canvases.map(canvas => [canvas.id, fingerprint(canvas)])),
  };
}
