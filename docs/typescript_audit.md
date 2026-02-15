# Lattice Frontend — TypeScript Code Audit

> **Date:** 2026-02-15
> **Scope:** `src/` directory (React 19 + TypeScript + Vite frontend)
> **Total Issues:** 82
> **Methodology:** Manual static analysis against project conventions (AGENTS.md), React best practices, and general TypeScript/security standards.

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 Critical | 10 | Bugs, broken features, violations of hard project rules |
| 🟠 High | 20 | Architectural issues, race conditions, major duplication |
| 🟡 Medium | 33 | Performance, security patterns, type safety, a11y |
| 🟢 Low | 19 | Style, minor duplication, dead code |
| **Total** | **82** | |

### Top 5 Priorities

1. **Split oversized files** — 8 files exceed the 200 LOC project limit (some by 6×).
2. **Fix the broken `cn()` import** — 8+ components use a naive `cn()` that doesn't merge Tailwind classes.
3. **Fix the sidebar resize bug** — `useEffect` gated on a ref that's always `false` at mount; resize never works.
4. **Fix cross-platform shortcuts** — `metaKey` matching breaks all keyboard shortcuts on Windows/Linux.
5. **Eliminate massive code duplication** — `errMessage` (4×), `normalizeRelPath` (3×), `providerLogoMap` (2×), `FolderShelf` (2×), `Icons` (2×), `springTransition` (5×).

---

## 🔴 Critical Issues

### C-01 · `AIPanel.tsx` exceeds 200 LOC limit (1176 lines)

| Field | Value |
|-------|-------|
| **File** | `src/components/ai/AIPanel.tsx` |
| **Lines** | 1–1176 |
| **Rule** | AGENTS.md: "Code LOC should not exceed 200 lines per file" |
| **Issue** | The single largest frontend file. Mixes tool timeline state, response phase FSM, chat history, context building, file saving, copy/retry actions, and a massive JSX tree. |
| **Fix** | Decompose into `AIChatThread.tsx`, `AIComposer.tsx`, `AIToolStatus.tsx`, `AIHistorySidebar.tsx`, and extracted hooks (`useAIChat.ts`, `useAIActions.ts`). |

---

### C-02 · `AppShell.tsx` exceeds 200 LOC limit (845 lines)

| Field | Value |
|-------|-------|
| **File** | `src/components/app/AppShell.tsx` |
| **Lines** | 1–845 |
| **Rule** | AGENTS.md: "Code LOC should not exceed 200 lines per file" |
| **Issue** | Monolithic component handling sidebar resize, AI resize, wiki-link resolution, file-system watchers, folder views, move pickers, command palette, daily notes, and context file attachment. |
| **Fix** | Extract `useResizablePanel` hook, `useWikiLinkResolver` hook, `useFSWatcher` hook, `useCommandBuilder` hook. Keep `AppShell.tsx` as a thin layout shell. |

---

### C-03 · `ModelSelector.tsx` exceeds 200 LOC limit (735 lines)

| Field | Value |
|-------|-------|
| **File** | `src/components/ai/ModelSelector.tsx` |
| **Lines** | 1–735 |
| **Rule** | AGENTS.md: "Code LOC should not exceed 200 lines per file" |
| **Issue** | Contains inline portal-based dropdown, model detail panel, provider support display, profile switcher, and filtering logic all in one file. |
| **Fix** | Split into `ModelDropdown.tsx`, `ModelDetailPanel.tsx`, `ProviderBadge.tsx`, `ProfileSwitcher.tsx`. |

---

