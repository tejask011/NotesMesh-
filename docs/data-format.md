# NoteMesh Data Format Specification 📄

NoteMesh is committed to data transparency, local ownership, and open standards.

---

## 1. Note Format

Notes are authored in standard GitHub Flavored Markdown (GFM) with these extensions:
- **Wikilinks**: `[[Target Note]]` or `[[Target Note|Custom Display Text]]`
- **Tags**: `#productivity`, `#ai/ml`, `#日本語`
- **Math**: inline `$e^{i\pi}$` and block `$$ ... $$`, rendered with KaTeX
- **Diagrams**: ` ```mermaid ` code blocks, rendered with Mermaid
- **Metadata**: Embedded in the note domain model:

```json
{
  "id": "note-12345",
  "title": "Neural Networks",
  "content": "# Neural Networks\n\nConnected to [[Knowledge Graph Guide]].",
  "folder": "Research/AI",
  "tags": ["ai", "deep-learning"],
  "isPinned": false,
  "isFavorite": true,
  "createdAt": 1729140000000,
  "updatedAt": 1729143600000
}
```

Text is stored **exactly as written**. Nothing is stripped or normalized on save, including emoji, joiners and line endings.

### Folders

`folder` is a `/`-separated path (`Research/AI/Papers`), displayed as a tree. Folders are not separate records: **a folder exists exactly as long as a note is in it**, so empty folders don't exist. Paths are normalized when set (`" /A//B/ "` becomes `A/B`), and a note with no folder is in `General`. Renaming a folder rewrites the path on every note in it and in its subfolders.

### Tags

A note's tags are the union of two sources:

| Source | Stored in | Removed by |
| :--- | :--- | :--- |
| **Assigned** | `note.tags` | The × on the tag in the editor |
| **Inline** (`#tag` in the text) | The note's text; derived when read | Editing the text |

Tags compare case-insensitively, and filtering by `ai` also matches `ai/ml`. All-digit `#123` and anything inside code are not tags. A line starting `#word` is a tag rather than a heading (`# word` is a heading, and `##word` still renders as a level-2 heading for convenience).

### Titles and links

`[[Title]]` resolves case-insensitively to a note's title. When two notes share a title, the first one wins everywhere, and the editor warns on the other. NoteMesh gives new, imported and templated notes unique titles (`Plan (2)`), but doesn't stop you from renaming one to match another. Text inside code is never treated as a link.

---

## 2. Canvas Document Format

Each board is one `CanvasDocument`, and a workspace can have any number of them:

```json
{
  "id": "canvas-main",
  "title": "Project Architecture & Flow",
  "gridEnabled": true,
  "viewport": {
    "x": 50,
    "y": 50,
    "zoom": 1.0
  },
  "elements": [
    {
      "id": "el-1",
      "type": "note-card",
      "x": 80,
      "y": 120,
      "width": 240,
      "height": 120,
      "linkedNoteId": "note-12345",
      "linkedNoteTitle": "Neural Networks",
      "text": "Card preview snippet",
      "color": "#3b82f6"
    },
    {
      "id": "el-2",
      "type": "rectangle",
      "x": 400,
      "y": 130,
      "width": 180,
      "height": 90,
      "text": "Process Step",
      "color": "#1e293b",
      "strokeColor": "#3b82f6"
    },
    {
      "id": "el-3",
      "type": "connector",
      "x": 320,
      "y": 175,
      "width": 80,
      "height": 0,
      "fromId": "el-1",
      "toId": "el-2",
      "fromPoint": { "x": 320, "y": 175 },
      "toPoint": { "x": 400, "y": 175 }
    }
  ],
  "createdAt": 1729140000000,
  "updatedAt": 1729143600000
}
```

---

## 3. Where Data Lives

| Engine | Used when | Layout | Limit |
| :--- | :--- | :--- | :--- |
| **IndexedDB** (database `notemesh`) | By default | One record per note and board, plus `snapshots` and `meta` stores | Browser quota, usually a large share of free disk |
| **localStorage** | IndexedDB is unavailable, e.g. some private modes | One atomic JSON blob under `notemesh_workspace` | About 5 MB |

Browsers may clear site data when a device runs low on space. **Settings** shows whether this workspace is protected and can request protection, but regular backups are still the only real guarantee.

---

## 4. Full Workspace Export / Import

The complete workspace can be exported or imported as a single portable JSON file from **Settings**. This is the lossless format:

```json
{
  "format": "notemesh-backup",
  "schemaVersion": 5,
  "exportedAt": "2026-10-31T12:00:00.000Z",
  "notes": [],
  "canvases": []
}
```

- **Restoring is all-or-nothing.** The file is fully validated first, and one invalid record rejects the file with nothing changed. Duplicate ids are invalid.
- **A snapshot of the current workspace is taken first**, so a restore can be undone from **Settings > Recovery Snapshots**.
- **Older backups** (`"version": "4.0.0"`, or no version at all) are upgraded through the migration chain. Backups from a *newer* schema are refused with a message to update the app.

**Export Notes as Markdown (.zip)** writes plain `.md` files in their folder structure. It's the way to take notes to other tools, but it's not a full backup: it doesn't include assigned tags, pins or boards.

### Canvas exports

The buttons on each board export the whole board, not just the visible area: **SVG** (a standalone file), **PNG** (2x resolution, scaled down only if it would exceed browser limits) and **JSON** (the board's data).

---

## 5. Schema Migrations

`CURRENT_SCHEMA_VERSION` in `src/core/storage/schema.ts` is the on-disk version. To change the persisted shape:

1. Bump `CURRENT_SCHEMA_VERSION`.
2. Add a step to `MIGRATIONS` in `src/core/storage/migrations.ts`. Never edit a migration that has shipped.
3. Migrations change shape only. They must not invent values for missing required fields: a record without them is damaged, and validation needs to be able to say so.
4. Add a test to `src/test/storage.test.ts` with data in the old shape.

| Schema | Change |
| :--- | :--- |
| 1-4 | Same record shape; only the localStorage key names changed (`notemesh_notes_v1` to `_v4`) |
| 5 | Moved to IndexedDB. `folder` is a normalized path; `tags` has no duplicates |

---

## 6. How Data Is Protected

| Failure | What happens |
| :--- | :--- |
| Write fails (e.g. storage full) | A red banner stays up with Retry and Download backup. The edit is kept in memory and in a journal, and is retried automatically |
| Tab closes with a pending write | Pending edits are journaled synchronously, then replayed on next launch if they're newer than what's stored |
| Some records are damaged | They're moved to a quarantine snapshot, and everything else loads |
| Whole workspace is unreadable | The recovery screen appears and **saving is locked**. The original bytes aren't touched, and sample data never replaces them |
| Data is from a newer app version | Same as above: opened read-only behind the recovery screen rather than risk rewriting it |
| Upgrading from an older version | The original data is kept as a snapshot, and old keys are removed only after the new store is verified |
| Another tab changes the workspace | This tab reloads the changed records, except ones with its own edits still queued |
