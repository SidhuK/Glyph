# Spaces, Storage, and Filesystem Flow

Glyph treats a user-selected folder as a space. A space contains the user's notes and attachments, plus a `.glyph/` directory for app metadata. The Rust backend owns space lifecycle, file safety, writes, indexing side effects, and filesystem change events.

This doc explains how a space opens, how files move through the system, and what code you must touch when changing storage behavior.

## Owned Files

The active space root contains user content:

```text
My Space/
  Notes/
    Plan.md
  assets/
    pasted-image.png
  .glyph/
    glyph.sqlite
    databases.json
    cache/
    Glyph/
      ai_history/
      ai_secrets.json
```

Code ownership:

- `src-tauri/src/space/commands.rs`: create, open, close, onboarding note command
- `src-tauri/src/space/helpers.rs`: create/open implementation and onboarding helpers
- `src-tauri/src/space/state.rs`: active root, watcher handle, local-change tracking, store mutexes
- `src-tauri/src/space/watcher.rs`: recursive filesystem watcher and index refresh
- `src-tauri/src/glyph_paths.rs`: `.glyph/` paths
- `src-tauri/src/space_fs/`: file tree, read/write, preview, rename, delete, link resolution
- `src-tauri/src/paths.rs`: traversal-safe joining
- `src-tauri/src/io_atomic.rs`: crash-safer writes and copies
- `src/contexts/SpaceContext.tsx`: frontend space state and recent-space handling
- `src/contexts/FileTreeContext.tsx`: frontend tree state tied to a space
- `src/hooks/useFileTree.ts`: frontend filesystem operations and tree loading
- `src/hooks/useFileTreeCRUD.ts`: create, rename, move, delete UI actions

## Space State

Rust stores active space state in `SpaceState`:

```rust
pub struct SpaceState {
    pub(crate) current: Mutex<Option<PathBuf>>,
    pub(crate) notes_watcher: Mutex<Option<notify::RecommendedWatcher>>,
    recent_local_changes: RecentLocalChanges,
    db_store_mutex: Arc<Mutex<()>>,
    file_tree_appearance_mutex: Arc<Mutex<()>>,
    pinned_files_mutex: Arc<Mutex<()>>,
}
```

The state has three jobs:

1. Hold the active root path.
2. Hold the watcher so it stays alive for the current space.
3. Share mutexes for JSON stores that live under `.glyph/`.

`current_root()` returns an error when no space is open. Most commands call it first, so the backend enforces "no active space, no workspace operation."

## Opening a Space

Frontend flow in `SpaceContext`:

1. `loadSettings()` reads the last space path.
2. If a path exists, React calls `invoke("space_open", { path })`.
3. User actions call `space_open` or `space_create` from `applySpaceSelection()`.
4. On successful open, React stores the root in settings and updates recent spaces.
5. On switching spaces, React closes the previous space, clears AI/editor prefetch caches, and clears current space path.

Rust flow in `space_open` and `space_create`:

1. Build a `PathBuf` from the user-selected path.
2. Canonicalize the directory through helper code.
3. Create or open Glyph metadata.
4. Reset the index schema cache with `index::db::reset_schema_cache()`.
5. Store the canonical root in `SpaceState.current`.
6. Install the notes watcher with `set_notes_watcher()`.
7. Enable the native Close Space menu item.

`space_close` clears `current`, drops the watcher, resets the schema cache, and disables Close Space.

## Path Safety

All space-relative filesystem code should join paths with `paths::join_under(root, rel)`.

`join_under()` rejects:

- absolute paths
- `..`
- platform root or prefix components

Space filesystem commands also call `deny_hidden_rel_path()` from `space_fs/helpers.rs`. It rejects any path component that starts with `.`. That blocks access to `.glyph/` through normal workspace file APIs.

Use both checks for user-controlled space-relative paths:

```rust
let rel = PathBuf::from(&path);
deny_hidden_rel_path(&rel)?;
let abs = paths::join_under(&root, &rel)?;
```

Do not bypass these helpers for convenience. A command that reads or writes a user-provided path without these checks can expose `.glyph/`, app metadata, or files outside the space.

## File Listing

`src-tauri/src/space_fs/list.rs` owns directory listing:

- `space_list_dir`: immediate children for the file tree
- `space_list_markdown_files`: markdown list for pickers and search surfaces
- `space_list_non_markdown_files`: attachment and non-markdown list

The list code hides names that `should_hide()` marks hidden, validates the starting directory, and sorts directories before files for `space_list_dir`.

Frontend loading uses `useFileTree()`:

- `loadDir()` calls `space_list_dir`.
- `loadedDirsRef` avoids duplicate loads.
- `loadRequestVersionRef` drops stale responses.
- `expandedDirs` controls which children stay hydrated.
- `expandAllDirs()` walks directories breadth-first from the root.

## Reading Text

`space_read_text`:

1. Validates the relative path.
2. Reads bytes from disk.
3. Requires valid UTF-8.
4. Returns text, SHA-256 etag, and `mtime_ms`.

`space_read_texts_batch` repeats the same validation per path and returns per-file errors instead of failing the whole batch. AI context and preview features use batch-style behavior when partial results matter.

`space_read_text_preview` and `space_read_binary_preview` live in `space_fs/read_write/preview.rs`. They limit read size for preview panes and file pickers.

## Writing Text

