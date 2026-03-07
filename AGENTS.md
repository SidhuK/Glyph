# AGENTS.md

## Commands
```bash
pnpm dev            # Vite dev server (frontend only)
pnpm tauri dev      # Full Tauri app in dev mode
pnpm build          # TypeScript check + Vite build
pnpm check          # Biome lint + format check
pnpm format         # Auto-format with Biome
pnpm test           # Run all tests (vitest)
pnpm test -- src/lib/diff.test.ts          # Single test file
pnpm test -- -t "test name"               # Single test by name
cd website && pnpm dev      # Astro marketing site dev server
cd website && pnpm build    # Astro marketing site production build
cd src-tauri && cargo check    # Typecheck Rust backend
cd src-tauri && cargo clippy   # Lint Rust
```
**Pre-push:** `pnpm check && pnpm build && cd src-tauri && cargo check`

## Architecture
**Glyph** — offline-first desktop note-taking app. Frontend: React 19 + TypeScript + Vite + Tailwind 4 (`src/`). Backend: Tauri 2 + Rust (`src-tauri/`). Editor: TipTap + Markdown. AI: Rig-backed multi-provider chat plus Codex/ChatGPT account integration. UI: shadcn/ui + Radix + Motion. Storage: SQLite + filesystem in `.glyph/` folder.

Repo extras: the public Astro marketing site is stored in `website/`. Internal product and engineering docs live in `docs/`.

## Frontend Overview (`src/`)
- `main.tsx` / `App.tsx` — Entry point, wraps `<AppShell>` in `<AppProviders>` (all contexts)
- `SettingsApp.tsx` — Separate settings window entry
- **`contexts/`** — App state via React Context: `SpaceContext`, `FileTreeContext`, `ViewContext`, `UIContext`, `EditorContext`, composed in `AppProviders`
- **`components/app/`** — App shell and navigation: `AppShell`, `Sidebar`, `MainContent`, `TabBar`, `CommandPalette`, welcome flow, command search helpers
- **`components/editor/`** — TipTap markdown editor, note properties UI, extensions, markdown serialization, slash commands, editor hooks
- **`components/ai/`** — AI workspace: `AIPanel`, `AIComposer`, `AIChatThread`, `AIToolTimeline`, `ModelSelector`, history/context/profile helpers, `hooks/useRigChat`
- **`components/filetree/`** — File browser: `FileTreePane`, `FileTreeDirItem`, `FileTreeFileItem`, `fileTypeUtils`
- **`components/database/`** — Database-note UI: table/board views, source picker, column dialogs, toolbar, cells
- **`components/licensing/`** — Trial, license gate, lock screen, and settings surfaces
- **`components/preview/`** — `FilePreviewPane` (in-app file preview), `MarkdownEditorPane`
- **`components/tasks/`** — `TasksPane`, `TaskRow`, `TaskCheckbox`
- **`components/settings/`** — Settings panes: AI, Appearance (accent, typography), Space, DailyNotes, General, About
- **`components/ui/`** — shadcn/ui primitives under `shadcn/` plus shared motion helpers in `animations.ts`
- **`components/Icons/`** — Shared icon wrappers for editor, file, navigation, and action icons
- **`hooks/`** — Core app hooks such as `useFileTree`, `useFileTreeCRUD`, `useViewLoader`, `useSearch`, `useCommandShortcuts`, `useMenuListeners`, `useDailyNote`, `useRecentFiles`, plus `hooks/database/`
- **`lib/`** — `tauri.ts` (typed IPC wrapper — always use `invoke()` from here), `tauriEvents.ts`, `shortcuts/`, `views/`, `database/`, and utilities like `settings.ts`, `dailyNotes.ts`, `tasks.ts`, `diff.ts`, `errorUtils.ts`, `notePreview.ts`, `windows.ts`
- **`utils/`** — `filePreview.ts`, `path.ts`, `window.ts`
- **`styles/`** — `shadcn-theme.css`, `shadcn-base.css`, numbered CSS files in `styles/app/`; shared design tokens live in `src/design-tokens.css`

## Backend Overview (`src-tauri/src/`)
- `lib.rs` / `main.rs` — Tauri setup, command registration
- **`space/`** — Space lifecycle: open/close/create, file `watcher.rs`, `state.rs`
- **`space_fs/`** — Filesystem ops: listing, summaries, view data, link ops, and `read_write/` for text/preview/path/trash operations
- **`notes/`** — Note CRUD, attachments, frontmatter/properties helpers, and Tauri commands/types
- **`index/`** — SQLite index: schema, indexer, search, tags, links, frontmatter/properties, helpers, and `tasks/`
- **`database/`** — Database-note parsing, queries, mutations, config rendering, and shared types
- **`ai_rig/`** — Rig AI runtime: providers, models, runtime, tools, commands, events, history, audit, store, and context
- **`ai_codex/`** — Codex/ChatGPT account state, transport, chat flow, and Tauri commands
- **`license/`** — Trial/license persistence, verification, service layer, and commands
- **`links/`** — Link fetching, metadata extraction, caching, helpers, commands, and types
- `paths.rs` — Safe path joining (prevents traversal via `join_under()`)
- `io_atomic.rs` — Crash-safe atomic writes
- `net.rs` — SSRF prevention for user-supplied URLs
- `glyph_paths.rs` / `glyph_fs.rs` — `.glyph/` directory helpers
- `system_fonts.rs` — System font enumeration

## Code Style & Safety
- TypeScript strict mode, no `any` (use `unknown` + narrowing). Biome handles formatting/imports.
- Functional React components, hooks, lazy-load heavy components. State via Context (no prop drilling).
- Rust: serde for serialization, tracing for logs, atomic writes via `io_atomic::write_atomic()`.
- Aim for roughly 200 LOC per file; treat this as a guideline, not a hard rule. Don't obsess over landing exactly at 200, but do refactor into subfolders when a file is getting out of hand.
- Use `paths::join_under()` for space paths (prevent traversal). Never log secrets.
- Use `net.rs` SSRF checks for user-supplied URLs. Version durable documents (`version: 1`).
- New Tauri commands: implement in `src-tauri/src/`, register in `lib.rs`, add types to `TauriCommands` in `src/lib/tauri.ts`.

## Migration Policy
- Use a hard cutover approach and never implement backward compatibility.
