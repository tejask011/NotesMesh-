# NoteMesh Product Roadmap & Milestone Tracker

**Current Status: Core foundation hardened. Data safety, dependable editing, and graph and canvas workflows are shipped.**

This document details what is completed, what is in active development, and what is ready for community contributors, open-source fellows, and maintainers.

---

## 1. Shipped Features

### Data Safety
- [x] IndexedDB storage with a localStorage fallback (`src/core/storage/`)
- [x] Schema versioning and an ordered migration chain, including from every older format
- [x] Strict, all-or-nothing backup validation with an export/restore round-trip test
- [x] Note text is stored exactly as written
- [x] Honest save status, with automatic retry and a persistent error banner
- [x] Recovery screen for unreadable data; saving locks rather than overwriting it
- [x] Automatic snapshots before restore, reset, upgrade and sync
- [x] Crash journal for edits that hadn't finished saving
- [x] Tabs stay in step with each other

### Notes & Knowledge Management
- [x] Full Markdown GFM editor with split live preview (`src/features/notes/NoteEditor.tsx`)
- [x] `[[Wikilinks]]` parsing with alias syntax (`[[Target Note|Alias]]`) without code backtick leaks (`src/core/markdown/parser.ts`)
- [x] Automatic Backlinks discovery with contextual preview snippets (`src/features/notes/BacklinksPanel.tsx`)
- [x] Nested folders with a tree view, rename and move (`src/core/notes/folders.ts`)
- [x] Inline and assigned tags with defined behavior and real-time filtering (`src/core/notes/tags.ts`)
- [x] Formatting shortcuts, list continuation, Tab indent, native undo (`src/core/markdown/formatting.ts`)
- [x] KaTeX math and Mermaid diagrams, lazy-loaded and offline
- [x] HTML sanitizing for all rendered notes
- [x] Local relevance search and related-note suggestions (`src/core/search/localSearch.ts`)
- [x] Reusable Note Templates: Daily Note, Meeting Minutes, ADR, Research note (`src/core/templates/`)
- [x] Dedicated full-screen Templates View (`src/features/templates/TemplatesView.tsx`)
- [x] Quick "Today's Daily Note" generator (`src/App.tsx`)
- [x] Multi-file Markdown import with clear handling of duplicates, unsupported files and read errors (`src/core/notes/importExport.ts`)
- [x] Single note download, and all notes as a Markdown .zip

### Knowledge Graph
- [x] HTML5 Canvas real-time physics engine (Hooke spring attraction + Coulomb repulsion) (`src/features/graph/`)
- [x] Interactive node dragging, pan, and smooth zoom (`src/features/graph/KnowledgeGraphView.tsx`)
- [x] Physical force adjustment sliders (Repel force, Link distance, Collision radius)
- [x] Node color schemes: **Color by Node Type**, **Color by Folder**, and **Color by Tag**
- [x] Search inside graph with real-time filtering
- [x] Connection depth filter around any note
- [x] Touch (pinch, drag, tap) and keyboard navigation
- [x] Barnes-Hut physics and level-of-detail drawing for large workspaces; stops using CPU once settled
- [x] Orphan nodes detection and show/hide toggle
- [x] Missing link nodes detection and display
- [x] Clicking any graph node navigates directly to that note

### Visual Canvas & Diagrams
- [x] Freeform diagramming workspace inspired by Miro & Excalidraw (`src/features/canvas/`)
- [x] Rectangles (Process), Diamonds (Decision), Circles (Concepts), Sticky Notes, Connectors
- [x] **Linked Note Cards**: embed notes on board and click to jump directly into the note editor
- [x] Curved cubic bezier connector paths
- [x] Element duplication (`Duplicate` button)
- [x] Multiple named boards: create, switch, rename, delete
- [x] Multi-select by Shift+click or box select, with group move, duplicate, recolor and delete
- [x] Full keyboard control, and touch input including pinch zoom
- [x] Whole-board SVG, PNG and JSON export
- [x] Multi-step Undo / Redo history stack, per board
- [x] Grid background

