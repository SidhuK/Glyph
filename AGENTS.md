# AGENTS.md

This file provides guidance to Codex and other AI code agents when working with code in this repository.

Primary goals:

- Make the smallest correct change that matches the intent.
- Code LOC should not exceed 200 lines. Prefer refactoring into subsequent folders/files to ensure clean code.
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
- **Note Editor**: TipTap with Markdown support (`@tiptap/markdown`)
- **Persistence**:
  - `@tauri-apps/plugin-store` for app settings
  - Filesystem for notes + attachments
  - Local SQLite (`.tether/tether.sqlite`) for index/search, links/tags, and canvases

### IPC Layer

Tauri commands are defined in `src-tauri/src/lib.rs` (registration) and implemented in individual Rust modules. The frontend uses a typed wrapper at `src/lib/tauri.ts` that maps command names to their argument/result types via the `TauriCommands` interface.

Rules:

- Always use the typed `invoke()` helper from `src/lib/tauri.ts` (do not call `tauriInvoke` directly).
- When adding or changing a command:
  1. Implement the Rust `#[tauri::command]` in an appropriate module under `src-tauri/src/`
  2. Register it in `src-tauri/src/lib.rs`
  3. Update the `TauriCommands` interface in `src/lib/tauri.ts`
  4. Prefer returning structured error strings (and keep them stable enough for UX)
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

- Notes are files; canvases are currently stored in SQLite (see `src-tauri/src/canvas.rs` and `src-tauri/src/index/`).
- The backend watches for external `.md` changes and emits `notes:external_changed` so the UI can refresh.
- Vault paths must be treated as untrusted input: always use safe join helpers (see `src-tauri/src/paths.rs`).

Legacy / planned layout (may exist in docs or older vaults):

- Some references may mention `canvases/`, `cache/`, or `vault.json`. Prefer the current layout above when implementing features; update docs if you touch those areas.

## Frontend Files (`src/`)

| File              | Purpose                                                  |
| ----------------- | -------------------------------------------------------- |
| `main.tsx`        | React app entry point, renders `<App />`                 |
| `App.tsx`         | Thin orchestrator composing hooks and AppShell           |
| `App.css`         | Global styles for the app shell, sidebar, and components |
| `SettingsApp.tsx` | Settings window entry point                              |

### Hooks (`src/hooks/`)

| File                  | Purpose                                                   |
| --------------------- | --------------------------------------------------------- |
| `useAppBootstrap.ts`  | App-level state: vault, recent vaults, indexing, settings |
| `useViewLoader.ts`    | View document loading and building (folder/tag/search)    |
| `useFileTree.ts`      | File tree state and directory operations                  |
| `useSearch.ts`        | Search query and results management                       |
| `useAISidebar.ts`     | AI sidebar open/width state with persistence              |
| `useFolderShelf.ts`   | Folder shelf subfolder/recent data                        |
| `useMenuListeners.ts` | Tauri menu event listeners                                |

### Utils (`src/utils/`)

| File        | Purpose                                    |
| ----------- | ------------------------------------------ |
| `path.ts`   | Path utilities (parentDir, isMarkdownPath) |
| `window.ts` | Window drag handling utilities             |

### Components (`src/components/`)

Root-level files are thin re-exports for backwards compatibility. Actual implementations live in subfolders.

| File                         | Purpose                                  |
| ---------------------------- | ---------------------------------------- |
| `CanvasPane.tsx`             | Re-exports from `canvas/`                |
| `CanvasNoteInlineEditor.tsx` | Re-exports from `editor/`                |
| `AIPane.tsx`                 | Re-exports from `ai/`                    |
| `FileTreePane.tsx`           | File tree sidebar pane                   |
| `FolderBreadcrumb.tsx`       | Breadcrumb navigation for folders        |
| `FolderShelf.tsx`            | Folder shelf with subfolders and recents |
| `Icons.tsx`                  | Re-exports from `Icons/`                 |
| `MotionUI.tsx`               | Motion-animated UI components            |
| `NotesPane.tsx`              | Sidebar list of notes                    |
| `CanvasesPane.tsx`           | Sidebar list of canvases                 |
| `SearchPane.tsx`             | Search results pane                      |
| `TagsPane.tsx`               | Tags list pane                           |

### `components/app/` - App Shell Components

