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

### Phase 2 Implementation Steps

- [x] **Step 2.0** — Pre-work: extract `hasViewDocChanged()` into `src/lib/views/builders/common.ts`
- [x] **Step 2.1** — Create `src/lib/views/builders/buildListViewDoc.ts` with `BuildListViewDocParams` type and `buildListViewDoc()` pipeline
- [x] **Step 2.2** — Rewrite `folderView.ts` as thin wrapper calling `buildListViewDoc()`
- [x] **Step 2.3** — Rewrite `searchView.ts` as thin wrapper calling `buildListViewDoc()`
- [x] **Step 2.4** — Rewrite `tagView.ts` as thin wrapper calling `buildListViewDoc()`
- [x] **Step 2.5** — Update `src/lib/views/index.ts` exports (add `buildListViewDoc`, keep existing builder exports)
- [x] **Step 2.6** — De-duplicate `useViewLoader.ts`: extract internal `loadAndBuildView()` helper, rewrite three loaders as thin wrappers (also fix `setActiveViewDoc` → `setActiveViewDocAndRef` inconsistency)
- [x] **Step 2.7** — Deduplicate `snapshotPersistedShape` in `CanvasPane.tsx` + `useCanvasHistory.ts` → extract to `src/components/canvas/utils.ts`
- [x] **Step 2.8** — Run `pnpm build`, `pnpm check`, and `cargo check` to verify all changes compile

---

### 2.0 Pre-work: extract `hasViewDocChanged` — **MEDIUM**

All three builders duplicate the exact same change detection:

```ts
const changed =
  !prev ||
  JSON.stringify(sanitizeNodes(prevNodes)) !==
    JSON.stringify(sanitizeNodes(nextNodes)) ||
  JSON.stringify(sanitizeEdges(prevEdges)) !==
    JSON.stringify(sanitizeEdges(nextEdges));
```

**Fix:** Add to `src/lib/views/builders/common.ts`:

```ts
export function hasViewDocChanged(
  prev: ViewDoc | null,
  prevNodes: CanvasNode[],
  prevEdges: CanvasEdge[],
  nextNodes: CanvasNode[],
  nextEdges: CanvasEdge[],
): boolean {
  return (
    !prev ||
    JSON.stringify(sanitizeNodes(prevNodes)) !==
      JSON.stringify(sanitizeNodes(nextNodes)) ||
    JSON.stringify(sanitizeEdges(prevEdges)) !==
      JSON.stringify(sanitizeEdges(nextEdges))
  );
}
```

This lets `buildListViewDoc` call it once rather than duplicating the pattern.

---

### 2.1 Create `buildListViewDoc.ts` — `src/lib/views/builders/buildListViewDoc.ts` — **HIGH**

Create the shared pipeline. Strategy callbacks push all view-specific behavior into the callers.

**Type definition (params):**

```ts
import type { CanvasNode, CanvasEdge } from "../../tauri";
import type { ViewDoc, ViewKind, ViewOptions } from "../types";

export interface BuildPrimaryResult {
  node: CanvasNode;
  isNew: boolean;
}

export interface BuildListViewDocParams {
  kind: ViewKind;
  viewId: string;
  selector: string;
  title: string;
  options: ViewOptions;
  existing: ViewDoc | null;

  /** Ordered list of primary node IDs (note rel_paths, file rel_paths, etc.) */
  primaryIds: string[];

  /** Optional prev-node normalization (e.g., legacy frame child migration). */
  normalizePrevNodes?: (nodes: CanvasNode[]) => CanvasNode[];

  /** Build or merge a single primary node. Called once per primaryId. */
  buildPrimaryNode: (args: {
    id: string;
    prevNode: CanvasNode | undefined;
  }) => BuildPrimaryResult;

  /** Should a non-primary prev node be preserved in the output? */
  shouldPreservePrevNode: (node: CanvasNode) => boolean;
}
```

**Pipeline (8 stages):**

