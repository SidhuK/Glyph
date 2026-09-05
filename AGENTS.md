# [AGENTS.md](http://AGENTS.md)

## Commands

**Reference only — do not run these unless specifically stated by the user:**

```bash
pnpm build          # TypeScript check + Vite build
pnpm check          # Biome lint + format check
pnpm format         # Auto-format with Biome
pnpm test           # Run all tests (vitest)
cd src-tauri && cargo check    # Typecheck Rust backend
cd src-tauri && cargo clippy   # Lint Rust
```

**Reference only — do not run dev servers:**

```bash
pnpm dev            # Vite dev server (frontend only)
pnpm tauri dev      # Full Tauri app in dev mode
GLYPH_DEV_FORCE_TRIAL=1 pnpm tauri dev # Force trial mode to check licensing
```

**Pre-push:** `pnpm check && pnpm build && cd src-tauri && cargo check` # use this when you are ready to push your changes to the main branch, and the user has requested you to do so.

**Never run a dev server or use the computer use tool - the user handles dev.**

## Code Style & Safety

- TypeScript strict mode, no `any` (use `unknown` + narrowing). Biome handles formatting/imports.
- Functional React components, hooks, lazy-load heavy components. State via Context (no prop drilling).
- Rust: serde for serialization, tracing for logs, atomic writes via `io_atomic::write_atomic()`.
- Aim for roughly 200 LOC per file; treat this as a guideline, not a hard rule. Don't obsess over landing exactly at 200, but do refactor into subfolders when a file is getting out of hand.
- Use `paths::join_under()` for space paths (prevent traversal). Never log secrets.
- Use `net.rs` SSRF checks for user-supplied URLs. Version durable documents (`version: 1`).
- New Tauri commands: implement in `src-tauri/src/`, register in `lib.rs`, add types to `TauriCommands` in `src/lib/tauri.ts`.
- Wrap blocking work (filesystem walks, SQLite, git subprocesses) in `tauri::async_runtime::spawn_blocking` inside Tauri commands; never block the async runtime.
- Multi-window: resolve the space per window via `space_state.root_for_window(&window)` in commands; never assume a single global active space.
- Never call `invoke()` in a loop over paths/notes; use the existing batch commands (`space_read_texts_batch`, `space_read_text_previews_batch`, `task_summaries_for_paths`) or add a batch command.
- New settings require all of: default value, load-time normalization of legacy/invalid values, `settings:updated` emit, Rust runtime sync when native code consumes it, and a `settingsSearch.ts` entry.
- Any Rust code path that writes a note must reindex it and emit a typed `space:fs_changed` change event; the SQLite index is derived and must never go stale after a write.
- All user-facing strings go through the i18n translation layer (menu labels via `set_menu_labels`); no hardcoded UI text.
- Hard subtraction pass: always attempt the fix by deleting or narrowing existing code first, and only add LOC when the existing code provably cannot support the fix. Never add new abstractions, command entries, shortcuts, files, or wiring as a patch around code that should have been narrowed.
- NEVER make test files unless specifically requested by users.
- For TSX files extract hooks/subcomponents when rendering, state, effects, and commands start mixing.



## React Code Practices

Agents and reviewers should flag these patterns unless the change includes a clear justification and there is no simpler React/Tauri-safe alternative:

- `useEffect`: UseEffect is completely banned. UseEffect is a code smell and should be avoided at all costs. Use derived values during render, event handlers for user actions, keys for reset behavior, and React Query for async server/IPC/filesystem state. See [https://react.dev/learn/you-might-not-need-an-effect](https://react.dev/learn/you-might-not-need-an-effect).
- TanStack Query: prefer queries/mutations for async server, IPC, filesystem, loading, error, retry, cache, and invalidation flows instead of hand-rolled `useState`/`useEffect` state machines.
- TanStack Virtual: use the existing virtualizer patterns for large lists, tables, boards, timelines, and scroll-heavy surfaces instead of rendering everything or inventing custom windowing logic.
- `setTimeout`: do not use to sequence React state, paper over races, or wait for rendering. If used for debounce, retry, focus, or transient UI, use cleanup, a named delay constant, and explain why the delay is needed.
- `setInterval`: prefer React Query polling/refetch behavior or an approved interval hook. Do not create raw intervals inside components.
- `useImperativeHandle`: avoid; prefer state and props. Only acceptable for narrow wrappers around imperative third-party APIs such as editors.
- Duplicate state: derive values from existing state instead of mirroring them. Refactor ownership when derivation is awkward.
- Direct DOM queries/manipulation: avoid `document.querySelector`, `document.getElementById`, manual node creation, and direct mutation in React code. Prefer refs, props, and component state. Exceptions are app bootstrap, portals, sanitized renderers, and third-party integration boundaries.
- `useRef`: do not use refs as hidden mutable state. Refs are acceptable for DOM handles, external imperative APIs, timers/animation handles, stale-closure avoidance, and measurement/scroll integration.
- Type assertions with `as`: prefer narrowing, typed helpers, `satisfies`, and explicit annotations. `as const` is allowed.
- Silent fallbacks: do not hide failed user-initiated actions behind fallback behavior. Surface errors clearly when the product cannot do what the user asked.
- Async action booleans like `isSaving`, `isLoadingFoo`, or `isDeleting`: prefer React Query mutations/queries for server, IPC, filesystem, and durable async work. Local UI-only state is fine.
- Lint/type suppression comments such as `eslint-disable`, `biome-ignore`, `@ts-ignore`, or `@ts-expect-error` require explicit human approval.



## Migration Policy

- Use a hard cutover approach and never implement backward compatibility. However ask before you decided to do a hard cutover.
- Unless a core functionality is broken, never suggest adding backward compatibility.



## Sub-agents

- Never spawn sub-agents by default. Before spawning any sub-agent, including when you are ready to spawn one or think delegation would help, ask the user which agents to spawn and which base model each should use. Spawn them only after the user explicitly provides that direction.



## Development Platform

- Glyph is a macOS-only app. It is not being developed for Linux or Windows. Focus code, suggestions, and comments solely on macOS development.