| File                 | Purpose                                    |
| -------------------- | ------------------------------------------ |
| `AppShell.tsx`       | Main layout shell composing sidebar + main |
| `Sidebar.tsx`        | Sidebar wrapper with collapse toggle       |
| `SidebarHeader.tsx`  | Sidebar header with vault actions          |
| `SidebarContent.tsx` | Sidebar content (file tree or tags)        |
| `MainContent.tsx`    | Main content area with canvas              |
| `MainToolbar.tsx`    | Main toolbar with breadcrumb and AI toggle |
| `WelcomeScreen.tsx`  | Welcome screen when no vault is open       |

### `components/canvas/` - Canvas Editor

| File                          | Purpose                                        |
| ----------------------------- | ---------------------------------------------- |
| `index.ts`                    | Module exports                                 |
| `types.ts`                    | CanvasNode, CanvasEdge, CanvasDocLike, etc.    |
| `constants.ts`                | BULK_LOAD_THRESHOLD, STICKY_COLORS, dimensions |
| `utils.ts`                    | Node hash, color, rotation, size utilities     |
| `contexts.ts`                 | CanvasActionsContext, CanvasNoteEditContext    |
| `CanvasPane.tsx`              | Main canvas component with ReactFlow           |
| `CanvasToolbar.tsx`           | Toolbar with alignment/snap/add tools          |
| `CanvasNoteOverlayEditor.tsx` | Note editing overlay with tabs                 |
| `nodes/NoteNode.tsx`          | Note node component                            |
| `nodes/TextNode.tsx`          | Text/sticky node component                     |
| `nodes/FileNode.tsx`          | File node component                            |
| `nodes/LinkNode.tsx`          | Link preview node component                    |
| `nodes/FrameNode.tsx`         | Frame/group node component                     |
| `nodes/FolderNode.tsx`        | Folder node component                          |
| `nodes/FolderPreviewNode.tsx` | Folder preview popup node                      |
| `hooks/useCanvasHistory.ts`   | Undo/redo history management                   |
| `hooks/useNoteEditSession.ts` | Inline note editing session                    |

### `components/editor/` - Note Inline Editor

| File                         | Purpose                                  |
| ---------------------------- | ---------------------------------------- |
| `index.ts`                   | Module exports                           |
| `types.ts`                   | CanvasInlineEditorMode, SlashCommandItem |
| `slashCommands.ts`           | Slash command definitions and extension  |
| `extensions/index.ts`        | TipTap extensions configuration          |
| `hooks/useNoteEditor.ts`     | TipTap editor setup hook                 |
| `CanvasNoteInlineEditor.tsx` | Main editor component                    |
| `EditorRibbon.tsx`           | Formatting toolbar/ribbon                |

### `components/ai/` - AI Chat & Context

| File                     | Purpose                                    |
| ------------------------ | ------------------------------------------ |
| `index.ts`               | Module exports                             |
| `types.ts`               | ChatMessage, ContextSpec, ContextManifest  |
| `utils.ts`               | Error handling, token estimation utilities |
| `payloadBuilder.ts`      | Context payload building logic             |
| `useAiContext.ts`        | Context folder attachment management       |
| `useAiProfiles.ts`       | AI profile loading and management          |
| `AISidebar.tsx`          | AI sidebar container with chat             |
| `AIPane.tsx`             | Main AI pane component                     |
| `ProfileSettings.tsx`    | Profile configuration UI                   |
| `ContextPayload.tsx`     | Context payload configuration UI           |
| `ChatActions.tsx`        | Action buttons (rewrite, create note)      |
| `ChatMessages.tsx`       | Chat message list                          |
| `ChatInput.tsx`          | Chat input with send/cancel                |
| `hooks/useAIProfiles.ts` | Profile CRUD hook                          |
| `hooks/useAIContext.ts`  | Context state hook                         |
| `hooks/useAIChat.ts`     | Chat streaming hook                        |
| `hooks/useAIActions.ts`  | Action handlers hook                       |

### `components/ui/` - Shared UI Components

| File                 | Purpose                         |
| -------------------- | ------------------------------- |
| `index.ts`           | Module exports                  |
| `animations.ts`      | Shared animation variants       |
| `MotionButton.tsx`   | Motion-animated button variants |
| `MotionPanel.tsx`    | Motion-animated panel/container |
| `MotionWrappers.tsx` | Motion wrapper components       |

### `components/Icons/` - Icon Components

| File                  | Purpose                  |
| --------------------- | ------------------------ |
| `index.ts`            | Re-exports all icons     |
| `NavigationIcons.tsx` | Navigation-related icons |
| `EditorIcons.tsx`     | Editor formatting icons  |
| `ActionIcons.tsx`     | Action/button icons      |
| `FileIcons.tsx`       | File type icons          |

