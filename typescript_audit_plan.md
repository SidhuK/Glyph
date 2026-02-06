# Comprehensive Code Audit & Implementation Plan — `src/`

## Executive Summary

After auditing every file in `src/` (90+ TypeScript/TSX files), 3 systemic root causes drive the majority of issues:

1. **Overly-generic XYFlow types** (`Node<Record<string, unknown>>`) forcing unsafe `as unknown as` casts everywhere
2. **"God component" `AppShell`** receiving ~40 props, with massive prop drilling through 4+ layers
3. **Copy-pasted view builder/loader code** (~80% identical across folder/search/tag)

Fixing these three will eliminate most individual issues. Below is every finding, organized by phase.

---

## Phase 0 — Critical Bug Fixes (< 1 hour)

### 0.1 `useViewLoader` ref/state divergence bug — `src/hooks/useViewLoader.ts` L263 — **CRITICAL** — [x]

The returned `setActiveViewDoc` does NOT update `activeViewDocRef.current`. Consumers like `getActiveFolderDir()` in AppShell read the ref and get stale data after MainContent saves.

**Fix:** Wrap the setter:

```ts
const setActiveViewDocAndRef = useCallback((doc: ViewDoc | null) => {
  setActiveViewDoc(doc);
  activeViewDocRef.current = doc;
}, []);
```

Return `setActiveViewDocAndRef` instead of raw `setActiveViewDoc`.

### 0.2 Async listener leak in `useMenuListeners` — `src/hooks/useMenuListeners.ts` L15-L37 — **HIGH** — [x]

If unmounted before `await listen(...)` resolves, `unlisten` stays `null` and the listener leaks.

**Fix:** Add `cancelled` guard pattern:

```ts
useEffect(() => {
  let cancelled = false;
  const cleanups: (() => void)[] = [];
  void (async () => {
    const u = await listen("menu:open_vault", ...);
    if (cancelled) { u(); return; }
    cleanups.push(u);
    // ...same for other listeners
  })();
  return () => { cancelled = true; cleanups.forEach(fn => fn()); };
}, [deps]);
```

### 0.3 Same leak in `SettingsApp` — `src/SettingsApp.tsx` L42-L56 — **HIGH** — [x]

Identical async listener race. Same fix pattern.

### 0.4 Same leak in `useAIChat` — `src/components/ai/hooks/useAIChat.ts` L64-L111 — **HIGH** — [x]

Three `await listen(...)` calls without `cancelled` guards.

### 0.5 `TauriChatTransport` missing stream `cancel()` — `src/lib/ai/tauriChatTransport.ts` L56-L148 — **HIGH** — [x]

If consumer cancels the `ReadableStream`, listeners remain attached.

**Fix:** Add `cancel()` to the underlying source:

```ts
return new ReadableStream<UIMessageChunk>({
  start: async (controller) => { ... },
  cancel: async () => {
    void invoke("ai_chat_cancel", { job_id: jobId }).catch(() => {});
    cleanup();
  }
});
```

### 0.6 Stale closure toggle in `AppShell` — `src/components/app/AppShell.tsx` L249 — **MEDIUM** — [x]

`setAiSidebarOpen(!aiSidebarOpen)` captures stale `aiSidebarOpen`.

**Fix:** `setAiSidebarOpen(v => !v)`.

### 0.7 Pending save timer not cleared on doc swap in `CanvasPane` — `src/components/canvas/CanvasPane.tsx` L169-L187 — **MEDIUM** — [x]

If doc changes while a save is queued, the wrong shape could be saved.

**Fix:** Clear `saveTimeoutRef.current` in the doc-change effect before `setNodes/setEdges`.

Everything passes. Here's a summary of all Phase 0 fixes applied:

```
Completed All Steps

Step	File	Fix
0.1	useViewLoader.ts	Wrapped setActiveViewDoc in setActiveViewDocAndRef that syncs the ref
0.2	useMenuListeners.ts	Added cancelled guard with per-listener check after each await listen()
0.3	SettingsApp.tsx	Same cancelled guard pattern for the single settings:navigate listener
0.4	useAIChat.ts	Same pattern for all 3 AI event listeners (ai:chunk, ai:done, ai:error)
0.5	tauriChatTransport.ts	Added cancel() handler on ReadableStream to invoke cleanup and cancel the AI job
0.6	AppShell.tsx + useAISidebar.ts	Switched to functional updater (v) => !v, widened type to React.Dispatch<SetStateAction<boolean>>, removed aiSidebarOpen from deps
0.7	CanvasPane.tsx	Clear both saveTimeoutRef and pendingSaveRef before applying new doc state

```

---

## Phase 1 — Type Safety Foundation (1–3 hours)

### Phase 1 Implementation Steps

- [x] **Step 1.1a** — Create `src/lib/canvasFlowTypes.ts` with typed node data interfaces, discriminated union `CanvasNode`, layout props, and type guards
- [x] **Step 1.1b** — Update `src/lib/tauri.ts` to re-export `CanvasNode`/`CanvasEdge` from `canvasFlowTypes.ts`
- [x] **Step 1.1c** — Update `src/components/canvas/types.ts` to re-export from `canvasFlowTypes.ts`
- [x] **Step 1.1d** — Remove `parentNode`/`extent`/`style` unsafe casts in `sanitize.ts`, `useCanvasHistory.ts`, `CanvasPane.tsx` snapshot, and `common.ts`
- [x] **Step 1.1e** — Remove `node.data as Record<string, unknown>` casts in `CanvasPane.tsx`, `useCanvasToolbarActions.ts`, `useExternalCanvasCommands.ts`, `useNoteEditSession.ts`, `useCanvasTabs.ts`, `CanvasNoteOverlayEditor.tsx`
- [x] **Step 1.1f** — Update node component props (`LinkNode.tsx`, `payloadBuilder.ts`, `noteEditHelpers.ts`) to use typed data
- [x] **Step 1.2** — Fix `invoke` type safety in `src/lib/tauri.ts`
- [x] **Step 1.3** — Type `AiMessage.role` as union in `src/lib/tauri.ts`
- [x] **Step 1.4** — Strengthen `SelectedCanvasNode.data` type in `src/components/ai/types.ts`
- [x] **Step 1.5** — Fix `node_type` mismatch `folder_preview` vs `folderPreview` in `src/lib/views/builders/folderView.ts`
- [x] **Step 1.6** — Run `pnpm build` and `cargo check` to verify all changes compile

### 1.1 Define typed Canvas node/edge data unions — `src/lib/tauri.ts` L114-L116, `src/components/canvas/types.ts` L4-L6 — **CRITICAL**

Currently `CanvasNode = Node<Record<string, unknown>>` forces `as Record<string, unknown>` in **24+ locations** across CanvasPane, useCanvasToolbarActions, useExternalCanvasCommands, useNoteEditSession, sanitize.ts, and all three view builders.

**Fix:** Define in `src/lib/tauri.ts`:

```ts
export type NoteNodeData = { noteId: string; title: string; content?: string };
export type FileNodeData = { path: string; title: string };
export type FolderNodeData = { dir: string; title: string };
export type LinkNodeData = {
  url: string;
  title?: string;
  preview?: LinkPreview;
  status?: string;
  image_src?: string;
};
export type TextNodeData = { text: string };
export type FrameNodeData = { title?: string; width?: number; height?: number };
export type FolderPreviewNodeData = { parentFolderNodeId: string };

export type CanvasNodeData =
  | NoteNodeData
  | FileNodeData
  | FolderNodeData
  | LinkNodeData
  | TextNodeData
  | FrameNodeData
  | FolderPreviewNodeData;
```

Then add type guards:

```ts
export function isNoteNode(n: CanvasNode): n is Node<NoteNodeData, "note"> {
  return n.type === "note";
}
export function isFileNode(n: CanvasNode): n is Node<FileNodeData, "file"> {
  return n.type === "file";
}
// etc.
```

**Files to update after this change (delete unsafe casts):**

