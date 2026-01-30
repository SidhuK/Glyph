# Tether — Phased Build Plan (Empty Repo → Full App)

**Date:** 2026-01-30  
**References:** `tauri_canvas_ai_spec.md`, `plan.md`

This is a coding-first, phased plan that keeps the app runnable at the end of every step, while building toward the full “finished app” scope (no intentional MVP stopping point).

---

## Pre-flight Decisions (confirm early, but we can proceed with defaults)

- [x] **Network location:** Default to **all network calls in Rust** (AI + link previews) for scoping/privacy. - All network calls should be in Rust.
- [x] **Wikilinks:** Support `[[Title]]` as UX sugar; keep stable identity by `id` and resolve via index. - Yes, there should be Wiki links supported by default.
- [x] **Preview images:** Default store in `cache/` (rebuildable) unless you want portable/offline previews in `assets/` - The preview images should remain in cache with the ability to put those images, if needed, into permanent storage in Assets
- [x] **Network hardening:** Block `localhost` + private IP ranges by default with an “Advanced override”.
- [x] **Search engine path:** Use **SQLite + FTS5 from day one** (derived index in `cache/index.sqlite`, rebuildable + migrated). - We’ll go with SQLite directly (no JSON index).

---

## Phase Checklist

- [x] Step 1 — Scaffold the app workspace
- [x] Step 2 — Tauri permissions + plugin foundation
- [x] Step 3 — Vault create/open + safe IO primitives
- [ ] Step 4 — Notes system end-to-end (CRUD + editor + attachments)
- [ ] Step 5 — Canvas core (xyflow) + persistence
- [ ] Step 6 — Canvas “power tools” (groups, snap, align, undo/redo)
- [ ] Step 7 — Indexing + search + backlinks + external edit handling
- [ ] Step 8 — Link previews (OpenGraph) + caching + YouTube metadata
- [ ] Step 9 — AI foundations (providers, profiles, secrets, streaming, cancellation)
- [ ] Step 10 — AI context selection + payload preview + token budgeting
- [ ] Step 11 — AI actions: note rewrite diff/apply + generate notes/cards + audit log
- [ ] Step 12 — macOS polish + hardening + release readiness

---

## Step 1 — Scaffold the app workspace

**Goal:** Go from empty repo to a booting Tauri+React app with a stable dev workflow.

- Create `app/` with Tauri + Vite + React + TypeScript; use `pnpm`.
- Add baseline lint/format (keep minimal; avoid tool bloat).
- Establish a typed `invoke` wrapper + error normalization in the frontend.
- Add Rust logging (`tracing`) and a simple “ping/version” command.

**Done when:** `pnpm dev` launches the desktop app, renders a basic shell UI, and successfully calls one backend command.

---

## Step 2 — Tauri permissions + plugin foundation

**Goal:** Lock down capabilities up front (deny-by-default), and add core plugins we’ll rely on.

- Configure Tauri allowlists/scopes for filesystem (vault-only) and network (explicit use only).
- Add plugins (as needed): `dialog`, `fs`, `store`, `notification` (optional), `os` (optional).  
  Keep `http` usage in Rust if we centralize network there.
- Establish a small event protocol (progress + streaming): `index:*`, `links:*`, `ai:*`.

**Done when:** file pickers work, settings store works, and the app still launches under scoped permissions.

---

## Step 3 — Vault create/open + safe IO primitives

**Goal:** Make vault selection real, safe, and migration-ready.

Backend (Rust):

- `vault_create`, `vault_open`, `vault_get_current`
- Validate/create vault structure: `notes/`, `canvases/`, `assets/`, `cache/`, `vault.json`
- Implement `paths` (vault-root enforcement) and `io_atomic` (temp → fsync → rename)
- Add schema versioning + migration harness for `vault.json`

Frontend (React):

- “Open/Create Vault” flow using native folder picker
- “Recent vaults” from app settings store

**Done when:** vault open/create works and all writes go through atomic + vault-scoped APIs.

---

## Step 4 — Notes system end-to-end (CRUD + editor + attachments)

**Goal:** Full note lifecycle with correct on-disk Markdown + frontmatter.

Backend (Rust):

- `notes_list`, `note_create`, `note_read`, `note_write`, `note_delete`
- YAML frontmatter normalization:
  - ensure stable `id` (UUID)
  - preserve `created`, update `updated`
- `note_attach_file`: copy into `assets/` with stable naming, return reference snippet

Frontend (React):

- Notes explorer list + “new note”
- CodeMirror 6 markdown editor with debounced autosave + save-state UI
- Attachment UI (drag/drop optional later) using native file picker

**Done when:** notes are correct markdown files on disk, autosave is reliable, and attachments land in `assets/`.

---

## Step 5 — Canvas core (xyflow) + persistence

**Goal:** A real infinite canvas wired to a real `canvases/*.json` file.

Frontend (React):

- Integrate `@xyflow/react` with pan/zoom, selection, multi-select
- Implement node types:
  - NoteNode (references `noteId`)
  - TextNode (stores text in canvas JSON)
  - LinkNode (stores `url`, preview placeholder)
- Implement edges (connect) with optional labels
- Debounced autosave of canvas edits

