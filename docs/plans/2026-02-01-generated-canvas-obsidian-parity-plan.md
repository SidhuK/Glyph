# Tether: Generated Canvases + Obsidian-Parity Markdown (Vault Mode)

Date: 2026-02-01  
Owner: Tether  
Status: Draft (ready to implement)

## 0) Summary

We are refactoring Tether into an Obsidian-first vault browser/editor where:

- The **sidebar** is an Obsidian-like file explorer (plus tags + search).
- The **main area** is a single, “living” **generated canvas** (ReactFlow) that auto-populates from the current selection (folder / tag / search).
- Notes and files in the vault are **never modified just by opening/previewing/indexing**.
- The app may write Tether-owned data into a hidden vault folder: **`.tether/`** (layouts, view state, index DB, caches, AI annotations).
- Markdown preview aims for **feature parity with Obsidian** (wikilinks/embeds/callouts/tasks/math/mermaid/footnotes/highlights/tags/frontmatter, etc.).

The current “manual canvas creation” UX (sidebar “Canvases”, “New canvas”) is removed. Canvases become **query-driven views**.

## 1) Goals

### Product goals

1) **No surprise writes**
- Opening a file, browsing folders, rendering markdown, or rebuilding search index must not modify vault files.
- Vault file writes happen only via explicit edit+save (or autosave after edits, if enabled).

2) **Generated canvases**
- Clicking a **folder** / **tag** / **search query** opens a generated canvas that displays relevant nodes.
- Users can rearrange nodes and add edges; those layouts persist per view.

3) **Obsidian-parity markdown**
- Preview renders the same constructs users expect from Obsidian.
- Links/embeds resolve like Obsidian (including relative behavior and title/path resolution).

4) **Aesthetic, non-robotic UI**
- Canvas layouts look intentionally designed (clustered, stable, “floating”), not a random pile.
- Sidebar and typography feel close to Obsidian’s polish.

### Engineering goals

- Clear separation of concerns: **Vault content** vs **Tether metadata**.
- Stable identifiers for nodes so layouts persist without jitter.
- Performance: handle large vaults (many files) without UI freezing.

## 2) Non-goals (for the first iteration)

- Full Obsidian plugin ecosystem compatibility.
- Replicating Obsidian’s exact internal markdown engine 1:1 at the implementation level (we target behavior parity).
- Supporting every non-markdown file type in-editor (we’ll support previewing common embeds early).
- Multi-vault simultaneous opening.

## 3) Constraints & Principles

### Hard constraints

- We can write only under `.tether/` in the vault (and optionally OS app data), but we **must not** mutate normal vault files unless saving edits.
- Rendering/indexing must not “normalize” markdown or YAML frontmatter on read.

### Key principles

- **Read paths are pure.** All read-only operations must be side-effect free.
- **Writes are explicit and minimal.** When saving, write raw user text without auto-injecting metadata unless the user changed it.
- **Derived data stays derived.** Indexes, render caches, AI suggestions belong in `.tether/`.
- **Layouts are stable.** Adding/removing files should not cause existing nodes to jump around.

## 4) Current Baseline (what exists today)

Frontend (React):
- `src/components/FileTreePane.tsx`: basic file tree; clicking a folder expands; clicking a file opens editor.
- `src/components/CanvasPane.tsx`: ReactFlow canvas with nodes/edges and save debounce.
- `src/components/CanvasesPane.tsx`: manual canvases list + “New canvas”.
- `src/components/MarkdownFileEditor.tsx`: CodeMirror editor for any markdown file (manual save).
- `src/components/NoteEditor.tsx`: CodeMirror editor for “note DB notes” (has 500ms autosave debounce).
- `src/App.tsx`: drives vault selection, file open/save, manual canvas list/read/write, search, AI pane.

Backend (Tauri/Rust):
- `src-tauri/src/vault_fs.rs`: lists files/dirs, reads/writes text files (raw).
- `src-tauri/src/index.rs`: builds/queries a derived search/link index (DB).
- `src-tauri/src/canvas.rs`: DB-backed manual canvases table and CRUD.
- `src-tauri/src/notes.rs`: DB-like notes under `notes/` with YAML frontmatter normalization on write (this is NOT Obsidian’s model).

Immediate concern from user:
- “Metadata manipulation” appears to happen when opening files. We must ensure **no write occurs on open/preview/index**.

## 5) Target Architecture Overview

We introduce an explicit “Vault Mode” model:

### Two domains

1) **Vault Content Domain** (Obsidian files)
- Raw markdown files anywhere in vault.
- Attachments and other file types.
- Read-only operations: browse, read text, render preview, resolve links, compute derived graph.

2) **Tether Metadata Domain** (`.tether/`)
- View definitions (folder/tag/search), layouts, edges, UI state, caches.
- Derived search/link index DB (SQLite).
- AI metadata (edge suggestions, labels, embeddings later).

