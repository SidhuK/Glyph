# SQLite Index, Search, Graph, and Checklists

Glyph keeps Markdown files as the durable source of truth. The SQLite database under `.glyph/glyph.sqlite` is a derived index. It accelerates search, tags, backlinks, relationships, database rows, and checklist progress summaries.

If the index is wrong, rebuild it from Markdown. Do not treat SQLite rows as the authoritative note content.

## Main Files

Backend:

- `src-tauri/src/index/schema.rs`: table and FTS schema
- `src-tauri/src/index/db.rs`: database path, WAL setup, schema cache, migrations
- `src-tauri/src/index/indexer.rs`: note indexing, removal, rebuild
- `src-tauri/src/index/commands.rs`: Tauri commands for search, all docs, tags, checklist summaries, graph
- `src-tauri/src/index/frontmatter.rs`: frontmatter title and preview parsing
- `src-tauri/src/index/links.rs`: outgoing link parsing
- `src-tauri/src/index/tags.rs`: tag and people mention parsing
- `src-tauri/src/index/properties.rs`: frontmatter property indexing
- `src-tauri/src/index/relationships.rs`: relationship indexing and query
- `src-tauri/src/index/search_advanced.rs`: structured search
- `src-tauri/src/index/search_hybrid.rs`: FTS plus local semantic-ish ranking
- `src-tauri/src/index/checklists/`: markdown checklist parsing and summary queries

Frontend consumers:

- `src/components/app/AllDocsPane.tsx`
- `src/components/checklists/TaskProgressIndicator.tsx`
- `src/components/TagsPane.tsx`
- `src/components/graph/LocalNoteGraphDialog.tsx`
- `src/components/database/`
- `src/components/app/CommandSearchResults.tsx`
- `src/hooks/useMarkdownTaskSummary.ts`
- `src/hooks/useTaskSummariesForPaths.ts`

## Database Location

`db_path(space_root)` returns:

```text
.glyph/glyph.sqlite
```

`open_db()` creates the parent directory, opens the database, configures WAL, ensures schema, and runs migrations. It caches schema setup by database path so repeated commands do not run schema checks on every open.

Opening or closing a space calls `reset_schema_cache()` so a different space gets a fresh schema check.

## WAL and Schema Version

`db.rs` sets:

- `INDEX_DB_VERSION = 7`
- `journal_mode = WAL`
- `journal_size_limit = 1_048_576`
- `SQLITE_FCNTL_PERSIST_WAL`

Migrations are hard-coded by `user_version`:

- version 2: tags table gains `is_explicit`
- version 3: normalize unknown frontmatter property kinds
- version 5: infer status property kinds
- version 6: infer priority property kinds
- version 7: add `checklist_total` and `checklist_completed` on `notes`, backfill from markdown files

Schema creation still uses `CREATE TABLE IF NOT EXISTS`. Migrations fix existing databases that already have older tables.

## Tables

`schema.rs` creates:

### `notes`

Stores one row per markdown note:

- `id`: space-relative note path
- `title`
- `created`
- `updated`
- `path`
- `etag`
- `preview`
- `checklist_total`
- `checklist_completed`

`id` and `path` are currently the note path. The index uses paths as stable identifiers. Checklist columns store aggregate counts for progress rings; they are not per-task rows.

### `links`

Stores outgoing links:

- `from_id`
- `to_id`
- `to_title`
- `kind`

`to_id` is set when the link resolves to a known note or file path. `to_title` stores unresolved wiki titles.

### `note_relationships`

Stores frontmatter relationship fields:

- `from_id`
- `field_key`
- `to_id`
- `to_title`
- `target_title`
- `ordinal`

Relationships support richer graph and database relation columns than raw links.

### `tags`

Stores note tags:

- `note_id`
- `tag`
- `is_explicit`

Explicit tags come directly from the note. Derived parent tags let searches for `#work` include notes tagged `#work/today`.

People mentions can be stored under the `people/` namespace when the setting is enabled.

### `note_properties`

Stores frontmatter properties:

- `note_id`
- `key`
- `value_type`
- `value_text`
- `value_json`
- `ordinal`

`value_text` powers filtering and sorting. `value_json` preserves typed values such as booleans and lists.

### `notes_fts`

FTS5 virtual table for note title/body search.

## Indexing a Note

`index_note(space_root, note_id, markdown)` opens SQLite and calls `index_note_with_conn()`.

The indexer:

1. Computes SHA-256 etag from Markdown bytes.
2. If the etag did not change, it ensures relationships are indexed and refreshes timestamps when the file mtime changed.
3. Parses frontmatter title, created, and updated.
4. Falls back to the filename stem for untitled notes.
5. Builds a preview.
6. Inserts or replaces the `notes` row.
7. Replaces the `notes_fts` row.
8. Deletes old links and tags.
9. Parses tags and optional people mentions.
10. Reindexes frontmatter properties.
11. Reindexes relationships.
12. Stores checklist total/completed counts on the `notes` row.
13. Parses outgoing links.
14. Resolves wiki titles to note ids when the title is unique.
15. Inserts link rows.
16. Commits the transaction.