| File                                                       | Lines with unsafe casts                     | Fix                                  |
| ---------------------------------------------------------- | ------------------------------------------- | ------------------------------------ |
| `src/components/canvas/CanvasPane.tsx`                     | L97-110, L282-284, L297, L311-328, L352-361 | Use type guards                      |
| `src/components/canvas/hooks/useCanvasToolbarActions.ts`   | L110, L134                                  | Use `isNoteNode(n)`, `isLinkNode(n)` |
| `src/components/canvas/hooks/useExternalCanvasCommands.ts` | L39, L64                                    | Use type guards                      |
| `src/components/canvas/hooks/useNoteEditSession.ts`        | L161                                        | Use `isNoteNode(node)`               |
| `src/components/canvas/hooks/useCanvasHistory.ts`          | L32-35, L42-44                              | Access fields directly after re-type |
| `src/lib/views/sanitize.ts`                                | L12-20, L34-38                              | Destructure typed fields             |
| `src/lib/views/builders/folderView.ts`                     | L84-86                                      | Direct typed access                  |
| `src/lib/views/builders/searchView.ts`                     | L49-50                                      | Direct typed access                  |
| `src/lib/views/builders/tagView.ts`                        | L50-51                                      | Direct typed access                  |

### 1.2 Fix `invoke` type safety — `src/lib/tauri.ts` L320-L333 — **HIGH**

The payload cast `(args[0] ?? {}) as Record<string, unknown>` defeats the purpose of `TauriCommands`.

**Fix:** Use function overloads:

```ts
export function invoke<K extends keyof TauriCommands>(
  command: K,
  args: TauriCommands[K]["args"],
): Promise<TauriCommands[K]["result"]>;
export function invoke<K extends keyof TauriCommands>(
  command: K,
): TauriCommands[K]["args"] extends void
  ? Promise<TauriCommands[K]["result"]>
  : never;
```

### 1.3 Type `AiMessage.role` as a union — `src/lib/tauri.ts` L188-L191 — **MEDIUM**

**Fix:** `role: "system" | "user" | "assistant"`.

### 1.4 Strengthen `SelectedCanvasNode.data` type — `src/components/ai/types.ts` L30-L34 — **MEDIUM**

Currently `Record<string, unknown> | null`. Use `CanvasNodeData | null` after Phase 1.1.

### 1.5 Fix `node_type` mismatch: `folder_preview` vs `folderPreview` — `src/lib/views/builders/folderView.ts` L121 — **HIGH**

Canvas registers `folderPreview` in nodeTypes but the view builder checks for `folder_preview`. Standardize on `folderPreview`.

**Phase 1 is complete.** Here's a summary of what was done:

**Files created:**

