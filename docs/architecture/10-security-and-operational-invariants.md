# Security and Operational Invariants

Glyph is an offline-first desktop app that works on user-selected folders. The app must protect three things: files outside the active space, app metadata under `.glyph/`, and user secrets. Most safety comes from narrow path APIs, atomic writes, explicit network checks, and a clear source-of-truth rule.

## Main Files

Backend safety:

- `src-tauri/src/paths.rs`: safe relative path joining
- `src-tauri/src/space_fs/helpers.rs`: hidden path denial and etag helpers
- `src-tauri/src/io_atomic.rs`: atomic writes and copies
- `src-tauri/src/net.rs`: SSRF-style URL host checks
- `src-tauri/src/ai_rig/helpers.rs`: AI base URL validation and HTTP helpers
- `src-tauri/src/ai_rig/tools.rs`: AI tool path and size limits
- `src-tauri/src/ai_rig/local_secrets.rs`: per-space AI secrets store
- `src-tauri/src/license/`: license storage and Gumroad verification
- `src-tauri/src/glyph_paths.rs`: controlled `.glyph/` paths
- `src-tauri/src/space/watcher.rs`: watcher and local-change suppression

Frontend safety:

- `src/lib/tauri.ts`: typed IPC boundary
- `src/lib/settings.ts`: settings normalization
- `src/components/preview/MarkdownEditorPane.tsx`: save conflict handling
- `src/hooks/useGitSync.ts`: editor flush before sync

## Invariant 1: Notes Live as Files

Markdown files are the source of truth for note content.

Allowed derived state:

- app-support `index/<space-key>/.glyph/glyph.sqlite`
- `.glyph/databases.json`
- `.glyph/cache/ai/`
- `.glyph/Glyph/ai_history/`
- appearance and pinned-file stores
- app settings stores

Derived state must be rebuildable or disposable where practical. The SQLite index must never become the only copy of a note.

## Invariant 2: Space Paths Stay Inside the Space

Any user-controlled path that points into a space must pass through:

```rust
deny_hidden_rel_path(&rel)?;
let abs = paths::join_under(&root, &rel)?;
```

`join_under()` rejects:

- absolute paths
- parent directory components
- root directory components
- platform prefixes

`deny_hidden_rel_path()` rejects any path component starting with `.`.

Together, those helpers protect:

- files outside the selected folder
- `.glyph/`
- hidden files and folders

Do not manually concatenate paths. Do not canonicalize a user path and then strip prefixes unless you have checked the exact race and symlink behavior you need.

## Invariant 3: `.glyph/` Is App Metadata

Normal workspace file APIs must not expose `.glyph/`.

Only app-owned modules should read or write it:

- `glyph_paths.rs`
- index database code
- database store code
- AI history/secrets code
- appearance stores
- pinned files
- Git sync config

User-visible file tree commands hide dotfiles and reject hidden paths. If a feature needs to show `.glyph/` for diagnostics, build a dedicated diagnostic command that redacts secrets and does not reuse normal file APIs.

## Invariant 4: Writes Are Crash-Safer

Durable overwrites should use `io_atomic::write_atomic()`:

1. Create parent directory.
2. Write to a hidden temp file beside the destination.
3. Sync the temp file.
4. Rename temp file to destination.
5. Sync the parent directory.

Use `io_atomic::copy_atomic()` for duplicate/copy operations.

Use `OpenOptions::create_new` when the operation must reserve a new file without overwriting, such as database row creation and open-or-create text commands.

## Invariant 5: Editor Saves Check mtime

`space_write_text` accepts `base_mtime_ms`. When present, Rust compares it with the on-disk mtime and rejects stale writes.

`MarkdownEditorPane` handles this conflict by refreshing the file and retrying once. This is a last-writer strategy with explicit conflict detection. It is not a merge algorithm.

Do not remove `base_mtime_ms` from editor saves.

## Invariant 6: Local Writes and Watcher Events Do Not Loop

Markdown writes call `mark_recent_local_change()` before writing. The watcher checks `has_recent_local_change()` and skips external reindex/event handling for recent local writes.

The writer then emits `notes:external_changed` after indexing.

This prevents duplicate indexing and reload loops while keeping the UI informed.

## Invariant 7: SQLite Is Derived

The app-support search index (`index/<space-key>/.glyph/glyph.sqlite`) stores derived rows for:

- notes
- links
- tags
- properties
- relationships
- FTS
- tasks

When parser behavior changes, rebuild the index. When schema changes, add a migration and increment `INDEX_DB_VERSION`.

Never write a note only by updating SQLite. Write Markdown, then reindex.

## Invariant 8: Database Rows Write Frontmatter

Workspace databases store definitions in `.glyph/databases.json`. Rows come from notes.

Editable cells update YAML frontmatter and reindex the note. Read-only columns stay read-only because they derive from filesystem paths, timestamps, or links.

