# Tether — Detailed Implementation Plan (Tauri + React + xyflow)
**Date:** 2026-01-30  
**Spec source:** `tauri_canvas_ai_spec.md`

This plan is written to build the “finished app” end-to-end in a **step-by-step** way (no “MVP stop”), while keeping the codebase continuously runnable.

---

## 0) Guiding Principles (non-negotiables)

- **Local-first:** the vault is the source of truth; app state is derived where possible.
- **Open formats:** notes are Markdown; canvases/layout are JSON; attachments are files.
- **Privacy default-deny:** nothing leaves the machine unless the user explicitly triggers it and sees the exact payload.
- **Safety:** atomic writes, crash-safe recovery, no silent data loss.
- **Performance:** smooth canvas interactions; indexing + previews are async and cancelable.

---

## 1) What “Done” Looks Like (feature checklist)

### Vault & storage
- Create/open vault anywhere; enforce recommended structure.
- Vault-scoped filesystem access; reject path traversal.
- `vault.json` settings + schema versioning + migrations.

### Notes
- Markdown editor with YAML frontmatter (`id`, `title`, `created`, `updated`, `tags`).
- Fast search (title + full text).
- Backlinks panel.
- Attachments copied into `assets/` and referenced from notes/canvas.
- Optional wikilinks (`[[...]]`) support.

### Canvas
- Infinite canvas with pan/zoom; multi-select.
- Nodes: note, text, link.
- Edges with optional labels.
- Groups/frames; align/distribute; snap-to-grid toggle.
- Open note from node; editor pane.

### Link cards
- URL paste → link card.
- Preview fetch + cache: title/desc/image; favicon/hostname.
- YouTube: title + thumbnail (transcripts optional later).
- Robust fallback if fetch fails.

### AI
- Chat sidebar with provider + model selector.
- Providers supported:
  - OpenAI
  - OpenAI-compatible (custom base URL + optional headers)
  - OpenRouter (treated as OpenAI-compatible + convenience UI)
  - Anthropic
  - Google (Gemini)
  - Local Ollama
- “Selected context” controls: selected nodes only; optionally include neighbors depth 1/2.
- Explicit “payload preview” of exactly what will be sent.
- Token budget + truncation/summarization rules.
- AI actions: summarize, action items, compare/merge ideas, generate notes/cards, rewrite notes with **diff preview + explicit apply**.
- Optional local audit log stored under `cache/`.

### macOS integrations (spec-marked optional, but included here)
- Native dialogs for vault + attachments.
- Notifications for long tasks (indexing/previews/AI).
- Menu bar status (optional).
- Global quick-open (optional; implement if feasible with Tauri/global shortcuts).

---

## 2) Repo Layout (recommended)

We’ll use the spec’s suggested monorepo layout:

```
app/
  src/                 # React frontend
  src-tauri/           # Rust backend
  package.json
  pnpm-lock.yaml
  vite.config.ts
  tsconfig.json
```

Why: aligns with Tauri conventions; clean boundary between UI and local services.

---

## 3) Data Formats & Versioning

### 3.1 Vault structure (on disk)

```
MyVault/
  notes/
  canvases/
  assets/
  cache/
  vault.json
```

### 3.2 `vault.json` (vault-level metadata)
Proposed schema (versioned):

```json
{
  "version": 1,
  "vaultId": "uuid",
  "created": "ISO-8601",
  "updated": "ISO-8601",
  "defaults": {
    "canvasId": "main"
  }
}
```

Notes:
- Store only vault metadata here. **App preferences** (recent vaults, UI layout) should live in app settings (not in vault) unless explicitly “portable config” is desired.

### 3.3 Notes (Markdown + YAML frontmatter)
- Stored in `notes/`.
- YAML frontmatter must include stable `id` (UUID).
- `created` immutable; `updated` changes on write.