1. Extract `prevNodes` / `prevEdges` from `existing`
2. Normalize prev nodes (if `normalizePrevNodes` provided)
3. Build `prevById` map, iterate `primaryIds` → call `buildPrimaryNode()` → collect `nextNodes` + `newNodes`
4. Preserve non-primary prev nodes via `shouldPreservePrevNode()`
5. Layout new nodes (`computeGridPositions`) — identical logic across all three builders
6. Filter edges to only those connecting nodes in `nextNodes`
7. Construct `ViewDoc`
8. Detect changes via `hasViewDocChanged()`

Target: **< 100 lines** for the function body.

---

### 2.2 Rewrite `folderView.ts` as thin wrapper — **HIGH**

Keep folder-specific logic:

- `vault_list_dir` + `vault_dir_recent_entries` IPC calls
- `recentIds` inclusion logic
- Markdown vs non-markdown node type decision
- `normalizeLegacyFrameChildren` passed as `normalizePrevNodes`
- Folder-specific `shouldPreservePrevNode`: exclude `note`, `file`, `folder`, `folderPreview`, and legacy `frame` nodes with `folder:` prefix

The wrapper calls `buildListViewDoc()` with these strategy callbacks. Target: **~80 lines** (down from 182).

---

### 2.3 Rewrite `searchView.ts` as thin wrapper — **HIGH**

Keep search-specific logic:

- `search` IPC call
- `titleById` map from search results
- All nodes are `type: "note"` (no file nodes)
- `shouldPreservePrevNode`: preserve everything except `note` type

Target: **~50 lines** (down from 131).

---

### 2.4 Rewrite `tagView.ts` as thin wrapper — **HIGH**

Keep tag-specific logic:

- `#` prefix normalization
- `tag_notes` IPC call
- `titleById` map from results
- Identical strategies to search

Target: **~55 lines** (down from 132).

---

### 2.5 Update `src/lib/views/index.ts` exports — **LOW**

Add export for `buildListViewDoc` and `BuildListViewDocParams` type. Keep all existing builder exports unchanged for backwards compatibility.

---

### 2.6 De-duplicate `useViewLoader.ts` — **HIGH**

The three `loadAndBuild*View` methods are ~80 lines each and ~95% identical. The only differences are:

1. `ViewRef` construction (`{kind:"folder",dir}` vs `{kind:"search",query:q}` vs `{kind:"tag",tag:t}`)
2. Input validation (search/tag trim + empty guard)
3. Builder function call (`buildFolderViewDoc(dir, opts, existing)` etc.)

**Fix:** Extract internal `loadAndBuildView` helper:

```ts
type ViewBuildResult = { doc: ViewDoc; changed: boolean };

const loadAndBuildView = useCallback(
  async (
    view: ViewRef,
    buildFn: (existing: ViewDoc | null) => Promise<ViewBuildResult>,
  ) => {
    // shared: version tracking, isStale guard, loadViewDoc,
    // buildAndSet with save-if-changed, NeedsIndexRebuildError retry,
    // error handling
    // Uses setActiveViewDocAndRef everywhere (fixing the inconsistency
    // where raw setActiveViewDoc was used without syncing the ref)
  },
  [setError, startIndexRebuild, setActiveViewDocAndRef],
);
```

Then each public method becomes a thin wrapper:

```ts
const loadAndBuildFolderView = useCallback(
  (dir: string) =>
    loadAndBuildView({ kind: "folder", dir }, (existing) =>
      buildFolderViewDoc(dir, { recursive: true, limit: 500 }, existing),
    ),
  [loadAndBuildView],
);

const loadAndBuildSearchView = useCallback(
  (query: string) => {
    const q = query.trim();
    if (!q) return;
    return loadAndBuildView({ kind: "search", query: q }, (existing) =>
      buildSearchViewDoc(q, { limit: 200 }, existing),
    );
  },
  [loadAndBuildView],
);

const loadAndBuildTagView = useCallback(
  (tag: string) => {
    const t = tag.trim();
    if (!t) return;
    return loadAndBuildView({ kind: "tag", tag: t }, (existing) =>
      buildTagViewDoc(t, { limit: 500 }, existing),
    );
  },
  [loadAndBuildView],
);
```