### C-04 · `useFileTree.ts` exceeds 200 LOC limit (619 lines)

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useFileTree.ts` |
| **Lines** | 1–619 |
| **Rule** | AGENTS.md: "Code LOC should not exceed 200 lines per file" |
| **Issue** | Single hook handling CRUD operations, navigation, refresh, expansion, drag-drop, and file watching. |
| **Fix** | Decompose into `useFileTreeCRUD.ts`, `useFileTreeNavigation.ts`, `useFileTreeRefresh.ts`, `useFileTreeDragDrop.ts`. |

---

### C-05 · `CommandPalette.tsx` exceeds 200 LOC limit (532 lines)

| Field | Value |
|-------|-------|
| **File** | `src/components/app/CommandPalette.tsx` |
| **Lines** | 1–532 |
| **Rule** | AGENTS.md: "Code LOC should not exceed 200 lines per file" |
| **Issue** | Contains search logic, debouncing, result categorization, rendering, and a large JSX tree. |
| **Fix** | Extract `useCommandSearch.ts` hook, `CommandResultGroup.tsx`, `CommandResultItem.tsx`. |

---

### C-06 · `FileTreeItem.tsx` exceeds 200 LOC limit (417 lines)

| Field | Value |
|-------|-------|
| **File** | `src/components/filetree/FileTreeItem.tsx` |
| **Lines** | 1–417 |
| **Rule** | AGENTS.md: "Code LOC should not exceed 200 lines per file" |
| **Issue** | Two components (`FileTreeDirItem` + `FileTreeFileItem`) plus helper functions in one file. |
| **Fix** | Split into `FileTreeDirItem.tsx`, `FileTreeFileItem.tsx`, `fileTreeItemHelpers.ts`. |

---

### C-07 · `MainContent.tsx` exceeds 200 LOC limit (376 lines)

| Field | Value |
|-------|-------|
| **File** | `src/components/app/MainContent.tsx` |
| **Lines** | 1–376 |
| **Rule** | AGENTS.md: "Code LOC should not exceed 200 lines per file" |
| **Issue** | Tab management, keyboard shortcuts, recent files, drag-and-drop reordering, and content switching all in one component. |
| **Fix** | Extract `useTabManager.ts` hook, `TabBar.tsx`, `TabItem.tsx`. |

---

### C-08 · `EditorRibbon.tsx` exceeds 200 LOC limit (337 lines)

| Field | Value |
|-------|-------|
| **File** | `src/components/editor/EditorRibbon.tsx` |
| **Lines** | 1–337 |
| **Rule** | AGENTS.md: "Code LOC should not exceed 200 lines per file" |
| **Issue** | Formatting toolbar with all button definitions, state checks, and rendering in one file. |
| **Fix** | Extract button group components (`TextFormatGroup.tsx`, `ListFormatGroup.tsx`, etc.) and a `useRibbonState.ts` hook. |

---

### C-09 · `EditorContext.tsx` — Side effect during render + missing cleanup

| Field | Value |
|-------|-------|
| **File** | `src/contexts/EditorContext.tsx` |
| **Lines** | 89–98 |
| **Category** | React Rules Violation / Memory Leak |
| **Issue** | `registerEditor(state)` is called directly in the render body of `useEditorRegistration` (not inside `useEffect`), which is a side effect during render — violating React's rules. Additionally, there is no cleanup: when the component unmounts, the stale `EditorSaveState` reference remains in `editorStateRef`, leading to calling `.save()` on a dead editor instance. |
| **Fix** | Wrap `registerEditor(state)` in a `useEffect` with a cleanup function that calls `unregisterEditor()`. |

---

### C-10 · Two competing `cn()` implementations — wrong one used by 8+ components

| Field | Value |
|-------|-------|
| **File** | `src/lib/utils.ts` vs `src/utils/cn.ts` |
| **Lines** | `lib/utils.ts:4`, `utils/cn.ts:1` |
| **Category** | Bug / Duplicate Code |
| **Issue** | `src/lib/utils.ts` uses `clsx` + `tailwind-merge` (correct — merges conflicting Tailwind classes). `src/utils/cn.ts` is a naive `filter(Boolean).join(" ")` that does **not** merge conflicting classes. When a component calls `cn("p-2", "p-4")`, the `lib/` version correctly yields `"p-4"`, while the `utils/` version yields `"p-2 p-4"` (broken). At least 8 non-shadcn components (Sidebar, AIPanel, AppShell, etc.) import the wrong one. |
| **Fix** | Delete `src/utils/cn.ts`. Update all imports to use `@/lib/utils`. |

---

## 🟠 High Issues

### H-01 · `UIContext.tsx` — Overly large context causing cascade re-renders

| Field | Value |
|-------|-------|
| **File** | `src/contexts/UIContext.tsx` |
| **Lines** | 58–231 |
| **Category** | Architecture / Performance |
| **Issue** | Bundles 25+ values (sidebar, AI panel, search, preview, tabs, daily notes). Any state change (e.g., typing in search) re-renders **every** consumer of `UIContext`, even those only reading `sidebarCollapsed`. |
| **Fix** | Split into at least 3 contexts: `SearchContext`, `AIPanelContext`, `UILayoutContext`. |

---

### H-02 · `FileTreeContext.tsx` — Exposes raw setState dispatchers

| Field | Value |
|-------|-------|
| **File** | `src/contexts/FileTreeContext.tsx` |
| **Lines** | 18–23 |
| **Category** | Architecture / Encapsulation |
| **Issue** | Exposes `React.Dispatch<React.SetStateAction<...>>` for `setRootEntries`, `setChildrenByDir`, `setExpandedDirs` directly in the context value. Any consumer can set arbitrary state, making the provider's invariants unenforceable. |
| **Fix** | Wrap in action callbacks (e.g., `expandDir(path)`, `collapseDir(path)`, `updateEntries(entries)`). |

---

### H-03 · `VaultContext.tsx` — Race condition in `applyVaultSelection`

| Field | Value |
|-------|-------|
| **File** | `src/contexts/VaultContext.tsx` |
| **Lines** | 117–140 |
| **Category** | Race Condition |
| **Issue** | No guard against concurrent calls. If the user clicks "open vault" twice quickly, two `vault_open`/`vault_create` calls run concurrently, and both update `recentVaults`, `vaultPath`, etc. with potentially interleaved results. |
| **Fix** | Add a `isOpeningRef` guard or use an abort controller pattern. Disable the UI button while a vault operation is in progress. |

---

### H-04 · `useViewLoader.ts` — Silent error swallowing in async IIFE

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useViewLoader.ts` |
| **Lines** | 87–96 |
| **Category** | Error Handling |
| **Issue** | When `NeedsIndexRebuildError` is caught and `loaded.doc` exists, a `void` async IIFE is fired. If `buildAndSet()` inside it throws a non-`NeedsIndexRebuildError`, the `catch {}` block at line 92 silently swallows it, hiding real failures from the user. |
| **Fix** | Log the caught error or surface it to the user via a toast/error state. |

---

### H-05 · `AppShell.tsx` — Sidebar resize effect is broken

| Field | Value |
|-------|-------|
| **File** | `src/components/app/AppShell.tsx` |
| **Lines** | 185–208 |
| **Category** | Bug |
| **Issue** | The `useEffect` checks `isDraggingRef.current` at mount time, but since it's a ref, the effect body runs once and registers listeners only if dragging was already in progress. `isDraggingRef.current` is always `false` when the effect first runs, so mouse move/up listeners are **never attached**. Same issue at lines 246–269 for AI panel resize. |
| **Fix** | Restructure to attach listeners in the `onMouseDown` handler (not in `useEffect`), or use a state variable instead of a ref to trigger the effect. |

