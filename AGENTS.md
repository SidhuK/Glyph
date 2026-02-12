# AGENTS.md

Guidance for AI code agents working in this repository.

## Primary Goals

- Make the smallest correct change that matches the intent
- Code LOC should not exceed 200 lines per file; refactor into subfolders as needed
- Keep the app offline-first and vault-backed (filesystem + local SQLite)
- Preserve type-safety across the Tauri IPC boundary (frontend ↔ backend)
- Prefer crash-safe / atomic writes for user data

## Commands

```bash
pnpm dev              # Vite dev server (frontend only)
pnpm tauri dev        # Full Tauri app in dev mode
pnpm build            # TypeScript check + Vite build
pnpm check            # Biome lint + format check
pnpm format           # Auto-format with Biome

cd src-tauri && cargo check   # Typecheck Rust backend
cd src-tauri && cargo clippy  # Lint Rust
```

**Before pushing:** `pnpm check && pnpm build && cd src-tauri && cargo check`

## Architecture Overview

**Lattice** is a desktop note-taking app with a node-based canvas editor.

| Layer | Tech | Location |
|-------|------|----------|
| Frontend | React 19 + TypeScript + Vite | `src/` |
| Backend | Tauri 2 + Rust | `src-tauri/` |
| Canvas | @xyflow/react | `src/components/canvas/` |
| Editor | TipTap + Markdown | `src/components/editor/` |
| AI | Rig-backed multi-provider chat with tool use (`rig.rs`) | `src/components/ai/` + `src-tauri/src/ai_rig/` |
| UI | shadcn/ui + Motion (Framer Motion) | `src/components/ui/` |
| Storage | SQLite + Filesystem | `.lattice/lattice.sqlite` |

## Key Frontend Files

### Entry Points
- `src/main.tsx` — React app entry, renders `<App />`
- `src/App.tsx` — Wraps app in `<AppProviders>` (contexts)
- `src/SettingsApp.tsx` — Settings window entry

### Contexts (`src/contexts/`)
State management via React Context (no prop drilling):

| Context | Purpose |
|---------|---------|
| `VaultContext` | Vault path, recent vaults, open/close/create actions |
| `FileTreeContext` | File tree state, tags, active file |
| `ViewContext` | Active view doc, canvas loaders |
| `UIContext` | Sidebar, AI sidebar, search, preview state |
| `EditorContext` | Active TipTap editor instance state |

### App Shell (`src/components/app/`)
- `AppShell.tsx` — Main layout, consumes all contexts
- `Sidebar.tsx` / `SidebarContent.tsx` / `SidebarHeader.tsx` — File tree or tags view
- `MainContent.tsx` — Canvas area + welcome screen
- `MainToolbar.tsx` — Top toolbar controls
- `CommandPalette.tsx` — Cmd+K command palette
- `KeyboardShortcutsHelp.tsx` — Shortcut reference overlay
- `WelcomeScreen.tsx` — Shown when no vault is open

### Canvas (`src/components/`)
- `CanvasPane.tsx` — Main ReactFlow canvas
- `CanvasNoteInlineEditor.tsx` — Inline note editing on canvas

### AI (`src/components/ai/`)
- `AIPanel.tsx` — AI chat sidebar
- `AIFloatingHost.tsx` — Floating AI entry point
- `ModelSelector.tsx` — Model picker (multi-provider)
- `AIToolTimeline.tsx` — Tool call timeline display
- `hooks/useRigChat.ts` — Rig/Tauri chat state + streaming
- `useAiContext.ts` / `useAiHistory.ts` / `useAiProfiles.ts` — AI state

### Editor (`src/components/editor/`)
- `CanvasNoteInlineEditor.tsx` — TipTap editor in canvas nodes
- `EditorRibbon.tsx` — Formatting toolbar
- `extensions/` — Custom TipTap extensions
- `hooks/` — Editor-specific hooks
- `markdown/` — Markdown serialization
- `slashCommands.ts` — Slash command menu

### File Tree (`src/components/filetree/`)
- `FileTreePane.tsx` / `FileTreeItem.tsx` — File browser
- `fileTypeUtils.ts` — File type detection

### Preview & Shelf
- `src/components/preview/` — File preview, markdown editor panes
- `src/components/shelf/` — Folder shelf (pinned folders)

