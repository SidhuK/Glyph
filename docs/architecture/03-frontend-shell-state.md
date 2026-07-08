# Frontend Shell and State

The frontend shell coordinates spaces, file tree state, tabs, settings mode, command routing, AI panel visibility, shortcuts, and prefetch. React owns interaction state. Rust owns durable workspace operations.

This document explains the provider stack and the shell files you should read before changing navigation or global UI behavior.

## Entry Point

`src/App.tsx` has the top-level composition:

```tsx
<LazyMotion features={domAnimation}>
  <AppProviders>
    <LicenseGate>
      <AppShell />
    </LicenseGate>
  </AppProviders>
</LazyMotion>
```

`LicenseGate` protects the app surface. `AppShell` still expects all providers to exist under it.

## Provider Stack

`src/contexts/index.tsx` composes providers in this order:

```text
QueryClientProvider
  SpaceProvider
    FileTreeProvider
      UIProvider
        EditorProvider
          AppShell
```

The order encodes dependencies:

- `SpaceProvider` has no workspace state dependency.
- `FileTreeProvider` depends on `spacePath`.
- `UIProvider` reacts to space changes and settings.
- `EditorProvider` exposes save state to the shell.

Do not move providers without checking their hooks. A provider that calls `useSpace()` must stay inside `SpaceProvider`.

## Space Provider

`src/contexts/SpaceContext.tsx` owns:

- app info
- current space path
- last space path
- recent spaces
- onboarding note path
- indexing flag
- open/create/close actions

On startup, it:

1. Calls `app_info`.
2. Loads settings.
3. Syncs people-mentions-as-tags to the Rust index runtime.
4. Reopens the last space when settings contain one.
5. Syncs native recent-space menu entries.

When opening a new space, it closes the previous one first and clears caches:

- `clearAiPanelCaches()`
- `clearInlineImageHydrationCache()`
- `invalidateNavigationPrefetch()`

That prevents a note preview, AI context, or editor image cache from leaking across spaces.

## File Tree Provider

`src/contexts/FileTreeContext.tsx` owns file browser state:

- root entries
- loaded children by directory
- expanded directories
- active directory and file
- pinned files
- file tree appearance
- tags and people
- tag appearance

It fetches tags with paging because tag lists can exceed one command response. It fetches people only when `enablePeopleMentionsAsTags` is enabled in settings.

When `spacePath` changes, it clears file tree state, lists the root with `space_list_dir`, starts `index_rebuild`, loads appearance stores, and loads pinned files.

It listens for:

- `settings:updated`: refresh tag behavior and tag rendering flags
- `space:fs_changed`: refresh pinned files after removals

## UI Provider

`src/contexts/UIContext.tsx` owns global view state:

- sidebar collapsed and width
- command palette open state
- open markdown tabs list
- active markdown tab path
- daily note and template settings
- table of contents setting
- folio mode and scope
- settings mode and active settings tab
- AI enabled/open state
- AI assistant mode

It uses a reducer because many actions touch related fields. For example, disabling AI also closes the AI panel. Opening settings forces the sidebar open.

On space close, it clears open markdown tabs and active markdown tab path. On space open, it opens the sidebar.

It listens for `settings:updated` so settings windows and panes can update the live shell without a reload.

## Editor Provider

`src/contexts/EditorContext.tsx` exposes the currently mounted editor:

- `registerEditor()`
- `saveCurrentEditor()`
- `hasUnsavedChanges()`
- `getCurrentMarkdown(relPath)`

`MarkdownEditorPane` registers editor state. Shell-level shortcuts and menu items call `saveCurrentEditor()` without needing props from the active editor component.

Only the current editor can be registered. If a feature introduces multiple editable panes, it must either preserve this current-editor model or replace it with keyed editor registration.

## App Shell

`src/components/app/AppShell.tsx` is the coordination layer. It pulls from all providers and wires:

- sidebar rendering
- main content rendering
- tabs
- command palette
- native menu listeners
- keyboard shortcuts
- Git sync
- daily notes
- templates
- AI context attachment
- file tree refresh queue
- prefetch
- update indicator
- quick note events
- onboarding and release-note prompts

This file is intentionally broad. When behavior starts mixing render, state, effects, and commands too heavily, extract a hook or subcomponent. Current examples:

- `useTabManager()`
- `useWorkspaceLinkEvents()`
- `useAppCommands()`
- `useCommandShortcuts()`
- `useShortcutBindings()`
- `useMenuListeners()`
- `useGitSync()`
- `useDailyNote()`

## Tab Manager

`src/components/app/useTabManager.ts` owns workspace tabs:

- tab records
- active tab id
- dirty flags by path
- per-tab markdown navigation history
- recent files
- retargeting tabs on rename
- closing tabs on removal
- tab reordering
- keyboard activation

Tabs have three kinds:

```ts
type WorkspaceTab = {
  id: string;
  kind: "blank" | "file" | "special";
  target: string | null;
};
```

Special tabs use stable ids such as:

- all docs
- calendar
- databases
- templates

