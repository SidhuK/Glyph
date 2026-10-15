# AGENTS.md

Glyph is a macOS-only Tauri app: React/TypeScript frontend in `src/` (`@` maps to `src`), Rust backend in `src-tauri/`. Write code, suggestions and comments for macOS only.

## Commands

Run freely after making changes:

```bash
vp check                       # Oxfmt, Oxlint, and TypeScript checks
vp fmt                         # Auto-format with Oxfmt
vp test                        # Vitest (jsdom, setup in src/test/setup.ts)
cd src-tauri && cargo check    # Typecheck Rust
cd src-tauri && cargo clippy   # Lint Rust
```

Never run `vp dev` or `vp run tauri dev`, and don't drive the app with computer-use, browser or simulator tools. The user runs dev.

Before pushing to main, and only when the user asks you to push:

```bash
vp check && vp test && vp build && cd src-tauri && cargo check && cargo test
```

## Ask first

- **Sub-agents:** don't spawn any until the user approves. Propose which agents to spawn, list the models the Agent tool currently offers, and wait for the user to pick.
- **Persisted-format cutovers:** ask before a hard cutover that changes settings, durable documents or the index schema. Otherwise cut over hard with no backward-compatibility shims, and don't suggest compatibility layers unless core functionality is broken.
- **Suppressions:** `oxlint-disable`, `@ts-ignore` and `@ts-expect-error` need explicit human approval.
- **New test files:** only when asked. Updating existing tests that your change breaks is fine.

## Rust and Tauri invariants

- New Tauri command: implement it under `src-tauri/src/`, register it in `lib.rs`, and add its types to `TauriCommands` in `src/lib/tauri.ts`.
- Wrap blocking work (filesystem walks, SQLite, git subprocesses) in `tauri::async_runtime::spawn_blocking`. Never block the async runtime.
- Resolve the space per window with `space_state.root_for_window(&window)`. There is no single global active space.
- Build space paths with `paths::join_under()` to prevent traversal.
- Write files with `io_atomic::write_atomic()`.
- Check user-supplied URLs with the SSRF checks in `net.rs`.
- Any code path that writes a note must reindex it and emit a typed `space:fs_changed` event. The SQLite index is derived and must never go stale after a write.
- Persisted JSON documents carry a `version` field (currently `1`).
- Use serde for serialization and tracing for logs.

## Cross-cutting rules

- Never call `invoke()` in a loop over paths or notes. Use a batch command (`space_read_texts_batch`, `space_read_text_previews_batch`, `space_read_wiki_embeds_batch`, `space_resolve_image_sources_batch`, `document_read_images_batch`, `task_summaries_for_paths`) or add one.
- A new setting needs a default value, load-time normalization of legacy or invalid values, a `settings:updated` emit, Rust runtime sync when native code reads it, and a `settingsSearch.ts` entry.
- All user-facing strings go through i18next. Add new keys to every locale in `src/i18n/locales/`. Native menu labels go through `set_menu_labels`.

## Frontend rules

- No new `useEffect`. Existing ones can stay. Use derived values during render, event handlers for user actions, `key` for resets, and React Query for async state. See https://react.dev/learn/you-might-not-need-an-effect.
- IPC, filesystem and other async work goes in React Query queries and mutations, not hand-rolled `isSaving`-style booleans. Shared UI state goes in Context, not prop drilling.
- Large lists, tables, boards and timelines use the existing TanStack Virtual patterns.
- Don't use `setTimeout` to sequence state, wait for rendering or paper over races. Debounce, retry, focus or transient-UI timers need cleanup and a named delay constant. No raw `setInterval` in components; use React Query polling.
- No `any`; use `unknown` and narrow. No `as` assertions except `as const`; prefer narrowing, `satisfies` or explicit annotations.
- Use refs for DOM handles, imperative APIs, timers and measurement, not as hidden mutable state.
- Surface failed user-initiated actions as errors. No silent fallbacks.

## Change discipline

- Prefer fixes that delete or narrow existing code. Add files, commands, shortcuts or abstractions only when the existing code can't support the fix, never as a wrapper around code that should have been narrowed.
- Keep files around 200 lines. Split into a subfolder when one grows well past that, and extract hooks or subcomponents when a TSX file mixes rendering, state, effects and commands.
