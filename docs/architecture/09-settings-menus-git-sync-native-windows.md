# Settings, Menus, Git Sync, and Native Windows

Glyph keeps most preferences in a Tauri store, mirrors live changes through events, and pushes native runtime settings through Tauri commands. Git sync and native windows sit beside settings because they depend on both workspace state and desktop integration.

## Main Files

Settings and shortcuts:

- `src/lib/settings.ts`: settings store, defaults, migrations, update helpers
- `src/components/settings/`: settings panes
- `src/components/settings/ai/`: AI settings sections
- `src/lib/shortcuts/`: shortcut types, registry, platform normalization
- `src/shared/appCommandManifest.json`: command metadata
- `src/components/app/useAppCommands.tsx`: command list and enablement
- `src/hooks/useShortcutBindings.ts`: configured shortcut loading
- `src/hooks/useCommandShortcuts.ts`: keyboard dispatch

Menus and windows:

- `src-tauri/src/lib.rs`: menu, windows, setup, global shortcut, vibrancy
- `src-tauri/src/menu_manifest.rs`: native menu command mapping
- `src/hooks/useMenuListeners.ts`: menu event handling
- `src/components/quick-note/QuickNoteWindow.tsx`: quick note UI
- `src/lib/windowLabels.ts`: window labels

Git sync:

- `src/hooks/useGitSync.ts`: frontend controller
- `src/components/settings/GitSettingsPane.tsx`: settings UI
- `src-tauri/src/git_sync/commands.rs`: Tauri commands
- `src-tauri/src/git_sync/service.rs`: status, config, background sync
- `src-tauri/src/git_sync/git.rs`: git command wrappers
- `src-tauri/src/git_sync/store.rs`: per-space sync config
- `src-tauri/src/git_sync/types.rs`: config/status types

## Settings Store

`src/lib/settings.ts` uses `LazyStore("settings.json")` from `@tauri-apps/plugin-store`.

Settings include:

- current and recent spaces
- theme mode, accent, font families, font sizes
- auto-update check interval
- AI enabled and assistant mode
- daily notes folder
- quick notes folder
- template folder and daily note template
- task source
- database UI settings
- editor settings
- file tree settings
- shortcut bindings
- onboarding flags

Defaults live in the same file. The loader normalizes older values into current shapes.

## Live Settings Event

Settings helpers call `emitSettingsUpdated()` after updates. The event name is:

```text
settings:updated
```

Listeners include:

- `UIProvider`: AI, TOC, folio, daily notes, templates
- `FileTreeProvider`: people mentions and beautiful tags
- `useNoteEditor`: editor feature flags and attachment settings
- `AppShell`: collapsible headings
- settings panes that need cross-window refresh

Use this event when a setting changes live UI behavior. Do not require a full app reload for normal preference changes.

## Settings That Affect Rust

Some settings must be sent to Rust:

- people mentions as tags: `index_set_people_mentions_as_tags_enabled`
- menu shortcuts: `set_menu_shortcuts`
- quick note global shortcut: `set_quick_note_global_shortcut`
- window vibrancy: `set_window_vibrancy_theme`

Keep the Tauri runtime synchronized after settings load and after updates.

## Shortcut Architecture

Shortcut data has three layers:

1. Command metadata in `src/shared/appCommandManifest.json`
2. Shortcut registry and normalization in `src/lib/shortcuts/`
3. Runtime handlers in `AppShell` through `useCommandShortcuts()`

The shell builds handlers from:

- fixed Escape/back settings shortcuts
- command palette/search shortcuts
- close-window fallback
- tab number activation
- commands from `useAppCommands()`

`allowInEditable` controls whether a shortcut can fire while focus sits in an input/editor.

Native menu shortcuts use the same configured bindings. `AppShell` converts shortcut definitions with `toTauriAccelerator()` and sends them through `set_menu_shortcuts`.

## Command Palette

The command palette is lazy-loaded:

- `loadCommandPalette()`
- `LazyCommandPalette`

`AppShell` preloads it after 500ms idle time. Commands come from `useAppCommands()`, which receives current shell state and returns action objects with enablement.

Command search uses the index for note search and the command registry for command results.

When adding a command:

1. Put shared metadata in the manifest when needed.
2. Add shortcut registry entry if configurable.
3. Add action and enablement to `useAppCommands()`.
4. Add menu mapping if the native menu should expose it.
5. Check command palette, keyboard, and native menu paths.

## Native Menus

Rust builds the main menu in `src-tauri/src/lib.rs`. Menu events follow one of two paths:

- Recent-space menu item emits `menu:open_recent_space`.
- Command menu item emits `menu:app_command`.

`useMenuListeners()` maps those events to shell actions:

- new note
- create from template
- open daily note
- save note
- close tab
- open/create/close/reveal space
- Git sync
- AI pane and context actions
- editor formatting actions

