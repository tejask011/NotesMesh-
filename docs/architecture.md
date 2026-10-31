# NoteMesh Architecture Overview

NoteMesh is engineered as a **local-first, modular knowledge workspace**. This document explains the system boundaries, design choices, and data flow across subsystems.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       App Shell & UI                        │
│   Navbar  │  Sidebar  │  CommandPalette  │  SettingsView     │
├───────────────┬──────────────────────────┬──────────────────┤
│ Notes Feature │   Knowledge Graph View   │ Canvas Workspace │
│ Editor/Preview│ Physics Simulation       │ Visual Diagram   │
│ Backlinks     │ Node & Edge Visualizer   │ Linked Note Cards│
├───────────────┴──────────────────────────┴──────────────────┤
│                        Core Layer                           │
│  Domain Models  │  Wikilink Parser  │  Graph Data Engine    │
├─────────────────────────────────────────────────────────────┤
│                    Plugin Runtime Engine                    │
│   PluginManager │ Sandboxed Context │ Commands & Status Bar │
├─────────────────────────────────────────────────────────────┤
│                     Storage Abstraction                     │
│   SaveQueue ─► WorkspaceStorage ─► IndexedDB / localStorage │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Domain Models (`src/core/domain/`)

- `Note`: Identifiers, title, markdown body, folders, tags, pin/favorite flags, timestamps.
- `NoteLink` & `BacklinkItem`: Captured targets `[[Target Note]]`, source notes, and context snippets.
- `GraphNode` & `GraphEdge`: Graph structure with calculated connection degrees, collision radii, and orphan flags.
- `CanvasDocument` & `CanvasElement`: Freeform whiteboard documents with process rectangles, decision diamonds, sticky notes, connectors, and **Linked Note Cards**.
- `PluginManifest` & `PluginContext`: Versioning, permissions, and plugin runtime contracts.

---

## 2. Storage (`src/core/storage/`)

```
UI ──► SaveQueue ──► WorkspaceStorage ──► StorageBackend
       debounce,     migrations,          IndexedDbBackend (default)
       status,       validation,          LocalStorageBackend (fallback)
       retry,        snapshots,
       journal       recovery lock
```

- **`SaveQueue`**: all edits go through here. It coalesces rapid edits per record, runs writes strictly one at a time, retries failures, and is the source of truth for the visible save status. It never reports "Saved" before a write has actually finished.
- **`WorkspaceStorage`** (`StorageAdapter`): the engine-independent logic. Opens and migrates the workspace, validates backups, takes snapshots, and locks saving when data can't be read.
- **`StorageBackend`**: the small interface a storage engine implements (`read`, `putNote`, `replaceAll`, snapshots...). Adding a filesystem or SQLite engine means implementing this, and nothing above it changes.
- **`schema.ts` / `migrations.ts`**: strict validation and the ordered migration chain.

The format and the failure behavior are specified in [data-format.md](./data-format.md).

---

## 3. Markdown & Wikilinks Engine (`src/core/markdown/`)

- `extractWikilinks`: Regular expression matching `[[Target]]` or `[[Target|Alias]]`.
- `resolveWikilinks`: Case-insensitive resolution against active note titles; highlights missing targets cleanly.
- `buildBacklinks`: Scans workspace notes to discover referring links and extracts live preview snippets.
- `formatting.ts`: Pure text transforms behind the editor's toolbar and shortcuts. They return an edit, which the editor applies through the browser's undo-aware insert command.
- `parser.ts`: All rendered HTML goes through DOMPurify, because notes can come from imported files. Math and Mermaid render to placeholders that `features/notes/richContent.ts` upgrades after sanitizing, loading KaTeX and Mermaid only when a note uses them. Both are bundled, so they work offline.

---

## 4. Knowledge Graph Simulation (`src/core/graph/`)

- `forceSimulation.ts`: Hooke's law springs along edges and Coulomb repulsion between nodes, using a Barnes-Hut quadtree so each tick is O(n log n). Movement cools over time and the render loop stops when it's done, so a settled graph uses no CPU.
- `graphBuilder.ts`: Filter layer supporting tag isolation, orphan node toggles, missing link visualization and connection depth (breadth-first from a focus note).
- Rendering (`features/graph/KnowledgeGraphView.tsx`): culls offscreen items and batches paths. While moving, a large graph draws a capped set of on-screen edges, then all of them once still.
- All input is Pointer Events, so mouse, touch and pen share one code path.

---

## 5. Plugin Runtime (`src/core/plugins/`)

- Sandboxed `PluginContext` exposing controlled extension points:
  - `registerCommand`: Injects actions into the global Command Palette (`Ctrl+K`).
  - `addStatusBarItem` & `updateStatusBarItem`: Injects live indicators into the bottom footer.
  - `onNoteChange`: Subscribes to live active note edits.
- A command's `shortcut` is live: the app runs it on that key press while the plugin is enabled.

---

## 6. Keyboard Shortcuts (`src/core/shortcuts.ts`)

The single source of truth: handlers match against these definitions, and Settings renders its reference from them, so documented and actual shortcuts can't drift. Avoid combos browsers won't release (`Ctrl+N`, `Ctrl+T`, `Ctrl+Shift+T`, `Ctrl+W`) and `Ctrl+Alt`, which means AltGr on many keyboards.

---

## 7. Local Search (`src/core/search/localSearch.ts`)

TF-IDF vectors compared by cosine similarity, with trigram matching for typos. It powers the palette's "Similar" results and the Related panel. Everything runs on the device. It matches shared and similar words, not meaning; see the [roadmap](./roadmap.md).

---

## 8. Sync (`src/core/sync/`)

Opt-in, manual, file-based three-way merge with no server. See [sync.md](./sync.md).

---

## 9. Testing

- `npm test` runs Vitest in jsdom with `fake-indexeddb`. Storage tests run against both engines.
- `src/test/canvas.test.tsx` and `graphDepthPerformance.test.tsx` cover keyboard and touch input, including pinch and canceled gestures.
- Performance tests assert generous budgets at 5,000 notes. They exist to catch a return to quadratic behavior, not to measure small changes.