### Generated canvas = “View”

A View is defined by:
- `kind`: `folder` | `tag` | `search` | `global`
- `selector`: e.g. folder path, tag string, search query
- `options`: recursion, include attachments, include non-md, max nodes, etc.
- `layout state`: persisted node positions, user edges, hidden/collapsed groups, pinned nodes.

The canvas is just a renderer of the current View state.

## 6) `.tether/` Folder Layout (v1)

Create the following structure in the vault root:

```
.tether/
  manifest.json
  index.sqlite
  views/
    global.json
    folder/
      <hash>.json
    tag/
      <hash>.json
    search/
      <hash>.json
  cache/
    rendered/
    thumbnails/
  session.json
```

### `manifest.json`

Stores:
- `schema_version` (int)
- `created_at`
- `app_version` (for migrations)

### `index.sqlite`

Derived DB for fast lookup and Obsidian-like resolution. Minimum tables:
- `files(rel_path TEXT PRIMARY KEY, title TEXT, mtime_ms INTEGER, sha256 TEXT, is_markdown INTEGER)`
- `tags(rel_path TEXT, tag TEXT, PRIMARY KEY(rel_path, tag))`
- `links(from_rel_path TEXT, to_rel_path TEXT, kind TEXT, PRIMARY KEY(from_rel_path, to_rel_path, kind))`
- `backlinks(to_rel_path TEXT, from_rel_path TEXT, PRIMARY KEY(to_rel_path, from_rel_path))` (or derive via `links`)
- `aliases(rel_path TEXT, alias TEXT, PRIMARY KEY(rel_path, alias))` (optional early; needed for Obsidian-like title resolution)

Notes:
- Index rebuild reads files; it never rewrites them.
- Store enough to resolve `[[Title]]` to a file path deterministically.

### View persistence files: `views/**/<hash>.json`

File contents (suggested):

- `schema_version`
- `view_id` (e.g. `folder:Projects/AI`)
- `kind`, `selector`, `options`
- `nodes`: `{ id, type, x, y, width?, height?, collapsed?, data? }[]`
- `edges`: `{ id, source, target, kind, label?, strength?, created_at?, created_by }[]`
  - `kind`: `user` | `ai_suggested` | `ai_accepted` | `derived`
  - `created_by`: `user` | `ai` | `system`
- `ui`: minimap on/off, zoom, pan, selected group, etc.

### `session.json`

Per-vault session state:
- expanded dirs
- last selected view
- last selected file/node
- panel sizes (sidebar width, inspector width)
- last search query

## 7) Stable Node Identity

Node IDs must be stable across sessions and rebuilds:

- Markdown note node: `rel_path` (e.g. `Projects/Note.md`)
- Folder/group node: `folder:<rel_path>`
- Attachment node: `asset:<rel_path>`
- Tag hub node (optional): `tag:<tag>`
- Search hub node (optional): `search:<queryHash>`

This stability is required for layout persistence, AI references, and reliable edge creation.

## 8) View Types & Population Rules (Best Default Choice)

We’ll implement a **single main canvas** that always shows “the current view”.

### Default behaviors (recommended)

1) **Folder View**
- Selector: folder path `X`
- Populate: markdown files under `X` (recursive by default, with “Depth: 1 / Recursive” toggle).
- Grouping: cluster by immediate subfolder; optionally show folder nodes as containers.
- Attachments: include attachments referenced by notes in `X` (default) + optional “include all attachments under folder”.

2) **Tag View**
- Selector: tag string `#foo` (from inline tags + frontmatter tags)
- Populate: notes that contain the tag.
- Grouping: cluster by folder or by tag co-occurrence.

3) **Search View**
- Selector: search query string
- Populate: top N results (default N=200, configurable).
- Grouping: cluster by folder and score bands.

4) **Global View**
- Populate: pinned notes + recently opened + optionally “top-level folders as clusters”.
- Used as the “home” canvas when nothing else is selected.

### Layout persistence strategy

Persist layouts per view (folder/tag/search/global). This keeps canvases stable, predictable, and avoids constantly re-autolaying everything.

## 9) Aesthetic Canvas Layout (Non-robotic)

We want “floating, intentional” layouts:

### Initial placement algorithm

Deterministic, stable, and attractive:

1) Cluster nodes
- Folder view: cluster by subfolder
- Tag view: cluster by folder or co-tag clusters
- Search view: cluster by folder and score

2) Place clusters using a simple radial or grid-of-clusters layout
- Each cluster gets a bounding region.

3) Within a cluster
- Place nodes in a tidy grid with jitter (seeded by view id + node id) for organic feel.

4) Optional relaxation pass (bounded)
- Run a small number of force iterations to reduce overlaps while keeping stability.

### “User controls”