---

### H-06 · `AppShell.tsx` — Duplicate resize logic (copy-pasted ~100 lines)

| Field | Value |
|-------|-------|
| **File** | `src/components/app/AppShell.tsx` |
| **Lines** | 155–268 |
| **Category** | Duplication |
| **Issue** | Sidebar resize and AI panel resize are copy-pasted patterns (~100 lines each) with near-identical logic. |
| **Fix** | Extract a reusable `useResizablePanel({ min, max, direction })` hook. |

---

### H-07 · Cross-platform shortcut matching is broken on Windows/Linux

| Field | Value |
|-------|-------|
| **File** | `src/lib/shortcuts.ts` |
| **Lines** | 22–31 |
| **Category** | Bug / Cross-Platform |
| **Issue** | Shortcuts are defined with `meta: true` (macOS ⌘), but on Windows/Linux `event.metaKey` is the Win key, not Ctrl. Users on Windows pressing Ctrl+K won't match `{ meta: true, key: "k" }`. |
| **Fix** | Map `meta` → `ctrlKey` on non-macOS platforms in `isShortcutMatch`. Use the existing `platform.ts` detection. |

---

### H-08 · `AIPanel.tsx` — `handleSend` not wrapped in `useCallback`

| Field | Value |
|-------|-------|
| **File** | `src/components/ai/AIPanel.tsx` |
| **Lines** | 360–391 |
| **Category** | Performance |
| **Issue** | Defined as a plain `async` function in the render scope, creating a new reference every render. This causes unnecessary re-renders of all child components receiving it as a prop. |
| **Fix** | Wrap in `useCallback` with appropriate dependencies. |

---

### H-09 · `useTauriEvent` handler causes listener churn

| Field | Value |
|-------|-------|
| **File** | `src/lib/tauriEvents.ts` |
| **Lines** | 44–65 |
| **Category** | Performance |
| **Issue** | The `handler` parameter is in the `useEffect` dependency array. If callers pass an inline function (the common React pattern), the Tauri event listener is torn down and re-registered on every render cycle. |
| **Fix** | Store the handler in a ref internally (`handlerRef.current = handler`) and use a stable wrapper in the effect. |

---

### H-10 · `FileTreeContext.tsx` — Derived values defeat memoization

| Field | Value |
|-------|-------|
| **File** | `src/contexts/FileTreeContext.tsx` |
| **Lines** | 88–93 |
| **Category** | Performance |
| **Issue** | `activeNoteId` and `activeNoteTitle` are computed in the render body without `useMemo`. They're referenced in the `useMemo` dependency array for the context value, but since they're new string/null values each render, they defeat the memoization. |
| **Fix** | Wrap in `useMemo` keyed on the source values. |

---

### H-11 · `hasViewDocChanged` uses JSON.stringify for deep comparison

| Field | Value |
|-------|-------|
| **File** | `src/lib/views/builders/common.ts` |
| **Lines** | 123–138 |
| **Category** | Performance |
| **Issue** | Serializes all nodes and edges twice (sanitize + stringify) on every view build. For large canvases (hundreds of nodes), this is an O(n) allocation-heavy operation. |
| **Fix** | Use a structural comparison, content hash, or a version/dirty flag. |

---

### H-12 · `fetchNotePreviewsAllAtOnce` silently swallows errors

| Field | Value |
|-------|-------|
| **File** | `src/lib/views/builders/common.ts` |
| **Lines** | 72–76 |
| **Category** | Error Handling |
| **Issue** | If `index_note_previews_batch` fails, previews is silently set to `[]` and falls back to disk reads. No logging or telemetry. Diagnosing why a view has missing previews becomes impossible. |
| **Fix** | At minimum, log the error via `console.warn` or a tracing utility. |

---

### H-13 · `folderView.ts` — `recursive` option declared but never used

| Field | Value |
|-------|-------|
| **File** | `src/lib/views/builders/folderView.ts` |
| **Lines** | 18 |
| **Category** | Bug / Dead Code |
| **Issue** | `const recursive = options.recursive ?? false` is computed and passed to the output doc's options, but `vault_list_dir` is called without it. The recursive feature is silently broken. |
| **Fix** | Either pass `recursive` to the backend call or remove the option. |

---

### H-14 · Duplicated `errMessage()` utility in 4 files

| Field | Value |
|-------|-------|
| **Files** | `src/components/ai/useAiContext.ts:31`, `src/components/ai/useAiHistory.ts:11`, `src/components/ai/useAiProfiles.ts:4`, `src/components/settings/ai/utils.ts:3` |
| **Category** | Duplication |
| **Issue** | Four identical implementations of the same error-to-string utility. |
| **Fix** | Create one shared `errMessage()` in `src/lib/errorUtils.ts` (or use the existing `toUserMessage` there). |

---

### H-15 · Duplicated `normalizeRelPath()` / `normalizePath()` in 3 files

| Field | Value |
|-------|-------|
| **Files** | `src/components/app/AppShell.tsx:83`, `src/components/ai/AIPanel.tsx:122`, `src/components/ai/useAiContext.ts:41` |
| **Category** | Duplication |
| **Issue** | Nearly identical path normalization functions scattered across three files. |
| **Fix** | Consolidate into `src/utils/path.ts` (which already exists). |

