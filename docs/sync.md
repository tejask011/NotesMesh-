# Sync

Sync in NoteMesh is **opt-in, manual and serverless**. If you never turn it on, nothing in this document happens.

## What it does

You choose a folder. Each time you press **Sync now**, NoteMesh:

1. Saves any pending edits.
2. Reads `notemesh-sync.json` from that folder and validates it. If it's invalid, sync stops and nothing changes on either side.
3. Takes a snapshot of your workspace, so the merge can be undone from **Settings > Recovery Snapshots**.
4. Merges the file with your workspace and saves the result locally.
5. Writes the merged result back to the file.

Connecting a folder does not sync by itself, and nothing runs in the background.

NoteMesh doesn't move the file between devices. That's up to whatever syncs the folder: Syncthing, Dropbox, iCloud Drive, a USB stick. NoteMesh has no sync server, no accounts and makes no network requests for sync.

## Privacy

**The sync file is not encrypted.** It's a normal NoteMesh backup, with all of your notes in plain text. Anyone with access to the folder can read it, and that includes any cloud service syncing it. If your notes are sensitive, use a peer-to-peer tool or a folder you've encrypted yourself.

## How conflicts are handled

The merge is three-way: for each note and board, it compares this device, the sync file, and a fingerprint of what the two last agreed on (the "base", stored per device).

The guiding rule is that **a merge may leave you with extra copies, but never loses text.**

| This device | Sync file | Result |
| :--- | :--- | :--- |
| Unchanged | Changed | The file's version is taken |
| Changed | Unchanged | This device's version is kept |
| Changed | Changed, same way | No conflict |
| Changed | Changed, differently | **Conflict:** this device's version stays, and the file's is added as `Title (sync conflict 2026-10-31)` |
| Deleted | Unchanged | Stays deleted |
| Unchanged | Deleted | Deleted here too |
| Edited | Deleted | **Conflict:** the edit is kept, and the note comes back |
| Deleted | Edited | **Conflict:** the edit is kept, and the note comes back |
| Created | Absent | Added to the file |
| Absent | Created | Added here |

Conflicts are listed in the Sync panel after each sync, with a link to the other version. Resolve one by keeping the text you want and deleting the copy.

Things worth knowing:

- **Merging is per note, not per line.** Two edits to different paragraphs of one note still make a conflict with two copies.
- **Clocks don't matter.** Changes are detected by comparing content fingerprints, so a device with a wrong clock can't make the wrong version win. Timestamps and a board's pan and zoom don't count as changes.
- **The first sync is conservative.** With no shared history, any note that differs on the two sides is treated as a conflict and kept twice. Fresh installs don't conflict over their identical sample notes.
- **Sync one device at a time, and let the folder finish syncing in between.** If two devices write the file at once, your folder tool decides what happens (usually keeping a conflicted copy of the file). NoteMesh only reads `notemesh-sync.json`, so you'd merge the other copy in with **Merge from a file**.

## Browser support

Connecting a folder needs the File System Access API, currently available in Chrome and Edge. In other browsers, use **Merge from a file**: it merges a sync file or backup into your workspace by the same rules, then downloads the merged result for you to put back.

## Architecture

| File | Responsibility |
| :--- | :--- |
| `src/core/sync/syncEngine.ts` | The pure three-way merge. No I/O. |
| `src/core/sync/syncService.ts` | Folder handles, the base, and the read-merge-write order |
| `src/features/settings/SyncPanel.tsx` | UI, including the privacy and conflict disclosures |

The order in `syncWithFolder` matters. The base is recorded last, so if writing the file fails, the next sync simply merges against the old base again rather than missing anything.

To add another transport, like WebDAV, keep the engine as is and write a new service function. Any transport that talks to a network must stay opt-in and say plainly where data goes.