**Bonus fix:** Replace all internal `setActiveViewDoc(x); activeViewDocRef.current = x;` pairs with the unified `setActiveViewDocAndRef(x)` from Phase 0.1.

Target: **~100 lines** (down from 273).

---

### 2.7 Deduplicate `snapshotPersistedShape` — **MEDIUM**

`src/components/canvas/CanvasPane.tsx` and `src/components/canvas/hooks/useCanvasHistory.ts` both contain near-identical snapshot serialization logic.

**Fix:** Extract to `src/components/canvas/utils.ts`:

```ts
export function snapshotPersistedShape(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): string {
  const sanitizedNodes = nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data ?? {},
    ...(n.parentNode ? { parentNode: n.parentNode } : {}),
    ...(n.style ? { style: n.style } : {}),
  }));
  const sanitizedEdges = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.type,
    data: e.data ?? {},
    ...(e.label ? { label: e.label } : {}),
    ...(e.style ? { style: e.style } : {}),
  }));
  return JSON.stringify({ nodes: sanitizedNodes, edges: sanitizedEdges });
}
```

Update both `CanvasPane.tsx` and `useCanvasHistory.ts` to import and use it.

---

### 2.8 Verification — **REQUIRED**

Run:

```bash
pnpm build        # TypeScript check + Vite build
pnpm check        # Biome lint + format
cargo check       # Rust backend (should be unaffected, but verify)
```

All must pass before Phase 2 is considered complete.

Phase 2 is complete. Here's a summary:

Files created (2):

buildListViewDoc.ts — Generic pipeline with strategy callbacks (BuildListViewDocParams + buildListViewDoc())
Files rewritten (4):

folderView.ts — 120 lines (down from 182), thin wrapper with folder-specific fetch + strategies
searchView.ts — 79 lines (down from 131)
tagView.ts — 81 lines (down from 132)
useViewLoader.ts — 144 lines (down from 273), single loadAndBuildView helper + fixed setActiveViewDocAndRef inconsistency
Files modified (4):

common.ts — Added hasViewDocChanged()
utils.ts — Added snapshotPersistedShape()
CanvasPane.tsx — Removed inline snapshot, imports from utils
useCanvasHistory.ts — Removed inline snapshotString, imports from utils
index.ts — Added new exports
All checks pass: pnpm build, pnpm check, cargo check.

---

## Phase 3 — Prop Drilling & State Architecture (1–2 days)

### Phase 3 Implementation Steps

- [x] **Step 3.0** — Pre-work: Analyze component tree to confirm context boundaries (App→AppShell→Sidebar/MainContent) and identify all prop consumers
- [x] **Step 3.1a** — Create `src/contexts/VaultContext.tsx` with `VaultContextValue` type and `VaultProvider` + `useVault()` hook
- [x] **Step 3.1b** — Create `src/contexts/FileTreeContext.tsx` with `FileTreeContextValue` type and `FileTreeProvider` + `useFileTreeContext()` hook
- [x] **Step 3.1c** — Create `src/contexts/ViewContext.tsx` with `ViewContextValue` type and `ViewProvider` + `useViewContext()` hook
- [x] **Step 3.1d** — Create `src/contexts/UIContext.tsx` with `UIContextValue` type and `UIProvider` + `useUIContext()` hook
- [x] **Step 3.1e** — Create `src/contexts/index.ts` barrel export and combined `AppProviders` wrapper component
- [x] **Step 3.2a** — Split `useAppBootstrap` into `useAppInfo()` (info state + error) — *integrated into VaultContext*
- [x] **Step 3.2b** — Split `useAppBootstrap` into `useVaultLifecycle()` (vaultPath, schema, recent, open/close/create actions) — *integrated into VaultContext*
- [x] **Step 3.2c** — Split `useAppBootstrap` into `useFileTreeState()` (rootEntries, childrenByDir, expandedDirs, summaries) — *integrated into FileTreeContext*
- [x] **Step 3.2d** — Split `useAppBootstrap` into `useTagsState()` (tags, tagsError, refreshTags, startIndexRebuild) — *integrated into FileTreeContext*
- [x] **Step 3.2e** — Update `useAppBootstrap` to compose the split hooks and maintain backward compatibility — *replaced by contexts*
- [x] **Step 3.3** — Refactor `App.tsx` to use `AppProviders` wrapper instead of prop drilling
- [x] **Step 3.4** — Refactor `AppShell.tsx` to consume contexts instead of receiving props (reduce from 60-line props to near-zero)
- [x] **Step 3.5** — Refactor `Sidebar.tsx` to consume contexts (VaultContext, FileTreeContext, UIContext)
- [x] **Step 3.6** — Refactor `MainContent.tsx` to consume contexts (VaultContext, ViewContext, UIContext)
- [x] **Step 3.7** — Remove `setCanvasCommandTyped` adapter in AppShell by properly typing `setCanvasCommand` throughout — *kept minimal adapter for type safety*
- [x] **Step 3.8** — Run `pnpm build`, `pnpm check`, and `cargo check` to verify all changes compile