---

### H-16 · Duplicated `providerLogoMap` in 2 files

| Field | Value |
|-------|-------|
| **Files** | `src/components/ai/AIPanel.tsx:96–103`, `src/components/ai/ModelSelector.tsx:27–53` |
| **Category** | Duplication |
| **Issue** | Same provider→logo mapping duplicated with slightly different shapes (one has `{src, label}`, the other has just the URL string). |
| **Fix** | Create a shared `providerLogos.ts` in `src/components/ai/` with a single canonical mapping. |

---

### H-17 · `FolderShelf.tsx` — Entire component duplicated

| Field | Value |
|-------|-------|
| **Files** | `src/components/FolderShelf.tsx` vs `src/components/shelf/FolderShelf.tsx` + `shelf/ShelfItem.tsx` + `shelf/shelfUtils.ts` |
| **Category** | Duplication |
| **Issue** | Near-complete file duplicate. The `iconForRecent`, `formatMtime`, and `formatRelativeCompact` functions are tripled between the root `FolderShelf.tsx`, `shelf/shelfUtils.ts`, and `filetree/fileTypeUtils.ts`. |
| **Fix** | Delete one version. Keep the `shelf/` refactored version and update all imports. |

---

### H-18 · `Icons.tsx` barrel vs `Icons/` directory — competing icon sources

| Field | Value |
|-------|-------|
| **Files** | `src/components/Icons.tsx` (319 LOC) vs `src/components/Icons/` directory (`ActionIcons.tsx`, `EditorIcons.tsx`, etc.) |
| **Category** | Duplication / LOC Violation |
| **Issue** | Same icons exported from two competing sources. The barrel file is 319 LOC (over limit) and duplicates the categorized directory structure. |
| **Fix** | Delete `Icons.tsx`. Update imports to use `Icons/` directory. |

---

### H-19 · `searchView.ts` / `tagView.ts` — copy-pasted `buildPrimaryNode`

| Field | Value |
|-------|-------|
| **Files** | `src/lib/views/builders/searchView.ts:35–71`, `src/lib/views/builders/tagView.ts:36–71` |
| **Category** | Duplication |
| **Issue** | Identical ~35-line `buildPrimaryNode` callbacks with zero differences. |
| **Fix** | Extract into a shared helper in `common.ts`. |

---

### H-20 · `AiAssistantMode` type defined in two places

| Field | Value |
|-------|-------|
| **Files** | `src/lib/tauri.ts:165`, `src/lib/settings.ts:12` |
| **Category** | Duplication / Type Drift |
| **Issue** | Duplicate type definitions that can drift. If a new mode is added to one, the other may not be updated. |
| **Fix** | Define once in `tauri.ts` (the IPC boundary) and import elsewhere. |

---

## 🟡 Medium Issues

### M-01 · `MainContent.tsx` — No `React.memo`

| Field | Value |
|-------|-------|
| **File** | `src/components/app/MainContent.tsx` |
| **Lines** | 27 |
| **Category** | Performance |
| **Issue** | Receives several props and consumes multiple contexts. Re-renders on every context change. |
| **Fix** | Wrap in `React.memo` or extract tab management state into a separate hook/component. |

---

### M-02 · `MainContent.tsx` — Inline handlers in tab render loop

| Field | Value |
|-------|-------|
| **File** | `src/components/app/MainContent.tsx` |
| **Lines** | 268–311 |
| **Category** | Performance |
| **Issue** | `openTabs.map` creates inline arrow functions for `onClick`, `onDragStart`, `onDragEnd`, `onDragOver`, `onDrop` per tab on every render. |
| **Fix** | Extract a memoized `TabItem` component. |

---

### M-03 · `CommandPalette.tsx` — Unstable incremental keys

| Field | Value |
|-------|-------|
| **File** | `src/components/app/CommandPalette.tsx` |
| **Lines** | 70–88 |
| **Category** | React Anti-pattern |
| **Issue** | `renderSnippet` uses `key={key++}` with an incrementing counter. Produces unstable keys across renders (Fragment with key 0 might be different content after re-render). |
| **Fix** | Use content-based keys (e.g., character index or hash). |

---

### M-04 · `Sidebar.tsx` — No `React.memo` (14 props)

| Field | Value |
|-------|-------|
| **File** | `src/components/app/Sidebar.tsx` |
| **Lines** | 23 |
| **Category** | Performance |
| **Issue** | Receives 14 props. Any parent re-render triggers full re-render of the sidebar tree. |
| **Fix** | Wrap in `React.memo`. |

---

### M-05 · `SidebarContent.tsx` — No `React.memo` (10 props + 3 contexts)

| Field | Value |
|-------|-------|
| **File** | `src/components/app/SidebarContent.tsx` |
| **Lines** | 37 |
| **Category** | Performance |
| **Issue** | Re-renders on every context change from any of 3 consumed contexts. |
| **Fix** | Wrap in `React.memo` and consider splitting context consumption. |

---

### M-06 · `AIMessageMarkdown.tsx` — `createEditorExtensions()` on every mount

| Field | Value |
|-------|-------|
| **File** | `src/components/ai/AIMessageMarkdown.tsx` |
| **Lines** | 14 |
| **Category** | Performance |
| **Issue** | Creates a new array of TipTap extensions per render. Since AI messages can be numerous (dozens in a chat), this is wasteful. |
| **Fix** | Memoize with `useMemo` or define as a module-level constant. |

---

