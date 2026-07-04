# KAR-25 Space Switcher Plan

Linear issue: https://linear.app/karats/issue/KAR-25/spaces-switcher-instead-of-separate-app-windows

Issue status at planning time:

- Title: "Spaces switcher instead of Separate app windows?"
- Status: Todo
- Label: Improvement
- Description: empty
- Comment context: use one Glyph window for multiple spaces, with an Arc-like compact footer switcher, one dot per open space, optional trackpad swipe, and full in-place space context switching.

## Product Direction

Glyph should stop treating "open another space" as "create another native app window." The app should have one primary workspace window that can remember multiple open space roots and switch the active root in place.

The important invariant is:

> Multiple spaces may be available in the switcher, but only one space is mounted at a time.

"Open spaces" in the new model means "space roots listed in the switcher." It must not mean multiple filesystem watchers, multiple active indexes, or multiple editor/provider trees mounted at once.

The interaction should feel close to Arc spaces:

- The current file tree is the active space.
- The sidebar footer shows compact dots for the spaces currently in the switcher.
- Clicking a dot switches to that space in the same window.
- Opening a recent space or picking a new folder adds it to the switcher and makes it active.
- Switching should use a quick slide/reveal transition in the file tree area. The "door opens/closes" effect is best implemented as a small horizontal slide with a slight scale/opacity change, not a large page transition.
- Settings that are already scoped by space should rehydrate for the newly active space.

## Recommended Behavior

### Startup

On launch:

1. Load settings.
2. Load the persisted open-space list.
3. Pick the active space:
   - prefer `space.currentPath` if present;
   - otherwise use the first open-space path;
   - otherwise show the current "No space open" state.
4. Call `space_open` for only the chosen path.
5. Render dots for the persisted open-space list, with the active path selected.

The persisted list should be app-level UI state, not space-scoped state. A good setting name is `space.openPaths`.

### Opening A Space

When the user chooses File -> Open Space, the command palette action, the welcome screen action, or the recent-spaces menu:

1. If the chosen path is already in `space.openPaths`, switch to it.
2. If it is not in `space.openPaths`, add it to the end of the list.
3. Make it active.
4. Persist:
   - `space.currentPath`
   - `space.openPaths`
   - `space.recent`
5. Do not create a new native window.

The old `space_open_window` branch in `SpaceContext.applySpaceSelection()` is the current behavior to remove.

### Creating A Space

Creating a space follows the same in-window path:

1. Pick/create the folder.
2. Add the new root to `space.openPaths`.
3. Make it active.
4. Persist current, open, and recent lists.
5. Mount only that root.

### Switching Spaces

When the user clicks a dot:

1. Ignore the click if it targets the active path.
2. Save the current editor before switching by calling `saveCurrentEditor()`.
3. If saving fails, keep the current space active and surface the error.
4. Clear space-specific frontend caches.
5. Call `space_open` for the target path. This replaces the backend's current session.
6. Set `spacePath`, `spaceSchemaVersion`, and `onboardingNotePath` from the returned `SpaceInfo`.
7. Persist `space.currentPath`.
8. Let existing providers reset from the `spacePath` change:
   - `FileTreeProvider` clears and reloads the root tree.
   - `useTabManager(spacePath)` clears tabs/history/dirty state.
   - `UIProvider` reloads space-scoped settings.
   - `GitSyncProvider` refreshes per-space Git state.
   - navigation prefetch caches are invalidated.

Important: switching should not preserve open tabs across spaces in the first implementation. Preserving per-space workspace view state is useful later, but it adds more state ownership and dirty-editor edge cases. The first version should switch cleanly and predictably.

### Closing A Space

Close Space should remove the active root from the switcher:

1. Save the current editor if needed.
2. Remove active path from `space.openPaths`.
3. If another open path remains, switch to the nearest neighbor:
   - prefer the dot to the right;
   - otherwise the dot to the left.
4. If no open path remains, call `space_close`, clear `space.currentPath`, and show "No space open."
5. Keep the path in `space.recent` so it can be reopened later.

This is a behavior change from "close this native space window." In the one-window model it means "remove this space from my switcher."

### Recent Spaces Menu

The native Recent Spaces menu should keep working. Selecting a recent space should now route to the main window and add/switch that path inside the footer switcher. It should not open or focus a separate space window.

The recent menu should continue to exclude the current active space. It may include spaces already present in `space.openPaths` if they are inactive; selecting one just switches.

### Footer Switcher UI