**Phase 3 is complete.** Summary of changes:

**Files created (5):**
- `src/contexts/VaultContext.tsx` — Vault state, lifecycle actions, indexing
- `src/contexts/FileTreeContext.tsx` — File tree state, tags, active file
- `src/contexts/ViewContext.tsx` — View doc state, loaders
- `src/contexts/UIContext.tsx` — Sidebar, AI sidebar, search, preview state
- `src/contexts/index.tsx` — Barrel exports + `AppProviders` wrapper

**Files refactored (5):**
- `src/App.tsx` — Reduced from 43 lines to 13 lines (no prop drilling)
- `src/components/app/AppShell.tsx` — Props reduced from 40+ to 0 (uses contexts)
- `src/components/app/Sidebar.tsx` — Props reduced from 35 to 11 action callbacks
- `src/components/app/SidebarContent.tsx` — Props reduced from 30 to 10 action callbacks
- `src/components/app/MainContent.tsx` — Props reduced from 27 to 6 (only canvas-specific)

**Legacy file (can be deleted):**
- `src/hooks/useAppBootstrap.ts` — No longer imported, replaced by contexts

**Results:** `pnpm build`, `pnpm check`, and `cargo check` all pass.

---

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

### Phase 4 Implementation Steps

- [x] **Step 4.0 — Baseline + guardrails (before edits)**
  - Files: `src/lib/views/builders/common.ts`, `src/components/canvas/CanvasPane.tsx`, `src/lib/canvasLayout.ts`, `src/lib/settings.ts`, `src/hooks/useAISidebar.ts`
  - Capture current behavior and add quick manual perf checks (large folder/search/tag view load, canvas with many nodes, AI sidebar drag).
  - Keep scope to local refactors only (no API/IPC contract changes).

- [x] **Step 4.1 — Replace repeated `JSON.stringify` diffing in view change detection**
  - File: `src/lib/views/builders/common.ts`
  - Replace `hasViewDocChanged()` internals with one-pass structural signatures (or cached hash keys) so sanitize+serialize work is done once per side, not repeatedly.
  - Pattern target: typed helper functions with deterministic signatures, no `any`, no behavior change.
  - Acceptance: identical changed/unchanged outcomes for existing view builders.

- [x] **Step 4.2 — Memoize canvas node lookup map**
  - File: `src/components/canvas/CanvasPane.tsx`
  - Add `nodeById` memo (`Map<string, CanvasNode>`) and replace hot-path `nodes.find(...)` in `noteEditActions.openEditor`.
  - Pattern target: `useMemo` + O(1) lookups, keep current `isNoteNode` narrowing and tab behavior unchanged.
  - Acceptance: open-editor behavior unchanged, fewer linear scans per action.

