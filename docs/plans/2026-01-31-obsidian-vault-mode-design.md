# Obsidian Vault Mode + `.tether/` Storage (Design)

Date: 2026-01-31

## Summary

Tether should be able to open any existing folder / Obsidian vault without creating or modifying files in that vault, except for a single hidden folder at the vault root: `.tether/`.

All Tether-owned data (canvas graphs, search index, link preview cache, AI audit logs, settings specific to that vault) lives under `.tether/` and is never written elsewhere unless the user explicitly saves a note/file.

## Goals

- Open any folder (including an existing Obsidian vault) with **no automatic edits/saves** to user Markdown files.
- Provide a **file tree** for navigating folders and files in the vault.
- Open Markdown in the main panel, allow editing, but only **write on explicit Save**.
- Provide an **AI chat pane** that can use selected context (active file, selected canvas nodes, etc.).
- Provide a **brainstorming canvas** persisted to SQLite under `.tether/` (no `canvases/*.json`).

## Non-goals (initial)

- Full Obsidian compatibility (plugins, Dataview, embeds parity).
- Perfect wikilink resolution (we will be “good enough” and improve over time).
- Sync / collaboration.

## Storage

Vault root contains user content. Tether writes only to:

```
<vault>/
  .tether/
    tether.sqlite           # primary DB: canvases, index metadata, settings
    cache/                  # derived data (safe to delete)
      link-previews/        # cached OG images/text
      ai/                   # optional audit logs per job
    assets/                 # content-addressed assets referenced by notes/canvas (optional)
```

Notes remain wherever they already are (e.g. `Projects/Idea.md`). `.tether/` is excluded from the file tree by default.

## Document model

- Notes/files are identified by **vault-relative paths** (e.g. `Projects/Idea.md`).
- The editor operates on an in-memory buffer:
  - Selecting a file loads from disk into the buffer.
  - Edits mark the buffer dirty.
  - Disk is only written when the user explicitly saves.
  - Switching away from a dirty buffer prompts: Save / Discard / Cancel.
- Save supports conflict detection using `mtime_ms` (or an etag) from last read.

## Canvas model

- Canvas docs are stored in SQLite as JSON blobs (for fast iteration) with metadata columns:
  - `id`, `title`, `updated`, `doc_json`
- Canvas “note nodes” reference notes by `notePath` (vault-relative path), not UUID.

## Index/search model

- Index lives in SQLite (same DB initially).
- Indexer scans `*.md` files across the vault, excluding `.tether/` (and other ignored dirs like `.obsidian/`).
- Search uses SQLite FTS.
- Backlinks are derived from parsing markdown links + wikilinks and stored as edges in an index table.

## Tauri IPC surface (target)

- `vault_open` / `vault_create`: sets current vault root; ensures `.tether/` exists; never creates `notes/`, `canvases/`, `cache/`, `assets/` at vault root.
- `fs_list_dir`: list children of a vault-relative directory (with file/dir markers).
- `fs_read_text`: read a vault-relative file, returning content + mtime/etag.
- `fs_write_text`: write a vault-relative file (explicit save) with optional conflict detection.
- Canvas: `canvas_list/read/write` backed by SQLite in `.tether/`.
- Index: `index_rebuild/search/backlinks` backed by SQLite in `.tether/`.

## Migration notes

The existing “Tether v1 vault layout” (`notes/`, `canvases/`, `cache/`, `assets/`, `vault.json`) is treated as just a normal folder tree in this mode. A later migration can optionally import those notes/canvases into `.tether/`-backed storage, but nothing is done automatically.