The sidebar footer should have a dedicated switcher area above or beside the license footer:

- Show one dot button per path in `space.openPaths`.
- Active dot is visually filled or larger.
- Inactive dots are smaller/subtler.
- Each dot has:
  - `aria-label="Switch to {spaceName}"`
  - `aria-current="true"` for the active path
  - `title` with the full path or path basename
- The active space basename may be shown only in a tooltip or compact accessible label, not as another row of large text.
- If there are more dots than fit, use horizontal scrolling or collapse overflow into a small menu. Do not let dots resize the sidebar.
- The footer should still work when the license footer is absent, trial, or community-build mode.

The first version should avoid adding a visible plus button unless the design needs it. Existing Open Space commands already provide the add-space affordance. If a plus affordance is added later, it should call the same `onOpenSpace` action.

### Switch Animation

Use Motion around the file-tree/tags region, keyed by the active `spacePath`.

Recommended effect:

- outgoing tree: translateX(-10px or +10px), opacity 0, maybe scale 0.985
- incoming tree: translateX(+10px or -10px), opacity 1, scale 1
- duration: around 140-190ms
- spring or ease-out, respecting `useReducedMotion()`

The direction can be derived from the previous/next dot index. If the target dot is to the right, content moves left; if target is to the left, content moves right.

This should wrap only the sidebar content body, not the whole app shell. The editor/main area will naturally reset from the active `spacePath`; adding a large editor transition in the first version risks making the app feel slower.

### Trackpad Swipe

Treat swipe as a follow-up after click switching is solid.

If implemented:

- listen for horizontal wheel gestures on the sidebar footer or sidebar body, not globally across the editor;
- require a threshold so normal scrolling does not switch spaces;
- throttle until the current switch finishes;
- respect reduced motion;
- expose only previous/next space behavior.

## Current Code Shape

### Backend

Current space lifecycle lives in:

- `src-tauri/src/space/commands.rs`
- `src-tauri/src/space/state.rs`
- `src-tauri/src/space/helpers.rs`
- `src-tauri/src/space/watcher.rs`
- `src-tauri/src/lib.rs`
- `src/lib/tauri.ts`

The backend currently supports per-window space sessions:

- `SpaceState.sessions: Mutex<HashMap<String, SpaceSession>>`
- `space_open_window(...)`
- `SPACE_WINDOW_PREFIX`
- generated labels like `space-{hash}`
- window routing helpers in `src-tauri/src/lib.rs`

Most backend commands resolve the root through:

- `state.root_for_window(&window)`
- `state.root_for_window_label(window_label)`
- `state.recent_local_changes_for_window(window.label())`

This exists so several native space windows can each talk to a different space.

For KAR-25, that is the old model. The target model needs one active root for the main app window.

### Frontend

Current frontend ownership:

- `src/contexts/SpaceContext.tsx`
  - app info
  - active `spacePath`
  - recent spaces
  - open/create/close actions
  - current logic that opens another native window when a session already exists
- `src/contexts/FileTreeContext.tsx`
  - clears/reloads file tree when `spacePath` changes
- `src/contexts/UIContext.tsx`
  - clears tabs when no space exists
  - reloads space-scoped settings on `spacePath` changes
- `src/components/app/useTabManager.ts`
  - resets tabs, dirty state, and history when `spacePath` changes
- `src/contexts/GitSyncContext.tsx` and `src/hooks/useGitSync.ts`
  - refresh per-space Git sync from `spacePath`
- `src/components/app/SidebarContent.tsx`
  - owns the file tree/tags/sidebar body
  - currently ends with `LicenseStatusFooter`
- `src/components/licensing/LicenseStatusFooter.tsx`
  - current footer component

This is favorable: most frontend state already responds to `spacePath` as the active-space boundary.

## Recommended Refactor

### Keep A Deep Active-Space Module

Do not spread switcher details through the app shell. The useful seam is `SpaceContext`.

`SpaceContext` should expose a small interface like:

```ts
type OpenSpace = {
  path: string;
  label: string;
};

interface SpaceContextValue {
  spacePath: string | null;
  openSpaces: OpenSpace[];
  activeSpaceIndex: number;
  switchSpace: (path: string) => Promise<void>;
  switchToNextSpace: () => Promise<void>;
  switchToPreviousSpace: () => Promise<void>;
  onOpenSpace: () => Promise<void>;
  onOpenSpaceAtPath: (path: string) => Promise<void>;
  onCreateSpace: () => Promise<void>;
  closeSpace: () => Promise<void>;
}
```