- [x] **Step 4.3 — Stop rescanning all nodes inside `findDropPosition`**
  - File: `src/components/canvas/CanvasPane.tsx`
  - Add memoized `maxRightEdge` derived from `nodes` and use it in `findDropPosition`.
  - Pattern target: derive once, consume many; keep grid snapping behavior identical.
  - Acceptance: newly added nodes still appear at the expected right-side insertion point.

- [x] **Step 4.4 — Bound `computeGridPositions` width search**
  - File: `src/lib/canvasLayout.ts`
  - Cap width search window to ~30 attempts and add early-stop after N non-improving widths (e.g., 5).
  - Pattern target: named constants + deterministic loop exit conditions.
  - Acceptance: layout remains stable/usable while reducing worst-case brute-force iterations.

- [x] **Step 4.5 — Remove redundant store init calls**
  - File: `src/lib/settings.ts`
  - Replace `ensureLoaded()` repeated `store.init()` calls with memoized init promise (`const initPromise = store.init()`).
  - Pattern target: idempotent async initialization; retain existing read/write semantics.
  - Acceptance: settings read/write behavior unchanged.

- [x] **Step 4.6 — Migrate AI sidebar resizing to Pointer Events**
  - File: `src/hooks/useAISidebar.ts`
  - Replace window `mousemove`/`mouseup` listeners with pointer capture flow on the resizer (`pointerdown`/`pointermove`/`pointerup` + release capture).
  - Pattern target: leak-safe cleanup, unmount-safe, strict typed event handlers.
  - Acceptance: resize UX remains smooth; no dangling global listeners on interrupted drag/unmount.

- [x] **Step 4.7 — Verify + document**
  - Run: `pnpm check`, `pnpm build`, `cd src-tauri && cargo check`
  - Add a short “Phase 4 complete” summary (files touched + measurable wins + any tradeoffs).

### Phase 4 completion summary

- Files touched: `src/lib/views/builders/common.ts`, `src/components/canvas/CanvasPane.tsx`, `src/lib/canvasLayout.ts`, `src/lib/settings.ts`, `src/hooks/useAISidebar.ts`, `src/contexts/UIContext.tsx`, `src/components/app/AppShell.tsx`
- Performance-focused changes shipped:
  - `hasViewDocChanged()` now computes sanitized signatures once per side before compare.
  - Canvas note editor uses memoized `nodeById` map instead of per-action `nodes.find(...)`.
  - `findDropPosition()` now uses memoized `maxRightEdge` instead of rescanning nodes.
  - `computeGridPositions()` now uses bounded width search + early-stop on non-improving widths.
  - Settings store init is memoized with a shared init promise.
  - AI sidebar resize flow now uses pointer capture (`onPointer*`) and removes global window mouse listeners.
- Verification:
  - `pnpm check` ✅
  - `pnpm build` ✅
  - `cd src-tauri && cargo check` ✅ (existing warning in `src-tauri/src/lattice_paths.rs` for unused function `lattice_assets_dir`)

---

## Phase 5 — Pattern & Architecture Improvements (1 day)

### Phase 5 Implementation Steps

- [x] **Step 5.0 — Discovery + sequencing**
  - Confirm current hotspots and prioritize by risk: `tauri` events, error handling, runtime parsing safety, keyboard UX, accessibility.
  - Sequence for minimal regressions: foundation utilities first, then consumers.

- [x] **Step 5.1 — Add typed Tauri event utility (`src/lib/tauriEvents.ts`)**
  - Introduce `TauriEventMap` + `useTauriEvent<K extends keyof TauriEventMap>()`.
  - Use strict payload typing with generics; no `any`.
  - Include cancellation-safe async listener pattern.

- [x] **Step 5.2 — Migrate event consumers to `useTauriEvent`**
  - Target files: `src/hooks/useMenuListeners.ts`, `src/SettingsApp.tsx`, `src/components/ai/hooks/useAIChat.ts`, and any remaining `listen(...)` call sites.
  - Keep behavior identical while removing duplicated setup/cleanup boilerplate.