Markdown file tabs sync into `UIProvider` as `openMarkdownTabs` and `activeMarkdownTabPath`. AI context actions use those values.

When `ui.resumeLastSession` is enabled, `AppShell` restores the last saved per-space tab snapshot from `workspace.sessionBySpace` after the space and settings are loaded. The snapshot stores non-blank file and special tabs plus the active target. Missing markdown files are skipped by validating each file against disk before restoring. Tab changes are saved back through `saveWorkspaceSessionSnapshot()` after real tab commits, so switching spaces does not write an empty snapshot.

### Rename and Delete Behavior

When a path gets renamed:

- file tree CRUD updates the backend path
- `AppShell` calls `renameTabsForPath()`
- `FileTreeContext` updates pinned file paths and appearance keys

When a path gets removed:

- `space:fs_changed` reaches `AppShell`
- `dispatchPathRemoved()` broadcasts the path
- `closeTabsForPathRemoval()` removes matching file tabs
- dirty flags and history entries for removed paths disappear

## File Tree Hook

`src/hooks/useFileTree.ts` bridges file tree UI actions to Tauri commands.

Responsibilities:

- load directories
- track loaded directories
- discard stale directory responses
- expand and collapse directory state
- open markdown files inside the app
- open non-markdown files externally
- delegate create, rename, move, duplicate, delete to `useFileTreeCRUD()`

The hook uses refs for request versions and loaded directories because those values must not retrigger renders on every filesystem load.

## Command Routing

Global commands live in three layers:

1. Command manifest and bindings in `src/lib/shortcuts/` and `src/shared/appCommandManifest.json`
2. Runtime command construction in `src/components/app/useAppCommands.tsx`
3. Palette, shortcuts, and native menu dispatch in `AppShell`

Native menu events arrive through `useMenuListeners()`. Keyboard events arrive through `useCommandShortcuts()`. Both call the same command actions whenever possible.

When adding a command, update:

- shared manifest if it belongs in menus or shortcuts
- shortcut registry if configurable
- `useAppCommands()` for runtime enablement and action
- menu listener wiring if the native menu needs it

## Prefetch

`src/lib/navigationPrefetch.ts` caches expensive next-view data:

- markdown note docs
- all-docs data
- calendar data
- database landing and rows

`AppShell` prefetches when users hover or navigate. It invalidates cache on:

- `notes:external_changed`
- space changes
- explicit note path changes

This cache improves navigation but must not become a source of truth. Every prefetch entry needs an invalidation path.

## Settings Mode

Settings render inside the main app surface rather than as a separate route. `UIProvider` stores `settingsMode` and `settingsTab`. `AppShell` opens settings from menus, commands, and panes.

Some settings change Rust behavior:

- people mentions as tags call `index_set_people_mentions_as_tags_enabled`
- shortcuts call `set_menu_shortcuts`
- quick note shortcut calls `set_quick_note_global_shortcut`
- translucent app calls `set_window_vibrancy_theme`

Keep UI settings and native runtime settings in sync when adding a preference.

## AI Panel State

`UIProvider` has a separate `AISidebarContext`:

- `aiEnabled`
- `aiPanelOpen`
- `aiAssistantMode`

The shell closes the note info sidebar when the AI panel opens, and closes the AI panel when the note info sidebar opens. That keeps the right side of the editor from displaying two competing panels.

AI context attachment flows through `dispatchAiContextAttach()`. Shell commands can attach the current note or all open notes to the AI composer.

## Native Window Integration

The shell calls Tauri APIs directly for UI-only native actions:

- `getCurrentWindow()` for close/focus behavior
- `@tauri-apps/plugin-dialog` for open/save dialogs
- `@tauri-apps/plugin-opener` for revealing or opening external paths
- `@tauri-apps/api/path` for path joins used in native dialog defaults

Durable workspace file changes still go through backend commands.

## Change Checklist

When changing shell behavior:

1. Decide which provider owns the state.
2. Keep durable workspace data out of React-only state.
3. Use `invoke()` for backend operations.
4. Add cache invalidation for any prefetched data.
5. Update native menu and shortcut routing together.
6. Retarget tabs, pinned files, and appearance when paths move.
7. Reset state on space changes if the state belongs to a space.
8. Avoid adding broad behavior directly to `AppShell` when a focused hook can own it.

## Debugging Map

- Space will not open: `SpaceContext.tsx`, `space/commands.rs`
- File tree stale: `useFileTree.ts`, `AppShell` `space:fs_changed` handler
- Shortcut works but menu does not: `useMenuListeners.ts`, `menu_manifest.rs`, `set_menu_shortcuts`
- Menu works but shortcut does not: `useShortcutBindings.ts`, `useCommandShortcuts.ts`
- Tabs wrong after rename: `useTabManager.ts`, `useFileTreeCRUD.ts`
- AI context attaches wrong notes: `openMarkdownTabs`, `activeMarkdownTabPath`, `aiContextEvents.ts`
- Settings change not reflected live: `settings:updated` emitter and listener
