# Plan 003: Space-wide graph view — backend command + full-pane prototype (design spike)

> **Executor instructions**: This is a **design-spike plan**: build a working
> prototype behind clear limits, measure it, and record open questions — do
> not polish it into a finished feature. Follow the steps, run every
> verification command, and honor the STOP conditions. When done, update the
> status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat a27b376..HEAD -- src-tauri/src/index/commands.rs src/components/graph/ src/lib/tauri.ts src-tauri/src/lib.rs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M (spike; production feature is L)
- **Risk**: LOW (additive command + new component; perf risk is what the
  spike measures)
- **Depends on**: none (001 and 002 are unrelated)
- **Category**: direction
- **Planned at**: commit `a27b376`, 2026-06-11

## Why this matters

Glyph's only graph surface is a per-note modal
(`LocalNoteGraphDialog`) showing one hop of neighbors. The SQLite index
already stores every note, every note-to-note edge (`links` and
`note_relationships` tables, with from/to indexes), and every indexed tag
(`tags(note_id, tag, is_explicit)`). The architecture docs note the
relationship model "supports richer graph … than raw links". A whole-space
graph view is a hallmark feature of this app category (Obsidian/Logseq) and
should show the space as a whole: linked notes, tag clusters, and notes that
have no note links at all. The unknown is rendering performance on large
spaces — that is what this spike answers, alongside a reusable `space_graph`
backend command.

## Current state

Relevant files:

- `src-tauri/src/index/commands.rs` (1788 lines) —
  `fn local_note_graph_for_conn(conn, note_id)` (line 1329): seeds from one
  note, gathers neighbors via a `UNION` over `links` and
  `note_relationships`, then expands common tags via
  `local_graph_tag_expansion_for_seed_nodes` with limits
  (`COMMON_TAG_LIMIT: 12`, `TAGGED_NOTES_PER_TAG_LIMIT: 12`,
  `TOTAL_TAGGED_NOTES_LIMIT: 64`). The Tauri command wrapper
  `note_local_graph` (line 1585) follows the standard pattern:

  ```rust
  #[tauri::command(rename_all = "snake_case")]
  pub async fn note_local_graph(
      window: WebviewWindow,
      state: State<'_, SpaceState>,
      note_id: String,
  ) -> Result<LocalNoteGraph, String> {
      let root = state.root_for_window(&window)?;
      tauri::async_runtime::spawn_blocking(move || -> Result<LocalNoteGraph, String> {
          let conn = open_db(&root)?;
          local_note_graph_for_conn(&conn, &note_id)
      })
      .await
      .map_err(|e| e.to_string())?
  }
  ```

  An in-file test module `local_graph_tests` (line ~1599) builds an
  in-memory db with `ensure_schema` and inserts `notes`/`links` rows — use it
  as the test pattern.
- `src-tauri/src/index/schema.rs` — `tags(note_id, tag, is_explicit)` stores
  indexed inline/frontmatter tags. `tags_tag_idx` supports tag lookups, and
  `index::tags::PEOPLE_TAG_NAMESPACE` is used to exclude people pseudo-tags
  from user-facing tag lists.
- `src-tauri/src/index/types.rs` — existing local graph tag types
  (`LocalGraphTagNode`, `LocalGraphTagEdge`) show the shape to mirror for the
  space graph.
- `src-tauri/src/lib.rs` — command registration; `note_local_graph` is at
  line 1684 inside the `invoke_handler` list.
- `src/lib/tauri.ts` — typed IPC: `interface LocalNoteGraph` (line 378),
  command entry `note_local_graph: CommandDef<{ note_id: string }, LocalNoteGraph>;`
  (line 1022). New commands must be added to this `TauriCommands` map
  (AGENTS.md rule).