- [x] **Step 5.3 — Add shared error extraction utility (`src/lib/errorUtils.ts`)**
  - Implement `extractErrorMessage(e: unknown): string`.
  - Keep output stable for UX text while reducing repeated inline error logic.

- [x] **Step 5.4 — Replace inline error extraction at call sites**
  - Replace `e instanceof Error ? e.message : String(e)` in hooks/components.
  - Keep the change mechanical and focused (no behavior changes beyond consistency).

- [x] **Step 5.5 — Add `cn` utility (`src/utils/cn.ts`)**
  - Add `cn(...parts)` helper for class string composition.
  - Keep utility tiny and framework-agnostic.

- [x] **Step 5.6 — Normalize className composition in high-churn UI files**
  - Start with: `src/components/app/AppShell.tsx`, `src/SettingsApp.tsx`, `src/components/app/SidebarContent.tsx`, `src/components/ui/MotionButton.tsx`, `src/components/ai/AISidebar.tsx`.
  - Replace fragile template concatenation where it improves readability/maintainability.

- [x] **Step 5.7 — Guard command shortcuts inside editable elements**
  - File: `src/hooks/useCommandShortcuts.ts`.
  - Add early-return when event target is input/textarea/contentEditable.

- [x] **Step 5.8 — Replace search focus `querySelector` with explicit ref channel**
  - Files: `src/components/app/AppShell.tsx`, `src/components/SearchPane.tsx` (or forwarding wrapper path in use).
  - Introduce typed focus API via ref or callback ref; remove DOM query by selector.

- [x] **Step 5.9 — Add runtime `ViewDoc` validation before use**
  - File: `src/lib/views/persistence.ts`.
  - Add robust `isViewDoc()` type guard and parse flow for `unknown`.
  - Reject malformed payloads safely with clear error handling path.

- [x] **Step 5.10 — Normalize line endings in note preview parsing**
  - File: `src/lib/notePreview.ts`.
  - Normalize `\r\n` to `\n` before parsing to keep behavior cross-platform stable.

- [x] **Step 5.11 — Harden theme value parsing in settings**
  - File: `src/lib/settings.ts`.
  - Validate stored theme against `ThemeMode` union before accepting persisted value.

- [x] **Step 5.12 — Safe root element bootstrap**
  - File: `src/main.tsx`.
  - Replace `as HTMLElement` cast with explicit null guard and clear error.

- [x] **Step 5.13 — Reset file tree caches on vault switch**
  - File: `src/hooks/useFileTree.ts`.
  - Clear `loadedDirsRef`, request version refs, and in-flight summary refs when `vaultPath` changes.

- [x] **Step 5.14 — Cap folder shelf cache growth**
  - File: `src/hooks/useFolderShelf.ts`.
  - Limit cache size and/or clear on vault switch to avoid unbounded growth.

- [x] **Step 5.15 — Guard `getRandomVariation` edge case**
  - File: `src/components/canvas/utils.ts`.
  - Return `min` when `range <= 0` to avoid divide-by-zero/invalid random span.

- [x] **Step 5.16 — Improve Command Palette accessibility**
  - File: `src/components/app/CommandPalette.tsx`.
  - Add dialog semantics (`role`, `aria-modal`, label), focus target, and initial focus behavior.

- [x] **Step 5.17 — Verify + document**
  - Run: `pnpm check`, `pnpm build`, `cd src-tauri && cargo check`.
  - Update this plan section with a concise completion summary + touched files.

### Phase 5 completion summary

- Files added:
  - `src/lib/tauriEvents.ts`
  - `src/lib/errorUtils.ts`
  - `src/utils/cn.ts`
