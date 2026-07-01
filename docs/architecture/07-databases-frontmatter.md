# Workspace Databases and Frontmatter

Glyph databases are saved views over notes. A database definition lives in `.glyph/databases.json`; each row is still a Markdown note. Editable cells write back to YAML frontmatter, then the note gets reindexed.

This design keeps databases offline and file-based. It also means database behavior depends on the index staying fresh.

## Main Files

Backend:

- `src-tauri/src/databases/types.rs`: database document, view, column, filter, row types
- `src-tauri/src/databases/store.rs`: `.glyph/databases.json` load/save and default view helpers
- `src-tauri/src/databases/query.rs`: source selection, filtering, sorting, row hydration
- `src-tauri/src/databases/commands.rs`: Tauri commands and frontmatter mutations
- `src-tauri/src/index/properties.rs`: indexed frontmatter property rows
- `src-tauri/src/notes/frontmatter.rs`: YAML mapping parse/render
- `src-tauri/src/notes/properties.rs`: property kind/value helpers

Frontend:

- `src/components/databases/DatabasesPane.tsx`: collections landing
- `src/components/databases/CreateCollectionDialog.tsx`: new collection flow (folder required)
- `src/components/database/DatabaseTable.tsx`: table view
- `src/components/database/DatabaseBoard.tsx`: board view
- `src/components/database/DatabaseToolbar.tsx`: view controls
- `src/components/database/DatabaseCell.tsx`: cell rendering and editing
- `src/components/database/DatabaseViewOptions*.tsx`: source, columns, filters, sort panels
- `src/hooks/database/useDatabaseBoard.ts`: board state helpers
- `src/lib/database/`: config, board, collection helpers, selected view storage, types
- `src/lib/tauri.ts`: database IPC types

## Durable Model

The database store lives at:

```text
.glyph/databases.json
```

The store shape:

```rust
pub struct DatabaseStore {
    pub databases: Vec<DatabaseDefinition>,
    pub status_colors: BTreeMap<String, String>,
}
```

The store contains collection definitions and view preferences. It does not contain row data. Row data comes from notes and the SQLite index.

There is no store version field and no load-time migration. `load_store()` parses JSON as-is. Unknown JSON fields are ignored by serde.

## Collections

Collections are user-created databases. New spaces start with an empty store.

`default_store()` returns:

- `databases: []`
- `status_colors: {}`

Creating a collection (`databases_create`) requires a folder. The backend rejects an empty folder path. New collections are created with:

- `source.kind = "folder"`
- `source.value` = chosen folder (recursive)
- `new_note.folder` = same folder
- one default view named `View 1`
- default view layout `board`, grouped by `tags`
- default columns: title, tags, updated

The frontend opens `CreateCollectionDialog` before calling `databases_create`. Command palette "New collection" opens the databases tab and the same dialog.

Users can still change a collection source to `all_notes`, `tag`, or `search` later through view options.

## Database Definition

`DatabaseDefinition` contains:

- `id`
- `name`
- `icon`
- `color`
- `source`
- `new_note`
- `schema`
- `views`
- timestamps

`source` selects which notes can appear:

- `all_notes`
- `folder`
- `tag`
- `search`

`new_note.folder` controls where `databases_create_row` creates a new note.

`schema` describes frontmatter-backed fields and built-in fields that the database exposes.

## Views

`DatabaseViewDefinition` contains:

- `id`
- `name`
- `layout`: `table` or `board`
- `search`
- `icon`
- `color`
- columns
- sorts
- filters
- grouping
- board lane colors
- board lane order
- board card order
- timestamps

Unsupported layouts are pruned on `databases_update`. If all views disappear after pruning, the store adds a default board view named `View 1` grouped by `tags`.

## Columns

Built-in columns come from `query.rs`:

- `title`
- `path`
- `folder`
- `created`
- `updated`
- `tags`
- `linked_notes`

Property columns use:

- `column_type = "property"`
- `property_key`
- `property_kind`

Property kinds include:

- `text`
- `url`
- `date`
- `checkbox`
- `tags`
- `status`
- `priority`
- `relation`
- `multi_select`

## Loading and Saving the Store

`load_store()`:

1. Reads `.glyph/databases.json`.
2. Parses JSON into `DatabaseStore`.
3. Returns `default_store()` if the file does not exist.

`save_store()` writes pretty JSON with `io_atomic::write_atomic()`.

Commands that mutate the store lock `SpaceState.db_store_mutex()` before loading and saving.

## Source Selection

`source_ids()` in `query.rs` selects note paths from the index:

- `all_notes`: latest notes from `notes`
- `folder`: direct or recursive folder SQL
- `tag`: notes with exact normalized tag
- `search`: calls `parse_raw_search_query()` and `run_search_advanced()`

The source scan limit is 2,000 notes. Row query pagination then applies view search, filters, sort, offset, and limit.

Folder source behavior:

- recursive folder source uses `id LIKE '{folder}/%'`
- direct folder source excludes grandchildren
- empty folder source means root-level notes for direct mode or all notes for recursive mode

## Row Hydration

`hydrate_rows_by_paths()` turns note ids into `DatabaseRow` records.

It joins:

- `notes` for title, created, updated, preview
- `tags` for tag lists
- `links` and `note_relationships` for linked notes
- `note_properties` for frontmatter properties

Large path sets are chunked with `SQLITE_BATCH_SIZE = 500` to keep SQLite parameter lists manageable.

The frontend receives rows with:

- note path
- title
- folder
- timestamps
- preview
- tags
- linked notes
- properties keyed by property name

