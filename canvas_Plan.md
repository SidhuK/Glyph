# Canvas Folder-Tiles + Root Sticky Notes Redesign

## Outcome
- Folder canvases show:
  - Big **folder tiles** for immediate subfolders (name + counts + hover "recent files" list).
  - **Sticky notes / file cards only for files directly in the current folder** (no files from subfolders).
- Double-click folder tile navigates into that folder's canvas view.

---

## Product Spec (Decision Complete)

### Folder canvas population rules (per selected `dir`)
1. List immediate children of `dir`.
2. Render **one "folder tile" node per immediate subfolder**.
3. Render **one node per immediate file in `dir`**:
   - Markdown file (`*.md`) -> `note` sticky node (title + excerpt).
   - Non-markdown file -> `file` node (existing file card behavior).
4. Do **not** create nodes for files inside subfolders.

### Folder tile content
- Always visible:
  - Folder name
  - Counts (recursive within that folder):
    - `total_markdown` (markdown files)
    - `total_files` (all files)
- On hover:
  - Up to 5 most recently modified **markdown** files (recursive within that folder), displayed as clickable rows.
  - Clicking a row opens that file in the editor (same as opening a note/file node).

### Folder tile interactions
- Double-click tile: open that folder as the active folder canvas view.
- Single click: normal ReactFlow selection/drag behavior (no navigation).

### Single-folder vault entry convenience (to match your "single folder is fine" note)
- On vault open/create (and on app startup restore), if the vault root contains **exactly 1 folder and 0 files**, automatically open that folder's canvas view instead of the root canvas.

---

## Architecture / Data Flow Changes

### New canvas node type
- Add ReactFlow node type: `folder`
- Stable node id: `dir:${rel_path}` (prevents collision with file nodes which use `rel_path` as id)

**Folder node data shape (stored in `node.data`)**
```ts
{
  dir: string;              // folder rel path (e.g. "Projects")
  name: string;             // display name
  total_files: number;      // recursive
  total_markdown: number;   // recursive
  recent_markdown: Array<{  // length <= 5, sorted desc by mtime
    rel_path: string;
    name: string;
    mtime_ms: number;
  }>;
  truncated?: boolean;      // if backend had to cap scan (see below)
}
```

### Backend: new Tauri command (for counts + recency)
Add a new command to avoid needing `mtime` in `FsEntry` and avoid huge payloads:

- **Command**: `vault_dir_children_summary`
- **Args**:
  - `dir?: string | null` (same convention as existing vault fs commands)
  - `preview_limit?: number | null` (default 5, max 20)
- **Returns**: `DirChildSummary[]` where each entry corresponds to an immediate child folder of `dir`:
  - `dir_rel_path`, `name`
  - `total_files_recursive`, `total_markdown_recursive`
  - `recent_markdown` (top N by mtime)
  - `truncated` (true if scan hit a safety cap)

**Rust implementation notes (in `src-tauri/src/vault_fs.rs`)**
- Use `deny_hidden_rel_path()` and `paths::join_under()` like existing commands.
- Enumerate immediate child directories via `read_dir(start_abs)`.
- For each child dir, DFS its subtree:
  - Increment totals for each file.
  - For markdown files, maintain a per-folder min-heap of size `preview_limit` keyed by `mtime_ms`.
- Add a global `MAX_SCAN_FILES` safety cap per folder (e.g. 200_000); set `truncated=true` if hit.

Register in:
- `src-tauri/src/lib.rs` `invoke_handler(...)`

Add TS typing + IPC mapping in:
- `src/lib/tauri.ts`

---

## Frontend Implementation Plan (Files + Exact Responsibilities)

### 1) Update folder view generation
File: `src/lib/views.ts`

Replace current folder-view layout logic (frames grouping everything) with "folder tiles + root-only nodes":

- Fetch immediate entries:
  - `invoke("vault_list_dir", { dir: v.selector || null })`
- Split:
  - `childDirs` = `kind === "dir"`
  - `rootFiles` = `kind === "file"`
- Fetch folder summaries:
  - `invoke("vault_dir_children_summary", { dir: v.selector || null, preview_limit: 5 })`
  - Map by `dir_rel_path`
- Fetch markdown contents only for `rootFiles.filter(f => f.is_markdown)` using existing `fetchNoteContents()`.
- Build nodes:
  - Folder tiles: `type: "folder"`, id `dir:${child.rel_path}`, data from summary map.
  - Root markdown: `type: "note"`, id `rel_path`, data `{ noteId, title, content }`
  - Root non-markdown: `type: "file"`, id `rel_path`, data `{ path, title }`

