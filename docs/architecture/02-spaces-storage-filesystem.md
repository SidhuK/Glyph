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
    databases.json
    cache/
    Glyph/
      ai_history/
      ai_secrets.json
```

The SQLite search index lives under app support, not in the space folder:

```text
Application Support/com.karatsidhu.glyph/
  index/
    spaces.json
    <space-key>/
      .glyph/
        glyph.sqlite
        glyph.sqlite-wal
        glyph.sqlite-shm
```

Use the space folder name as `<space-key>` when it is unique. Colliding names get a short path-hash suffix. `index/spaces.json` maps canonical space roots to stable keys.

Code ownership:

- `src-tauri/src/space/commands.rs`: create, open, close, onboarding note command
- `src-tauri/src/space/helpers.rs`: create/open implementation and onboarding helpers
- `src-tauri/src/space/state.rs`: active root, watcher handle, local-change tracking, store mutexes
- `src-tauri/src/space/watcher.rs`: recursive filesystem watcher and index refresh
- `src-tauri/src/note_mutation.rs`: centralized note commit, indexing, unindexing, rename handling, and change payload construction (introduced in `4aa71d69`)
- `src-tauri/src/glyph_paths.rs`: `.glyph/` paths in the space folder
- `src-tauri/src/index/paths.rs`: app-support SQLite index paths and space-key manifest
- `src-tauri/src/space_fs/`: file tree, read/write, preview, rename, delete, link resolution
- `src-tauri/src/paths.rs`: traversal-safe joining
- `src-tauri/src/io_atomic.rs`: crash-safer writes and copies
- `src/contexts/SpaceContext.tsx`: frontend space state and recent-space handling
- `src/contexts/FileTreeContext.tsx`: frontend tree state tied to a space
- `src/hooks/useFileTree.ts`: frontend filesystem operations and tree loading
- `src/hooks/useFileTreeCRUD.ts`: create, rename, move, delete UI actions
- `src/lib/spaceChange.ts`: renderer-side application of typed filesystem changes and derived-cache invalidation

## Space State

Rust stores per-window space sessions in `SpaceState`:

```rust
pub struct SpaceState {
    pub(crate) sessions: Mutex<HashMap<String, SpaceSession>>,
    db_store_mutex: Arc<Mutex<()>>,
    file_tree_appearance_mutex: Arc<Mutex<()>>,
    list_collapse_state_mutex: Arc<Mutex<()>>,
    note_mutation_mutex: Arc<Mutex<()>>,
    pinned_files_mutex: Arc<Mutex<()>>,
}
```

The state has three jobs:

1. Map each window label to its space root, watcher, and recent-local-change set.
2. Share mutexes for JSON stores and note mutations that live under `.glyph/` or the derived index.
3. Resolve auxiliary editor windows against the main window's session when they share its space (`quick-note`, `quick-task`, and `external-markdown-*`).

Commands call `root_for_window(&window)`, so the backend enforces "no space session for this window, no workspace operation" while retaining independent sessions for windows that own their space.

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
3. Register the space in the app-support index manifest and remove any stale in-space `glyph.sqlite` sidecars.
4. Create or open Glyph metadata in `.glyph/`.
5. Reset the index schema cache with `index::db::reset_schema_cache()`.
6. Store the canonical root and watcher in the calling window's `SpaceState` session.
7. Install the notes watcher with `set_notes_watcher()`.
8. Enable the native Close Space menu item.

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

`space_write_text` handles note and text writes through the centralized mutation helpers in `src-tauri/src/note_mutation.rs`:

1. Validates the relative path.
2. Checks `base_mtime_ms` when the caller supplies it.
3. Creates parent folders.
4. Writes bytes through `io_atomic::write_atomic()` (or reserves a new path with the create-new mode).
5. Reindexes markdown content and marks the local change together.
6. Returns a typed `SpaceChange::create` or `SpaceChange::content` result for one propagation path.

The `base_mtime_ms` check protects an open editor from silently overwriting a file changed outside the app. `MarkdownEditorPane` handles the conflict path by reading the latest file and retrying once with the new mtime.

`space_open_or_create_text` uses `OpenOptions::create_new` because it must not overwrite an existing file.

## Atomic Writes

`io_atomic::write_atomic()` writes to a hidden temporary file in the destination folder, syncs the file, renames it into place, and syncs the parent directory. This pattern protects against partial files after a crash.

Use `io_atomic::copy_atomic()` when duplicating a file. Use `OpenOptions::create_new` only when the operation must reserve a new path without overwriting.

## Watcher and Event Flow

`set_notes_watcher()` installs a recursive watcher with `notify`.

The watcher and all backend writers now converge on one typed event, `space:fs_changed`. `SpaceChange` is defined in Rust in `src-tauri/src/note_mutation.rs` and mirrored in `src/lib/spaceChange.ts`:

- `content` and `create` identify one changed path
- `remove` includes whether the removal is recursive
- `rename` includes source, destination, and recursive state
- `batch` groups changes from one operation

The watcher emits this event type for visible filesystem changes:

- `space:fs_changed`: any visible create, modify, remove, or rename event, with a `SpaceChange` payload

The watcher also updates the SQLite index for markdown files. It debounces index work for 100ms and collapses repeated events by relative path.

Recent local changes prevent a loop:

1. Local markdown writes call `mark_recent_local_change()`.
2. The watcher sees the filesystem event.
3. `has_recent_local_change()` returns true for about two seconds.
4. The watcher skips duplicate index work and change propagation for that recent local path.
5. The mutation commit emits the needed `space:fs_changed` event after indexing. The renderer applies the same payload to the file tree, tabs, pinned paths, open-note content, and derived query/prefetch caches.

Frontend application is centralized in `applySpaceChange()` and `useSpaceChangePropagation()` in `src/lib/spaceChange.ts`. It ignores changes for another space, recursively applies batches, reloads affected directories, retargets or closes tabs and pinned paths, refreshes tags, notifies open-note listeners, and invalidates note, calendar, All Notes/activity, database, usage, folio, and unlinked-mention data. The renderer event map in `src/lib/tauriEvents.ts` types `space:fs_changed` as `SpaceChange`.

## Rename, Duplicate, Delete

`space_fs/read_write/paths.rs` owns path mutations.

### Duplicate

`space_duplicate_path`:

- rejects directories
- reserves the duplicate with a hidden lock file
- uses case-insensitive sibling names to choose `Copy`, `Copy 2`, and so on
- copies with `copy_atomic()`
- indexes the duplicate if it is markdown
- emits a typed `space:fs_changed` create payload

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

`glyph_paths.rs` defines space-local app metadata paths:

- `glyph_dir()`: `.glyph`
- `glyph_cache_dir()`: `.glyph/cache`
- `glyph_app_dir()`: `.glyph/Glyph`
- `ai_history_dir()`: `.glyph/Glyph/ai_history`

`index/paths.rs` defines the derived SQLite index under app support:

- `index_root_path()`: `Application Support/com.karatsidhu.glyph/index`
- `index_db_path(space_root)`: `index/<space-key>/.glyph/glyph.sqlite`
- `spaces.json`: canonical space root to stable index key mapping

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
7. Return or emit a `SpaceChange` through `note_mutation.rs`; do not add a second note/filesystem event path.
8. Keep `.glyph/` inaccessible through normal space file commands.

## Failure Modes

- If the UI shows stale file tree entries, inspect `space:fs_changed` handling in `AppShell`.
- If an editor overwrites external changes, inspect `base_mtime_ms` in `space_write_text` and `persistDoc()`.
- If the index misses a note, inspect `mark_recent_local_change()` timing and explicit `index_note()` calls.
- If JSON metadata corrupts after a crash, inspect whether the store writes through `io_atomic::write_atomic()`.
- If a path bug can reach `.glyph/`, treat it as a security bug.