**Filename convention (recommended):** `notes/<slug>-<id>.md`
- Human-friendly while remaining stable/unique.
- Index always resolves by `id`, never by filename.

### 3.4 Canvas (JSON, versioned)
- Stored in `canvases/<canvasId>.json`
- Nodes reference note IDs (not filenames).
- `preview` payload for link cards includes cached title/desc and optionally local image path.

**Derived assets:** any refetchable preview images should default to `cache/` (safe to delete). If you want previews to be “portable offline”, store them under `assets/` instead (decision point in §12).

### 3.5 Migrations
We’ll implement explicit migrations for:
- `vault.json` schema version
- canvas JSON schema version
- (optional) note frontmatter schema evolution (add new fields without breaking old notes)

---

## 4) Backend Architecture (Rust/Tauri)

### 4.1 Core crates / modules (suggested)

- `vault`
  - open/create vault
  - validate structure
  - schema migrations
  - keep current vault root in app state
- `paths`
  - safe joins
  - “must be within vault root” enforcement (prevents traversal)
- `io_atomic`
  - atomic write (temp → fsync → rename)
  - optional `.bak` snapshots
- `notes`
  - list/read/write/create/delete
  - frontmatter parsing + normalization
  - attachment helpers (copy into `assets/`)
- `canvas`
  - list/read/write
  - schema validation + migrations
- `index`
  - incremental indexing
  - backlinks extraction
  - SQLite FTS5 search engine adapter (keep an interface for future swaps)
- `links`
  - URL normalization/validation
  - OpenGraph/HTML parsing
  - preview image download + cache
- `ai`
  - provider abstraction
  - context bundling + payload preview
  - streaming + cancellation
  - audit log writer (to `cache/`)
- `secrets`
  - Keychain integration for API keys/tokens
  - never store keys in the vault
- `events`
  - emit Tauri events (index progress, preview ready, AI stream chunks)

### 4.2 Tauri Commands (public backend API)

We’ll define stable command namespaces (examples; refine as we implement):

**Vault**
- `vault_open(path)`
- `vault_create(path)`
- `vault_get_current()`
- `vault_recent_list()` (from app settings, not vault)

**Notes**
- `notes_list()`
- `note_create({ title? })`
- `note_read({ id })`
- `note_write({ id, markdown })`
- `note_delete({ id })`
- `note_attach_file({ id, sourcePath })` → returns asset path + inserted markdown snippet helper

**Canvas**
- `canvas_list()`
- `canvas_read({ canvasId })`
- `canvas_write({ canvasId, canvasJson })`

**Index/Search**
- `search({ query })`
- `backlinks({ noteId })`
- `index_status()`
- `index_rebuild()` (manual)

**Links**
- `link_preview({ url })`
- `link_preview_refresh({ url })`

**AI**
- `ai_providers_list()` (built-ins + user-defined OpenAI-compatible entries)
- `ai_models_list({ providerId })` (if supported; else manual)
- `ai_chat_start({ providerId, model, settings })`
- `ai_chat_send({ conversationId, userMessage, contextSpec })`
- `ai_cancel({ conversationId })`
- `ai_apply_note_edit({ noteId, patchOrFullText })` (used only after UI diff approval)

**Secrets**
- `secret_set({ keyId, value })`
- `secret_delete({ keyId })`
- `secret_status({ keyId })` (boolean only)

### 4.3 File watching
Use `notify` to watch:
- `notes/` for external edits
- `canvases/` (optional; depends on conflict strategy)

On change:
- re-index affected note(s)
- emit event to UI (“file changed externally”) and provide reload actions

### 4.4 Security model in backend
- Enforce “vault root” for every filesystem access.
- Enforce URL allow/deny:
  - allow only `http(s)` for link previews + AI
  - block `file://`, `localhost` optionally (decision), private IP ranges optionally (decision)
- Put strict timeouts and size limits on HTML/image downloads.
- Redact secrets from logs.

### 4.5 Async + Concurrency Patterns (Tokio / Tauri)