Do not add a database column that stores row data only in `databases.json` unless you intentionally design a new storage model.

## Invariant 9: AI Tools Stay in the Space

AI tools in `ai_rig/tools.rs` use their own path normalization:

- normalize slashes
- remove empty and current-directory segments
- reject `..`
- reject hidden components
- join under active space

They also cap:

- read bytes
- read chars
- list size
- search result size
- batch file count

Recursive delete and overwrite move require the `CONFIRM` token.

Keep those limits when adding tools. If a tool can mutate files, use atomic writes and consider explicit index refresh behavior for Markdown.

## Invariant 10: Network Hosts Need Validation

`net.rs` blocks:

- localhost
- private IPv4
- loopback
- link-local
- broadcast
- documentation ranges
- unspecified
- multicast
- private IPv6 and local IPv6 ranges

It resolves DNS for non-literal hosts and rejects any forbidden address. It only allows HTTP(S) schemes.

`ai_rig/helpers.rs` uses this for AI base URLs. HTTP URLs are blocked unless the profile enables `allow_private_hosts`, which exists for local providers such as Ollama, llama.cpp, and OpenCode.

User-supplied network features should use `net::validate_url_host()` or a stricter wrapper.

## Invariant 11: Secrets Stay Out of Logs and Normal File APIs

Current AI secrets are stored per space by `ai_rig/local_secrets.rs` in:

```text
.glyph/Glyph/ai_secrets.json
```

Normal file APIs block `.glyph/`, so the file tree and AI tools cannot read this file through their standard paths. That does not make the file encrypted. Treat it as sensitive app metadata.

Rules:

- Never log API keys.
- Never write API keys to AI history.
- Never include secrets in context manifests.
- Never expose `.glyph/Glyph/ai_secrets.json` through previews or file tree commands.
- Consider OS keychain migration separately if the product requires encrypted local secret storage.

## Invariant 12: License Keys Are Hashed and Masked

License activation verifies through Gumroad. Local license records live in Tauri app config as `license.json`.

The local record stores:

- license state
- trial window
- activation and verification timestamps
- hashed license key
- masked license key
- last error code

It does not store the raw license key after activation. Activation failures record error state without storing the submitted raw key.

## Invariant 13: Git Sync Flushes the Editor

`useGitSync()` calls `saveCurrentEditor()` before `git_sync_run`.

This keeps the active editor from being left out of a commit. Preserve this call when changing sync triggers or moving Git sync control.

Git sync also refuses unsupported repository states and pauses auto-sync after repeated failures.

## Invariant 14: Command Types Must Match Rust

The TypeScript command map and Rust command registration must stay aligned.

When adding commands:

- Rust command function
- `generate_handler!`
- `TauriCommands`
- frontend call sites

When changing payload casing, check Rust command attributes such as `rename_all = "snake_case"`.

## Invariant 15: Events Are Part of State Consistency

Events keep surfaces synchronized:

- `space:fs_changed`: file tree and removal handling
- `notes:external_changed`: editor reload and cache invalidation
- `settings:updated`: live settings propagation
- `git_sync:status`: sync status updates
- `ai:*`: chat streaming and timeline
- `menu:*`: native menu actions

If a backend command mutates data that multiple UI areas cache, emit an event or invalidate through the existing event path.

## Operational Checks

Run these checks before merging broad storage or runtime changes:

1. Open a space with nested folders.
2. Create, edit, rename, duplicate, and delete a note.
3. Confirm the file tree refreshes.
4. Confirm the note reappears in search after edit.
5. Confirm tags and backlinks update after edit.
6. Create or edit a database row and inspect the note frontmatter.
7. Paste an image and reload the note.
8. Trigger AI context with a folder and confirm hidden files stay excluded.
9. Run Git sync after editing an active note.
10. Close and reopen the app and confirm last space, settings, and recent spaces restore.

## Security Review Prompts

Ask these questions during review:

- Does this code accept a path from React, AI, CLI output, or user text?
- Does it pass through `join_under()` and hidden-path denial?
- Does it write through `write_atomic()` or `create_new`?
- Does it update derived state after changing Markdown?
- Does it expose `.glyph/` directly or indirectly?
- Does it place secrets in logs, JSON history, SQLite, or frontend state?
- Does it accept a URL or base URL?
- Does it validate host and scheme?
- Does it emit an event for cached UI state?
- Does it run blocking filesystem, SQLite, or Git work off the async runtime?

## Known Tradeoffs

- AI secrets currently live in a hidden per-space JSON file, not an OS keychain.
- Editor conflict handling retries once and does not merge.
- SQLite migrations are manual and versioned through `user_version`.
- Database filters run over hydrated rows after source selection, so very large databases need careful limits.
- AI tools can mutate files in create mode, within the active space and tool limits.

Document these tradeoffs when a feature depends on them. Do not hide them behind generic safety language.
