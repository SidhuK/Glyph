# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start Vite dev server (frontend only)
pnpm tauri dev        # Start full Tauri app in dev mode
pnpm build            # TypeScript check + Vite build
pnpm check            # Run Biome lint + format check
pnpm lint             # Run Biome linter only
pnpm format           # Auto-format with Biome

cd src-tauri && cargo check   # Typecheck Rust backend
cd src-tauri && cargo build   # Build Rust backend
```

## Architecture

**Cipher** is a desktop note-taking app with a node-based canvas editor.

- **Frontend**: React 19 + TypeScript + Vite in `src/`
- **Backend**: Tauri 2 + Rust in `src-tauri/`
- **Canvas**: `@xyflow/react` for node-based editing
- **Note Editor**: CodeMirror with markdown support
- **Persistence**: `@tauri-apps/plugin-store` for settings, filesystem for vault data

### IPC Layer

Tauri commands are defined in `src-tauri/src/lib.rs` and individual modules. The frontend uses a typed wrapper at `src/lib/tauri.ts` that maps command names to their argument/result types via the `TauriCommands` interface. Always use the `invoke()` helper from this module rather than calling `tauriInvoke` directly.

### Vault System

The app uses a vault-based architecture where a vault is a directory containing:

- `notes/` - Markdown files with YAML frontmatter (UUID filenames)
- `canvases/` - JSON files storing node/edge graphs (UUID filenames)
- `assets/` - Attached files (content-addressed by SHA256 hash)
- `cache/` - Temporary/cached data
- `vault.json` - Schema version and metadata

## Frontend Files (`src/`)

| File       | Purpose                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| `main.tsx` | React app entry point, renders `<App />`                                                             |
| `App.tsx`  | Root component: vault selection, note/canvas state management, layout shell with sidebar + main area |
| `App.css`  | Global styles for the app shell, sidebar, and components                                             |

### Components (`src/components/`)

| File               | Purpose                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CanvasPane.tsx`   | ReactFlow-based canvas editor with custom node types (note, text, link, frame), undo/redo history, auto-save, alignment/distribution tools, snap-to-grid |
| `NoteEditor.tsx`   | CodeMirror markdown editor with auto-save (500ms debounce), file attachment support, save state indicator                                                |
| `NotesPane.tsx`    | Sidebar list of notes with selection, create, and delete actions                                                                                         |
| `CanvasesPane.tsx` | Sidebar list of canvases with selection and create actions                                                                                               |

### Lib (`src/lib/`)

| File          | Purpose                                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tauri.ts`    | Typed IPC wrapper: defines `TauriCommands` interface mapping command names to arg/result types, exports typed `invoke()` function and `TauriInvokeError` class |
| `settings.ts` | App settings persistence via `@tauri-apps/plugin-store`: current vault path, recent vaults list (max 20)                                                       |

## Backend Files (`src-tauri/src/`)

| File           | Purpose                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `main.rs`      | Tauri app entry point, calls `app_lib::run()`                                                                                                                                              |
| `lib.rs`       | Tauri builder setup: registers plugins (dialog, opener, store), manages `VaultState`, registers all IPC commands                                                                           |
| `vault.rs`     | Vault lifecycle: `vault_create`, `vault_open`, `vault_get_current` commands; creates directory structure and `vault.json`; holds current vault path in `VaultState` (Mutex-guarded)        |
| `notes.rs`     | Note CRUD: `notes_list`, `note_create`, `note_read`, `note_write`, `note_delete`, `note_attach_file`; parses/renders YAML frontmatter; content-addressed asset storage with SHA256 hashing |
| `canvas.rs`    | Canvas CRUD: `canvas_list`, `canvas_create`, `canvas_read`, `canvas_write`; stores nodes/edges as JSON with version field                                                                  |
| `io_atomic.rs` | Atomic file writes: writes to temp file, syncs, renames to destination, syncs parent directory (crash-safe)                                                                                |
| `paths.rs`     | Path safety: `join_under()` prevents path traversal attacks by rejecting `..` components                                                                                                   |

## Code Style

- Biome handles formatting and linting (auto-organizes imports)
- TypeScript strict mode; avoid `any`
- React functional components with hooks
- Lazy-load heavy components (e.g., `CanvasPane`)
- Rust: use serde for serialization, tracing for logs, atomic file writes

## Skills

Use Rust skill for checking Rust code, Tauri skill for checking Tauri code, React skill for checking React and TypeScript code as well as the Vercel skills for checking TypeScript code.
