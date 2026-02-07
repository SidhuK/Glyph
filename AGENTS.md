# AGENTS.md

Guidance for AI code agents working in this repository.

## Primary Goals

- Make the smallest correct change that matches the intent
- Code LOC should not exceed 200 lines per file; refactor into subfolders as needed
- Keep the app offline-first and vault-backed (filesystem + local SQLite)
- Preserve type-safety across the Tauri IPC boundary (frontend ↔ backend)
- Prefer crash-safe / atomic writes for user data

## Commands

```bash
pnpm dev              # Vite dev server (frontend only)
pnpm tauri dev        # Full Tauri app in dev mode
pnpm build            # TypeScript check + Vite build
pnpm check            # Biome lint + format check
pnpm format           # Auto-format with Biome

cd src-tauri && cargo check   # Typecheck Rust backend
cd src-tauri && cargo clippy  # Lint Rust
```

**Before pushing:** `pnpm check && pnpm build && cd src-tauri && cargo check`

## Architecture Overview

**Lattice** is a desktop note-taking app with a node-based canvas editor.

| Layer | Tech | Location |
|-------|------|----------|
| Frontend | React 19 + TypeScript + Vite | `src/` |
| Backend | Tauri 2 + Rust | `src-tauri/` |
| Canvas | @xyflow/react | `src/components/canvas/` |
| Editor | TipTap + Markdown | `src/components/editor/` |
| Storage | SQLite + Filesystem | `.lattice/lattice.sqlite` |

## Key Frontend Files

### Entry Points
- `src/main.tsx` — React app entry, renders `<App />`
- `src/App.tsx` — Wraps app in `<AppProviders>` (contexts)
- `src/SettingsApp.tsx` — Settings window entry

### Contexts (`src/contexts/`)
State management via React Context (no prop drilling):

| Context | Purpose |
|---------|---------|
| `VaultContext` | Vault path, recent vaults, open/close/create actions |
| `FileTreeContext` | File tree state, tags, active file |
| `ViewContext` | Active view doc, canvas loaders |
| `UIContext` | Sidebar, AI sidebar, search, preview state |

### App Shell (`src/components/app/`)
- `AppShell.tsx` — Main layout, consumes all contexts
- `Sidebar.tsx` / `SidebarContent.tsx` — File tree or tags view
- `MainContent.tsx` — Canvas area + welcome screen

### Canvas (`src/components/canvas/`)
- `CanvasPane.tsx` — Main ReactFlow canvas
- `nodes/*.tsx` — Node components (NoteNode, TextNode, FileNode, etc.)
- `hooks/useCanvasHistory.ts` — Undo/redo

### Key Hooks (`src/hooks/`)
- `useViewLoader.ts` — View document loading (folder/search/tag)
- `useFileTree.ts` — File tree operations
- `useSearch.ts` — Search state

### IPC (`src/lib/tauri.ts`)
Typed wrapper for Tauri commands. Always use `invoke()` from here.

## Key Backend Files (`src-tauri/src/`)

| Module | Purpose |
|--------|---------|
| `lib.rs` | Tauri setup, command registration |
| `vault/` | Vault lifecycle, file watching |
| `vault_fs/` | Filesystem operations (list, read, write) |
| `notes/` | Note CRUD, attachments |
| `index/` | SQLite search, tags, backlinks |
| `canvas.rs` | Canvas CRUD (stored in SQLite) |
| `ai/` | AI chat, profiles, streaming |
| `paths.rs` | Safe path joining (prevents traversal) |
| `io_atomic.rs` | Crash-safe atomic writes |

## Vault Layout

Lattice works with any Obsidian-compatible vault. User markdown files stay wherever they are in the vault. Lattice only creates a `.lattice/` folder for its own data:

```
any-vault-folder/
├── (user's existing .md files and folders)
└── .lattice/
    ├── lattice.sqlite   # Index, search, canvases
    └── cache/           # Temporary data
```

## Code Style

- **TypeScript:** Strict mode, avoid `any`, use `unknown` + narrowing
- **React:** Functional components, hooks, lazy-load heavy components
- **Rust:** serde for serialization, tracing for logs, atomic writes
- **Formatting:** Biome handles it (auto-organizes imports)

## Safety Rules

- Treat vault paths as untrusted input
- Use `paths::join_under()` to prevent `..` traversal
- Use `io_atomic::write_atomic()` for file writes
- Version durable documents (`version: 1`) and reject unsupported versions
- Never log secrets or API keys

## Adding a Tauri Command

1. Implement `#[tauri::command]` in appropriate module under `src-tauri/src/`
2. Register in `src-tauri/src/lib.rs`
3. Add to `TauriCommands` interface in `src/lib/tauri.ts`