The implementation hides:

- deduping paths
- persistence of open/current/recent spaces
- calling `space_open` versus `space_create`
- editor save coordination
- cache invalidation
- onboarding note handling
- indexing state reset

Callers should not know whether the target came from a dot, recent menu, command palette, or file picker.

### Coordinate Editor Saving

`SpaceContext` currently cannot call `saveCurrentEditor()` because `EditorProvider` is below it in the provider stack:

```text
SpaceProvider
  FileTreeProvider
    UIProvider
      EditorProvider
        GitSyncProvider
          AppShell
```

There are two reasonable options:

1. Preferred: keep `SpaceProvider` as the owner of space state, but let `AppShell` wrap switching actions with editor save checks.
   - Add a helper hook in `AppShell`, e.g. `switchSpaceWithEditorFlush(path)`.
   - Pass it to `SpaceSwitcherFooter`.
   - Keep lower-level `SpaceContext.switchSpace(path)` focused on mounting/persistence/cache invalidation.
2. Larger refactor: move `EditorProvider` above `SpaceProvider`.
   - This is not recommended for the first slice because it changes provider ordering and could affect existing hooks.

The plan should use option 1.

### Preserve Existing Space-Scoped Settings

`src/lib/settings.ts` already has `SpaceScopedSettingsMap` and `SettingsScope`.

These settings already hydrate by active space:

- daily notes folder
- quick notes folder
- templates folder
- daily note template
- attachment storage mode
- attachment folder

`SpaceSettingsPane` already calls `space_get_current` and stores against the active path. Once switching updates the backend active root before settings render/hydrate, settings should populate for the selected dot automatically.

The plan should still audit settings panes after implementation:

- `src/components/settings/SpaceSettingsPane.tsx`
- `src/components/settings/TemplatesSettingsPane.tsx`
- `src/components/settings/GitSettingsPane.tsx`
- `src/components/settings/AiSettingsPane.tsx`
- `src/components/settings/settingsConfig.tsx`

### Backend Hard Cutover

This is the recommended backend direction after approval:

1. Delete the user-facing multi-space-window path:
   - remove `space_open_window` command;
   - remove its TypeScript command entry;
   - remove frontend calls to it.
2. Simplify host-window routing:
   - `main` is the only space host window;
   - quick note still uses the active main space via `current_root()`;
   - settings stays in the main surface or its existing settings behavior.
3. Narrow `SpaceState` back toward a single active session:
   - `current: Mutex<Option<PathBuf>>`
   - one watcher handle
   - one `RecentLocalChanges`
   - shared mutexes for stores
4. Keep compatibility shims only if they reduce churn:
   - `root_for_window(&window)` can still exist, but it should return `current_root()` for main/quick-note flows.
   - `root_for_window_label(label)` can be narrowed or removed after updating Git sync/service call sites.

Because the project policy says to ask before hard cutovers, the implementation should not start deleting multi-window support until this plan is approved.

## Files To Touch

### Frontend State And Settings

- `src/contexts/SpaceContext.tsx`
  - add `openSpaces`
  - add active index
  - replace `space_open_window` branching with in-window `space_open`/`space_create`
  - add `switchSpace`
  - update `closeSpace` to remove active path and switch neighbor
  - persist current/open/recent lists
  - clear caches on every active-space change
  - remove `isSpaceWindow()` and `SPACE_WINDOW_PREFIX` usage after backend cutover

- `src/lib/settings.ts`
  - add `openSpacePaths` / `space.openPaths`
  - normalize/dedupe persisted paths
  - add setters for open-space list and current-space updates
  - keep `recentSpaces` behavior separate
  - consider changing `setCurrentSpacePath(path)` into a more explicit helper that updates current/recent/open together

- `src/lib/tauri.ts`
  - remove `space_open_window` after Rust command removal
  - keep `space_open`, `space_create`, `space_close`, `space_get_current`, `space_get_current_info`

- `src/lib/windowLabels.ts`
  - delete if `SPACE_WINDOW_PREFIX` becomes unused

### Frontend Sidebar UI

- `src/components/app/Sidebar.tsx`
  - pass switcher props down or render a footer wrapper
  - keep settings-mode behavior in mind; the switcher probably belongs to workspace sidebar mode, not settings sidebar mode

- `src/components/app/SidebarContent.tsx`
  - replace direct `LicenseStatusFooter` usage with a new sidebar footer module
  - key file tree/tags content by `spacePath` for the switch animation
  - keep the empty-state footer behavior sane when no space is open