- “Auto-arrange (this view)” button
- “Tidy cluster” for selected cluster/group
- “Pin node” (prevents auto moves)
- “Lock layout” (no auto placement; only manual)

## 10) Obsidian-Parity Markdown Rendering

### Split “Preview” from “Edit”

Preview is pure:
- Reads text and renders.
- No writes, no metadata normalization, no hidden updates.

Editor is explicit:
- Uses CodeMirror (already present) for editing.
- Saves only on explicit action or after edits (autosave toggle).

### Feature requirements (target parity)

Implement in preview:
- `[[wikilinks]]` with alias `[[Page|Alias]]`
- Heading links `[[Page#Heading]]`
- Block references `[[Page#^block-id]]` and `^block-id` anchors
- Embeds `![[...]]` for notes/images/PDF (common types)
- Callouts `> [!note]` (and variants)
- Task lists (checkboxes)
- Math (KaTeX/MathJax; prefer KaTeX for speed)
- Mermaid diagrams
- Footnotes
- Highlights `==like this==`
- Tags: inline `#tag` and frontmatter tags
- Standard markdown tables, code blocks, etc.

### Link resolution rules (Obsidian-like)

We need a resolver that:
- Maps `[[Title]]` to a rel_path using index data.
- Resolves relative paths similarly to Obsidian’s behavior when ambiguous.
- Supports `.md` implicit extension.
- Supports file rename/move by using index updates and (optionally) an alias table.

### Styling parity

- Add an Obsidian-inspired typography layer and CSS variables.
- Render callouts, task checkboxes, embeds, and code blocks with Obsidian-like spacing and colors.
- Support theme switching (dark/light) and future “use vault theme” (later).

## 11) Editing + Saving Rules (No surprise writes)

### Defaults (recommended)

- Default open mode: **Preview-first**
- Toggle: `Preview` / `Edit`
- Save policy:
  - Manual save always available.
  - Optional autosave **only after edits** (never on open), per-vault toggle.

### “No metadata manipulation” guarantee

- Do not rewrite YAML frontmatter automatically.
- Do not inject ids/created/updated/tags on save unless the user changed those lines explicitly.
- When saving, write the editor buffer as-is.

### Conflict handling

Keep the current “base mtime / etag” approach:
- On save, if mtime has changed since open, show conflict UI.
- Provide: “Reload from disk” and “Overwrite on disk” actions.

## 12) Sidebar UX (Obsidian-like)

### File tree interactions (recommended)

- Chevron toggles expand/collapse.
- Clicking a folder name selects that folder’s **Folder View** (and also expands if collapsed; configurable).
- Clicking a file:
  - focuses/selects its node on the canvas (center + highlight)
  - opens it in inspector (preview).

### Additional sections

- Tabs or segmented control: **Files / Tags / Search**
- Tags list:
  - shows top tags and search/filter
  - clicking tag opens Tag View

## 13) Canvas UX (Main Workspace)

### Main area

- The canvas is always present; it is the primary navigation and thinking surface.
- Inspector panel shows the selected node’s content and actions.

### Node types (v1)

- Note node: title + path hint, quick actions (open/preview, pin)
- Attachment node: image thumbnail or file icon
- Folder/group node: container with label and bounds
- Link/URL node (optional from current code)

### Edge types

- User edges: user-created relationships
- AI suggested edges: shown with a different style until accepted
- Derived edges: optional visual layer from link graph

## 14) AI: “Talk to the Canvas”

AI features should be explicit and non-destructive:

### Inputs

- Selected nodes (titles + relevant excerpts)
- Current view context (folder/tag/search)
- Existing user edges and derived link graph

### Outputs

- Suggest edges + reasons
- Suggest cluster labels / summaries
- “Create links in notes” as an explicit action (only writes when user accepts)

### Persistence

- AI suggestions and accepted edges live in `.tether/views/...`
- Do not write AI metadata into markdown files by default.

## 15) Migration Plan (Remove manual canvases)

### Step 1: Remove “Canvases” from sidebar

- Hide/remove `src/components/CanvasesPane.tsx` usage.
- Remove “New canvas” actions from UI.

### Step 2: Deprecate backend `canvas_*` commands

- Keep temporarily behind a feature flag to allow importing legacy canvases.
- Add a one-time migration tool:
  - “Import legacy canvas into a View layout” (writes to `.tether/views/...`).

### Step 3: Remove legacy code

- Delete `canvas.rs` and related DB schema once migration is complete and stable.

## 16) Safety/Regression Tests

### Backend (Rust)

- “No-write-on-open” tests:
  - Open/read file → assert mtime unchanged.
  - Index rebuild → assert file contents + mtime unchanged (for sample vault fixtures).
- Path traversal + hidden path rules:
  - ensure `.tether/` is writable but other hidden paths remain protected (policy decision).