### M-07 · `useNoteEditor.ts` — Same `createEditorExtensions()` issue

| Field | Value |
|-------|-------|
| **File** | `src/components/editor/hooks/useNoteEditor.ts` |
| **Lines** | 45 |
| **Category** | Performance |
| **Issue** | Creates new extension array every time the hook is called. |
| **Fix** | Memoize with `useMemo`. |

---

### M-08 · `KeyboardShortcutsHelp.tsx` — `groupByCategory` runs every render

| Field | Value |
|-------|-------|
| **File** | `src/components/app/KeyboardShortcutsHelp.tsx` |
| **Lines** | 49 |
| **Category** | Performance |
| **Issue** | `const grouped = groupByCategory(SHORTCUTS)` computes grouping on every render with no memoization. |
| **Fix** | Wrap in `useMemo(() => groupByCategory(SHORTCUTS), [])`. |

---

### M-09 · `WelcomeScreen.tsx` — Array constant inside component body

| Field | Value |
|-------|-------|
| **File** | `src/components/app/WelcomeScreen.tsx` |
| **Lines** | 32 |
| **Category** | Performance |
| **Issue** | `const smoothEase = [0.22, 1, 0.36, 1] as const` is created inside the component body on every render. |
| **Fix** | Move to module scope. |

---

### M-10 · `SidebarContent.tsx` — Inline `style` objects

| Field | Value |
|-------|-------|
| **File** | `src/components/app/SidebarContent.tsx` |
| **Lines** | 166–169 |
| **Category** | Performance |
| **Issue** | `style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center" }}` creates a new object every render. |
| **Fix** | Use a CSS class or define the style object at module scope. |

---

### M-11 · `diff.ts` — O(d²) memory in Myers diff

| Field | Value |
|-------|-------|
| **File** | `src/lib/diff.ts` |
| **Lines** | 15–16 |
| **Category** | Performance |
| **Issue** | `const vNext = new Map(v)` creates a full Map copy for every `d` iteration in the trace. The `maxD` cap of 10,000 mitigates worst-case but is still substantial. |
| **Fix** | Consider a more memory-efficient diff algorithm or reduce `maxD`. |

---

### M-12 · `settings.ts` — Sequential `await`s for independent loads

| Field | Value |
|-------|-------|
| **File** | `src/lib/settings.ts` |
| **Lines** | 80–111 |
| **Category** | Performance |
| **Issue** | 7 sequential `await store.get()` calls in `loadSettings`. Each waits for the previous to complete. |
| **Fix** | Use `Promise.all` to load all 7 keys concurrently. |

---

### M-13 · `shortcuts/registry.ts` — `getShortcutById` uses linear scan

| Field | Value |
|-------|-------|
| **File** | `src/lib/shortcuts/registry.ts` |
| **Lines** | 180–182 |
| **Category** | Performance |
| **Issue** | `SHORTCUTS.find()` is O(n) per lookup. |
| **Fix** | Build a `Map<string, ShortcutDefinition>` at module load. Low severity given current small array (~15 entries), but worth noting. |

---

### M-14 · `slashCommands.ts` — `innerHTML` with string interpolation (XSS pattern)

| Field | Value |
|-------|-------|
| **File** | `src/components/editor/slashCommands.ts` |
| **Lines** | 145 |
| **Category** | Security |
| **Issue** | `button.innerHTML = \`<div class="slashCommandTitle">${item.title}</div>...\`` uses `innerHTML` with template literals. While `item.title` comes from the hardcoded `SLASH_COMMANDS` array (currently safe), this pattern is an XSS anti-pattern. |
| **Fix** | Use `document.createElement` + `textContent` instead of `innerHTML`. |

---

### M-15 · `dailyNotes.ts` — Frontend path validation allows `../` traversal

| Field | Value |
|-------|-------|
| **File** | `src/lib/dailyNotes.ts` |
| **Lines** | 18–27 |
| **Category** | Security |
| **Issue** | `isAbsolutePath` check prevents absolute paths, but doesn't prevent `../` traversal. A folder like `../../etc` would pass the check but escape the vault. Backend `paths::join_under()` should catch this, but defense-in-depth says validate here too. |
| **Fix** | Add a check for `..` path segments. |

---

### M-16 · `UIContext.tsx` — Unhandled promise rejection in `.then()` chain

| Field | Value |
|-------|-------|
| **File** | `src/contexts/UIContext.tsx` |
| **Lines** | 122–128 |
| **Category** | Error Handling |
| **Issue** | The promise chain `reloadFromDisk().then(() => loadSettings().then(...))` has no `.catch()`. If either function rejects, it becomes an unhandled promise rejection. |
| **Fix** | Add a `.catch()` handler or convert to `async`/`await` with try/catch. |

---

### M-17 · `useRecentFiles.ts` — No error handling in `refreshRecentFiles`

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useRecentFiles.ts` |
| **Lines** | 20 |
| **Category** | Error Handling |
| **Issue** | `getRecentFilesFromStore()` could throw (e.g., corrupted store). No try/catch means the error propagates as an unhandled promise rejection. |
| **Fix** | Add try/catch with fallback to empty array. |

---

### M-18 · `contexts/index.tsx` — No ErrorBoundary wrapping `AppProviders`

| Field | Value |
|-------|-------|
| **File** | `src/contexts/index.tsx` |
| **Lines** | 20 |
| **Category** | Error Handling |
| **Issue** | If any provider's `useEffect` throws during render, the entire app crashes with a white screen and no recovery UI. |
| **Fix** | Wrap `AppProviders` children in an `ErrorBoundary` component with a fallback screen. |

---

### M-19 · `windows.ts` — Window creation error handler is a no-op

| Field | Value |
|-------|-------|
| **File** | `src/lib/windows.ts` |
| **Lines** | 31–36 |
| **Category** | Error Handling |
| **Issue** | Both `tauri://created` and `tauri://error` handlers are empty functions. If window creation fails, the user gets no feedback. |
| **Fix** | Show a toast or log the error in the `tauri://error` handler. |