- `src/components/graph/LocalNoteGraphDialog.tsx` (677 lines) — the renderer:
  cytoscape + `cytoscape-fcose` layout, theme colors pulled from CSS custom
  properties via a probe (`cssColor`), node click dispatches
  `dispatchWikiLinkClick` to open notes. It is wrapped in a shadcn `Dialog`.
  The cytoscape setup/theming logic is reusable; the Dialog wrapper is not.

Conventions that apply:

- New Tauri commands: implement in `src-tauri/src/`, register in `lib.rs`,
  add to `TauriCommands` in `src/lib/tauri.ts` (AGENTS.md).
- TypeScript strict, no `any`; functional components; Biome formatting.
- ~200 LOC/file guideline — put new frontend code in new files under
  `src/components/graph/`, don't grow the dialog file.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Rust typecheck | `cd src-tauri && cargo check` | exit 0 |
| Rust tests | `cd src-tauri && cargo test index::` | all pass |
| Frontend check | `pnpm check` | exit 0 |
| Frontend build | `pnpm build` | exit 0 |
| Frontend tests | `pnpm test` | all pass |

Never run `pnpm dev` / `pnpm tauri dev` — the user runs the app and will
manually exercise the prototype.

## Scope

**In scope**:

- `src-tauri/src/index/commands.rs` — new `space_graph_for_conn` +
  `space_graph` command + tests, including tag nodes/tag edges and isolated
  note coverage
- `src-tauri/src/lib.rs` — register `space_graph`
- `src/lib/tauri.ts` — `SpaceGraph` types + command entry
- `src/components/graph/SpaceGraphView.tsx` (create) — full-pane prototype
- `src/components/graph/graphTheme.ts` (create, optional) — theming/cytoscape
  helpers extracted from the dialog *by copy*, only if cleanly separable
- One integration point to open the view (see Step 4)
- `plans/003-report-space-graph.md` (create) — spike findings

**Out of scope** (do NOT touch):

- `LocalNoteGraphDialog.tsx` behavior — the per-note dialog must keep working
  unchanged; if you extract shared helpers, prefer copying over refactoring
  the dialog in this spike.
- Graph persistence (saved layouts, pinned nodes), filtering UI, search-in-graph —
  note them as open questions instead.
- Tag hierarchy/product polish beyond the indexed explicit tag nodes. The
  spike should render explicit user tags, but not invent hierarchy grouping,
  tag filters, saved tag visibility, or a separate tag management surface.
- Index schema changes — the existing tables are sufficient.

## Git workflow

- Branch: `advisor/003-space-graph-spike`
- Commit style: short lower-case imperative summaries (matches `git log`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Backend — `space_graph` command with hard caps

In `src-tauri/src/index/commands.rs`:

1. Add types (serde `Serialize`, snake_case fields like the existing
   `LocalNoteGraph` family — copy its derive/attr style):
   `SpaceGraphNode { id, title, link_count, tag_count, is_isolated }`,
   `SpaceGraphEdge { from_id, to_id, kind }` (kind: `"link"` or
   `"relationship"`),
   `SpaceGraphTagNode { id, tag, title, note_count }`,
   `SpaceGraphTagEdge { tag_id, note_id }`, and
   `SpaceGraph { nodes, edges, tags, tag_edges, truncated: bool, truncated_tags: bool, total_notes: u32, total_tags: u32 }`.
   Use `glyph:tag:{tag}` IDs to match the local graph's tag node convention.
2. Add `fn space_graph_for_conn(conn: &rusqlite::Connection, max_nodes: usize, max_tags: usize) -> Result<SpaceGraph, String>`:
   - Count total notes.
   - Build note degree from note-to-note links, relationships, and explicit
     tag memberships. Keep note-link degree (`link_count`) separate from
     `tag_count` in the returned node.
   - If total notes ≤ `max_nodes`: select **all notes from `notes`**, including
     notes with no links, no relationships, and no tags. This is a hard
     requirement: the node query must start from `notes` with left-joined
     counts, not from `links`/`tags`.
   - If total notes > `max_nodes`: select the top `max_nodes` notes by total
     graph degree (note links + relationships + explicit tag memberships),
     tie-breaking by title/id, and set `truncated: true`. Zero-degree notes
     can only appear in this mode when the cap leaves room, but they must
     appear in the untruncated graph.
   - Select edges from `links` (`from_id`, `to_id` where `to_id IS NOT NULL`)
     and `note_relationships` (same condition), keeping only edges whose both
     endpoints are in the selected node set; dedupe `(from,to,kind)`.
   - Count `total_tags` as the number of distinct explicit non-people tags
     attached to the selected note set before applying `max_tags`.
   - Select explicit non-people tags (`is_explicit = 1` and
     `tag NOT LIKE format!("{PEOPLE_TAG_NAMESPACE}%")`) attached to the
     selected note set, ordered by visible note count desc then tag name asc,
     capped by `max_tags`. Set `truncated_tags: true` when `total_tags`
     exceeds `max_tags`.
   - Select `tag_edges` only between returned tags and returned notes; dedupe
     `(tag_id,note_id)`.
   - `is_isolated` is true when a note has zero note-to-note edges and zero
     returned tag edges. This makes truly standalone notes easy to style and
     count in the renderer.
3. Add the Tauri command `space_graph(window, state, max_nodes: Option<u32>, max_tags: Option<u32>)`
   mirroring `note_local_graph`'s wrapper exactly (default `max_nodes` 1000,
   clamp to `1..=5000`; default `max_tags` 250, clamp to `0..=1000`).
