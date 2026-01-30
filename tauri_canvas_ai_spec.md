# Tether

## Local‑First Canvas Notes + AI Agent (macOS) — Tauri Spec

> Personal, local-only macOS app. Notes and canvas live in an open on-disk “vault” (Markdown + JSON).  
> AI is opt-in: only selected content is sent to the chosen provider.

---

## 1) Goals

- **Local-first**: everything stored in a user-chosen folder on disk.
- **Open formats**: Markdown for notes, JSON for canvas/layout/metadata, files for attachments.
- **Fast + lightweight**: Tauri backend, minimal RAM usage, predictable performance.
- **AI-assisted thinking**: chat with selected notes/cards, generate insights, summaries, refactors, and links.
- **Canvas-native workflow**: infinite canvas, nodes/cards, connections, groups, zoom/pan, multi-select.
- **Zero lock-in**: vault can be opened in any editor, git, grep, etc.

## 2) Non-goals

- Real-time collaboration / multi-user.
- Cloud sync (could be layered later, but not in scope for this spec).
- “Perfect embeds for every website” (we’ll do robust link preview + graceful fallback).

---

## 3) “Finished App” Core Features

### 3.1 Vault & Storage

- Create/open a **vault folder** anywhere (e.g., `~/Documents/MyVault`).
- Vault structure (recommended):

  ```
  MyVault/
    notes/                 # markdown notes
    canvases/              # one or more canvas json files
    assets/                # images, PDFs, pasted files
    cache/                 # derived data (safe to delete)
    vault.json             # vault-level metadata/settings
  ```

- Notes are plain **Markdown** with YAML frontmatter containing a stable `id` (UUID).
- Canvas layout is stored as JSON referencing note IDs (not filenames).
- Attachments are copied into `assets/` with stable naming and referenced from notes/canvas.

### 3.2 Notes

- Create/edit Markdown notes with:
  - YAML frontmatter management (id, title, created/updated, tags).
  - Basic Markdown: headings, lists, code blocks, links, images.
  - Wikilink-style linking optional (`[[Note Title]]`) with resolution by `id`.
- Quick search across notes (title + full text).
- Backlinks panel (notes that link to the current note).

### 3.3 Canvas

- Infinite canvas with:
  - Pan/zoom (trackpad + keyboard).
  - Node cards for notes, link previews, and “text blocks”.
  - Multi-select, group/frames, align/distribute, snap-to-grid (toggle).
  - Edges (connections) with optional labels.
  - “Open note” from card; editing occurs in an editor pane.

Node types:

- **Note card**: references `noteId`.
- **Link card**: stores `url` + cached preview metadata.
- **Text card**: lightweight sticky note stored in canvas JSON.

### 3.4 Link Cards (Web/YouTube)

- Paste a URL → create a link card.
- Fetch and cache:
  - title, description, image (OpenGraph where available)
  - site hostname + favicon (optional)
- YouTube:
  - title + thumbnail from metadata (transcript as an optional add-on later)

Fallback:

- If preview fetch fails, show the URL with hostname; still usable.

### 3.5 AI Chat & “Selected Context”

- Chat sidebar with:
  - Provider selector (OpenAI / Anthropic / Google / local Ollama etc.).
  - Model selector (per provider).
  - “Context scope”: selected nodes only, optionally include linked neighbors (depth 1/2).
  - Token budget + truncation/summarization rules.
- AI capabilities:
  - Summarize selected notes.
  - Extract action items / TODOs.
  - Compare ideas; find conflicts; propose merges.
  - Generate new notes/cards (user-approved).
  - Rewrite/edit selected notes (diff preview + user approval).
- **Privacy guardrails**:
  - Nothing is sent unless content is selected.
  - Clear UI that shows exactly what will be sent.
  - Optional local “audit log” per conversation (stored in `cache/`).

### 3.6 System Integrations (macOS)

- Native file pickers (open vault, attach files).
- Notifications (optional: AI finished, long indexing finished).
- Global quick-open (optional).
- Menu bar status (optional).

---

## 4) Security & Privacy Model

- Default stance: **deny**.
- Use Tauri allowlists/scopes for:
  - filesystem access (restricted to the vault)
  - network access (only for explicit link previews + AI requests)
- Store API keys locally:
  - macOS Keychain (recommended)
  - Never commit keys into vault files

---

## 5) Data Formats

### 5.1 Note format (Markdown)

Example:

```md
---
id: 7d2f5e0a-2b2c-4f9b-9c5a-8d8b9e1f3d2a
title: Project Ideas
created: 2026-01-30T10:12:00+05:30
updated: 2026-01-30T10:12:00+05:30
tags: [ideas, projects]
---

# Project Ideas

- …
```

### 5.2 Canvas format (JSON)

Example:

```json
{
  "version": 1,
  "canvasId": "main",
  "nodes": [
    {
      "id": "node-1",
      "type": "note",
      "noteId": "7d2f…",
      "x": 120,
      "y": 90,
      "w": 340,
      "h": 220
    },
    {
      "id": "node-2",
      "type": "link",
      "url": "https://example.com",
      "x": 560,
      "y": 120,
      "w": 360,
      "h": 220,
      "preview": {
        "title": "Example",
        "description": "…",
        "imagePath": "assets/previews/example.png"
      }
    }
  ],
  "edges": [
    { "id": "edge-1", "from": "node-1", "to": "node-2", "label": "reference" }
  ],
  "groups": [
    { "id": "group-1", "title": "Research", "nodeIds": ["node-1", "node-2"] }
  ]
}
```

---

## 6) Recommended Tech Stack

### 6.1 Backend (Tauri + Rust)

- Tauri (Rust backend) for:
  - vault file IO (read/write notes, save canvas)
  - indexing/search (fast text search, optional FTS)
  - link preview fetching/parsing (optional; can be JS too)
  - AI requests (optional; can be JS too)
  - permissions/scopes and native integrations

Rust modules (suggested):

- `vault`: vault discovery, structure, migrations
- `notes`: CRUD + frontmatter
- `canvas`: CRUD + validation
- `index`: search + backlinks + incremental indexing
- `links`: metadata fetching + caching
- `ai`: provider client + context bundler + token budget

### 6.2 Frontend (TypeScript)

Because you’ve chosen **xyflow / React Flow** for the canvas, the practical choice is **TypeScript + React** (xyflow’s React package is `@xyflow/react`).

If you ever switch canvas tech, the rest of the frontend can stay mostly framework-agnostic.

UI responsibilities:

- canvas rendering & interactions
- markdown editor UI
- chat UI, provider/model picker
- vault explorer, search, backlinks, inspector

---

## 7) Libraries / Packages

Below are packages you will almost certainly want. Framework choice (React/Svelte/Vue/etc.) is separate.

### 7.1 Core Build & Tooling

- `@tauri-apps/cli` (dev/build)
- `@tauri-apps/api` (frontend bindings)
- `vite` (frontend bundling)
- `typescript`
- `pnpm` (recommended package manager)

### 7.2 Tauri Plugins (official, pick what you need)

- `@tauri-apps/plugin-fs` (scoped fs utilities, path helpers)
- `@tauri-apps/plugin-dialog` (native open/save dialogs)
- `@tauri-apps/plugin-http` (HTTP client from the backend side if desired)
- `@tauri-apps/plugin-store` (small persistent key-value store for app settings)
- `@tauri-apps/plugin-notification` (optional)
- `@tauri-apps/plugin-os` (optional)

### 7.3 Canvas / Graph Layer (PRIMARY: xyflow / React Flow)

You said you want **xyflow**. Treat this as the default canvas engine.

**Primary (recommended)**

- `@xyflow/react` (React Flow) — node-based editors, ports/handles, edges, snapping, selection, minimap/controls, etc.

**Optional add-ons (only if you need them)**

- Layout helpers (DAG / force layouts) — pick later based on your diagrams.
- If you ever want a freeform “whiteboard” feel instead of a node graph, alternatives exist, but that’s not the goal here.

Notes:

- React Flow v12+ uses the **new package name** `@xyflow/react` (older installs used `reactflow`). This matters when you scaffold/import.

### 7.4 Markdown Editing + Parsing

- Editor UI (pick one):
  - CodeMirror 6 packages (recommended)
  - Monaco editor (heavier)
- Parsing/transform:
  - `remark` / `rehype` ecosystem
  - `gray-matter` (YAML frontmatter parsing)

### 7.5 Local Search / Index

- Simple (start here): ripgrep-like scanning in Rust/JS
- More powerful (optional):
  - SQLite + FTS5 (store an index in `cache/`)
  - Rust search libs (e.g., Tantivy) if you want

### 7.6 AI Providers (pick what you actually use)

- OpenAI: `openai` SDK (or direct fetch)
- Anthropic: `@anthropic-ai/sdk` (or direct fetch)
- Google Gemini: official SDK (or direct fetch)
- Local: Ollama HTTP API (direct fetch)

(For personal use, direct `fetch` is fine; SDKs are optional.)

---

## 8) Version Pinning (fill in when you scaffold)

Pin these in your project templates; update intentionally:

- Tauri core + CLI
- Node (LTS)
- Rust stable
- Vite
- TypeScript
- pnpm
- **@xyflow/react** (React Flow)

Use `pnpm up --latest` and `cargo update` periodically, but only after committing.

---

## 9) Project Layout (repo)

Suggested mono-repo:

```
app/
  src/                 # frontend
  src-tauri/           # rust backend
  package.json
  pnpm-lock.yaml
  vite.config.ts
  tsconfig.json
```

---

## 10) Quality Bar

- Instant-feeling interactions on canvas (smooth pan/zoom, minimal jank).
- Vault operations are safe and atomic:
  - write to temp → fsync → rename
- No silent data loss:
  - autosave with debounce
  - crash-safe recovery
- AI actions always preview diffs before applying.

---

## 11) Future Extensions (optional)

- Git integration (commit snapshots, diff view).
- “Context graph” mode: include neighbors automatically.
- Pluggable “card types” (PDF, image gallery, code snippet, etc.).
- Local embeddings (if you want offline semantic search later).
