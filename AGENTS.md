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
cd src-tauri && cargo check    # Typecheck Rust backend
cd src-tauri && cargo clippy   # Lint Rust
```
**Pre-push:** `pnpm check && pnpm build && cd src-tauri && cargo check`

## Architecture
**Glyph** — offline-first desktop note-taking app. Frontend: React 19 + TypeScript + Vite + Tailwind 4 (`src/`). Backend: Tauri 2 + Rust (`src-tauri/`). Editor: TipTap + Markdown. AI: Rig-backed multi-provider chat. UI: shadcn/ui + Radix + Motion. Storage: SQLite + filesystem in `.glyph/` folder.

## Frontend Overview (`src/`)
- `main.tsx` / `App.tsx` — Entry point, wraps `<AppShell>` in `<AppProviders>` (all contexts)
- `SettingsApp.tsx` — Separate settings window entry
- **`contexts/`** — State via React Context: `SpaceContext` (space path/lifecycle), `FileTreeContext` (files, tags, active file), `ViewContext` (active view doc), `UIContext` (sidebar, search, preview state), `EditorContext` (TipTap editor instance)
- **`components/app/`** — App shell: `AppShell`, `Sidebar`, `MainContent` (tab-based file/markdown/preview panes), `TabBar`, `CommandPalette`, `MainToolbar`, `WelcomeScreen`, `KeyboardShortcutsHelp`
- **`components/editor/`** — TipTap markdown editor: `CanvasNoteInlineEditor`, `EditorRibbon`, `extensions/`, `markdown/` serialization, `slashCommands`
- **`components/ai/`** — AI chat sidebar: `AIPanel`, `AIComposer`, `AIChatThread`, `ModelSelector`, `AIToolTimeline`, `useRigChat` hook, profiles/history hooks
- **`components/filetree/`** — File browser: `FileTreePane`, `FileTreeDirItem`, `FileTreeFileItem`, `fileTypeUtils`
- **`components/preview/`** — `FilePreviewPane` (in-app file preview), `MarkdownEditorPane`
- **`components/tasks/`** — `TasksPane`, `TaskRow`, `TaskCheckbox`
- **`components/shelf/`** — `FolderShelf` (pinned folders), `ShelfItem`
- **`components/settings/`** — Settings panes: AI, Appearance (accent, typography), Space, DailyNotes, General, About
- **`components/ui/`** — shadcn/ui primitives + `MotionButton`, `MotionPanel`, `MotionWrappers`, `animations.ts`
- **`hooks/`** — `useFileTree`, `useFileTreeCRUD`, `useViewLoader`, `useSearch`, `useFolderShelf`, `useCommandShortcuts`, `useMenuListeners`, `useDailyNote`, `useRecentFiles`
- **`lib/`** — `tauri.ts` (typed IPC wrapper — always use `invoke()` from here), `tauriEvents.ts`, `shortcuts/` (registry + platform), `views/` (view doc builders), `settings.ts`, `dailyNotes.ts`, `tasks.ts`, `diff.ts`, `errorUtils.ts`, `notePreview.ts`, `windows.ts`
- **`utils/`** — `filePreview.ts`, `path.ts`, `window.ts`
- **`styles/`** — `shadcn-theme.css`, `shadcn-base.css`, numbered CSS files in `app/`, `design-tokens.css`

## Backend Overview (`src-tauri/src/`)
- `lib.rs` / `main.rs` — Tauri setup, command registration
- **`space/`** — Space lifecycle: open/close/create, file `watcher.rs`, `state.rs`
- **`space_fs/`** — Filesystem ops: `list.rs`, `read_write.rs`, `summary.rs`, `link_ops.rs`, `view_data.rs`
- **`notes/`** — Note CRUD, `attachments.rs`, `frontmatter.rs`
- **`index/`** — SQLite index: `db.rs`, `schema.rs`, `indexer.rs`, `search_hybrid.rs`, `search_advanced.rs`, `tags.rs`, `links.rs`, `frontmatter.rs`, `tasks/`
- **`ai_rig/`** — Rig AI runtime: `runtime.rs`, `providers.rs`, `models.rs`, `tools.rs`, `commands.rs`, `events.rs`, `history.rs`, `local_secrets.rs`, `store.rs`, `context.rs`
- **`links/`** — Link fetching: `fetch.rs`, `cache.rs`, metadata extraction
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