4. Register `index::commands::space_graph` in `src-tauri/src/lib.rs` next to
   `note_local_graph` (line 1684).
5. Add tests in a new `mod space_graph_tests` modeled on `local_graph_tests`:
   full graph under the cap includes linked notes, tagged notes, and notes
   with no links/tags; truncation keeps highest-degree nodes and sets
   `truncated`; edges with a missing endpoint excluded; explicit tags produce
   tag nodes/tag edges; people pseudo-tags and non-explicit virtual tags are
   excluded; tag cap sets `truncated_tags`.

**Verify**: `cd src-tauri && cargo check` → exit 0.
**Verify**: `cd src-tauri && cargo test index::` → all pass incl. new tests.

### Step 2: Typed IPC

In `src/lib/tauri.ts`: add `SpaceGraphNode`, `SpaceGraphEdge`,
`SpaceGraphTagNode`, `SpaceGraphTagEdge`, and `SpaceGraph` interfaces next
to `LocalNoteGraph` (line 378) and a command entry next to line 1022:

```ts
space_graph: CommandDef<{ max_nodes?: number; max_tags?: number }, SpaceGraph>;
```

**Verify**: `pnpm check` → exit 0.

### Step 3: Frontend — `SpaceGraphView.tsx` prototype

Create `src/components/graph/SpaceGraphView.tsx`: a full-pane (not Dialog)
component that:

- Invokes `space_graph` on mount via
  `invoke("space_graph", { max_nodes: 1000, max_tags: 250 })`.
- Reuses the cytoscape + fcose setup pattern from `LocalNoteGraphDialog.tsx`
  (registration guard, CSS-variable theming via the `cssColor` probe
  technique, node click → `dispatchWikiLinkClick`). Copy the needed helpers
  into `graphTheme.ts` if that keeps both files under control; do not import
  from or modify the dialog.
- Renders note nodes, tag nodes, note-to-note edges, and tag-to-note edges.
  Style tag nodes distinctly but minimally; tag node clicks can be no-op for
  the spike, while note node clicks still open notes.
- Shows a small overlay with note/tag/edge counts, isolated note count, and a
  "showing top N of M notes" notice when `truncated` is true. Also show a
  "showing top N of M tags" notice when `truncated_tags` is true.
- Handles empty spaces (zero notes → friendly empty state, no cytoscape init).

