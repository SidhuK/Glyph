# System Overview

Glyph is an offline-first desktop note app. The app stores the user's notes as files in a chosen folder, keeps derived metadata in `.glyph/`, and uses Tauri commands to connect a React interface to a Rust backend.

Use this document first. It gives you the map for the other architecture manuals and names the files that own the main behavior.

## Architecture Shape

Glyph has four main runtime boundaries:

1. React frontend in `src/`
2. Tauri command contract in `src/lib/tauri.ts`
3. Rust backend in `src-tauri/src/`
4. Space folder on disk, including `.md` files and `.glyph/` derived data

The frontend never reads the workspace filesystem directly for core app data. It calls the typed `invoke()` helper in `src/lib/tauri.ts`. Rust receives those commands, checks the active space, validates relative paths, performs filesystem or SQLite work, and emits events back to the UI.

```text
User
  |
  v
React shell, editor, AI panel, database views
  |
  | invoke("command", payload)
  v
src/lib/tauri.ts typed command map
  |
  v
Tauri command handlers in src-tauri/src/lib.rs
  |
  +--> space files: markdown, attachments, folders
  +--> app support index: derived SQLite search index per space
  +--> .glyph/databases.json workspace database definitions
  +--> app config: settings, AI profiles, license, update state
```

## Manual Set

Read the docs in this order when you are onboarding or changing a cross-cutting feature:

1. `01-system-overview.md`: the boundary map and change rules.
2. `02-spaces-storage-filesystem.md`: spaces, `.glyph/`, path validation, file events.
3. `03-frontend-shell-state.md`: providers, shell state, tabs, command routing, prefetch.
4. `04-ipc-and-native-runtime.md`: typed IPC, command registration, menus, windows.
5. `05-editor-markdown-autosave.md`: TipTap, Markdown serialization, autosave, conflicts.
6. `06-index-search-graph-tasks.md`: SQLite index, FTS, tags, links, graph, tasks.
7. `07-databases-frontmatter.md`: workspace databases, table/board views, frontmatter writes.
8. `08-ai-runtime-tools-history.md`: AI providers, context building, tool access, history.
9. `09-settings-menus-git-sync-native-windows.md`: settings, shortcuts, Git sync, native windows.
10. `10-security-and-operational-invariants.md`: invariants that keep data and secrets safe.

The set uses two patterns from external architecture documentation practice:

- Keep architecture docs next to the code so engineers can update docs in the same change as code. ADR guidance recommends lightweight Markdown records in source control for this reason. See <https://docs.cloud.google.com/architecture/architecture-decision-records>.
- Prefer useful levels of abstraction. The C4 model names context, container, component, and code views. These docs use context and container views where they help, then jump to concrete file ownership. See <https://c4model.com/diagrams>.
- Separate explanation from procedural checklists. Diataxis names explanation and reference as distinct documentation needs; these manuals combine both but keep "Change Checklist" and "Debugging Map" sections easy to scan. See <https://diataxis.fr/>.

## Repository Containers

### React App

The React app lives under `src/`. `src/App.tsx` wraps `<AppShell />` in `AppProviders` and `LicenseGate`. `src/contexts/index.tsx` composes the app providers in this order:

1. TanStack Query client
2. `SpaceProvider`
3. `FileTreeProvider`
4. `UIProvider`
5. `EditorProvider`

That order matters. File tree state depends on the active space. UI state depends on space changes. Editor state exposes save behavior to shell shortcuts and menus.

### Tauri IPC Boundary

`src/lib/tauri.ts` defines the TypeScript command map and exports a typed `invoke()` wrapper. The frontend should use this wrapper instead of `@tauri-apps/api/core` directly. The wrapper gives command names a typed payload and result.

Rust registers the matching commands in `src-tauri/src/lib.rs` inside `tauri::generate_handler!`. Adding a command requires changes on both sides:

1. Implement or expose the Rust command.
2. Register it in `src-tauri/src/lib.rs`.
3. Add the command signature to `TauriCommands` in `src/lib/tauri.ts`.
4. Call it through `invoke()` from React.

### Rust Backend

The Rust backend owns durable operations and native integration:

- `space/`: active space lifecycle and filesystem watcher
- `space_fs/`: list, read, write, rename, delete, preview, link resolution
- `index/`: derived SQLite index for notes, tags, links, tasks, search, calendar, graph
- `databases/`: workspace database definitions and frontmatter-backed row edits
- `ai_rig/`, `ai_codex/`, `ai_amp/`, `ai_claude_code/`, `ai_opencode/`, `ai_pi/`: AI runtimes
- `git_sync/`: Git sync configuration, status, background runs
- `license/`: trial/license bootstrap and Gumroad verification
- `paths.rs`, `io_atomic.rs`, `net.rs`: cross-cutting safety helpers