- `src/components/app/SpaceSwitcherFooter.tsx` (new)
  - render dots
  - handle click switching
  - expose active/inactive accessible labels
  - optionally handle horizontal wheel swipe in a later slice

- `src/components/app/SidebarFooter.tsx` (new, optional)
  - compose `SpaceSwitcherFooter` and `LicenseStatusFooter`
  - keeps licensing unrelated to switcher internals

- `src/styles/app/04-sidebar.css`
  - add stable footer layout
  - add dot sizes/states/focus styles
  - add overflow behavior for many dots
  - add animation classes only if Motion props are not enough

### Frontend Shell Integration

- `src/components/app/AppShell.tsx`
  - wrap dot switching with `saveCurrentEditor()`
  - call `setError`/toast when save or switch fails
  - pass active index/direction if animation needs it
  - ensure command/menu open-space paths still route to in-window open

- `src/hooks/useMenuListeners.ts`
  - likely no API change; it already routes recent-space menu events to `onOpenSpaceAtPath`
  - confirm recent-space selection switches in-window after `SpaceContext` changes

- `src/components/app/useAppCommands.tsx`
  - audit command labels if "Open Space" still implies opening a window anywhere

- `src/shared/appCommandManifest.json`
  - audit command descriptions for "window" language

### Backend Space Runtime

- `src-tauri/src/space/commands.rs`
  - remove `SPACE_WINDOW_PREFIX`, `is_space_window`, `space_window_label`, `space_window_title`, `focus_window`, and `space_open_window`
  - make `space_open` replace the single active session
  - make `space_create` replace the single active session
  - keep `space_close` as "unmount active"

- `src-tauri/src/space/state.rs`
  - remove or narrow `sessions`
  - remove per-window session helpers after call sites are updated
  - keep one active watcher and one recent-local-change tracker

- `src-tauri/src/lib.rs`
  - remove space host window helpers that include `space-*` windows
  - route menu events to `main`
  - remove destroyed-space-window cleanup
  - update `space_is_open`
  - keep quick-note/settings/external-markdown behavior intact

- `src-tauri/src/git_sync/service.rs`
  - replace `root_for_window_label(window_label)` with active root access or a narrower helper
  - keep status events emitted to the main window

- Any Rust module currently using `root_for_window` should continue to compile if that helper remains and returns the active root. This is the least risky transition.

### Docs

- `docs/architecture/02-spaces-storage-filesystem.md`
  - update "Space State" to describe one mounted space plus persisted switcher roots
  - remove stale per-window language after code cutover

- `docs/architecture/03-frontend-shell-state.md`
  - document `openSpaces` and the switcher
  - mention that tabs reset on first-version switches

- `docs/architecture/04-ipc-and-native-runtime.md`
  - remove `space_open_window`
  - update native windows section
  - update recent-spaces menu behavior

- `docs/architecture/09-settings-menus-git-sync-native-windows.md`
  - update native windows and Git sync sections for one active main space

## Files To Create

Recommended:

- `src/components/app/SpaceSwitcherFooter.tsx`
- `src/components/app/SidebarFooter.tsx`

Optional only if implementation gets large:

- `src/lib/spaces.ts`
  - pure helpers for path labels, dedupe, index lookup, next/previous selection
  - create only if `SpaceContext.tsx` starts mixing too much list logic with async mounting

Avoid creating test files unless explicitly requested. Existing tests can be updated if they break because touched code changed, but this plan should not introduce new test files by default.

## Detailed Implementation Phases

### Phase 1: Frontend In-Window Switching

Goal: stop creating extra windows from React while keeping backend multi-window support temporarily available.

Steps:

1. Add `space.openPaths` support in `settings.ts`.
2. Extend `SpaceContextValue` with `openSpaces`, active index, and `switchSpace`.
3. On startup, hydrate `openSpaces` from settings.
4. Change `applySpaceSelection()`:
   - remove the `sessionSpacePath ? space_open_window(...) : ...` behavior;
   - call `space_open` or `space_create` directly;
   - update `spacePath` even when another space was already active.
5. Ensure every successful switch clears:
   - AI panel caches
   - inline image hydration cache
   - navigation prefetch
6. Implement close-space neighbor selection.
7. Keep native recent-space menu functional.

This phase gives the product behavior without immediately deleting backend support.

### Phase 2: Footer Dots And Animation