Keep styling minimal — default tokens, no new CSS files (AGENTS.md:
don't over-engineer CSS).

**Verify**: `pnpm check && pnpm build` → exit 0.

### Step 4: Minimal entry point

Wire ONE way to open the view, the cheapest that exists: add a command-palette
entry ("Open graph view") in `src/components/app/useAppCommands.tsx`,
following the structure of an existing command there, that switches the main
content to the graph view. Inspect how `MainContent.tsx` chooses what to
render (e.g. existing special views/tabs) and follow the closest existing
pattern; if no non-file view pattern exists (everything is file-tab based),
render it as a controlled overlay pane and record that as an open question
instead of inventing a new tab architecture.

**Verify**: `pnpm check && pnpm build && pnpm test` → all exit 0.

### Step 5: Measure and write the spike report

Create `plans/003-report-space-graph.md` recording:

1. Backend timing: extend `space_graph_tests` with a synthetic-scale test
   (insert ~2,000 notes / ~10,000 links / ~500 explicit tag rows into the
   in-memory db, time `space_graph_for_conn` with `std::time::Instant`, assert
   < 500ms, print the duration). Record the number.
2. What the renderer prototype does and its limits (note cap, tag node cap,
   isolated note rendering, layout choice).
3. Open questions for productization: layout perf in the webview at 1k+
   nodes (needs the user to run the app — note as "requires manual run"),
   incremental updates on index change events, filtering/search, tag hierarchy
   behavior, whether the view should be a first-class tab type, saved layouts.
4. A go/no-go recommendation with an effort estimate (S/M/L) for the
   production feature.

**Verify**: report file exists; `cd src-tauri && cargo test index::` passes
including the timing test.

## Test plan

- Rust: `mod space_graph_tests` in `src-tauri/src/index/commands.rs`
  (pattern: existing `local_graph_tests` in the same file) — full graph,
  isolated/unlinked notes, tag nodes/tag edges, tag cap behavior, truncation
  by degree, dangling-edge exclusion, synthetic-scale timing.
- Frontend: no new component tests required for the spike (NEVER make test
  files unless requested — AGENTS.md); `pnpm test` must stay green.
- Verification: commands in the table above, all exit 0.

## Done criteria

ALL must hold:

- [ ] `cd src-tauri && cargo check` and `cargo test index::` exit 0; new
      `space_graph_tests` exist and pass
- [ ] `grep -n "space_graph" src-tauri/src/lib.rs` shows the registration
- [ ] `grep -n "space_graph" src/lib/tauri.ts` shows the typed command entry
- [ ] `pnpm check`, `pnpm build`, `pnpm test` all exit 0
- [ ] `src/components/graph/SpaceGraphView.tsx` exists; `LocalNoteGraphDialog.tsx`
      is unmodified (`git diff --stat a27b376..HEAD -- src/components/graph/LocalNoteGraphDialog.tsx` empty)
- [ ] `plans/003-report-space-graph.md` exists with timing numbers and a
      go/no-go recommendation, including notes on tag rendering and isolated
      notes
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match the live code (drift).
- `MainContent.tsx` has no reasonable place to mount a non-file view AND the
  overlay fallback would require touching more than one app-shell file —
  record the architectural question in the report and stop after Step 3.
- The synthetic-scale backend test exceeds 500ms and no indexing/query fix
  inside `space_graph_for_conn` resolves it — that's a spike finding, not a
  bug to engineer around; record it and continue to the report.
- You find yourself wanting to modify `LocalNoteGraphDialog.tsx` or the
  index schema.

## Maintenance notes

- If this graduates to a product feature, revisit: tag hierarchy, tag
  filtering/search, live updates from the file watcher/index events, and
  making the graph a first-class tab/view type.
- Reviewer should scrutinize the degree-based truncation SQL (it runs over
  the whole `links` table — confirm it uses the existing from/to indexes via
  `EXPLAIN QUERY PLAN` if in doubt).
- Plan 001 (AI index tools) is independent, but a future `space_graph` AI
  tool could reuse `space_graph_for_conn` directly.