### Frontend

- Rendering snapshot tests for markdown constructs:
  - wikilinks, embeds, callouts, math, mermaid, footnotes, highlights, tasks, tags.
- Interaction tests:
  - switching views doesn’t trigger saves
  - editing triggers dirty state; saving writes once

## 17) Performance Plan

- Incremental indexing:
  - track per-file hash/mtime to avoid full reindex.
- Canvas virtualization:
  - progressive node rendering for very large views.
- Render cache:
  - store rendered HTML (or AST) keyed by file hash under `.tether/cache/rendered/`.
- Off-main-thread work:
  - heavy layout calculations in a Web Worker (if needed).

## 18) Phased Implementation Plan (detailed)

### Phase 0 — Audit & Stop Surprise Writes

Deliverables:
- Verify read paths are pure (no implicit writes).
- Ensure any existing normalization code only runs on explicit save operations.
- Add explicit policies: vault files are “raw”, `.tether` is app-owned.

Work items:
- Identify all code paths triggered by “open file” and confirm they call only read APIs.
- Add logging around write operations for debugging (dev-only).
- Add a basic regression test fixture vault and assert no mtimes change after browsing.

### Phase 1 — `.tether/` Storage + Session State

Deliverables:
- Create `.tether/manifest.json` and `.tether/session.json`.
- Implement safe read/write helpers for `.tether/**`.

Work items:
- New backend commands:
  - `tether_meta_read(path)`
  - `tether_meta_write(path, bytes)`
  - `tether_meta_list(prefix)`
- Ensure `.tether` is allowed while other hidden paths stay denied.

### Phase 2 — View Model (folder/tag/search/global)

Deliverables:
- A “current view” state in `App.tsx`.
- Switching a folder/tag/search updates the canvas, not a manual canvas doc.

Work items:
- Define `ViewId` and hashing scheme for filenames.
- Implement view load/save to `.tether/views/**`.
- Introduce a View builder that resolves:
  - file list
  - node list (notes + referenced attachments)
  - derived edges (optional layer)

### Phase 3 — Canvas: Render View + Persist Layout

Deliverables:
- ReactFlow renders `ViewDoc` instead of manual `CanvasDoc`.
- Node drag updates layout in `.tether/views/**` (debounced).
- No “New canvas” UI.

Work items:
- Update `CanvasPane` props/types to accept `ViewDoc`.
- Save debouncing remains, but writes only to `.tether` view files.
- Add “Auto-arrange” actions.

### Phase 4 — Obsidian-Parity Preview Renderer

Deliverables:
- A new Preview component that matches Obsidian constructs.
- Link/Embed resolver using the index + vault FS.

Work items:
- Choose markdown engine and implement Obsidian extensions.
- Implement embed fetching and rendering for common types.
- Implement CSS that matches Obsidian feel.

### Phase 5 — Editor UX + Save Policy

Deliverables:
- Preview-first inspector with `Preview/Edit` toggle.
- Save only on explicit user action or post-edit autosave toggle.
- Guaranteed “no metadata rewrite unless user changed it”.

Work items:
- Keep CodeMirror editing, but separate from preview rendering.
- Ensure save uses raw text buffer (no normalization).

### Phase 6 — Tag Mode + Search Mode as Views

Deliverables:
- Tags panel in sidebar.
- Search results can open as a Search View canvas.

Work items:
- Extend index to store tags and fast tag lookup.
- UX: search can “Open as canvas” vs “jump to note”.

### Phase 7 — AI Integration on Generated Views

Deliverables:
- AI can suggest relationships between selected nodes.
- Accepting suggestions persists edges in `.tether/views/**`.

Work items:
- Define AI action schema (suggest edges, accept edges, apply links to notes).
- Ensure “apply to files” is always explicit.

### Phase 8 — Remove Legacy Manual Canvases (Migration + Cleanup)

Deliverables:
- Legacy `canvas_*` UI removed.
- Optional import/migration tool.
- Eventually remove backend `canvas.rs`.

## 19) Risks & Mitigations

- **Renderer parity risk**: Obsidian has many edge cases.
  - Mitigation: build a “parity test vault” with fixtures and snapshot render tests.
- **Large vault performance**: folder/tag views might contain thousands of notes.
  - Mitigation: cap nodes by default, progressive loading, worker layout.
- **Link resolution ambiguity**: multiple notes with same title.
  - Mitigation: deterministic tie-breakers + UI prompt when ambiguous.

## 20) Definition of Done (v1)

- No vault file is modified by open/preview/index.
- Folder click → generated canvas populated and laid out aesthetically.
- Tag + search generate canvases.
- Preview supports the listed Obsidian constructs (major ones verified via fixtures).
- Editing and saving works with conflict protection; no automatic YAML normalization.
- No manual “Canvases” section in sidebar.