Goal: keep the UI responsive, avoid blocking the async runtime, and make long-running work cancelable.

- Prefer `tauri::async_runtime` for spawning background work from commands (keeps us aligned with Tauri’s runtime).
- Treat these as **CPU-bound** and run via `spawn_blocking` (or a dedicated worker pool):
  - markdown parsing across many files (index rebuild)
  - diff generation for large notes
  - canvas validation/migrations for very large canvases
- Treat these as **I/O-bound** and run async:
  - network fetches for link previews and AI calls (use strict timeouts)
  - reading/writing individual notes/canvases (still keep atomic write path synchronous + minimal)
- Use bounded concurrency for fan-out work:
  - link preview refreshes
  - indexing across many notes
  - model listing across providers
  (e.g., `buffer_unordered(limit)` patterns)
- Use explicit cancellation:
  - store a per-job cancellation handle (e.g., for indexing, preview fetch, AI streaming)
  - implement cancel via `tokio::select!` between “work” and “cancel”
- For progress + streaming:
  - internal `mpsc`/`watch` channels for job status (latest state + incremental updates)
  - forward progress/stream chunks to the frontend via Tauri events

---

## 5) Frontend Architecture (React/TypeScript)

### 5.1 UI layout (recommended)
- Left sidebar: vault explorer + search + backlinks
- Center: canvas (xyflow)
- Right pane: note editor + inspector (tabs)
- Chat sidebar: dockable right or bottom

### 5.2 State management
Use a small store (e.g., Zustand) with slices:
- `vaultSlice` (current vault, recent vaults)
- `notesSlice` (note list, active note, dirty state)
- `canvasSlice` (nodes/edges/groups, selection, undo/redo)
- `indexSlice` (search results, backlinks, progress)
- `aiSlice` (providers, models, conversations, streaming state)
- `settingsSlice` (UI prefs, snap-to-grid default, etc.)

### 5.3 Editor
- CodeMirror 6 markdown editor.
- Autosave: debounce + “saved” indicator.
- Preview/renderer optional (split view later).

### 5.4 Canvas (xyflow / `@xyflow/react`)
Implement custom node components:
- `NoteNode` (title + snippet; open note)
- `TextNode` (sticky)
- `LinkNode` (URL + preview state)

Core interactions:
- pan/zoom, selection, multi-select
- connect edges with handles
- edge labels
- snap-to-grid toggle
- align/distribute for selection
- groups/frames (either as a node type, or custom overlay layer)
- undo/redo (critical) for canvas edits

### 5.5 Diff preview for AI edits
- Show side-by-side or unified diff for markdown
- Apply only after explicit approval
- Preserve immutable frontmatter fields (`id`, `created`) even if AI proposes changes

### 5.6 Tauri Path Handling (Frontend)

If any code in the webview needs path operations (app dirs, logs, display), follow these rules:

- Use `@tauri-apps/api/path` for join/dirname/basename/normalize; **do not** use Node’s `path` module in the webview.
- All Tauri path functions are **async**; always `await` them.
- Never build filesystem paths via string concatenation (avoid hardcoded `/` in real path ops).
- Prefer passing “high-level intents” to the backend (e.g., `note_attach_file`) instead of performing vault filesystem operations directly in the frontend.

### 5.7 React + TypeScript Best Practices (Performance + Maintainability)

- Keep Zustand subscriptions narrow (selectors for primitives/derived booleans) to avoid cascading re-renders, especially for canvas state.
- Memoize expensive or frequently-rendered components:
  - `NoteNode` / `LinkNode` / `TextNode` should use `React.memo` with stable props and avoid recreating objects each render.
- Prefer code-splitting for heavyweight UI:
  - lazy-load CodeMirror editor pane and possibly the chat sidebar (load on first open).