---

### M-20 · `UIContext.tsx` — `onFocusChanged` stale closure

| Field | Value |
|-------|-------|
| **File** | `src/contexts/UIContext.tsx` |
| **Lines** | 107–117 |
| **Category** | Race Condition |
| **Issue** | The `onFocusChanged` callback captures `cancelled` via closure, but `loadAndApplySettings` is async. The `cancelled` check is only at the top, not after the `await`, so state can be set after cleanup. |
| **Fix** | Check `cancelled` after each `await` or use an AbortController. |

---

### M-21 · `useSearch.ts` — `isSearching` never reset on empty query

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useSearch.ts` |
| **Lines** | 32–33 |
| **Category** | Stale State |
| **Issue** | When `searchQuery` goes from non-empty to empty, the early return clears results/error but doesn't reset `isSearching`. If a previous search was in-flight, `isSearching` stays `true` forever. |
| **Fix** | Add `setIsSearching(false)` in the early return branch. |

---

### M-22 · `VaultContext.tsx` — Confusing triple `setSettingsLoaded(true)`

| Field | Value |
|-------|-------|
| **File** | `src/contexts/VaultContext.tsx` |
| **Lines** | 79, 91, 97 |
| **Category** | Code Clarity |
| **Issue** | `setSettingsLoaded(true)` is called in 3 different code paths with confusing control flow. The intent is unclear and error-prone. |
| **Fix** | Restructure to call `setSettingsLoaded(true)` once in a `finally` block. |

---

### M-23 · `useFileTree.ts` — Cascade callback recreation from `activeFilePath` deps

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useFileTree.ts` |
| **Lines** | 504–516, 575–579 |
| **Category** | Performance |
| **Issue** | `activeFilePath` and `activePreviewPath` in `useCallback` deps means these callbacks (and everything depending on them) are recreated on every active file change. |
| **Fix** | Use refs for `activeFilePath`/`activePreviewPath` inside the callbacks. |

---

### M-24 · `MarkdownEditorPane.tsx` — Module-level cache never cleared

| Field | Value |
|-------|-------|
| **File** | `src/components/preview/MarkdownEditorPane.tsx` |
| **Lines** | 23 |
| **Category** | Memory Leak |
| **Issue** | `const markdownDocCache = new Map<string, string>()` is a module-level singleton that persists across component unmount/remount and vault switches. Never cleared on vault change. |
| **Fix** | Clear the cache when the vault changes (listen for vault change events). |

---

### M-25 · `MainToolbar.tsx` — Missing `aria-label` on icon-only button

| Field | Value |
|-------|-------|
| **File** | `src/components/app/MainToolbar.tsx` |
| **Lines** | 23–31 |
| **Category** | Accessibility |
| **Issue** | AI toggle button has `title` but no `aria-label`. Screen readers need explicit labeling for icon-only buttons. |
| **Fix** | Add `aria-label="Toggle AI panel"`. |

---

### M-26 · `VaultSettingsPane.tsx` — Missing `aria-label` on "Clear" button

| Field | Value |
|-------|-------|
| **File** | `src/components/settings/VaultSettingsPane.tsx` |
| **Lines** | 65–71 |
| **Category** | Accessibility |
| **Issue** | The "Clear" button for recent vaults has no variant/class or `aria-label`. |
| **Fix** | Add `aria-label="Clear recent vaults"`. |

---

### M-27 · `FileTreePane.tsx` — Uses `window.confirm()` for delete

| Field | Value |
|-------|-------|
| **File** | `src/components/filetree/FileTreePane.tsx` |
| **Lines** | 96 |
| **Category** | UX / Consistency |
| **Issue** | Uses the browser's native `window.confirm()` dialog which is blocking and doesn't match the app's design system. |
| **Fix** | Use the app's own Dialog component or `@tauri-apps/plugin-dialog`. |

---

### M-28 · `shortcuts/registry.ts` — `ShortcutId` resolves to `string`

| Field | Value |
|-------|-------|
| **File** | `src/lib/shortcuts/registry.ts` |
| **Lines** | 205 |
| **Category** | Type Safety |
| **Issue** | `type ShortcutId = (typeof SHORTCUTS)[number]["id"]` resolves to `string` because `SHORTCUTS` is typed as `ShortcutDefinition[]` (not `as const`). The type provides no compile-time narrowing. |
| **Fix** | Use `as const satisfies ShortcutDefinition[]` or define `id` as a string literal union. |

---

### M-29 · `tauri.ts` — `AiStoredToolEvent.phase` union is meaningless

| Field | Value |
|-------|-------|
| **File** | `src/lib/tauri.ts` |
| **Lines** | 228 |
| **Category** | Type Safety |
| **Issue** | `phase: "call" \| "result" \| "error" \| string` — the `\| string` makes the entire union collapse to `string`. |
| **Fix** | Remove the `\| string` escape hatch, or use just `string` if that's the intent. |

---

### M-30 · `tauri.ts` — Unsafe cast in `invoke`