Goal: make the switcher visible and polished.

Steps:

1. Create `SpaceSwitcherFooter.tsx`.
2. Create or adapt `SidebarFooter.tsx`.
3. Replace the current direct `LicenseStatusFooter` placements in `SidebarContent`.
4. Add dot styles in `04-sidebar.css`.
5. Add a keyed Motion wrapper around the file tree/tags content.
6. Track switch direction from old index to new index.
7. Respect reduced motion.

### Phase 3: Backend Cutover

Goal: remove the old one-window-per-space runtime.

Steps:

1. Remove `space_open_window` from Rust and TypeScript.
2. Remove generated `space-*` host-window creation.
3. Narrow `SpaceState` to one active session.
4. Update `lib.rs` window routing so menu events go to the main window.
5. Keep quick note behavior pointed at the active root.
6. Update Git sync service helpers to use the active root.
7. Update architecture docs.

This phase is the actual deletion of old behavior. It should happen after you approve the hard cutover.

### Phase 4: Optional Swipe

Goal: add Arc-like trackpad switching only after click switching is reliable.

Steps:

1. Add previous/next actions to `SpaceContext`.
2. Add horizontal wheel handling to `SpaceSwitcherFooter`.
3. Use a threshold and cooldown.
4. Do not bind global editor-area swipes.

## Risks And Decisions

### Unsaved Changes

Switching spaces while a note is dirty can lose work if the editor unmounts before save completes. The switch action must save first and abort on error.

Current `EditorContext.saveCurrentEditor()` returns `true` when an editor existed and save ran. It throws if save fails. The switch wrapper in `AppShell` should use that behavior and show a clear error.

### Stale Async Responses

`FileTreeProvider`, `useGitSync`, and several hooks already protect against stale responses by checking the active `spacePath` or request ids. The switch implementation should keep that pattern and avoid setting state from an old space after a rapid switch.

### Space-Scoped Settings

Space settings already depend on `space_get_current` and `loadSettings({ spacePath })`. The switch must update the backend current root before settings panes read their values.

### Current Root Versus Window Label

Many Rust commands use `root_for_window(&window)`. During the cutover, keeping that method as an active-root adapter will reduce the number of touched command modules.

### Git Sync

Git sync runtime is keyed by root. That is good. The event target is still window-label based. In the one-window model, emit status to `main`.

### Quick Note

Quick note uses the currently active space. After removing multi-window support, there is no focused-space-window ambiguity. Quick note should use the main active root.

### Recent Spaces Versus Open Spaces

Do not conflate the two lists:

- `space.openPaths`: spaces currently represented by dots.
- `space.recent`: historical menu/list of recently used spaces.
- `space.currentPath`: active mounted space.

### Multiple Windows Already Open During Upgrade

Because this is a hard cutover, the implementation does not need backward compatibility for existing open `space-*` windows. The app after update should only create/use the main host window. Existing runtime windows disappear when the app restarts.

## Acceptance Criteria

- Opening a second space in an active window does not create a new native window.
- The new space appears as a dot in the sidebar footer and becomes active.
- Clicking another dot switches the active file tree in the same window.
- Only one backend space is mounted at a time.
- Tabs/editor state from the previous space is not shown after switching.
- Space settings show values for the currently active dot.
- Git settings/status reflect the currently active dot.
- Recent-space native menu switches in-window.
- Close Space removes the active dot and switches to a neighbor, or leaves no space open.
- Quick note writes to the currently active space.
- File tree watcher events after switching do not update the wrong space UI.
- The old `space_open_window` path is removed after backend cutover.

## Verification Checklist

Manual checks:

1. Start with no space open; open Space A.
2. Open Space B from File -> Open Space; confirm no new window is created.
3. Confirm footer shows dots for A and B.
4. Click A dot; confirm A file tree, settings, tags, pinned files, and Git state load.
5. Click B dot; confirm B context loads.
6. Open a note in A, type a change, switch to B; confirm save happens or an error blocks switching.
7. Close active space with two spaces open; confirm neighbor activates.
8. Close final space; confirm no-space empty state.
9. Use native Recent Spaces menu; confirm in-window switch.
10. Open quick note after switching; confirm it writes to active space.
11. Trigger file changes in inactive space from Finder/terminal; confirm inactive changes do not mutate the active tree.

Static checks when implementation is ready:

- `pnpm check`
- `pnpm build`
- `cd src-tauri && cargo check`

Do not run dev servers; the user handles dev.