The etag short path matters. If content did not change, derived rows are skipped while note updated time can refresh.

## Removing a Note

`remove_note()` deletes:

- `notes`
- `notes_fts`
- links where the note is source or target
- tags
- note properties
- note relationships from this note

It also converts relationships from other notes that pointed at this note back to unresolved title form.

Delete and rename commands call this function when markdown paths disappear or move.

## Rebuilding the Index

`rebuild(space_root)`:

1. Deletes all derived rows.
2. Walks visible Markdown files under the space.
3. Indexes notes, FTS, tags, properties, and checklist counts.
4. Collects link and relationship data.
5. Resolves links after all notes exist.
6. Inserts relationships after all note titles can resolve.
7. Returns the indexed count.

`index_rebuild` runs this in `spawn_blocking` and sends a system notification when done.

`FileTreeProvider` starts an index rebuild after listing the root when a space opens.

## Search

Glyph exposes three search commands:

- `search`: simple text search through `hybrid_search()`
- `search_advanced`: structured request with query, tags, people, title-only, tag-only, limit
- `search_parse_and_run`: command palette query parser that turns raw text into `SearchAdvancedRequest`

`hybrid_search()` combines:

- FTS5 `MATCH` with BM25 ranking
- local candidate scan over title and preview
- trigram Jaccard score
- phrase and title bonuses

This is not embedding search. It is deterministic local ranking over indexed text.

Advanced search can join multiple `tags` aliases. For tag hierarchy, normalization happens in `tags.rs` and structured filtering happens in `search_advanced.rs`.

## Tags and People

Tags come from Markdown body and frontmatter. The parser expands hierarchical tags so parent tag searches include children.

People mentions are optional. `SpaceContext` syncs the setting to Rust with:

```ts
invoke("index_set_people_mentions_as_tags_enabled", { enabled })
```

The Rust flag is process-local. When the setting changes, the index may need a rebuild for stored people tags to reflect the new behavior.

Frontend tag lists page through:

- `tags_list`
- `people_list`

`FileTreeProvider` stores those lists for sidebar tag navigation.

## Backlinks and Graph

Backlinks query the `links` and relationship tables. The local graph command returns nodes and edges around a selected note.

The graph distinguishes:

- note nodes
- tag nodes
- note-to-note link edges
- note-to-tag edges
- relationship edges

Frontend renders local graph data in `LocalNoteGraphDialog`.

When link resolution feels wrong, inspect:

- `index/links.rs` for parsing
- `resolve_title_to_id()` in `db.rs`
- rename link rewriting in `space_fs/link_rewrite.rs`
- `space_fs/link_ops.rs` for click-time resolution

## Checklist summaries

The checklist subsystem parses markdown task-list lines (`- [ ]`, `- [x]`) and stores aggregate counts on each `notes` row during indexing.

Commands:

- `task_summary`: parse markdown and return total/completed/open counts (used by the open-note sidebar)
- `task_summaries_for_paths`: batch lookup from indexed `checklist_total` / `checklist_completed` columns

Markdown remains the source of truth. The index only caches counts for progress rings in navigation surfaces (file tree, All Notes, Folio, database board cards, note info sidebar).

## All Docs

`all_docs_list` queries the `notes` table and joins tag and people blobs. It supports an optional folder prefix and a high limit capped at 5,000.

`all_docs_count` uses the same folder prefix logic.

All-docs UI should treat this as an index view. If a note is missing, run or inspect `index_rebuild`.

## Index Consumers

The index feeds:

- command palette search
- all notes
- tags and people sidebars
- backlinks
- local graph
- checklist progress indicators
- database source rows
- AI tools when search can use FTS

Changes to schema or indexing can affect many surfaces. Run focused manual checks across at least search, tags, backlinks, databases, and checklist progress rings after broad index changes.

## Change Checklist

When changing the index:

1. Confirm whether the source of truth stays in Markdown.
2. Update `schema.rs` for new tables or columns.
3. Increment `INDEX_DB_VERSION` when existing databases need migration.
4. Add migration code in `db.rs`.
5. Update `index_note_with_conn()` and `rebuild()` together.
6. Update `remove_note()` for any new per-note derived rows.
7. Update frontend result types in `src/lib/tauri.ts` when command outputs change.
8. Rebuild the index after parser behavior changes.
9. Check downstream consumers, especially databases and checklist progress UI.

## Debugging Map

- Search misses a note: inspect `notes_fts` insertion and FTS query syntax.
- Tag count wrong: inspect explicit vs derived tag rows.
- Backlink wrong after rename: inspect link rewrite and `remove_note()`.
- Database row missing: inspect `source_ids()` in `databases/query.rs` and `notes` rows.
- Task checkbox writes wrong line: inspect task ordinal parsing and task source hashes.
- Rebuild slow: inspect full space walk and per-note parser work.