`space_write_text` handles note and text writes:

1. Validates the relative path.
2. Checks `base_mtime_ms` when the caller supplies it.
3. Creates parent folders.
4. Marks markdown writes as recent local changes.
5. Writes bytes through `io_atomic::write_atomic()`.
6. Reindexes markdown content with `index::index_note()`.
7. Emits `notes:external_changed` for markdown files because the watcher suppresses local writes.

The `base_mtime_ms` check protects an open editor from silently overwriting a file changed outside the app. `MarkdownEditorPane` handles the conflict path by reading the latest file and retrying once with the new mtime.

`space_open_or_create_text` uses `OpenOptions::create_new` because it must not overwrite an existing file.

## Atomic Writes

`io_atomic::write_atomic()` writes to a hidden temporary file in the destination folder, syncs the file, renames it into place, and syncs the parent directory. This pattern protects against partial files after a crash.

Use `io_atomic::copy_atomic()` when duplicating a file. Use `OpenOptions::create_new` only when the operation must reserve a new path without overwriting.

## Watcher and Event Flow

`set_notes_watcher()` installs a recursive watcher with `notify`.

The watcher emits two event types:

- `space:fs_changed`: any visible create, modify, or remove event
- `notes:external_changed`: markdown events that should refresh note-backed UI

The watcher also updates the SQLite index for markdown files. It debounces index work for 100ms and collapses repeated events by relative path.

Recent local changes prevent a loop:

1. Local markdown writes call `mark_recent_local_change()`.
2. The watcher sees the filesystem event.
3. `has_recent_local_change()` returns true for about two seconds.
4. The watcher skips the external note event and index work.
5. The writer emits the needed `notes:external_changed` event after indexing.

Frontend consumers:

- `FileTreeContext` refreshes pinned files after remove events.
- `AppShell` queues changed paths, reloads affected file tree directories after 150ms, and invalidates prefetch caches.
- `MarkdownEditorPane` reloads the active note after `notes:external_changed` when the editor is clean.

## Rename, Duplicate, Delete

`space_fs/read_write/paths.rs` owns path mutations.

### Duplicate

`space_duplicate_path`:

- rejects directories
- reserves the duplicate with a hidden lock file
- uses case-insensitive sibling names to choose `Copy`, `Copy 2`, and so on
- copies with `copy_atomic()`
- indexes the duplicate if it is markdown
- emits `notes:external_changed`

### Rename

`space_rename_path`:

- validates source and destination
- rejects existing destinations
- plans link rewrites for markdown notes, supported attachments, and directories
- renames the path
- reindexes moved markdown notes
- rewrites links in affected notes
- reindexes notes whose links changed

Frontend code must also update open tabs, pinned files, and appearance maps. `useTabManager()` owns tab retargeting. `FileTreeContext` owns pinned and appearance retargeting.

### Delete

`space_delete_path`:

- validates the path
- removes markdown rows from the index before deleting
- requires `recursive` for directories
- moves the path to trash through `trash.rs`

Delete events close matching tabs through `dispatchPathRemoved()` and `closeTabsForPathRemoval()`.

## Link Resolution

`space_fs/link_ops.rs` resolves:

- wiki links
- image wiki links
- markdown links relative to a source path
- link suggestions for autocomplete

The editor and preview panes dispatch link click events. `AppShell` listens and either opens a workspace file, opens a search palette, or opens an external URL.

## Storage Stores Under `.glyph/`

`glyph_paths.rs` defines app-controlled paths:

- `glyph_dir()`: `.glyph`
- `glyph_db_path()`: `.glyph/glyph.sqlite`
- `glyph_cache_dir()`: `.glyph/cache`
- `glyph_app_dir()`: `.glyph/Glyph`
- `ai_history_dir()`: `.glyph/Glyph/ai_history`

JSON stores under `.glyph/` include:

- `databases.json` from `databases/store.rs`
- `ai_secrets.json` from `ai_rig/local_secrets.rs`
- Git sync config from `git_sync/store.rs`
- file tree appearance from `file_tree_appearance/store.rs`
- tag appearance from `tag_appearance/store.rs`
- pinned files from `pinned_files/store.rs`

Each store uses a mutex from `SpaceState` or a module-specific guard where concurrent writes could collide. Keep that pattern when adding a new `.glyph/` JSON store.

## Change Checklist

When you change filesystem behavior:

1. Identify whether the data belongs to user content, derived `.glyph/` state, or app config.
2. Validate all user-provided paths with `deny_hidden_rel_path()` and `join_under()`.
3. Use `write_atomic()` for overwrites.
4. Mark local markdown changes before writes that the watcher will see.
5. Reindex markdown changes before emitting UI refresh events.
6. Update pinned files, appearance paths, and tabs for path moves.
7. Add or adjust events when the frontend needs to refresh cached state.
8. Keep `.glyph/` inaccessible through normal space file commands.

## Failure Modes

- If the UI shows stale file tree entries, inspect `space:fs_changed` handling in `AppShell`.
- If an editor overwrites external changes, inspect `base_mtime_ms` in `space_write_text` and `persistDoc()`.
- If the index misses a note, inspect `mark_recent_local_change()` timing and explicit `index_note()` calls.
- If JSON metadata corrupts after a crash, inspect whether the store writes through `io_atomic::write_atomic()`.
- If a path bug can reach `.glyph/`, treat it as a security bug.
