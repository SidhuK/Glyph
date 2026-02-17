# Cipher Release Readiness (macOS)

## Build

- Frontend build: `corepack pnpm build`
- Full app build (Tauri): `corepack pnpm tauri build`

## Packaging Checklist

- Verify app icon set in `src-tauri/icons/` and referenced from `src-tauri/tauri.conf.json`.
- Verify version bump:
  - `package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
- Run checks:
  - `corepack pnpm check`
  - `cd src-tauri && cargo check`

## Signing + Notarization (macOS)

This repo does not include certificates or secrets. Use your Apple Developer account tooling locally.

- Create a Developer ID Application certificate in Keychain Access.
- Configure codesigning identity for Tauri builds (commonly via environment variables or CI secrets).
- Notarize and staple the resulting `.app`/`.dmg` using Apple’s `notarytool`.

## Smoke Test Checklist

- Create/open a vault; verify notes and canvases persist.
- Link preview node loads title/description and caches image under `vault/cache/link-previews/`.
- Search and backlinks update after note edits.
- AI:
  - Create/select provider profile, set key in OS keychain, and run a chat.
  - Build + approve context payload before sending.
  - Cancel a streaming job.
  - Rewrite flow: stage rewrite → review diff → apply/reject.
  - Verify audit logs appear under `vault/cache/ai/`.