### Settings (`src/components/settings/`)
- `AiSettingsPane.tsx` — AI provider/model configuration
- `VaultSettingsPane.tsx` — Vault settings

### UI Components (`src/components/ui/`)
- `MotionButton.tsx` / `MotionPanel.tsx` / `MotionWrappers.tsx` — Animated UI components
- `animations.ts` — Shared animation configs
- `shadcn/` — shadcn/ui base components
- `button.tsx` / `command.tsx` / `dialog.tsx` — Core UI primitives

### Key Hooks (`src/hooks/`)
- `useViewLoader.ts` — View document loading (folder/search/tag)
- `useFileTree.ts` — File tree operations
- `useSearch.ts` — Search state
- `useFolderShelf.ts` — Folder shelf state
- `useCommandShortcuts.ts` — Global keyboard shortcuts
- `useMenuListeners.ts` — Native menu event listeners

### Lib (`src/lib/`)
- `tauri.ts` — Typed IPC wrapper; always use `invoke()` from here
- `tauriEvents.ts` — Tauri event listeners
- `shortcuts/` — Keyboard shortcut registry (`registry.ts`, `platform.ts`)
- `views/` — View document builders, persistence, sanitization
- `canvasLayout.ts` — Canvas auto-layout algorithms
- `canvasConstants.ts` / `canvasFlowTypes.ts` — Canvas type definitions
- `diff.ts` — Text diffing utilities
- `notePreview.ts` — Note preview generation
- `settings.ts` — App settings helpers
- `windows.ts` — Multi-window management
- `errorUtils.ts` — Error handling utilities

### Styles (`src/styles/`)
- `shadcn-theme.css` / `shadcn-base.css` — shadcn/ui theming
- `app/` — 25 numbered CSS files (bundled into one by Vite; no perf concern)
- `src/design-tokens.css` — Design token variables
- Module CSS: `*.module.css` files co-located with components

## Key Backend Files (`src-tauri/src/`)

| Module | Purpose |
|--------|---------|
| `lib.rs` | Tauri setup, command registration |
| `vault/` | Vault lifecycle, file watching (`watcher.rs`, `state.rs`) |
| `vault_fs/` | Filesystem operations (list, read, write, summary) |
| `notes/` | Note CRUD, attachments, frontmatter |
| `index/` | SQLite search, tags, backlinks, hybrid search |
| `links/` | Link fetching, caching, metadata extraction |
| `ai_rig/` | Rig runtime (`rig.rs`) for providers, tools, streaming events, profiles/history/secrets |
| `paths.rs` | Safe path joining (prevents traversal) |
| `lattice_paths.rs` | `.lattice/` directory and DB path helpers |
| `lattice_fs.rs` | Lattice-specific filesystem operations |
| `io_atomic.rs` | Crash-safe atomic writes |
| `net.rs` | Network safety (SSRF prevention) |

## Vault Layout

Lattice works with any Obsidian-compatible vault. User markdown files stay wherever they are in the vault. Lattice only creates a `.lattice/` folder for its own data:

```
any-vault-folder/
├── (user's existing .md files and folders)
└── .lattice/
    ├── lattice.sqlite   # Index, search, canvases
    └── cache/           # Temporary data
```

## Code Style

- **TypeScript:** Strict mode, avoid `any`, use `unknown` + narrowing
- **React:** Functional components, hooks, lazy-load heavy components
- **Rust:** serde for serialization, tracing for logs, atomic writes
- **Formatting:** Biome handles it (auto-organizes imports)
- **Animations:** Use Motion (Framer Motion) via `src/components/ui/` wrappers
- **CSS:** Global styles in numbered `src/styles/app/` files + CSS modules for component-scoped styles

## Safety Rules

- Treat vault paths as untrusted input
- Use `paths::join_under()` to prevent `..` traversal
- Use `io_atomic::write_atomic()` for file writes
- Version durable documents (`version: 1`) and reject unsupported versions
- Never log secrets or API keys
- Use `net.rs` SSRF checks for any user-supplied URLs

## Adding a Tauri Command

1. Implement `#[tauri::command]` in appropriate module under `src-tauri/src/`
2. Register in `src-tauri/src/lib.rs`
3. Add to `TauriCommands` interface in `src/lib/tauri.ts`
