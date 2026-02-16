# Lattice Updater Setup (Tauri v2, GitHub Releases)

This document is a future-ready checklist for shipping auto-updates to users outside the Mac App Store.

## Current Scaffold Added

The repo now includes placeholder updater scaffolding:

- `src-tauri/tauri.conf.json`
  - `bundle.createUpdaterArtifacts: true`
  - `plugins.updater.pubkey` placeholder
  - `plugins.updater.endpoints` placeholder
- `src-tauri/Cargo.toml`
  - `tauri-plugin-updater` dependency
- `src-tauri/src/lib.rs`
  - updater plugin initialization
- `src-tauri/capabilities/default.json`
  - `updater:default`
- `src-tauri/capabilities/settings.json`
  - `updater:default`
- `.github/workflows/tauri-release-placeholder.yml`
  - manual-only release workflow with guardrail and placeholders

## When You Are Ready To Publish

### 1. Decide release visibility

For the easiest updater flow, publish updates from a **public** GitHub repo/releases.

If you stay private, use a separate authenticated update server/proxy instead of direct GitHub release URLs.

### 2. Generate updater signing keys

Run locally once:

```bash
cargo tauri signer generate -w ~/.tauri/lattice-updater.key
```

You will get:

- public key (paste into config)
- private key (store in CI secret)

### 3. Fill placeholders in `src-tauri/tauri.conf.json`

Replace:

- `REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY`
- `REPLACE_OWNER`
- `REPLACE_REPO`

Endpoint should look like:

```json
"https://github.com/<owner>/<repo>/releases/latest/download/latest.json"
```

### 4. Configure GitHub repository secrets

Add:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (if you set one)

### 5. Update workflow placeholders

In `.github/workflows/tauri-release-placeholder.yml` replace:

- `v__VERSION__` tag pattern (or switch to using `${{ github.ref_name }}`)
- draft/prerelease behavior as desired

### 6. Release process

1. Bump `src-tauri/tauri.conf.json` version.
2. Run local checks:
   - `pnpm check`
   - `pnpm build`
   - `cd src-tauri && cargo check`
3. Trigger workflow manually with:
   - `publish_release=true`

The workflow will build Tauri bundles and publish updater artifacts + `latest.json`.

## Notes For Your Current Distribution Model (No Notarization)

- Updater still works technically.
- macOS trust prompts and first-run friction are expected outside notarization.
- If user experience becomes a priority later, add Developer ID signing + notarization.

## Optional Next Step (Not yet implemented)

Add an in-app update check UX (Settings > About / General):

- check for updates
- show version/changelog
- install and relaunch

This can be done with `@tauri-apps/plugin-updater` on the frontend when you are ready.