### Extensibility & System Architecture
- [x] Sandboxed Plugin Manifest and lifecycle (`onLoad`, `onUnload`) (`src/core/plugins/`)
- [x] Extension points: Status Bar items, Command Palette actions, active note subscription
- [x] Three built-in working sample plugins:
  - *Word Count & Reading Time*
  - *Quick Markdown Exporter*
  - *Table of Contents Generator*
- [x] In-app Plugin Manager modal to toggle plugins
- [x] Dedicated full-screen Settings View (`src/features/settings/SettingsView.tsx`)
- [x] Global Command Palette (`Ctrl+K` / `Cmd+K`) with full keyboard navigation
- [x] Working global, editor and plugin keyboard shortcuts from one registry (`src/core/shortcuts.ts`)
- [x] Opt-in, serverless file sync with defined conflict handling ([sync.md](./sync.md))
- [x] Dark / Light theme toggle with Tailwind CSS tokens and custom CSS variables
- [x] Full workspace JSON backup export and import
- [x] Automated Vitest suite, including keyboard, touch and large-workspace performance tests
- [x] Strict ESLint and TypeScript compilation passing with 0 warnings

---

## 2. Deliberately Not Built Yet

These were considered and left out on purpose, so here's why:

| Feature | Why not yet | What it would take |
| :--- | :--- | :--- |
| **Real-time collaboration** | It needs a CRDT data model and a relay or peer-to-peer transport, which changes the storage format and raises hard privacy questions. It shouldn't be started without a design decision on who hosts what. | Likely Yjs per note, an opt-in relay, and a migration |
| **Embedding-based semantic search** | Today's search matches shared and similar words, not meaning ("car" won't find "automobile"). Real embeddings mean shipping or downloading a model of 20 MB or more, which should be an explicit opt-in. | Issue #302 below, behind the same `search` and `relatedNotes` functions |
| **Encrypted sync** | The sync file is plain text, and the UI says so. A forgotten passphrase would make data unrecoverable, so it needs careful key-handling design. | WebCrypto AES-GCM over the sync file, plus a recovery story |
| **Line-level merging** | Sync conflicts are per note: both versions are kept, never lost, but you merge them by hand. | A diff3 merge in `syncEngine.ts` |
| **Note trash / version history** | Deleting a note is confirmed but immediate. Snapshots only cover restores, resets, upgrades and syncs. | A soft-delete flag, or per-note history |

---

## 3. Planned Community Features (Up For Grabs)

These tasks are open for pull requests! Read [CONTRIBUTING.md](../CONTRIBUTING.md) to pick an issue.

### Good First Issues (Beginner)
1. **Issue #101: Nord and Solarized Themes**
   - Add new theme presets to `src/styles/index.css` and a theme selector dropdown in Settings.
2. **Issue #102: Pomodoro Timer Plugin**
   - Build a sample plugin registering a 25-minute focus timer in the bottom status bar.
3. **Issue #103: Canvas Shape Color Presets**
   - Expand the canvas color picker with curated pastel tones for sticky notes.
4. **Issue #104: Note Word Goal Tracker**
   - Allow users to set a target word count with a progress bar.

### Intermediate Features
1. **Issue #201: File System Access API Adapter**
   - Keep a real folder of Markdown files as the workspace, in Chromium browsers.
   - It would implement the `StorageBackend` interface in `src/core/storage/storageInterface.ts`.
2. **Issue #203: Graph Hierarchical Layout**
   - Add a tree / Dagre layout option to the Knowledge Graph in addition to force-directed.
3. **Issue #204: Bi-directional Canvas Links**
   - Allow linking a Canvas inside a Note using syntax `![[Canvas: Architecture Flow]]`.

### Advanced Features
1. **Issue #301: Desktop Packaging with Tauri**
   - Package NoteMesh as a lightweight cross-platform desktop app using Tauri v2 and Rust.
2. **Issue #302: Local Embedding & Semantic Similarity**
   - Create an opt-in plugin running a small WebAssembly embedding model locally to suggest related notes without sending data over the network.