### `components/filetree/` - File Tree

| File               | Purpose                        |
| ------------------ | ------------------------------ |
| `index.ts`         | Module exports                 |
| `FileTreePane.tsx` | Main file tree container       |
| `FileTreeItem.tsx` | Individual tree item component |
| `fileTypeUtils.ts` | File type detection utilities  |

### `components/shelf/` - Folder Shelf

| File              | Purpose                 |
| ----------------- | ----------------------- |
| `index.ts`        | Module exports          |
| `FolderShelf.tsx` | Main shelf component    |
| `ShelfItem.tsx`   | Individual shelf item   |
| `shelfUtils.ts`   | Shelf utility functions |

### `components/settings/` - Settings Panes

| File                      | Purpose                     |
| ------------------------- | --------------------------- |
| `GeneralSettingsPane.tsx` | General app settings        |
| `AiSettingsPane.tsx`      | AI profile and key settings |
| `VaultSettingsPane.tsx`   | Vault-specific settings     |

### Lib (`src/lib/`)

| File              | Purpose                                                 |
| ----------------- | ------------------------------------------------------- |
| `tauri.ts`        | Typed IPC wrapper with `TauriCommands` interface        |
| `settings.ts`     | App settings persistence via `@tauri-apps/plugin-store` |
| `canvasLayout.ts` | Grid layout computation for canvas nodes                |
| `notePreview.ts`  | Note preview parsing (title, content extraction)        |
| `diff.ts`         | Unified diff generation for text comparison             |
| `windows.ts`      | Window management (open settings window)                |
| `views.ts`        | Re-exports from `views/`                                |

### `lib/views/` - View Document System

| File                     | Purpose                                       |
| ------------------------ | --------------------------------------------- |
| `index.ts`               | Module exports                                |
| `types.ts`               | ViewKind, ViewRef, ViewDoc interfaces         |
| `utils.ts`               | basename, viewId, sha256Hex, viewDocPath      |
| `sanitize.ts`            | sanitizeNodes, sanitizeEdges, asCanvasDocLike |
| `persistence.ts`         | loadViewDoc, saveViewDoc                      |
| `builders/common.ts`     | Shared builder utilities                      |
| `builders/folderView.ts` | buildFolderViewDoc                            |
| `builders/searchView.ts` | buildSearchViewDoc                            |
| `builders/tagView.ts`    | buildTagViewDoc                               |

### `lib/ai/` - AI Transport

| File                    | Purpose                           |
| ----------------------- | --------------------------------- |
| `tauriChatTransport.ts` | Tauri-based AI SDK chat transport |

## Backend Files (`src-tauri/src/`)

### Root Files

| File              | Purpose                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `main.rs`         | Tauri app entry point, calls `app_lib::run()`                                                               |
| `lib.rs`          | Tauri builder setup: registers plugins, manages state, builds menus, registers all IPC commands             |
| `canvas.rs`       | Canvas CRUD: `canvas_list`, `canvas_create`, `canvas_read`, `canvas_write`; stores canvas docs in SQLite    |
| `io_atomic.rs`    | Atomic file writes: writes to temp file, syncs, renames to destination, syncs parent directory (crash-safe) |
| `net.rs`          | Network helpers (URL host validation, SSRF protection)                                                      |
| `paths.rs`        | Path safety: `join_under()` prevents path traversal attacks by rejecting `..` components                    |
| `tether_paths.rs` | Canonical `.tether/` locations (`.tether/tether.sqlite`, cache dir, etc.)                                   |
| `tether_fs.rs`    | Filesystem helpers that operate inside `.tether/` safely                                                    |

### `ai/` - AI Chat & Profile Management

| File           | Purpose                                                                                |
| -------------- | -------------------------------------------------------------------------------------- |
| `mod.rs`       | Module exports: `AiState` and commands submodule                                       |
| `types.rs`     | Type definitions: `AiProfile`, `AiProviderKind`, `AiMessage`, events, request/response |
| `state.rs`     | `AiState` struct with job cancellation token management                                |
| `keychain.rs`  | Secure API key storage via system keychain                                             |
| `store.rs`     | AI profile persistence (JSON file), default profiles, legacy secret migration          |
| `helpers.rs`   | Utilities: URL parsing, HTTP client, message/system prompt splitting                   |
| `streaming.rs` | SSE streaming for OpenAI, Anthropic, and Gemini APIs                                   |
| `audit.rs`     | Audit log writing for AI requests/responses                                            |
| `commands.rs`  | Tauri commands: profile CRUD, secret management, chat start/cancel                     |

