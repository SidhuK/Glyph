# Contributing to Glyph

Thanks for your interest in contributing to Glyph.

Glyph is an offline-first desktop notes app built with React, TypeScript, Tauri, and Rust. The project is currently maintained with a strong macOS focus.

## Scope and support

- Glyph is currently supported on macOS.
- Windows-specific issues, support requests, and compatibility PRs are not being accepted right now.
- Linux support is also not an active focus unless explicitly requested by the maintainer.
- If you want to work on something cross-platform, please open an issue first so we can make sure it fits the roadmap.

## Before you start

- Check existing issues before opening a new one.
- For bugs, use the bug report form and include whether you are using an official GitHub release build, a trial/licensed build, or a self-built community build.
- For trial, activation, or Gumroad questions, use the licensing/support issue form.
- For larger features or architectural changes, open an issue before sending a PR.

## Development setup

### Requirements

- Node.js 20+
- `pnpm` 10+
- Rust stable
- macOS for full Tauri app development and verification

### Useful commands

```bash
pnpm dev
pnpm tauri dev
pnpm build
pnpm check
pnpm format
pnpm test
cd src-tauri && cargo check
cd src-tauri && cargo clippy
cd website && pnpm dev
cd website && pnpm build
```

### Pre-push checks

Run these before you open or update a PR:

```bash
pnpm check
pnpm build
cd src-tauri && cargo check
```

## Project layout

- `src/` - React frontend
- `src-tauri/` - Tauri and Rust backend
- `website/` - Astro marketing site
- `docs/` - product, release, and engineering documentation

## Coding guidelines

- TypeScript runs in strict mode. Avoid `any`; prefer `unknown` and explicit narrowing.
- Use functional React components and hooks.
- Use `invoke()` from `src/lib/tauri.ts` for frontend Tauri commands.
- Keep CSS simple and lean on the existing component system instead of over-engineering styles.
- In Rust code, prefer the existing safe helpers such as `paths::join_under()` for space paths and atomic writes where appropriate.
- Do not log secrets, license keys, or other sensitive user data.
- Follow the existing architecture instead of introducing parallel abstractions.
- Use a hard cutover approach. Do not add backward-compatibility layers for old behavior.

## Pull request guidelines

- Keep PRs focused. Avoid bundling unrelated cleanup with feature or bug-fix work.
- Include a clear summary, linked issue, and testing notes.
- Add screenshots or recordings for UI changes.
- Add or update tests when the change affects behavior that can be covered.
- If a change touches licensing behavior, be explicit about whether it applies to official builds, self-built community builds, or both.
- PRs that primarily add Windows-specific support, Windows-only fixes, or Windows workflow changes will be closed.

## Good first contributions

Good contributions usually look like:

- focused bug fixes with a clear repro
- polish to existing macOS workflows
- small editor, tasks, database, AI, or settings improvements
- docs updates that reflect current behavior
- tests for existing behavior

## If you are unsure

Open an issue first. A quick alignment pass is the best way to avoid wasted work, especially for bigger features, platform-related changes, or anything that touches release/licensing behavior.
