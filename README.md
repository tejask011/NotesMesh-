<div align="center">

# NoteMesh
### *Write your ideas. Connect your knowledge. Draw the bigger picture. Extend everything.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![Build Status](https://img.shields.io/badge/CI-Passing-emerald)](https://github.com)
[![Good First Issues](https://img.shields.io/badge/Issues-Good%20First%20Issue-purple.svg)](https://github.com)
[![Local First](https://img.shields.io/badge/Privacy-100%25%20Local--First-teal.svg)](./ETHICS.md)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)

**NoteMesh** is a local-first, open-source personal knowledge workspace. It unifies **Markdown notes**, **bidirectional wikilinks**, an interactive **knowledge graph**, and a freeform **visual canvas**—built to stay portable and grow through community extensions.

[Quickstart](#quickstart) • [Core Features](#core-features--current-status) • [Open Source Roadmap](#community-roadmap--good-first-issues) • [Contributing](#contributing) • [Ethics & Principles](#ethics--data-sovereignty)

</div>

---

## Why NoteMesh?

Most productivity tools scatter your knowledge: notes live in one tool, mind maps in another, flowcharts in a third, and relationship graphs are locked in proprietary cloud databases.

**NoteMesh solves this through five connected pillars:**
1. **Markdown Notes**: Portable, distraction-free writing with `[[wikilinks]]`, automatic backlinks discovery, tags, and nested folders.
2. **Knowledge Graph**: An interactive, physics-driven visualization revealing clusters, connections, and missing concepts in real time.
3. **Visual Canvas**: Freeform whiteboard diagramming with shapes, sticky notes, connectors, and **Linked Note Cards** that open actual notes directly from the board.
4. **Note Templates**: Standardized templates for Daily Notes, Meeting Minutes, Architecture Decision Records (ADRs), and Research Notes.
5. **Extensible Architecture**: Sandboxed plugins, command palette integration, and community themes.

---

## Core Features & Current Status

| Feature Pillar | Capability | Status | Reference |
| :--- | :--- | :--- | :--- |
| **Markdown Notes** | Full GFM editor, live split preview, folder organization, tag filtering | Complete | `src/features/notes/` |
| **Bidirectional Links** | `[[Note Title]]` & `[[Note|Alias]]` parsing, automatic backlinks panel | Complete | `src/core/markdown/` |
| **Note Templates** | Daily Notes, Meeting Minutes, ADRs, Research Notes with 1-click insertion | Complete | `src/core/templates/` |
| **Knowledge Graph** | Physics simulation, Color by Type/Folder/Tag, in-graph search, orphan toggles, connection depth filter, touch & keyboard control | Complete | `src/features/graph/` |
| **Visual Canvas** | Multiple named boards, multi-select, touch & keyboard control, rectangles, diamonds, sticky notes, curved connectors, duplicate, **Linked Note Cards** | Complete | `src/features/canvas/` |
| **Plugin System** | Sandboxed manifest, command registration, live status bar, 3 sample plugins | Complete | `src/core/plugins/` |
| **Theme Engine** | Dark mode & Light mode with CSS variables & Tailwind tokens | Complete | `src/styles/index.css` |
| **Command Palette** | Quick note navigation & plugin action runner (`Ctrl+K` / `Cmd+K`) | Complete | `src/components/CommandPalette.tsx` |
| **Storage & Backup** | IndexedDB with migrations, validated backups, save status, snapshots and a recovery screen ([format](./docs/data-format.md)) | Complete | `src/core/storage/` |
| **Sync (optional)** | Off by default. Manual, serverless file sync with defined conflict handling ([details](./docs/sync.md)) | Complete | `src/core/sync/` |
| **Local Search** | Relevance search and related notes, computed on your device | Complete | `src/core/search/` |
| **Canvas Export** | Whole-board SVG, PNG and JSON export | Complete | `src/features/canvas/` |
| **KaTeX Math & Mermaid** | LaTeX math and diagrams in the preview, loaded on demand and offline | Complete | `src/features/notes/richContent.ts` |
| **Collaboration** | Real-time co-editing | Not started, by design | [Roadmap](./docs/roadmap.md) |
| **Desktop Build (Tauri)** | Native local filesystem access via Rust / Tauri | Planned | [Roadmap](./docs/roadmap.md) |

---

## Community Roadmap & Good First Issues

We welcome new contributors! As project administrators, we ensure beginner-friendly tasks are well-scoped with mentorship available:

### Good First Issues (Beginner Friendly)
| ID | Area | Task | Skills Needed |
| :--- | :--- | :--- | :--- |
| `#101` | **Themes** | Add Nord and Solarized color theme presets | CSS Variables |
| `#102` | **Plugins** | Build a Pomodoro Timer plugin displaying status in footer | TypeScript |
| `#103` | **Canvas** | Add pastel color presets for canvas sticky notes | React, CSS |
| `#104` | **Notes** | Add target word goal tracker to editor toolbar | React, Lucide |
| `#105` | **Graph** | Add connection depth filter (1-hop, 2-hop neighborhood) | Canvas 2D, TS |

### Intermediate & Advanced Community Issues
| ID | Area | Task | Skills Needed |
| :--- | :--- | :--- | :--- |
| `#203` | **Storage** | Implement a File System Access API `StorageBackend` for opening local folders | Browser APIs |
| `#204` | **Graph** | Add 3D graph layout renderer option via Three.js / WebGL | 3D Graphics |

---

## Quickstart

### Prerequisites
- Node.js `v20+` or `v22+`
- npm `v10+`

### Setup & Run
```bash
# 1. Clone the repository
git clone https://github.com/your-username/notemesh.git
cd notemesh

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

Visit `http://localhost:3000` in your browser. NoteMesh comes pre-populated with interconnected sample notes and a canvas flowchart so you can explore immediately.

### Scripts
```bash
# Run unit tests
npm test

# Lint with ESLint
npm run lint

# Check TypeScript types
npm run typecheck

# Build production bundle
npm run build
```

---

## Repository Structure

```
notemesh/
├── .github/
│   ├── ISSUE_TEMPLATE/     # Templates for feature requests, bugs & good-first-issues
│   ├── workflows/ci.yml    # Automated GitHub Actions CI for lint, test, and build
│   └── pull_request_template.md
├── docs/
│   ├── architecture.md     # In-depth architectural subsystem breakdown
│   ├── data-format.md      # Note, Canvas, and JSON schema specifications
│   ├── plugin-development.md# Tutorial on authoring community plugins
│   └── roadmap.md          # 55% built core vs 45% community expansion plan
├── src/
│   ├── components/         # Shared UI: Navbar, Sidebar, CommandPalette
│   ├── core/
│   │   ├── domain/         # Strict TypeScript domain interfaces
│   │   ├── graph/          # Physics engine & graph data builder
│   │   ├── markdown/       # Wikilinks, tags, and GFM compiler
│   │   ├── plugins/        # Plugin manager & sample extensions
│   │   ├── storage/        # IndexedDB & localStorage engines, migrations, save queue
│   │   ├── sync/           # Opt-in three-way merge and folder sync
│   │   ├── search/         # Local relevance search
│   │   ├── notes/          # Folders, tags, titles, import & export
│   │   ├── canvas/         # Canvas operations & export
│   │   └── templates/      # Reusable built-in note templates
│   ├── features/
│   │   ├── canvas/         # Freeform visual whiteboard & diagram editor
│   │   ├── graph/          # Knowledge Graph canvas & interactive controls
│   │   ├── notes/          # Note editor, live preview, and backlinks panel
│   │   ├── plugins/        # Extension manager modal
│   │   ├── settings/       # Dedicated Settings view & workspace metrics
│   │   └── templates/      # Dedicated Templates view & generator
│   ├── styles/             # Tailwind & theme tokens
│   ├── test/               # Vitest automated test suites
│   ├── App.tsx             # Main workspace application shell
│   └── main.tsx            # DOM root
├── CONTRIBUTING.md         # Contribution guidelines, branch conventions & SLA
├── CODE_OF_CONDUCT.md      # Contributor Covenant v2.1
├── ETHICS.md               # Local-first ethics & data sovereignty pledge
├── LICENSE                 # MIT License
└── package.json
```

---

## Ethics & Data Sovereignty

NoteMesh strictly abides by our [Ethics Charter](./ETHICS.md):
- **Local-first**: You own your data. Notes are never transmitted to third-party clouds or telemetry trackers.
- **Portability**: Content is authored in plain Markdown with documented open JSON structures.
- **Transparent Plugins**: Extensions run locally with explicit permissions.

---

## Contributing

We love contributions! Please read our [CONTRIBUTING.md](./CONTRIBUTING.md) guide before submitting a PR.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`)
- Ensure `npm test` and `npm run lint` pass cleanly
- Maintainers review PRs within 48 hours!

---

## License

Licensed under the [MIT License](./LICENSE). Copyright (c) 2026 NoteMesh Community.