- Avoid barrel imports for heavy libs where it impacts bundle size; import from specific entrypoints.
- Prefer `interface` for React props, `type` for unions/intersections, and avoid `any`/implicit `any` in command payloads (define shared DTOs).

---

## 6) Search + Backlinks: Implementation Approach

We want high quality here without over-committing to one engine.

### 6.1 Index outputs we need
- `noteMetaById`: id → { title, tags, updated, path }
- `noteTextById`: derived full text (stored in FTS5; avoid keeping all content in memory)
- `outgoingLinksById`: id → [noteId]
- `backlinksById`: id → [noteId]

### 6.2 Pluggable search engine interface
Define a trait/interface:
- `index_note(id, markdown, meta)`
- `remove_note(id)`
- `search(query) -> [{id, score, highlights}]`
- `persist()` / `load()`

### 6.3 Engine choice
We’ll implement **SQLite + FTS5 from the start**:
- Store the derived index at `cache/index.sqlite` (safe to delete; rebuildable).
- Use explicit schema migrations for changes.
- Keep the search layer behind a small adapter interface so we can swap engines later if needed.

Even though we’re not “stopping at MVP”, this keeps early steps shippable while preserving an upgrade path.

---

## 7) Link Preview System (robust + cached)

### 7.1 Preview fetch pipeline
1. Normalize URL (strip tracking params optionally; decision).
2. Fetch HTML with timeout + max size.
3. Parse:
   - OpenGraph title/description/image
   - fallback to `<title>` and meta description
4. Resolve relative image URLs.
5. Download image with size cap; store to `cache/link-previews/<hash>.<ext>` (or `assets/` if chosen).
6. Return preview object:

```json
{
  "url": "...",
  "title": "...",
  "description": "...",
  "hostname": "...",
  "faviconUrl": "...",
  "imagePath": "cache/link-previews/....png",
  "fetchedAt": "ISO-8601"
}
```

### 7.2 Failure modes
- Network error → store negative cache entry (short TTL) to avoid refetch loops.
- Parse error → fallback to hostname + URL.
- Image too large → skip image, keep text preview.

### 7.3 YouTube
Start with metadata-only:
- title + thumbnail (via OG tags or standard metadata)
- transcript support is explicitly “later”

---

## 8) AI System (multi-provider, privacy-forward)

### 8.1 Provider model
We’ll treat providers as “profiles”:

- Built-in provider types:
  - `openai`
  - `openai_compatible`
  - `openrouter` (wrapper around openai_compatible)
  - `anthropic`
  - `google_gemini`
  - `ollama`

Each profile includes:
- `id`, `displayName`
- `type`
- `baseUrl` (for openai_compatible/openrouter/ollama)
- `apiKeyRef` (keychain key id) when applicable
- optional `headers` (openrouter + custom providers)
- optional `defaultModel`
- feature flags: streaming, models endpoint supported, max context, etc.

### 8.2 Common internal request format
Normalize inbound chat into a unified structure:
- messages: `{ role: "system"|"user"|"assistant", content: [{ type: "text", text: "..." }] }`
- context manifest (see below)
- request options: temperature, max tokens, etc.

Provider adapters translate to/from:
- OpenAI (and compatible)
- Anthropic
- Google
- Ollama

### 8.3 Context selection + payload preview (core privacy UX)
We implement:
- `ContextSpec`:
  - selected node ids
  - include neighbors depth (0/1/2)
  - include note content yes/no
  - include link previews yes/no
  - max bytes/tokens budget
- `ContextManifest` (what UI shows):
  - list of included items
  - per-item size estimate
  - final payload preview string (or structured blocks)

Rules:
- By default: **only selected nodes**.
- Neighbor inclusion is explicit and visible.
- UI must show “exactly what will be sent” before send.

### 8.4 Token/size budgeting
Cross-provider tokenization differs; we’ll implement:
- a conservative estimate based on characters/bytes
- optional provider-specific token estimation where easy