- [src/lib/canvasFlowTypes.ts](file:///Users/karatsidhu/Code/Tether/src/lib/canvasFlowTypes.ts) — Canonical typed node data interfaces (`NoteNodeData`, `TextNodeData`, etc.), per-node-type aliases (`NoteCanvasNode`, etc.), the `CanvasNode`/`CanvasEdge` types with legacy prop support, and type guard functions

**Files modified (15 total):**

- **Type definitions:** [tauri.ts](file:///Users/karatsidhu/Code/Tether/src/lib/tauri.ts), [canvas/types.ts](file:///Users/karatsidhu/Code/Tether/src/components/canvas/types.ts), [ai/types.ts](file:///Users/karatsidhu/Code/Tether/src/components/ai/types.ts)
- **Cast removals (parentNode/extent/style):** [sanitize.ts](file:///Users/karatsidhu/Code/Tether/src/lib/views/sanitize.ts), [useCanvasHistory.ts](file:///Users/karatsidhu/Code/Tether/src/components/canvas/hooks/useCanvasHistory.ts), [CanvasPane.tsx](file:///Users/karatsidhu/Code/Tether/src/components/canvas/CanvasPane.tsx), [common.ts](file:///Users/karatsidhu/Code/Tether/src/lib/views/builders/common.ts)
- **Cast removals (data access):** [useCanvasToolbarActions.ts](file:///Users/karatsidhu/Code/Tether/src/components/canvas/hooks/useCanvasToolbarActions.ts), [useExternalCanvasCommands.ts](file:///Users/karatsidhu/Code/Tether/src/components/canvas/hooks/useExternalCanvasCommands.ts), [useNoteEditSession.ts](file:///Users/karatsidhu/Code/Tether/src/components/canvas/hooks/useNoteEditSession.ts), [useCanvasTabs.ts](file:///Users/karatsidhu/Code/Tether/src/components/canvas/hooks/useCanvasTabs.ts), [CanvasNoteOverlayEditor.tsx](file:///Users/karatsidhu/Code/Tether/src/components/canvas/CanvasNoteOverlayEditor.tsx)
- **Typed props/data:** [LinkNode.tsx](file:///Users/karatsidhu/Code/Tether/src/components/canvas/nodes/LinkNode.tsx), [payloadBuilder.ts](file:///Users/karatsidhu/Code/Tether/src/components/ai/payloadBuilder.ts), view builders ([folderView.ts](file:///Users/karatsidhu/Code/Tether/src/lib/views/builders/folderView.ts), [searchView.ts](file:///Users/karatsidhu/Code/Tether/src/lib/views/builders/searchView.ts), [tagView.ts](file:///Users/karatsidhu/Code/Tether/src/lib/views/builders/tagView.ts))
- **AiMessage role + transport:** [tauriChatTransport.ts](file:///Users/karatsidhu/Code/Tether/src/lib/ai/tauriChatTransport.ts)

**Results:** Unsafe casts reduced from **50+ to 1** (the unavoidable IPC boundary cast). `pnpm build`, `pnpm check`, and `cargo check` all pass.

---

## Phase 2 — De-duplication (1–2 days)

### 2.1 Unify view builders — `src/lib/views/builders/folderView.ts`, `searchView.ts`, `tagView.ts` — **HIGH**

~80% of the code is identical: load existing → map IDs → fetch previews → merge with prev nodes → layout new nodes → filter edges → detect changes.

**Fix:** Extract `buildListViewDoc(params)`:

```ts
interface ViewBuildParams {
  view: ViewRef;
  limit: number;
  fetchIds: () => Promise<{
    ids: string[];
    titleById?: Map<string, string>;
  }>;
  shouldPreserveNonNoteNode?: (n: CanvasNode) => boolean;
  existing: ViewDoc | null;
}

async function buildListViewDoc(
  params: ViewBuildParams,
): Promise<{ doc: ViewDoc; changed: boolean }> {
  // shared: fetch IDs → fetch previews → merge nodes → layout → detect changes
}
```

Then each builder becomes a thin wrapper:

```ts
export async function buildSearchViewDoc(
  query: string,
  options: ViewOptions,
  existing: ViewDoc | null,
) {
  const v = viewId({ kind: "search", query });
  return buildListViewDoc({
    view: { kind: "search", query },
    limit: options.limit ?? 200,
    fetchIds: async () => {
      const results = await invoke("search", { query: v.selector });
      return {
        ids: results.map((r) => r.id).filter(Boolean),
        titleById: new Map(results.map((r) => [r.id, r.title])),
      };
    },
    existing,
  });
}
```

### 2.2 Unify `useViewLoader` methods — `src/hooks/useViewLoader.ts` — **HIGH**

Three nearly identical `loadAndBuild*View` methods (~80 lines each).

**Fix:** Extract generic `loadAndBuild(view: ViewRef, buildFn)`:

```ts
const loadAndBuild = useCallback(
  async (
    view: ViewRef,
    builder: (
      existing: ViewDoc | null,
    ) => Promise<{ doc: ViewDoc; changed: boolean }>,
  ) => {
    // shared: increment version, isStale guard, load existing,
    // build, save if changed, handle NeedsIndexRebuildError
  },
  [setError, startIndexRebuild],
);

const loadAndBuildFolderView = useCallback(
  (dir: string) =>
    loadAndBuild({ kind: "folder", dir }, (existing) =>
      buildFolderViewDoc(dir, { recursive: true, limit: 500 }, existing),
    ),
  [loadAndBuild],
);
```

### 2.3 Deduplicate `snapshotPersistedShape` — `src/components/canvas/CanvasPane.tsx` L89-L113, `src/components/canvas/hooks/useCanvasHistory.ts` L24-L48 — **MEDIUM**

Same JSON.stringify snapshot logic duplicated across two files.

**Fix:** Extract to `src/components/canvas/utils.ts`:

```ts
export function snapshotPersistedShape(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): string {
  // ...
}
```

### 2.4 Deduplicate change detection in view builders — `src/lib/views/builders/folderView.ts` L172-L177 (same in search + tag) — **MEDIUM**

Three copies of `JSON.stringify(sanitizeNodes(prev)) !== JSON.stringify(sanitizeNodes(next))`.

**Fix:** Extract to `src/lib/views/utils.ts`:

```ts
export function hasViewDocChanged(
  prevDoc: ViewDoc | null,
  nextNodes: CanvasNode[],
  nextEdges: CanvasEdge[],
): boolean {
  // ...
}
```

---

## Phase 3 — Prop Drilling & State Architecture (1–2 days)

### 3.1 Replace massive prop drilling with contexts — `src/App.tsx`, `src/components/app/AppShell.tsx` — **HIGH**

Currently `App → AppShell → Sidebar/MainContent` drills 40+ props. `AppShellProps` alone is 60 lines.

**Fix:** Create 4 lean contexts:

| Context           | Data                                                                          | Consumed by                           |
| ----------------- | ----------------------------------------------------------------------------- | ------------------------------------- |
| `VaultContext`    | vaultPath, schemaVersion, recentVaults, isIndexing, open/close/create actions | Sidebar, WelcomeScreen, MainContent   |
| `FileTreeContext` | rootEntries, childrenByDir, expandedDirs, summaries, tree actions             | FileTreePane, SidebarContent          |
| `ViewContext`     | activeViewDoc, activeViewPath, loading message, loaders, setActiveViewDoc     | MainContent, MainToolbar, FolderShelf |
| `UIContext`       | sidebarCollapsed, paletteOpen, aiSidebar state, search state                  | Sidebar, AppShell chrome              |

Implementation:

```ts
// src/contexts/VaultContext.tsx
const VaultContext = createContext<VaultContextValue>(null!);

export function VaultProvider({ children }: { children: ReactNode }) {
  const bootstrap = useAppBootstrap();
  return (
    <VaultContext.Provider value={bootstrap}>{children}</VaultContext.Provider>
  );
}

export function useVault() {
  return useContext(VaultContext);
}
```

### 3.2 Split `useAppBootstrap` — `src/hooks/useAppBootstrap.ts` — **HIGH**

20+ `useState` calls in one hook.

**Fix:** Split into:

- `useAppInfo()` → `info` state + error
- `useVaultLifecycle()` → vaultPath, open/close/create
- `useFileTreeState()` → rootEntries, childrenByDir, expandedDirs, summaries
- `useTagsState()` → tags, tagsError, refreshTags, startIndexRebuild

### 3.3 Remove unsafe `setCanvasCommandTyped` adapter — `src/components/app/AppShell.tsx` L154-L159 — **HIGH**

**Fix:** Type `setCanvasCommand` correctly throughout the dependency chain. After Phase 1.1, `useFileTree` deps should accept `setCanvasCommand: (cmd: CanvasExternalCommand | null) => void`.

---

## Phase 4 — Performance Improvements (1 day)

### 4.1 Replace JSON.stringify change detection — view builders + CanvasPane — **MEDIUM**

`JSON.stringify` on arrays of 500 nodes is O(n) with high constant factor.

**Fix:** Use structural hash comparison or incremental dirty tracking. Minimal approach: compute hashes once per sanitize call and compare.

### 4.2 Memoize node lookup in `CanvasPane` — `src/components/canvas/CanvasPane.tsx` L351-L365 — **MEDIUM**

`noteEditActions.openEditor` uses `nodes.find(...)` per call.

**Fix:**

```ts
const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
```

### 4.3 `findDropPosition` scans all nodes — `src/components/canvas/CanvasPane.tsx` L219-L232 — **MEDIUM**

**Fix:** Maintain `maxRightEdge` in a memo derived from nodes.

### 4.4 `canvasLayout.ts` brute-force width scan — `src/lib/canvasLayout.ts` L131-L171 — **MEDIUM**

**Fix:** Cap `(maxWidth - minWidth)` to ~30 iterations. Add early-stop when score hasn't improved for 5 consecutive widths.

### 4.5 `settings.ts` redundant `ensureLoaded()` — `src/lib/settings.ts` L5-L7 — **LOW**

**Fix:** Memoize: `const initPromise = store.init();`

### 4.6 Use Pointer Events for resize — `src/hooks/useAISidebar.ts` L61-L116 — **MEDIUM**

Window mouse listeners can leak on unmount mid-resize.

**Fix:** Use `setPointerCapture` on the resizer element, listen on `pointermove`/`pointerup` on the element itself. Clean cleanup guaranteed.

---

## Phase 5 — Pattern & Architecture Improvements (1 day)

### 5.1 Centralize Tauri event listening — across 5+ files — **HIGH**

Create `src/lib/tauriEvents.ts`:

```ts
type TauriEventMap = {
  "menu:open_vault": void;
  "menu:create_vault": void;
  "menu:close_vault": void;
  "ai:chunk": { job_id: string; delta: string };
  "ai:done": { job_id: string; cancelled: boolean };
  "ai:error": { job_id: string; message: string };
  "settings:navigate": { tab: SettingsTab };
  "notes:external_changed": { rel_path: string };
};

export function useTauriEvent<K extends keyof TauriEventMap>(
  event: K,
  handler: (payload: TauriEventMap[K]) => void,
): void {
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    void (async () => {
      const u = await listen(event, (e) => handler(e.payload));
      if (cancelled) {
        u();
        return;
      }
      unlisten = u;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [event, handler]);
}
```

### 5.2 Centralize error handling — across all hooks — **MEDIUM**

Create `src/lib/errorUtils.ts`:

```ts
export function extractErrorMessage(e: unknown): string {
  if (e instanceof TauriInvokeError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
```

Replace 15+ instances of `e instanceof Error ? e.message : String(e)`.

### 5.3 Add className utility — across all components — **LOW**

Create `src/utils/cn.ts`:

```ts
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
```

Replace string concatenation in `SettingsApp.tsx` L129, `AppShell.tsx` L294-L297, `SidebarContent.tsx` L121-L122, etc.

### 5.4 Fix `useCommandShortcuts` firing in inputs — `src/hooks/useCommandShortcuts.ts` L21 — **MEDIUM**

**Fix:** Add early return:

```ts
const t = e.target;
if (
  t instanceof HTMLElement &&
  (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
)
  return;
```

### 5.5 Replace `querySelector` for search focus — `src/components/app/AppShell.tsx` L237-L241 — **MEDIUM**

**Fix:** Pass a ref to `SearchPane` or expose `focusSearch()` via a callback ref.

### 5.6 Add runtime validation for `ViewDoc` parsing — `src/lib/views/persistence.ts` L6-L17 — **HIGH**

`JSON.parse(raw) as ViewDoc` is unsafe. The existing checks are minimal.

**Fix:** Add a proper `isViewDoc()` type guard checking all required fields:

```ts
function isViewDoc(x: unknown): x is ViewDoc {
  if (!x || typeof x !== "object") return false;
  const d = x as Record<string, unknown>;
  return (
    d.schema_version === 1 &&
    typeof d.view_id === "string" &&
    (d.kind === "global" ||
      d.kind === "folder" ||
      d.kind === "tag" ||
      d.kind === "search") &&
    typeof d.selector === "string" &&
    typeof d.title === "string" &&
    typeof d.options === "object" &&
    Array.isArray(d.nodes) &&
    Array.isArray(d.edges)
  );
}
```

### 5.7 Normalize `\r\n` in `notePreview.ts` — `src/lib/notePreview.ts` L16-L18 — **LOW**

**Fix:** `text = text.replace(/\r\n/g, "\n")` at the top of `parseNotePreview`.

### 5.8 Guard `settings.ts` theme validation — `src/lib/settings.ts` L35 — **LOW**

Validate the stored value is actually a valid `ThemeMode` before accepting it.

### 5.9 Safe root element in `main.tsx` — `src/main.tsx` L21 — **MEDIUM**

**Fix:** Null check instead of `as HTMLElement`:

```ts
const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");
ReactDOM.createRoot(rootEl).render(...);
```

### 5.10 Clear `useFileTree` ref caches on vault change — `src/hooks/useFileTree.ts` L65-L67 — **MEDIUM**

`loadedDirsRef`, `loadRequestVersionRef`, `dirSummariesInFlightRef` persist across vault switches.

**Fix:** Add `useEffect(() => { clear all refs }, [vaultPath])`.

### 5.11 Cap `useFolderShelf` cache growth — `src/hooks/useFolderShelf.ts` L22-L25 — **LOW**

**Fix:** Limit to last 30 entries or clear on vault change.

### 5.12 Guard `getRandomVariation` div-by-zero — `src/components/canvas/utils.ts` L18-L20 — **LOW**

**Fix:** `if (range <= 0) return min;`

### 5.13 Accessibility for `CommandPalette` — `src/components/app/CommandPalette.tsx` L63-L132 — **MEDIUM**

**Fix:** Add `role="dialog"`, `aria-modal="true"`, `aria-label="Command palette"`. Set `tabIndex={-1}` on the container and auto-focus it.

### 5.14 `useAISidebar` resize leak on mid-resize unmount — `src/hooks/useAISidebar.ts` L101-L114 — **HIGH**

If component unmounts while dragging, `mousemove`/`mouseup` remain on window.

**Fix:** Store handler refs and clean up in an effect cleanup, or switch to pointer capture.

---

## Phase 6 — Testing & Validation (½ day)

### 6.1 Existing test coverage

| File                           | Test exists?                             | Notes             |
| ------------------------------ | ---------------------------------------- | ----------------- |
| `src/hooks/fileTreeHelpers.ts` | Yes: `src/hooks/fileTreeHelpers.test.ts` | Maintain          |
| `src/utils/filePreview.ts`     | Yes: `src/utils/filePreview.test.ts`     | Maintain          |
| All other files                | No tests                                 | Add incrementally |

### 6.2 Recommended test additions (priority order)

1. `notePreview.ts` — pure functions, easy to test frontmatter parsing edge cases
2. `views/utils.ts` — `viewId`, `sha256Hex`, `viewDocPath`
3. `canvasLayout.ts` — `snapToGrid`, `estimateNodeSize`, `computeGridPositions`
4. `diff.ts` — `unifiedDiff` with edge cases
5. `tauri.ts` — `errorMessage` function
6. `shortcuts.ts` — `isShortcutMatch`, `formatShortcut`

---

## Implementation Priority Summary

| Phase                 | Effort | Impact      | Files touched |
| --------------------- | ------ | ----------- | ------------- |
| **0: Bug fixes**      | < 1h   | Critical    | 6 files       |
| **1: Type safety**    | 1-3h   | Critical    | 12 files      |
| **2: De-duplication** | 1-2d   | High        | 6 files       |
| **3: Prop drilling**  | 1-2d   | High        | 10+ files     |
| **4: Performance**    | 1d     | Medium      | 8 files       |
| **5: Patterns**       | 1d     | Medium-High | 15 files      |
| **6: Testing**        | ½d     | Medium      | New files     |

Phases 0 and 1 give the highest ROI and should be done first. Phase 2 and 3 can be tackled in parallel by different branches since they affect different file sets.

---

## Cross-cutting: Audit Automation Checklist

Use these commands to find remaining instances after each phase:

```bash
# Find all unsafe casts
rg -n "as unknown as|as any|as Record<string, unknown>|@ts-ignore" src/

# Find all async listener setups (check for cancelled guards)
rg -n "listen\(" src/

# Find all JSON.stringify used for change detection
rg -n "JSON\.stringify\(" src/

# Find all inline error extraction (should use centralized util)
rg -n "instanceof Error \? .\.message : String" src/

# Find all className string concatenation (should use cn())
rg -n "className=\{.*\?" src/ --glob "*.tsx"
```