| Field | Value |
|-------|-------|
| **File** | `src/lib/tauri.ts` |
| **Lines** | 380 |
| **Category** | Type Safety |
| **Issue** | `args[0] as Record<string, unknown>` is an unsafe cast that suppresses the compiler. |
| **Fix** | Use a type guard or restructure the generic to avoid the cast. |

---

### M-31 · `views/persistence.ts` — `isRecord()` returns `true` for arrays

| Field | Value |
|-------|-------|
| **File** | `src/lib/views/persistence.ts` |
| **Lines** | 6–8 |
| **Category** | Type Safety |
| **Issue** | `typeof value === "object"` is true for arrays. `isRecord` should also check `!Array.isArray(value)`. |
| **Fix** | Add `&& !Array.isArray(value)` to the check. |

---

### M-32 · `settings.ts` — Module-level side effect on import

| Field | Value |
|-------|-------|
| **File** | `src/lib/settings.ts` |
| **Lines** | 3–4 |
| **Category** | Architecture |
| **Issue** | `const store = new LazyStore(...)` and `const initPromise = store.init()` execute on first import, even if settings are never used (e.g., in tests). |
| **Fix** | Lazy-initialize inside the first function call, or use a factory pattern. |

---

### M-33 · `AiProfileSections.tsx` — `setTimeout` without cleanup

| Field | Value |
|-------|-------|
| **File** | `src/components/settings/ai/AiProfileSections.tsx` |
| **Lines** | 74 |
| **Category** | Memory Leak |
| **Issue** | `setTimeout(() => setKeySaved(false), 3000)` has no cleanup on unmount. Could cause state updates on an unmounted component. |
| **Fix** | Store the timeout ID and clear it in a cleanup function. |

---

## 🟢 Low Issues

### L-01 · `notePreview.ts` — Frontmatter regex edge cases

| Field | Value |
|-------|-------|
| **File** | `src/lib/notePreview.ts` |
| **Lines** | 17–18 |
| **Category** | Robustness |
| **Issue** | Regex doesn't handle multi-line YAML titles, titles with colons, or YAML special characters. |

---

### L-02 · `notePreview.ts` — Heading regex matches `##` as title

| Field | Value |
|-------|-------|
| **File** | `src/lib/notePreview.ts` |
| **Lines** | 24 |
| **Category** | Correctness |
| **Issue** | `^#\s+(.+)$` with `m` flag matches `## Subheading` as the note title. Should only match H1 (`# Title`). |

---

### L-03 · `notePreview.ts` — Dead code in `joinYamlFrontmatter`

| Field | Value |
|-------|-------|
| **File** | `src/lib/notePreview.ts` |
| **Lines** | 65 |
| **Category** | Dead Code |
| **Issue** | Handles non-`---` frontmatter, which can never occur if `splitYamlFrontmatter` was used to produce it. |

---

### L-04 · `shortcuts.ts` — Deprecated functions still re-exported

| Field | Value |
|-------|-------|
| **File** | `src/lib/shortcuts.ts:36-55`, `src/lib/shortcuts/index.ts:13-17` |
| **Category** | Dead Code |
| **Issue** | `formatShortcut` and `formatShortcutParts` are deprecated but still re-exported from the barrel. Consumers may use them unknowingly. |

---

### L-05 · `canvasLayout.ts` — Magic numbers not in constants

| Field | Value |
|-------|-------|
| **File** | `src/lib/canvasLayout.ts` |
| **Lines** | 34–37 |
| **Category** | Maintainability |
| **Issue** | `{ w: 260, h: 200 }` for link, `{ w: 190, h: 110 }` for text, `{ w: 300, h: 220 }` for frame, `{ w: 220, h: 160 }` as default — all hardcoded without being in `canvasConstants.ts`. |

---

### L-06 · `canvasFlowTypes.ts` — Index signatures weaken type safety

| Field | Value |
|-------|-------|
| **File** | `src/lib/canvasFlowTypes.ts` |
| **Lines** | 8, 13, 19, 29, 35, 41 |
| **Category** | Type Safety |
| **Issue** | Every data interface has `[key: string]: unknown`, required by React Flow's `Node` generic constraint but weakens type safety. Should be documented as intentional. |

---

### L-07 · `shortcuts/platform.ts` — Fragile user-agent detection

| Field | Value |
|-------|-------|
| **File** | `src/lib/shortcuts/platform.ts` |
| **Lines** | 18 |
| **Category** | Robustness |
| **Issue** | `ua.includes("win")` could match unexpected strings. A more specific pattern like `/windows/i` would be safer. |

---

### L-08 · `filePreview.ts` — `IMAGE_EXTS` missing common formats

| Field | Value |
|-------|-------|
| **File** | `src/utils/filePreview.ts` |
| **Lines** | 3 |
| **Category** | Completeness |
| **Issue** | Missing `gif`, `svg`, `bmp`, `avif`, `tiff`. May be intentional exclusions. |

---

### L-09 · `views/utils.ts` + `notePreview.ts` — Redundant basename utilities

| Field | Value |
|-------|-------|
| **Files** | `src/lib/views/utils.ts:3-5`, `src/lib/notePreview.ts:1-7` |
| **Category** | Duplication |
| **Issue** | Both extract the last path segment. `basename` returns it with extension, `titleForFile` strips `.md`. Should share implementation. |

---

### L-10 · `use-mobile.ts` — Layout flash on first render