**Existing view doc preservation + migration**
When `existing` is present:
- Preserve positions for nodes that still exist by id.
- Keep user-created nodes (`text`, `link`, user `frame`) exactly as today.
- Remove legacy auto-generated frames: `type === "frame" && id.startsWith("folder:")`
- Flatten children of removed legacy frames:
  - For any node with `parentNode` pointing to a removed legacy frame: convert to absolute position (`frame.position + child.position`) and clear `parentNode`/`extent`.
  - This prevents orphaned nodes and preserves old layouts as much as possible.
- Only keep derived file nodes that match the new rule set (root-only).

### 2) Wire navigation + initial "single folder" open
File: `src/App.tsx`

- Change folder view build calls to use non-recursive display intent:
  - `buildFolderViewDoc(dir, { recursive: false, limit: 500 }, loaded.doc)`
  - (Keep `recursive` stored in `ViewDoc.options`, but folder view rendering ignores nested files regardless.)
- Add `onOpenFolder` callback passed into `CanvasPane`:
  - `onOpenFolder={(dir) => void loadAndBuildFolderView(dir)}`
- On vault open/create + startup restore:
  - After `vault_list_dir` for root:
    - If exactly one `dir` entry and no `file` entries, call `loadAndBuildFolderView(theOnlyDir.rel_path)` instead of `loadAndBuildFolderView("")`.

### 3) Add the new folder tile node renderer
File: `src/components/CanvasPane.tsx`

- Add prop:
  - `onOpenFolder: (dir: string) => void`
- Add `FolderNode` component:
  - Renders icon + name + counts
  - Renders hover-only list of recent markdown items; each is clickable and calls "open file"
- Provide actions to node components via a lightweight React context (so folder node rows can open files/folders without putting functions into `node.data`):
  - `openNote(path)` uses existing `onOpenNote`
  - `openFolder(dir)` uses new `onOpenFolder`
- Register node type:
  - `nodeTypes = { ..., folder: FolderNode }`
- Extend `onNodeDoubleClick`:
  - If `node.type === "folder"` and `data.dir` is a string -> `onOpenFolder(data.dir)`

### 4) Styling for folder tiles
File: `src/App.css`

Add styles:
- `.rfNodeFolder` (distinct from sticky aesthetic; no folded corner/texture)
- Title + counts line
- `.rfNodeFolderPreview` hidden by default, visible on hover
- Preview rows look like "small links" (hover underline/contrast), and are clearly clickable

---

## Backend Types + IPC Additions (Signatures)

### Rust (new structs + command)
File: `src-tauri/src/vault_fs.rs`
- `struct RecentMarkdown { rel_path: String, name: String, mtime_ms: u64 }`
- `struct DirChildSummary { dir_rel_path: String, name: String, total_files_recursive: u32, total_markdown_recursive: u32, recent_markdown: Vec<RecentMarkdown>, truncated: bool }`
- `#[tauri::command] pub async fn vault_dir_children_summary(state: State<'_, VaultState>, dir: Option<String>, preview_limit: Option<u32>) -> Result<Vec<DirChildSummary>, String>`

File: `src-tauri/src/lib.rs`
- Register `vault_fs::vault_dir_children_summary` in `generate_handler![]`

### TypeScript (typed IPC wrapper)
File: `src/lib/tauri.ts`
- Add interfaces `RecentMarkdown`, `DirChildSummary`
- Add command mapping in `TauriCommands`:
  - `vault_dir_children_summary: CommandDef<{ dir?: string | null; preview_limit?: number | null }, DirChildSummary[]>;`

---

## Test / Verification Checklist

### Manual scenarios
1. Root has many folders + nested subfolders:
   - Canvas shows folder tiles for immediate folders only.
   - No notes from nested folders appear as sticky notes.
   - Hover shows 5 most recent markdown files for each folder tile.
2. Folder with root files + subfolders:
   - Root markdown files appear as sticky notes.
   - Root non-markdown files appear as file cards.
   - Subfolder files do not appear.
3. Clicking behavior:
   - Double-click folder tile navigates into folder view.
   - Clicking a preview row opens that file in editor.
4. Legacy migration:
   - Existing folder canvases created with the old "frame per folder" layout do not retain the old `folder:*` frames, and remaining nodes don't jump to weird relative positions.
5. Single-folder vault:
   - On vault open, app starts inside that folder's canvas automatically.

### Build/Typecheck
- `pnpm build`
- `pnpm check`
- `cd src-tauri && cargo check`

---

## Assumptions / Defaults
- "Most recently modified" is filesystem `mtime` (not note frontmatter date).
- Counts are recursive within each folder; hidden paths remain excluded (consistent with current vault fs).
- Folder view continues to persist node positions in the saved view doc; derived nodes are regenerated but keep position when ids match.