### Disk Model

The selected space folder contains user-owned content. Markdown notes are first-class files. Attachments and other files can live beside notes.

Glyph stores space-local app metadata under `.glyph/` in the space:

- `.glyph/databases.json`: workspace database definitions and status colors
- `.glyph/cache/ai/`: per-run AI audit JSON
- `.glyph/Glyph/ai_history/`: AI chat history records
- `.glyph/Glyph/ai_secrets.json`: per-space AI API keys
- `.glyph/cache/`: cache material

The derived SQLite search index lives under Tauri app config (`Application Support/com.karatsidhu.glyph/index/<space-key>/.glyph/glyph.sqlite`). Markdown files remain the source of truth; the index rebuilds from notes when missing or empty.

App-level preferences that do not belong to a single space live in Tauri app config through plugins or Rust app config paths.

## Primary Data Flows

### Open a Space

1. React calls `space_open` or `space_create` from `SpaceContext`.
2. Rust canonicalizes the folder and creates or opens Glyph metadata.
3. Rust stores the active root in `SpaceState`.
4. Rust resets the index schema cache.
5. Rust installs a recursive notes watcher.
6. React stores the selected path in settings and clears stale caches.
7. `FileTreeProvider` lists the root and starts `index_rebuild`.

See `02-spaces-storage-filesystem.md` for the details.

### Open and Save a Note

1. The tab manager opens a markdown file target.
2. `MarkdownEditorPane` reads the note through `space_read_text`.
3. `NoteInlineEditor` owns the TipTap editor instance.
4. User edits update Markdown text in React state.
5. Autosave calls `space_write_text` with the last known `mtime_ms`.
6. Rust validates the path, checks conflicts, writes atomically, indexes the note, and emits `notes:external_changed`.

See `05-editor-markdown-autosave.md`.

### Query Notes

1. The UI calls search, all-docs, calendar, tags, graph, database, or task commands.
2. Rust opens the app-support SQLite index for the active space.
3. Rust queries derived rows generated from Markdown content.
4. If the result needs note content, Rust reads the backing note file after validating the path.

See `06-index-search-graph-tasks.md` and `07-databases-frontmatter.md`.

### AI Chat

1. The AI panel builds user messages and optional context.
2. `useRigChat` starts `ai_chat_start`.
3. Rust chooses a native provider runtime or Rig runtime based on the selected profile.
4. Rust emits `ai:chunk`, `ai:tool`, `ai:status`, `ai:done`, and `ai:error`.
5. React streams the assistant response and tool timeline.
6. Rust writes per-run audit JSON under `.glyph/cache/ai/` and chat history under `.glyph/Glyph/ai_history/`.

See `08-ai-runtime-tools-history.md`.

## Change Rules

Use these rules when changing the architecture:

- Keep the active space as the root of user data. Do not add a second source of truth for notes.
- Treat the app-support SQLite index as derived. Rebuild it when the parser or schema behavior changes.
- Route durable filesystem writes through Rust. The frontend may use Tauri plugins for dialogs and opening external files, but note content should go through `space_fs`.
- Use `paths::join_under()` and hidden-path checks for any space-relative path.
- Use `io_atomic::write_atomic()` for durable writes unless a create-new operation needs `OpenOptions::create_new`.
- Update both `src/lib/tauri.ts` and `src-tauri/src/lib.rs` for new commands.
- Emit events when the UI needs to refresh derived state after backend work.
- Keep AI tools scoped to the active space and block hidden paths.

## Code Reading Checklist

Start with these files when you need current behavior:

- `src/App.tsx`
- `src/contexts/index.tsx`
- `src/components/app/AppShell.tsx`
- `src/lib/tauri.ts`
- `src-tauri/src/lib.rs`
- `src-tauri/src/space/commands.rs`
- `src-tauri/src/space/state.rs`
- `src-tauri/src/space/watcher.rs`
- `src-tauri/src/space_fs/read_write/text.rs`
- `src-tauri/src/index/schema.rs`
- `src-tauri/src/index/indexer.rs`
- `src-tauri/src/databases/commands.rs`
- `src-tauri/src/ai_rig/commands.rs`

## When This Doc Is Wrong

Treat the code as the source of truth. Update this document when you change a boundary, add a durable store, change command registration, or move ownership between React and Rust.
