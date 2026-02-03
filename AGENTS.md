# AGENTS.md

This file provides guidance to Codex and other AI code agents when working with code in this repository.

Primary goals:
- Make the smallest correct change that matches the intent.
- Keep the app offline-first and vault-backed (filesystem + local SQLite).
- Preserve type-safety across the Tauri IPC boundary (frontend ↔ backend).
- Prefer crash-safe / atomic writes for user data.

## Commands

```bash
pnpm dev              # Start Vite dev server (frontend only)
pnpm tauri dev        # Start full Tauri app in dev mode
pnpm build            # TypeScript check + Vite build
pnpm check            # Run Biome lint + format check
pnpm lint             # Run Biome linter only
pnpm format           # Auto-format with Biome
pnpm preview          # Preview built frontend (no Tauri)

cd src-tauri && cargo check   # Typecheck Rust backend
cd src-tauri && cargo build   # Build Rust backend
cd src-tauri && cargo fmt     # Format Rust (if rustfmt installed)
cd src-tauri && cargo clippy  # Lint Rust (if clippy installed)
```

## Quick Start (Typical Workflow)

- Frontend-only UI work: `pnpm dev`
- Full desktop app work (recommended): `pnpm tauri dev`
- Before pushing changes: `pnpm check && pnpm build` and `cd src-tauri && cargo check`

## Architecture

**Tether** is a desktop note-taking app with a node-based canvas editor.

- **Frontend**: React 19 + TypeScript + Vite in `src/`
- **Backend**: Tauri 2 + Rust in `src-tauri/`
- **Canvas**: `@xyflow/react` for node-based editing
- **Note Editor**: CodeMirror with markdown support
- **Persistence**:
  - `@tauri-apps/plugin-store` for app settings
  - Filesystem for notes + attachments
  - Local SQLite (`.tether/tether.sqlite`) for index/search, links/tags, and canvases

### IPC Layer

Tauri commands are defined in `src-tauri/src/lib.rs` (registration) and implemented in individual Rust modules. The frontend uses a typed wrapper at `src/lib/tauri.ts` that maps command names to their argument/result types via the `TauriCommands` interface.

Rules:
- Always use the typed `invoke()` helper from `src/lib/tauri.ts` (do not call `tauriInvoke` directly).
- When adding or changing a command:
  1) Implement the Rust `#[tauri::command]` in an appropriate module under `src-tauri/src/`
  2) Register it in `src-tauri/src/lib.rs`
  3) Update the `TauriCommands` interface in `src/lib/tauri.ts`
  4) Prefer returning structured error strings (and keep them stable enough for UX)
- Keep payloads JSON-serializable and version any durable documents (`version: u32` pattern).

### Vault System

The app uses a vault-based architecture where a vault is a user-selected directory containing user-visible data plus a hidden `.tether/` directory for app-managed state.

Current layout (as implemented today):

- `notes/` - Markdown files with YAML frontmatter (UUID filenames)
- `assets/` - Attached files (content-addressed by SHA256 hash, preserving extension)
- `.tether/` - App-managed state (SQLite DB, cache)
  - `.tether/tether.sqlite` - Index/search (FTS), links, tags, and canvases
  - `.tether/cache/` - Temporary/cached data

Notes about the model:
- Notes are files; canvases are currently stored in SQLite (see `src-tauri/src/canvas.rs` and `src-tauri/src/index.rs`).
- The backend watches for external `.md` changes and emits `notes:external_changed` so the UI can refresh.
- Vault paths must be treated as untrusted input: always use safe join helpers (see `src-tauri/src/paths.rs`).