Truncation strategy:
1. prefer including titles/headers over full bodies
2. include recent sections (or first N chars)
3. if still too big, auto-summarize locally is not possible; instead:
   - ask user to reduce selection, or
   - allow “AI summarizes selected notes first” as a two-step flow (still explicit)

### 8.5 Streaming + cancellation
- Backend provides streaming chunks via Tauri events.
- UI renders incremental tokens.
- Provide cancel button; backend aborts request.

### 8.6 Audit log (optional)
Stored under `cache/ai/`:
- timestamp, provider id, model
- context manifest (without secrets)
- redacted request/response
- user actions (apply edit accepted/rejected)

### 8.7 AI-driven note edits
Implement “edit pipeline”:
1. AI proposes new note content (or patch) in response.
2. UI shows diff.
3. User approves.
4. Backend writes with atomic write, preserves immutable frontmatter.

Also support “generate new note/card”:
- AI output is staged; user confirms; then create note + add canvas node.

---

## 9) Permissions, Scopes, and Security (Tauri)

### 9.1 Filesystem
- Restrict fs access to the chosen vault root.
- Never allow arbitrary path reads/writes outside vault.
- Ensure all plugin usage (fs/dialog) respects the vault scoping.

### 9.2 Network access
We only perform network calls in two areas:
- link previews
- AI provider requests

Hardening steps:
- explicit allow for `http(s)` only
- timeouts and size caps
- optional domain/IP restrictions (decision)

### 9.3 Secrets
- Keys stored in macOS Keychain via backend.
- Frontend never persists raw keys; it only sets/clears them through commands.
- Audit logs and request previews never include secrets.

---

## 10) Reliability: Autosave, Recovery, Conflicts

### 10.1 Notes autosave
- Debounced write on edit.
- Show status: “Saving…” → “Saved”.
- If write fails, show banner with retry.

### 10.2 Canvas autosave
- Debounce canvas JSON writes.
- Maintain an in-memory dirty flag + periodic flush.

### 10.3 Crash-safe recovery
- Atomic write routine.
- Optionally keep last-known-good `.bak` file for notes/canvas.
- On startup: detect incomplete temp files; clean safely.

### 10.4 External edits (file watcher)
- If active note changed externally:
  - prompt user to reload/merge
  - preserve unsaved changes via local “draft buffer”

---

## 11) Testing & Quality Bar

### Rust
- Unit tests for:
  - path scoping / traversal rejection
  - frontmatter parsing/normalization
  - canvas schema validation
  - URL normalization + allow/deny
- Integration tests for atomic write behavior (temp + rename).

### Frontend
- Component tests for:
  - editor save flow
  - diff preview apply/reject
  - canvas node rendering
- (Optional) e2e tests later (Tauri + Playwright) if setup is reasonable.

### Performance validation
- Canvas: ensure pan/zoom stays smooth with hundreds of nodes.
- Indexing: background thread; progress events; cancel/rebuild.

---

## 12) Step-by-Step Build Plan (phases)

Each phase ends with a runnable app state; no “MVP freeze”, just continuous layering.

### Phase 1 — Scaffold + shared foundations
- Scaffold Tauri + Vite + React + TypeScript + pnpm.
- Add core UI shell (left/center/right + chat dock placeholder).
- Add Rust app state for “current vault”.
- Add a typed command wrapper in TS (`invokeTyped`).
- Add structured logging + UI error/toast system.

**Exit criteria:** app launches, panes render, backend command roundtrip works.

### Phase 2 — Vault open/create + scoped IO
- Implement vault create/open with structure validation + `vault.json`.
- Implement safe path join + “must be inside vault root”.
- Add native folder picker + “recent vaults”.
- Add atomic write utility and use it for all writes.

**Exit criteria:** vault can be created/opened; all IO is vault-scoped.