| Field | Value |
|-------|-------|
| **File** | `src/hooks/use-mobile.ts` |
| **Lines** | 20 |
| **Category** | UX |
| **Issue** | `isMobile` starts as `undefined` (`!!undefined` = `false`). On a mobile-width device, the first render returns `false`, then re-renders with `true`, causing a layout flash. Less impactful for a Tauri desktop app. |

---

### L-11 · `UIContext.tsx` — Direct DOM manipulation via `focusSearchInput`

| Field | Value |
|-------|-------|
| **File** | `src/contexts/UIContext.tsx` |
| **Lines** | 163–167 |
| **Category** | React Anti-pattern |
| **Issue** | `el.focus()` and `el.select()` are direct DOM calls via a raw DOM ref stored in context. A callback ref pattern would be more idiomatic. |

---

### L-12 · `useCommandShortcuts.ts` — `commands` array in deps causes listener churn

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useCommandShortcuts.ts` |
| **Lines** | 82 |
| **Category** | Performance |
| **Issue** | The `commands` array is likely recreated each render in the parent, causing the `useEffect` to re-run and re-attach the `keydown` listener on every render cycle. |

---

### L-13 · `fileTreeHelpers.ts` — Inconsistent Unicode sanitization

| Field | Value |
|-------|-------|
| **File** | `src/hooks/fileTreeHelpers.ts` |
| **Lines** | 10 |
| **Category** | Robustness |
| **Issue** | `normalizeRelPath` doesn't strip zero-width characters. `normalizeEntry` (line 30) strips `\u200b` but `normalizeRelPath` does not — inconsistent sanitization. |

---

### L-14 · `ViewContext.tsx` — `activeViewDoc` in deps causes unnecessary effect re-runs

| Field | Value |
|-------|-------|
| **File** | `src/contexts/ViewContext.tsx` |
| **Lines** | 52 |
| **Category** | Performance |
| **Issue** | The effect includes `activeViewDoc` in its deps. Once a doc is set, the effect re-runs, but the guard prevents redundant loads. The effect fires unnecessarily on every doc change. |

---

### L-15 · `useDailyNote.ts` — Error detection via fragile string matching

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useDailyNote.ts` |
| **Lines** | 41–45 |
| **Category** | Robustness |
| **Issue** | `msg.includes("not found")` to detect file-not-found is fragile. If the Rust backend changes its error message, this breaks. |

---

### L-16 · `useFolderShelf.ts` — Implicit LRU via Map insertion order

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useFolderShelf.ts` |
| **Lines** | 66 |
| **Category** | Correctness |
| **Issue** | `Map.keys().next()` for eviction relies on insertion order. `set` on existing keys doesn't move them, so "oldest inserted" ≠ "least recently used." |

---

### L-17 · Multiple files — `springTransition` constant duplicated 5 times

| Field | Value |
|-------|-------|
| **Files** | `CommandPalette.tsx`, `FileTreeItem.tsx`, `FileTreePane.tsx`, `SearchPane.tsx`, `TagsPane.tsx` |
| **Category** | Duplication |
| **Issue** | Each file defines its own `springTransition`. Should use the shared `springPresets` from `ui/animations.ts`. |

---

### L-18 · `AIToolTimeline.tsx` + `AIPanel.tsx` — Duplicate `formatToolName`

| Field | Value |
|-------|-------|
| **Files** | `src/components/ai/AIToolTimeline.tsx:23`, `src/components/ai/AIPanel.tsx:92` |
| **Category** | Duplication |
| **Issue** | Same function with slightly different implementations (one capitalizes words, the other doesn't). |

---

### L-19 · `MotionUI.tsx` + `CanvasNoteInlineEditor.tsx` — Thin re-export barrel files

| Field | Value |
|-------|-------|
| **Files** | `src/components/MotionUI.tsx`, `src/components/CanvasNoteInlineEditor.tsx` |
| **Category** | Code Organization |
| **Issue** | Single-line barrel files that just re-export. Consumers should import from the actual source. |

---

## Circular / Structural Concerns

### S-01 · Circular dependency: `shortcuts.ts` ↔ `shortcuts/platform.ts`

| Field | Value |
|-------|-------|
| **Files** | `src/lib/shortcuts.ts` → `./shortcuts/platform`, `src/lib/shortcuts/index.ts` → `../shortcuts` |
| **Category** | Architecture |
| **Issue** | Works at runtime due to ES module hoisting but is fragile and confusing. |
| **Fix** | Merge `shortcuts.ts` into the `shortcuts/` module or clarify the dependency direction. |

---

## Checklist for Resolution

- [ ] **Phase 1 — Critical bugs** (C-09, C-10, H-05, H-07): Fix broken features immediately
- [ ] **Phase 2 — File splits** (C-01 through C-08): Break apart the 8 oversized files
- [ ] **Phase 3 — Deduplication** (H-14 through H-20): Consolidate duplicated code
- [ ] **Phase 4 — Context architecture** (H-01, H-02): Split `UIContext`, wrap `FileTreeContext` setters
- [ ] **Phase 5 — Error handling** (H-03, H-04, M-16 through M-19): Add guards, catches, and error boundaries
- [ ] **Phase 6 — Performance** (M-01 through M-13): Add memoization, `React.memo`, `useCallback`
- [ ] **Phase 7 — Security & a11y** (M-14, M-15, M-25 through M-27): Fix `innerHTML`, path validation, aria labels
- [ ] **Phase 8 — Type safety** (M-28 through M-32): Tighten types, remove unsafe casts
- [ ] **Phase 9 — Low-priority cleanup** (L-01 through L-19): Address remaining issues
