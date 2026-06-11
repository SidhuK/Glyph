# Plan 003 Report: Space Graph Spike

## Backend timing

- Synthetic-scale coverage was added in `space_graph_synthetic_scale_stays_under_spike_budget` with about 2,000 notes, 10,000 links, and 500 explicit tag rows.
- Timing number from `cargo test index:: -- --nocapture`: `479.411166ms`. The test asserts the query returns in under 500ms.

## Verification

- `cd src-tauri && cargo check`: passed.
- `cd src-tauri && cargo test index:: -- --nocapture`: passed, including the new `space_graph_tests`.
- `pnpm check`: passed.
- `pnpm build`: passed. Vite reported the existing large chunk warning.
- `pnpm test`: failed in unrelated existing suites: editor tests need `window.matchMedia`, folio tests hit null tag-icon appearance data, settings tests mock `../Icons` without `ChevronDown`, and preview tests did not observe the native popup mock.

## Prototype behavior

- Adds a `space_graph` Tauri command with default caps of 1,000 notes and 250 tags.
- The backend starts from `notes`, so untruncated graphs include linked notes, tagged notes, and isolated notes with no links or tags.
- The graph returns note-to-note `link` and `relationship` edges, explicit non-people tag nodes, tag-to-note edges, note/tag totals, and truncation flags.
- The full-pane prototype uses Cytoscape with `fcose`, opens notes on note-node click, and leaves tag-node click as a neighborhood highlight only.
- The overlay reports visible notes, tags, edges, isolated notes, and top-N notices when note or tag caps apply.

## Limits and open questions

- Webview layout performance at 1,000+ visible nodes requires a manual app run.
- The graph does not incrementally update when the index changes.
- Filtering, search-in-graph, pinned nodes, saved layouts, and persisted layout positions are not included.
- Tag hierarchy behavior is unresolved; this spike renders only indexed explicit user tags.
- The graph is currently a special tab, matching existing All Notes/Calendar/Collections architecture. Productization should decide whether graph deserves a first-class view/tab type.

## Recommendation

Go for a production feature after a manual webview performance pass. Backend shape is reusable and additive; the remaining work is mostly interaction design and live-update behavior. Estimated production effort: M for a polished v1, L if saved layouts, filters, and incremental updates are included.