Legacy / planned layout (may exist in docs or older vaults):
- Some references may mention `canvases/`, `cache/`, or `vault.json`. Prefer the current layout above when implementing features; update docs if you touch those areas.

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
| `lib.rs`       | Tauri builder setup: registers plugins (dialog, opener, store, notification), manages `VaultState`, registers all IPC commands                                                            |
| `vault.rs`     | Vault lifecycle: `vault_create`, `vault_open`, `vault_get_current`; ensures `.tether/` dirs; holds current vault path in `VaultState` (Mutex-guarded); watches for external note changes   |
| `vault_fs.rs`  | Higher-level vault filesystem helpers (vault-aware IO utilities)                                                                                                                          |
| `notes.rs`     | Note CRUD: `notes_list`, `note_create`, `note_read`, `note_write`, `note_delete`, `note_attach_file`; YAML frontmatter; atomic writes; content-addressed assets (SHA256)                  |
| `canvas.rs`    | Canvas CRUD: `canvas_list`, `canvas_create`, `canvas_read`, `canvas_write`; stores canvas docs as JSON in SQLite with `version`                                                            |
| `index.rs`     | Local SQLite index/search (FTS), backlinks, link & tag extraction, and schema management (also stores canvases)                                                                            |
| `links.rs`     | Link-graph helpers and commands (wiki-link style parsing, backlink building)                                                                                                              |
| `ai.rs`        | AI-related backend commands and helpers (kept behind explicit UI actions)                                                                                                                  |
| `net.rs`       | Network helpers (use sparingly; keep vault data local by default)                                                                                                                         |
| `io_atomic.rs` | Atomic file writes: writes to temp file, syncs, renames to destination, syncs parent directory (crash-safe)                                                                                |
| `paths.rs`     | Path safety: `join_under()` prevents path traversal attacks by rejecting `..` components                                                                                                   |
| `tether_paths.rs` | Canonical `.tether/` locations (`.tether/tether.sqlite`, cache dir, etc.)                                                                                                              |
| `tether_fs.rs` | Filesystem helpers that operate inside `.tether/` safely                                                                                                                                   |

## Code Style

- Biome handles formatting and linting (auto-organizes imports)
- TypeScript strict mode; avoid `any` (prefer `unknown` + narrowing)
- React functional components with hooks
- Lazy-load heavy components (e.g., `CanvasPane`) when it improves startup performance
- Prefer stable, typed module boundaries (UI ↔ IPC ↔ backend)
- Rust: use serde for serialization, tracing for logs, atomic file writes, and safe path joins

### Formatting & Linting Expectations

- Prefer fixing lint at the source rather than disabling rules.
- Keep imports organized (Biome will do this automatically).
- Avoid introducing new dependencies unless necessary; keep bundles lean.

### Data Safety & Security

- Treat vault paths and IDs as untrusted input.
- Never allow `..` traversal or absolute-path escapes when joining paths (use `paths::join_under()`).
- For file writes under the vault, prefer `io_atomic::write_atomic()` for crash safety.
- Keep durable document formats versioned (`version: 1`) and reject unsupported versions with clear errors.

### Notes & Attachments

- Notes live at `notes/<uuid>.md` with YAML frontmatter that includes at least `id`, `title`, `created`, `updated`, and `tags`.
- Writes normalize frontmatter and preserve the original `created` timestamp when updating.
- Attachments are copied into `assets/` using a SHA256 content hash (the hash is the filename; the original extension is preserved when present).

### Canvases & Indexing

- Canvases are stored in `.tether/tether.sqlite` as JSON documents (`canvases.doc_json`) and are versioned (`CANVAS_VERSION`).
- Search and backlinks are derived from note content and live in SQLite (FTS5). Rebuild flows should not delete the DB because it also stores non-derived data (e.g., canvases).

## Skills

Use the most relevant skills available in your environment when performing non-trivial work:
- Rust / async Rust skills for backend changes in `src-tauri/`
- Tauri skills for IPC, filesystem, and platform-specific behavior
- TypeScript / React / Vercel React best practices for frontend changes in `src/`

If your environment supports repository-scoped skills in `.agents/skills/`, prefer those for design/UX or architectural guidance so the behavior is consistent across contributors.
