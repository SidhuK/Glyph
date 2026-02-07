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
