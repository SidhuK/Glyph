# Contributing to Glyph

Thanks for your interest in Glyph.

Glyph is an offline-first desktop notes app built with React, TypeScript, Tauri, and Rust. The project is currently maintained with a strong macOS focus.

## ⚠️ Pull requests are not accepted at this time

Glyph is maintained by one person and I am not reviewing or merging external pull requests right now. Unsolicited PRs will be closed without review, even if the change is good.

That said, I do want to hear about problems. If you have found something crucial, like a data-loss bug, a security issue, or a broken core workflow:

- **Open an issue** with a clear repro: https://github.com/SidhuK/Glyph/issues/new/choose
- **Message me on Discord** if it is urgent or you would rather talk it through: https://discord.gg/cNqrBfFx7D

For security issues, please reach out on Discord first rather than filing a public issue.

The rest of this document is for people building Glyph from source for their own use. It is not an invitation to send patches.

## Scope and support

- Glyph is currently supported on macOS.
- Windows-specific issues and support requests are not being accepted right now.
- Linux support is also not an active focus.

## Before you start

- Check existing issues before opening a new one.
- For bugs, use the bug report form and include whether you are using an official GitHub release build, a trial/licensed build, or a self-built community build.
- Use the licensing/support issue form for trial, activation, or Gumroad questions.

## Development setup

### Requirements

- Node.js 24.21.0
- Vite+ 0.3.1
- `pnpm` 10+ (managed by Vite+)
- Rust stable
- Xcode Command Line Tools
- macOS on Apple Silicon for full Tauri app development and verification

Install Vite+ with `curl -fsSL https://vite.plus | bash`, then install dependencies with `vp install`.

### Useful commands

```bash
vp dev
vp run tauri dev # full Tauri app; equivalent to `pnpm tauri dev`
vp build
vp run tauri build # full macOS app; equivalent to `pnpm tauri build`
vp check
vp check --fix # auto-fix formatting and lint issues
vp fmt
vp lint
vp test
vp test src/components/app/commandPaletteHelpers.test.ts # single file
vp test -t "test name" # single test by name
cd src-tauri && cargo check
cd src-tauri && cargo clippy
```

### Checks

Run these before building a release of your own:

```bash
vp check
vp test
vp build
cd src-tauri && cargo check
```

## Project layout

- `src/` - React frontend
- `src-tauri/` - Tauri and Rust backend

## Coding guidelines

- TypeScript runs in strict mode. Avoid `any`; prefer `unknown` and explicit narrowing.
- Use functional React components and hooks.
- Use `invoke()` from `src/lib/tauri.ts` for frontend Tauri commands.
- Use `net.rs` SSRF checks for user-supplied URLs.
- Aim for roughly 200 lines per file; split into submodules when a file outgrows that.
- Keep CSS simple and lean on the existing component system instead of over-engineering styles.
- In Rust code, prefer the existing safe helpers such as `paths::join_under()` for space paths and atomic writes where appropriate.
- Do not log secrets, license keys, or other sensitive user data.
- Follow the existing architecture instead of introducing parallel abstractions.
- Use a hard cutover approach. Do not add backward-compatibility layers for old behavior.

## If you fork Glyph

Glyph is AGPL-3.0, so you are free to fork and modify it. Keep in mind:

- Self-built community builds are not supported. Please say which build you are on when reporting a bug.
- Licensing and update code paths behave differently in official builds versus self-built builds.

## If you are unsure

Open an issue or ask on Discord. Do not send a PR.
