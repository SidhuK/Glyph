# IPC and Native Runtime

Glyph uses Tauri as the bridge between React and Rust. The IPC boundary has a typed frontend map and explicit Rust registration. Native menus, windows, plugins, and global shortcuts live next to that command boundary because they all belong to the app runtime rather than to a single React component.

## Main Files

Frontend:

- `src/lib/tauri.ts`: typed `invoke()` wrapper and command result types
- `src/lib/tauriEvents.ts`: typed event helpers
- `src/lib/spaceChange.ts`: typed `space:fs_changed` propagation and cache invalidation
- `src/hooks/useMenuListeners.ts`: native menu event consumers
- `src/lib/shortcuts/`: shortcut normalization and registry
- `src/shared/appCommandManifest.json`: app command metadata shared with native menu code

Rust:

- `src-tauri/src/lib.rs`: Tauri builder, command registration, menus, windows, plugins
- `src-tauri/src/note_mutation.rs`: shared Markdown write, index, and change-event flow
- `src-tauri/src/menu_manifest.rs`: native menu command lookup and accelerators
- feature modules under `src-tauri/src/*/commands.rs`: command handlers

## Command Contract

The frontend command contract lives in `TauriCommands` in `src/lib/tauri.ts`.

Each entry declares:

```ts
type CommandDef<Args, Result> = { args: Args; result: Result };
```

For example:

```ts
space_read_text: CommandDef<{ path: string }, TextFileDoc>;
```

Callers use the exported `invoke()` helper:

```ts
const doc = await invoke("space_read_text", { path });
```

The helper wraps `@tauri-apps/api/core` and converts thrown values into `TauriInvokeError`. This gives UI code a consistent `Error.message` path.

## Rust Registration

Rust registers commands in `src-tauri/src/lib.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    app_info,
    license::commands::license_bootstrap_status,
    space_fs::read_write::text::space_read_text,
    ...
])
```

Tauri command names come from Rust function names unless the handler uses command attributes such as `rename_all = "snake_case"`.

Adding a command requires four changes:

1. Implement the command in a Rust module.
2. Register it in `generate_handler!`.
3. Add its TypeScript signature in `TauriCommands`.
4. Use `invoke()` from React.

If any of those steps are missing, the failure usually appears at runtime. TypeScript only protects commands that exist in the TypeScript map.

## Command Categories

The command map covers these groups:

- App and native shell: app info, windows, menus, vibrancy, fonts, clipboard, print
- App exit: exit listener registration and confirm-exit flow (`app_confirm_exit`, `app_register_exit_listener`)
- License: bootstrap, activate, clear local
- Updater: release channel check (`updater_check_release_channel`)
- Space lifecycle: create, open, close, onboarding, open in new window (`space_open_window`)
- Space filesystem: list, read, write, preview, batch reads, create, rename, duplicate, delete, link resolution, pasted image saving
- External markdown: open, read, write, and close markdown files outside the space in dedicated windows (`external_markdown_*`, `open_external_markdown_path`)
- Note metadata: frontmatter property parse/render, relationships, local connections (`note_*`)
- Appearance stores: file tree, tags, pinned files
- Index: rebuild, sync, search (plain, advanced, parse-and-run), all docs, calendar, tags, people, task summaries, backlinks, space connections
- Databases: list, get, create, update, delete, query rows, mutate cells, create rows, status colors, preview context
- Git sync: status, config, run, disconnect
- Git history: commit list and diffs (`git_history_list`, `git_history_diff`)
- AI: profiles, secrets, models, chat, context, history, provider support, Codex account and rate limits

Keep command names descriptive. Most existing commands use a module prefix: `space_`, `index_`-style index names, `databases_`, `ai_`, `codex_`, `git_sync_`, `git_history_`, `external_markdown_`.

## Note mutation boundary

Markdown writes use the shared helpers in `src-tauri/src/note_mutation.rs`. `commit_markdown()` validates the relative path, checks the expected mtime when replacing an existing note, writes atomically, and calls `index_written_markdown()` before returning. Commands emit the returned `SpaceChange` through `space:fs_changed` after the blocking work completes. Text writes, imports, database cell edits, and path operations use this boundary, so a successful note mutation updates the derived index before frontend consumers refresh. This boundary was introduced in the note mutation work that landed after `8f2d0446`.

`SpaceChange` is a tagged, serialized enum with `content`, `create`, `remove`, `rename`, and `batch` variants. Each payload carries the canonical `space_path`; path-specific variants carry `rel_path`, or `from_path` and `to_path`, plus `recursive` where needed. Keep the Rust enum and `src/lib/spaceChange.ts` union in sync when adding a change kind.

## Tauri Builder

`run()` in `src-tauri/src/lib.rs` creates the app:

1. Initializes tracing.
2. Builds the native menu.
3. Handles menu events.
4. Configures setup behavior.
5. Handles window close behavior.
6. Manages shared Rust state.
7. Installs plugins.
8. Registers commands.
9. Runs the Tauri app.

Managed state:

- `ai_rig::AiState`
- `ai_codex::state::CodexState`
- `git_sync::GitSyncState`
- `space::SpaceState`
- `app_exit::AppExitState`
- `external_markdown::ExternalMarkdownState`
- `MenuState`
- `QuickNoteShortcutState`

Plugins:

- global shortcut
- dialog
- opener
- process
- store
- updater

## Menu Events

Native menu items do not call React directly. `on_menu_event` in Rust emits app events:

- Recent spaces emit `menu:open_recent_space` with a path.
- App commands emit `menu:app_command` with a command id.

React listens through `useMenuListeners()` and calls the same actions used by command palette and shortcuts.

This keeps native menus, keyboard shortcuts, and command palette behavior aligned.

## Menu Manifest

`menu_manifest.rs` maps native menu ids to command metadata from `src/shared/appCommandManifest.json`. Rust uses it to:

- find labels
- find default bindings
- convert shortcut strings into native accelerators

`set_menu_shortcuts` lets React push updated shortcut bindings into the native menu after settings load or change. `set_menu_labels` does the same for translated menu labels when the UI language setting changes.

When adding a user-configurable command:

1. Add it to the shared command manifest.
2. Add it to the shortcut registry.
3. Add native menu handling when needed.
4. Send updated accelerators through `set_menu_shortcuts`.

## Recent Spaces Menu

`MenuState` stores recent spaces and shortcut overrides. Rust uses revisioned menu item ids such as `space.recent.{revision}.{index}` so stale events can still parse safely.

`SpaceContext` calls `set_recent_spaces_menu` whenever recent spaces or current space changes. It excludes the current space from the menu.

## Markdown Menu Visibility

React calls `set_markdown_menu_visible` when `activeMarkdownTabPath` changes. Rust rebuilds or toggles markdown-specific menu items based on whether a markdown note is active.

The shell should update this only from active tab state, not from arbitrary file tree selection.

## Windows

`src-tauri/src/lib.rs` owns native windows. Window labels live in `src/lib/windowLabels.ts`:

- Main window (`main`)
- Per-space windows (`space-` prefix) created through `space_open_window`
- Quick note window (`quick-note`)
- External markdown windows (`external-markdown-` prefix)
- Settings and quick-task windows when present

Close behavior:

- Settings, quick note, and quick-task window close requests hide the window.
- External markdown windows emit `external-markdown:close_requested` so the frontend can flush unsaved content before `external_markdown_finish_close`.
- On macOS, closing the main window hides it instead of exiting the app.

Quick note window helpers:

- `show_quick_note_window`
- `hide_quick_note_window`
- `show_main_window`
- `set_quick_note_global_shortcut`

The quick note window uses a lock to prevent duplicate creation races.

## Global Shortcut

React reads shortcut settings and calls `set_quick_note_global_shortcut`. Rust registers or updates the global shortcut through `tauri_plugin_global_shortcut`.

The shortcut emits a native action that opens the quick note window. Keep this path separate from normal in-app command shortcuts because it must work while the app window is not focused.

## App Setup

During setup, Rust:

- refreshes AI provider support metadata in the background
- restores persisted main window geometry through `window_geometry`, falling back to 80 percent of the current monitor on first launch
- applies macOS vibrancy when available

Frontend startup then hydrates settings and space state. Do not assume React settings are available in Rust setup unless you pass them through a command later.

## Events

Backend-to-frontend events include:

- `menu:open_recent_space`
- `menu:app_command`
- `space:fs_changed` with a typed `SpaceChange` payload. `useSpaceChangePropagation()` batches delivery for 50ms, refreshes affected directories and tags, invalidates derived query data, and reloads open-note content for `content` changes.
- `settings:updated`
- `index:progress`
- `ai:chunk`
- `ai:done`
- `ai:error`
- `ai:status`
- `ai:tool`
- `ai:profiles-updated`
- `codex:chunk`, `codex:done`, `codex:error`, `codex:status`, `codex:tool`
- `git_sync:status`
- `quick-note:open_note`
- `external-markdown:close_requested`

Use events for state changes that multiple frontend areas need to react to. Use command return values for direct request/response work.

## Error Handling

Most Rust commands return `Result<T, String>`. The frontend receives those strings through `TauriInvokeError.message`.

Keep error messages actionable because they often surface directly in toast messages or settings panes. Avoid logging secrets in Rust errors or traces.

## Threading Rules

Rust commands that perform filesystem walks, SQLite work, Git calls, or blocking IO use `tauri::async_runtime::spawn_blocking`. This keeps Tauri's async runtime responsive.

Examples:

- opening spaces
- rebuilding index
- querying databases
- reading and writing files
- running Git sync background work

Use async commands for operations that await network or runtime work. Use `spawn_blocking` inside async commands for blocking filesystem or SQLite sections.

## Change Checklist

When adding or changing IPC:

1. Add the Rust command near the module that owns the behavior.
2. Use `State<'_, SpaceState>` when the command needs a space.
3. Validate paths before filesystem work.
4. Wrap blocking work in `spawn_blocking`.
5. Register the command in `src-tauri/src/lib.rs`.
6. Add the typed command to `src/lib/tauri.ts`.
7. Emit an event only if other UI surfaces need to react.
8. Update menus, shortcuts, or command palette if the operation is user-invokable.
9. Keep command payloads serializable with snake_case where Rust uses `rename_all = "snake_case"`.

## Drift Checks

Use these checks when IPC feels broken:

- Rust command exists but frontend fails with "unknown command": check `generate_handler!`.
- TypeScript cannot call a command: check `TauriCommands`.
- Payload arrives empty: check casing and the command attribute.
- Menu item does nothing: check `menu_manifest.rs` and `useMenuListeners()`.
- Shortcut text differs from native menu: check `set_menu_shortcuts` and `toTauriAccelerator()`.
- Event listener never fires: check event name spelling in Rust `emit()` and frontend listener.