- Files updated:
  - `src/hooks/useMenuListeners.ts`
  - `src/SettingsApp.tsx`
  - `src/components/ai/hooks/useAIChat.ts`
  - `src/lib/ai/tauriChatTransport.ts`
  - `src/hooks/useSearch.ts`
  - `src/hooks/useViewLoader.ts`
  - `src/hooks/useFileTree.ts`
  - `src/contexts/FileTreeContext.tsx`
  - `src/components/preview/FilePreviewPane.tsx`
  - `src/components/canvas/hooks/useNoteEditSession.ts`
  - `src/components/settings/VaultSettingsPane.tsx`
  - `src/components/settings/GeneralSettingsPane.tsx`
  - `src/components/app/AppShell.tsx`
  - `src/components/app/SidebarContent.tsx`
  - `src/components/ui/MotionButton.tsx`
  - `src/components/ai/AISidebar.tsx`
  - `src/hooks/useCommandShortcuts.ts`
  - `src/contexts/UIContext.tsx`
  - `src/components/SearchPane.tsx`
  - `src/lib/views/persistence.ts`
  - `src/lib/notePreview.ts`
  - `src/lib/settings.ts`
  - `src/main.tsx`
  - `src/hooks/useFolderShelf.ts`
  - `src/components/canvas/utils.ts`
  - `src/components/app/CommandPalette.tsx`
- Key outcomes:
  - Centralized typed Tauri event handling and removed direct listener duplication.
  - Centralized error-to-message extraction and removed inline `instanceof Error` fallbacks.
  - Introduced `cn()` and normalized class composition in the targeted high-churn UI files.
  - Replaced search input `querySelector` focus with typed ref channel through context.
  - Hardened runtime parsing for `ViewDoc`, theme value validation, and root bootstrap safety.
  - Added cache lifecycle guards for vault changes and bounded folder shelf cache growth.
  - Added command shortcut input guards and command palette accessibility semantics.
- Verification:
  - `pnpm check` ✅
  - `pnpm build` ✅
  - `cd src-tauri && cargo check` ✅ (existing warning: unused `lattice_assets_dir` in `src-tauri/src/lattice_paths.rs`)

---

## Phase 6 — Testing & Validation (½ day)

### Phase 6 Implementation Steps

- [x] **Step 6.0 — Discovery + baseline test map**
  - Current tests confirmed: `src/hooks/fileTreeHelpers.test.ts`, `src/utils/filePreview.test.ts`.
  - Remaining key modules still need direct unit coverage.

- [ ] **Step 6.1 — Add tests for note preview parsing**
  - Target: `src/lib/notePreview.ts` via `src/lib/notePreview.test.ts`.
  - Cover frontmatter parsing, CRLF normalization, title/content extraction fallbacks.

- [ ] **Step 6.2 — Add tests for view utility determinism**
  - Target: `src/lib/views/utils.ts` via `src/lib/views/utils.test.ts`.
  - Cover `viewId`, `sha256Hex`, `viewDocPath` stability and edge cases.

- [ ] **Step 6.3 — Add tests for layout helpers**
  - Target: `src/lib/canvasLayout.ts` via `src/lib/canvasLayout.test.ts`.
  - Cover `snapToGrid`, `estimateNodeSize`, and bounded `computeGridPositions` behavior.

- [ ] **Step 6.4 — Add tests for diff + shortcuts utilities**
  - Targets:
    - `src/lib/diff.ts` via `src/lib/diff.test.ts`
    - `src/lib/shortcuts.ts` via `src/lib/shortcuts.test.ts`
  - Cover edge cases and formatting/matching correctness.

- [ ] **Step 6.5 — Add tests for shared error extraction helper**
  - Target: `src/lib/errorUtils.ts` via `src/lib/errorUtils.test.ts`.
  - Cover `Error`, `unknown`, and custom invoke error shapes.

- [ ] **Step 6.6 — Run full validation and stabilize**
  - Run: `pnpm check`, `pnpm build`, and project test command(s) used in repo.
  - Ensure tests are deterministic and don’t rely on network/clock randomness.

- [ ] **Step 6.7 — Document final test coverage deltas**
  - Update this section with added test files and coverage rationale.

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
