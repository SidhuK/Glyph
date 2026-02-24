# Glyph Updater Setup (Tauri v2, GitHub Releases)

This document is the runbook for shipping auto-updates to users outside the Mac App Store.

## Current Scaffold Added

The repo already includes updater scaffolding:

- `src-tauri/tauri.conf.json`
  - `bundle.createUpdaterArtifacts: true`
  - `plugins.updater.pubkey` placeholder (you must replace this)
  - `plugins.updater.endpoints` set to:
    - `https://github.com/SidhuK/Glyph/releases/latest/download/latest.json`
- `src-tauri/Cargo.toml`
  - `tauri-plugin-updater` dependency
- `src-tauri/src/lib.rs`
  - updater plugin initialization
- `src-tauri/capabilities/default.json`
  - `updater:default`
- `src-tauri/capabilities/settings.json`
  - `updater:default`
- `.github/workflows/tauri-release.yml`
  - auto-release workflow on every push to `main`

## When You Are Ready To Publish

### 1. Decide release visibility

For the easiest updater flow, publish updates from a **public** GitHub repo/releases.

If you stay private, use a separate authenticated update server/proxy instead of direct GitHub release URLs.

### 2. Generate updater signing keys

Run locally once:

```bash
cargo tauri signer generate -w ~/.tauri/glyph-updater.key
```

You will get:

- public key (copy this into `src-tauri/tauri.conf.json` -> `plugins.updater.pubkey`)
- private key file (`~/.tauri/glyph-updater.key`) for CI secrets

### 3. Fill placeholder in `src-tauri/tauri.conf.json`

Replace:

- `REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY`

The endpoint is already set for your repo:

```json
"https://github.com/SidhuK/Glyph/releases/latest/download/latest.json"
```

### 4. Configure GitHub repository secrets

Add:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (if you set one)

### 5. Use the release workflow

Workflow file:

- `.github/workflows/tauri-release.yml`

Workflow behavior:

- Runs automatically on every push to `main`.
- Computes next version from latest Git tag and bumps patch:
  - `0.1.0` -> `0.1.1` -> `0.1.2` ...
- Syncs versions in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Publishes GitHub release with updater artifacts + `latest.json`.
- Generates release notes from commit messages since the previous tag.

### 6. Release process

1. Merge changes to `main`.
2. (Recommended pre-merge) Run local checks:
   - `pnpm check`
   - `pnpm build`
   - `cd src-tauri && cargo check`
3. Workflow runs automatically and publishes:
   - new tag (`vX.Y.Z`)
   - release artifacts
   - `latest.json`

The workflow also supports manual `workflow_dispatch` if needed.

## Notes For Your Current Distribution Model (No Notarization)

- Updater still works technically.
- macOS trust prompts and first-run friction are expected outside notarization.
- If user experience becomes a priority later, add Developer ID signing + notarization.

## Current In-App Behavior

Auto-update is already wired in the app startup path:

- [src/App.tsx](/Users/karatsidhu/Code/Glyph/src/App.tsx)
- [src/hooks/useAutoUpdater.ts](/Users/karatsidhu/Code/Glyph/src/hooks/useAutoUpdater.ts)

On app start (main window, non-dev), Glyph checks for updates, downloads, installs, and relaunches.