This lets native menus call the same functions as keyboard shortcuts and command palette commands.

## Window Runtime

`lib.rs` owns window setup and close behavior:

- The main window is centered and sized to 80 percent of the current monitor.
- macOS vibrancy applies during setup and can change later through command.
- Settings window close requests hide the window.
- Quick note window close requests hide the window.
- macOS main window close requests hide the window.

Quick note commands:

- `show_quick_note_window`
- `hide_quick_note_window`
- `show_main_window`
- `set_quick_note_global_shortcut`

Use the `QUICK_NOTE_WINDOW_LOCK` pattern if you add another command that can create a singleton window from multiple triggers.

## Quick Notes

The quick note flow opens a small native window and writes notes into the configured quick notes folder. When a quick note should open in the main window, backend/frontend code emits:

```text
quick-note:open_note
```

`AppShell` listens and opens the note through normal workspace navigation.

Quick notes still use the active space. If no space is open, quick note commands should fail or prompt through UI rather than creating files in app config.

## Git Sync Model

Git sync is per space. Config lives under the space, not app config.

Frontend `useGitSync()` owns:

- current status
- loading/error state
- status refresh
- manual sync
- auto sync resume
- settings navigation

It saves the current editor before running sync:

```ts
await saveCurrentEditor();
```

It builds run context from settings so backend can maintain managed ignores for templates and attachments.

## Git Sync Status

`git_sync_status_read` returns `GitSyncStatus`, derived from:

- git installed check
- repository inspection
- sync config
- runtime phase
- repo health
- local change count
- ahead/behind count
- preflight issue
- conflict risk

`service.rs` can auto-adopt an existing repo when the space root is already a Git repo with a remote.

Unsupported state:

- the active space is inside a larger Git repo
- detached HEAD
- wrong branch
- missing origin
- no commits
- no Git installed

## Git Sync Run

`git_sync_run`:

1. Requires an active space.
2. Requires Git installed.
3. Loads config.
4. Skips auto run when disabled or paused.
5. Refuses to start if another sync is running.
6. Emits initial `git_sync:status`.
7. Spawns blocking background sync.

Background run:

1. Inspect repository.
2. Reject nested repo.
3. Check repo health and conflict risk.
4. Record last attempted timestamp.
5. Upsert managed `.gitignore`.
6. Fetch remote.
7. Stage sync inclusions.
8. Commit local changes as `Glyph sync`.
9. Merge remote branch if it exists.
10. Push branch, setting upstream when needed.
11. Record success and emit status.

On auto-sync failure, consecutive failures increment. After three auto failures, Git sync pauses itself.

## Git Sync Conflict Posture

Git sync tries to avoid overwriting remote changes:

- `overlapping_change_risk()` detects conflict risk before sync.
- Preflight issues stop the sync before mutation.
- Conflict policy can choose local-wins merge behavior when configured.
- Auto-sync pauses after repeated failures.

Manual Git operations remain the escape hatch for complex conflicts.

## Auto Sync

`useGitSync()` starts an auto run once per opened space when:

- status is configured
- enabled
- not paused

It also starts an interval using `status.interval_minutes`, clamped to at least one minute in the frontend and one to 1,440 minutes in the backend.

## Native Notifications

Rust sends notifications for:

- index rebuild complete
- AI response ready
- AI request failed

Git sync status uses app events instead of system notifications.

## Change Checklist

When changing settings:

1. Add a default value.
2. Add normalization for unknown or legacy values.
3. Add update helper.
4. Emit `settings:updated` with the smallest useful payload.
5. Update live listeners.
6. Sync Rust runtime when needed.

When changing shortcuts or menus:

1. Update command manifest.
2. Update shortcut registry.
3. Update `useAppCommands()`.
4. Update native menu mapping.
5. Verify palette, keyboard, and menu paths.

When changing Git sync:

1. Preserve editor flush before sync.
2. Keep config per space.
3. Emit `git_sync:status` after runtime state changes.
4. Handle missing Git and unsupported repo shapes.
5. Avoid running two syncs at the same time.
6. Keep auto-sync failure pause behavior.

## Debugging Map

- Setting changes only after restart: inspect `settings:updated` payload and listeners.
- Native shortcut text stale: inspect `set_menu_shortcuts`.
- Global quick note shortcut dead: inspect `set_quick_note_global_shortcut`.
- Command works in palette but not menu: inspect `useMenuListeners()` and `menu_manifest.rs`.
- Git sync starts with stale note content: inspect `saveCurrentEditor()` in `useGitSync()`.
- Auto sync keeps running after failure: inspect consecutive failure count and paused config.
- Window closes instead of hiding on macOS: inspect `on_window_event` in `lib.rs`.