### `index/` - SQLite Index & Search

| File             | Purpose                                                                    |
| ---------------- | -------------------------------------------------------------------------- |
| `mod.rs`         | Module exports: `open_db`, `index_note`, `remove_note`, commands submodule |
| `types.rs`       | Type definitions: `SearchResult`, `IndexNotePreview`, `BacklinkItem`, etc. |
| `db.rs`          | Database connection, path resolution, title-to-ID resolution               |
| `schema.rs`      | SQLite schema creation (notes, links, tags, FTS5, canvases)                |
| `helpers.rs`     | Utilities: SHA256 hashing, ISO8601 timestamps, path normalization          |
| `frontmatter.rs` | YAML frontmatter parsing, title/created/updated extraction, preview gen    |
| `tags.rs`        | Tag normalization, frontmatter tag parsing, inline tag parsing             |
| `links.rs`       | Wikilink and markdown link parsing, outgoing link extraction               |
| `indexer.rs`     | Note indexing, removal, full rebuild with link resolution                  |
| `commands.rs`    | Tauri commands: `index_rebuild`, `search`, `tags_list`, `backlinks`, etc.  |

### `links/` - Link Preview & Caching

| File          | Purpose                                                            |
| ------------- | ------------------------------------------------------------------ |
| `mod.rs`      | Module exports: commands submodule                                 |
| `types.rs`    | Type definitions: `LinkPreview`                                    |
| `helpers.rs`  | Utilities: URL normalization, cache paths, HTTP client             |
| `cache.rs`    | Link preview cache read/write                                      |
| `fetch.rs`    | HTML fetching, meta tag extraction, YouTube oEmbed, image download |
| `commands.rs` | Tauri command: `link_preview` with caching and TTL                 |

### `notes/` - Note CRUD & Attachments

| File             | Purpose                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| `mod.rs`         | Module exports: commands and attachments submodules                    |
| `types.rs`       | Type definitions: `NoteMeta`, `NoteDoc`, `NoteWriteResult`, etc.       |
| `frontmatter.rs` | YAML frontmatter parsing, normalization, rendering                     |
| `helpers.rs`     | Utilities: path resolution, etag generation, metadata extraction       |
| `commands.rs`    | Tauri commands: `notes_list`, `note_create`, `note_read`, `note_write` |
| `attachments.rs` | Tauri command: `note_attach_file` with content-addressed asset storage |

### `vault/` - Vault Lifecycle & File Watching

| File          | Purpose                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| `mod.rs`      | Module exports: `VaultState` and commands submodule                     |
| `state.rs`    | `VaultState` struct: current vault path, file watcher storage           |
| `helpers.rs`  | Vault creation/opening, temp file cleanup, directory canonicalization   |
| `watcher.rs`  | File watcher setup for external `.md` changes, incremental indexing     |
| `commands.rs` | Tauri commands: `vault_create`, `vault_open`, `vault_get_current`, etc. |

### `vault_fs/` - Vault Filesystem Operations

| File            | Purpose                                                                           |
| --------------- | --------------------------------------------------------------------------------- |
| `mod.rs`        | Module exports: list, read_write, summary submodules                              |
| `types.rs`      | Type definitions: `FsEntry`, `TextFileDoc`, `DirChildSummary`, etc.               |
| `helpers.rs`    | Utilities: etag generation, mtime, hidden path detection                          |
| `list.rs`       | Tauri commands: `vault_list_dir`, `vault_list_files`, `vault_list_markdown_files` |
| `read_write.rs` | Tauri commands: `vault_read_text`, `vault_write_text`, `vault_relativize_path`    |
| `summary.rs`    | Tauri commands: `vault_dir_children_summary`, `vault_dir_recent_entries`          |

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
- Indexing behavior:
  - On vault open, the app kicks an `index_rebuild` in the background (non-blocking) to warm search/tags/backlinks and note preview cache.
  - Writes to `.md` via `vault_write_text` are indexed immediately; external `.md` changes are watched and incrementally indexed/removed.

## Skills

Use the most relevant skills available in your environment when performing non-trivial work:

- Rust / async Rust skills for backend changes in `src-tauri/`
- Tauri skills for IPC, filesystem, and platform-specific behavior
- TypeScript / React / Vercel React best practices for frontend changes in `src/`

If your environment supports repository-scoped skills in `.agents/skills/`, prefer those for design/UX or architectural guidance so the behavior is consistent across contributors.