## Filtering

Filters run in Rust over hydrated rows. Supported operators include:

- equals
- not_equals
- contains
- not_contains
- starts_with
- ends_with
- greater_than
- less_than
- is_empty
- is_not_empty
- is_true
- is_false
- tags_contains
- any_of
- none_of
- within_last_7_days

Numeric comparisons parse numbers after removing `$`, `,`, and `%`.

Date shortcuts include:

- Today
- Yesterday
- Overdue
- This Week
- Last 7 Days
- Last 30 Days

Tag filters normalize tags and support hierarchy matching through `tag_matches_hierarchy()`.

## View Search

`row_matches_search()` performs simple term matching across:

- title
- note path
- folder
- preview
- tags
- linked notes
- property values

All query terms must appear somewhere in the combined row text.

This search happens after source selection. A database with `source.kind = "search"` first uses index search to choose candidates, then view search can narrow those rows.

## Sorting

Rows sort by configured columns. Sort comparison uses column kind:

- dates parse as `YYYY-MM-DD`
- datetimes parse as RFC3339
- checkboxes compare booleans
- text cells compare case-insensitive text
- numeric-looking text sorts numerically before text fallback

Sorting happens after filtering and before pagination.

## Cell Editing

`databases_update_cell` writes editable columns back to the note.

Editable:

- `title`
- `tags`
- `property`

Read-only:

- `path`
- `folder`
- `created`
- `updated`
- `linked_notes`

Flow:

1. Load current row with `row_by_path()`.
2. Validate the column is editable.
3. Validate path and read Markdown.
4. Parse frontmatter mapping.
5. Convert the cell value to YAML.
6. Insert or replace the YAML key.
7. Render frontmatter plus original body.
8. Write Markdown with `write_markdown_note()`.
9. Reindex the note.
10. Return the fresh row.

This makes frontmatter the durable database cell storage.

## Creating Rows

`databases_create_row` creates a new Markdown note.

Flow:

1. Load the database definition.
2. Choose folder from `database.new_note.folder`.
3. Normalize title, defaulting to `Untitled`.
4. Slugify title into a filename.
5. Build frontmatter:
   - title
   - schema defaults
   - tags
   - initial values from caller
6. Render Markdown.
7. Write with `OpenOptions::create_new`.
8. On collision, try `Title 2.md`, `Title 3.md`, and so on.
9. Stop after 1,000 collisions.
10. Index the new note.
11. Return the created row.

Reserved frontmatter keys cannot be used for new-note defaults:

- `created`
- `folder`
- `glyph`
- `id`
- `linked_notes`
- `path`
- `tags`
- `title`
- `updated`

## Board View

Board layout uses the same row query result as table layout. The difference lives in view state:

- `grouping`
- `board_lane_colors`
- `board_lane_order`
- `board_card_order`

Frontend board helpers in `src/hooks/database/useDatabaseBoard.ts` group rows, apply lane order, and persist board state through `databases_update`.

Because board card order lives in the database view definition, it is workspace-level metadata rather than note content.

## Status Colors

Status colors live in the same store:

```rust
status_colors: BTreeMap<String, String>
```

`databases_status_color_set` normalizes status ids and validates colors. Supported colors:

- gray
- brown
- orange
- yellow
- green
- blue
- purple
- red

Invalid colors are rejected by `databases_status_color_set`.

## Preview Context

`databases_preview_context` returns richer note context for database previews:

- title
- Markdown content
- timestamps
- word count
- character count
- line count
- reading time
- backlinks

It reads the note file and queries backlinks from the index. This command accepts an unused `_space_path` parameter for caller compatibility, but it uses the active `SpaceState`.

## Frontend Flow

Typical collections page flow:

1. `DatabasesPane` lists summaries with `databases_list`.
2. If no collections exist, the pane shows an empty state with "Create Collection".
3. Creating a collection opens `CreateCollectionDialog`, requires a folder pick, then calls `databases_create` with `name` and `folder`.
4. User opens a collection.
5. Frontend calls `databases_get` to load definition and available properties.
6. Frontend selects a view.
7. Table or board calls `databases_query_rows`.
8. Cell edits call `databases_update_cell`.
9. View edits call `databases_update`.
10. New row action calls `databases_create_row`.
11. Delete collection uses Tauri `confirm()` before `databases_delete`.

Available properties come from the index, not from the database store alone. If property suggestions are stale, rebuild the index.

## Change Checklist

When changing databases:

1. Decide whether the data belongs in note frontmatter or `.glyph/databases.json`.
2. Update Rust types and TypeScript IPC types together.
3. Use a hard cutover for store shape changes. Do not add version fields or load-time migration.
4. Keep row content derived from Markdown and index rows.
5. Use `db_store_mutex()` for store writes.
6. Use atomic writes for store saves and note writes.
7. Reindex notes after any frontmatter mutation.
8. Update both table and board behavior when changing view fields.
9. Keep destructive actions behind Tauri `confirm()`, not `window.confirm`.

## Debugging Map

- Collection missing: inspect `databases.json` and confirm `databases_create` succeeded.
- Empty collections pane: expected when `databases` is `[]`; use Create Collection.
- Row missing: inspect source selection and index `notes` rows.
- Property column empty: inspect `note_properties` indexing.
- Cell edit does not persist: inspect `apply_cell_update_to_markdown()`.
- New row goes to wrong folder: inspect `database.new_note.folder`.
- Board order resets: inspect `board_card_order` and `databases_update`.
- Status color rejected: inspect `normalize_status_id()` and allowed colors.