Backend (Rust):

- `canvas_list`, `canvas_read`, `canvas_write`
- Canvas schema validation + `version` migrations

**Done when:** reopen app → canvas layout is identical; note nodes open the note in the editor pane.

---

## Step 6 — Canvas “power tools” (groups, snap, align, undo/redo)

**Goal:** Bring canvas interaction quality up to spec.

- Add snap-to-grid toggle + snap behavior.
- Implement align/distribute for multi-selection.
- Implement groups/frames (either as a node type or separate overlay model).
- Implement undo/redo with a clear boundary (canvas-only history) and keyboard shortcuts.
- Performance pass: keep node props stable, memoize node components, narrow store subscriptions.

**Done when:** the canvas feels “instant” and supports core diagramming workflows.

---

## Step 7 — Indexing + search + backlinks + external edit handling

**Goal:** “Knowledge graph” behaviors: search, backlinks, and resilience to external edits.

Backend (Rust):

- Index builder that produces:
  - note metadata map
  - outgoing links + backlinks
- SQLite-backed index in `cache/index.sqlite`:
  - schema + migrations for note metadata + link graph tables
  - FTS5 virtual table for full-text search (ranking + snippets/highlights)
  - incremental updates on note create/write/delete (commands + watcher)
- File watching (`notify`) for `notes/` (and optionally `canvases/`)
- Emit index progress events; allow cancel/rebuild

Frontend (React):

- Search UI (title + full text results)
- Backlinks panel for active note
- External edit conflict UX (reload/merge prompt + local draft buffer)

**Done when:** search/backlinks update quickly and external edits don’t cause silent data loss.

---

## Step 8 — Link previews (OpenGraph) + caching + YouTube metadata

**Goal:** Link cards become first-class, robust, and fast.

Backend (Rust, recommended):

- `link_preview` pipeline with timeouts + size limits:
  - fetch HTML, parse OG tags, resolve images
  - download preview image to `cache/link-previews/`
  - negative-cache failures (short TTL)
- YouTube: title + thumbnail (no transcript yet)

Frontend (React):

- Paste URL → create LinkNode → show loading → apply preview
- Manual “refresh preview” action
- Graceful fallback: URL + hostname even if preview fails

**Done when:** link cards are reliable, never freeze the UI, and survive offline mode gracefully.

---

## Step 9 — AI foundations (providers, profiles, secrets, streaming, cancellation)

**Goal:** Multi-provider chat plumbing that is secure and extensible.

Backend (Rust):

- Keychain-backed secrets (`secrets` module)
- Provider profiles (stored in app settings, not vault):
  - OpenAI
  - OpenAI-compatible (custom base URL + headers)
  - OpenRouter (preset wrapper)
  - Anthropic
  - Google Gemini
  - Ollama (local)
- Streaming + cancellation primitives:
  - per-conversation/job cancellation handle
  - stream chunks via Tauri events (`ai:chunk`, `ai:done`, `ai:error`)

Frontend (React):

- Provider/model selector UI + “configure provider” dialogs
- Chat UI with streaming rendering + cancel button

**Done when:** you can chat successfully with at least one provider from each “class” (OpenAI-like, Anthropic, local).

---

## Step 10 — AI context selection + payload preview + token budgeting

**Goal:** The privacy UX: selected context only, visible and controllable.

- Implement `ContextSpec`:
  - selected nodes
  - include neighbors depth (0/1/2)
  - toggles for note contents + link preview text
  - budget settings (chars/bytes with conservative token estimate)
- Implement `ContextManifest`:
  - list included items + sizes
  - exact payload preview shown to user before send
- Enforce truncation rules (titles/headers first, then body excerpts).

**Done when:** user can see exactly what will be sent, and the app refuses to send unapproved/unscoped content.

---

## Step 11 — AI actions: note rewrite diff/apply + generate notes/cards + audit log

**Goal:** Turn AI into safe editing tooling, not a black box.

- Implement note rewrite flow:
  - AI proposes full text (or patch)
  - UI shows diff (side-by-side or unified)
  - apply only on explicit approval
  - backend preserves immutable frontmatter (`id`, `created`)
- Implement “generate new note(s)/card(s)”:
  - stage output
  - user confirms creation
  - create note file + canvas node(s)
- Implement optional audit log under `cache/ai/`:
  - request metadata + context manifest (no secrets)
  - redacted payload + response
  - apply accepted/rejected state

**Done when:** AI can safely create and edit content with a clear review gate.

---

## Step 12 — macOS polish + hardening + release readiness

**Goal:** Finish the product: stability, performance, packaging.

- macOS integrations:
  - notifications for long tasks
  - menu bar status (optional)
  - global quick-open (optional; only if feasible cleanly)
- Security review:
  - verify fs scoping across all commands
  - verify network restrictions and timeouts
  - redact secrets everywhere (logs, audit log, request previews)
- Reliability:
  - crash recovery checks (temp files, `.bak` if enabled)
  - stress tests: large vaults, many nodes, long chats
- Packaging checklist:
  - icons, build config
  - signing/notarization steps documented

**Done when:** app is smooth, safe, and distributable with clear operational guardrails.