### Phase 3 — Notes system (complete)
- Implement note create/read/write/list/delete.
- Implement frontmatter normalization and metadata extraction.
- Implement CodeMirror editor with autosave and dirty-state UX.
- Implement attachments: pick file → copy into `assets/` → insert markdown link.
- Implement optional wikilinks parsing + navigation strategy (see decisions).

**Exit criteria:** full notes workflow stable, on-disk markdown correct.

### Phase 4 — Canvas system (complete)
- Add xyflow canvas with pan/zoom, selection, multi-select.
- Implement node types: note/text/link.
- Implement edges with labels.
- Implement groups/frames, snap-to-grid toggle, align/distribute.
- Implement undo/redo for canvas operations.
- Implement canvas persistence: read/write JSON; schema validation + migrations.

**Exit criteria:** canvas features match spec; reload preserves layout reliably.

### Phase 5 — Indexing, search, backlinks (complete)
- Implement index builder:
  - parse notes for links
  - build backlinks map
  - create SQLite FTS5 search index adapter (schema + migrations in `cache/index.sqlite`)
- Add file watcher; incremental updates on external edits.
- Build search UI + backlinks panel.

**Exit criteria:** fast search + backlinks that update with edits.

### Phase 6 — Link previews (complete)
- Implement preview fetcher with caching and robust fallback.
- Integrate into LinkNode lifecycle: paste URL → show pending → update preview.
- Add “refresh preview” and negative-cache TTL behavior.
- Add YouTube special-casing (metadata only).

**Exit criteria:** link cards are reliable and don’t hang the UI.

### Phase 7 — AI foundations (providers + secrets + streaming)
- Implement Keychain secret store and UI for provider keys.
- Implement provider profile system + persistence (app settings).
- Implement adapters for:
  - OpenAI
  - OpenAI-compatible (custom base URL + headers)
  - OpenRouter (preset + convenience UI)
  - Anthropic
  - Google Gemini
  - Ollama
- Implement streaming + cancellation end-to-end.

**Exit criteria:** chat works with multiple providers, streaming is smooth, keys are secure.

### Phase 8 — AI context + actions (complete)
- Implement context selection controls:
  - selected nodes only
  - neighbor depth 1/2
  - include linked metadata toggles
- Implement payload preview UX (exact content shown before send).
- Implement token/size budgeting + truncation rules.
- Implement actions:
  - summarize selected notes
  - extract TODOs
  - compare ideas / propose merges
  - generate new note(s) + canvas nodes (staged + approved)
  - rewrite note with diff preview + apply
- Implement optional audit logging under `cache/ai/`.

**Exit criteria:** AI is powerful, privacy-forward, and never edits without approval.

### Phase 9 — macOS integrations + polish
- Notifications for long tasks.
- Menu bar status (optional) showing vault open/index status.
- Global quick-open (optional) if feasible within Tauri’s shortcut APIs.
- UX polish: keyboard shortcuts, command palette, empty states, performance tuning.

**Exit criteria:** feels like a native-quality macOS tool.

### Phase 10 — Hardening + packaging
- Permission review (fs/network) and explicit deny-by-default posture.
- Stress test: large vaults, many nodes, long AI chats.
- Packaging: icons, signing/notarization checklist, release builds.

**Exit criteria:** distributable build with strong safety guarantees.

---

## 13) Open Decisions / Questions (to confirm early)

1. **AI request location:** should all AI + link preview network requests run in **Rust backend** (recommended), or is JS acceptable for some?
2. **Wikilinks format:** do we keep `[[Title]]` purely as a convenience (resolved via index), or do we standardize on an ID-backed link like `[Title](tether://note/<id>)` for true stability?
3. **Preview image storage:** `cache/` (rebuildable) vs `assets/` (portable/offline). Default in this plan is `cache/`.
4. **Network hardening:** should we block localhost/private IP ranges by default for previews/AI endpoints, with an override for advanced users?
5. **Search engine target:** use SQLite FTS5 from day one (`cache/index.sqlite`), and treat it as derived/rebuildable.
