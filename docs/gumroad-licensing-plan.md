# Glyph Licensing Plan: Direct Gumroad Verification Only

## Summary

Glyph will use Gumroad directly as the only online license verifier. Official GitHub release binaries will start a 48-hour trial on first launch, then hard-lock until the user enters a valid Gumroad license key. On successful activation, Glyph will persist a local activation record and allow offline use forever on unlimited devices.

This plan intentionally chooses simplicity over stronger offline cryptographic proof. Because Glyph is open source and official binaries remain publicly downloadable from GitHub, the licensing model is an honest-user runtime gate for official builds, not DRM.

## Core Product Decisions

- Source code stays public on GitHub.
- Official GitHub release binaries are licensed.
- Local/community builds are not blocked by default.
- Gumroad is the only license authority.
- Trial length is exactly 48 hours from first launch of an official build.
- Trial expiry behavior is a hard lock.
- License is one-time, lifetime, unlimited devices, unlimited reinstalls.
- No seat counting, no device fingerprinting, no activation caps.
- After one successful verification, Glyph works offline forever.
- No Cloudflare Worker or other private verification service.
- No raw Gumroad key is stored locally after activation.

## Important Constraint

Without a Worker, Glyph cannot create a stronger signed offline entitlement. So "offline forever" will be implemented as:

- verify once with Gumroad
- persist a local activation record
- trust that local record forever

That is weaker than a signed entitlement design, but acceptable for this simpler plan.

## Current Repo Fit

- Tauri updater is already configured in [src-tauri/tauri.conf.json](/Users/karatsidhu/Code/Glyph/src-tauri/tauri.conf.json).
- Release builds already publish to public GitHub Releases via [.github/workflows/tauri-release.yml](/Users/karatsidhu/Code/Glyph/.github/workflows/tauri-release.yml).
- Tauri Store is already used in [src/lib/settings.ts](/Users/karatsidhu/Code/Glyph/src/lib/settings.ts).
- There is no existing licensing or trial module.
- Main app boot currently mounts directly through [src/main.tsx](/Users/karatsidhu/Code/Glyph/src/main.tsx) and [src/App.tsx](/Users/karatsidhu/Code/Glyph/src/App.tsx).

## High-Level Architecture

### Official-build gating

Add an official-build flag so only official GitHub release binaries enforce licensing.

Build-time env vars:

- `GLYPH_OFFICIAL_BUILD=1`
- `GLYPH_GUMROAD_PRODUCT_ID=<product id>`
- `GLYPH_GUMROAD_PRODUCT_URL=<buy url>`

Behavior:

- Official build: licensing active.
- Non-official build: app always usable.

This keeps contributor and self-build flows frictionless.

### Direct Gumroad verification

Glyph will call Gumroad from Rust, not from the browser layer.

Why Rust:

- avoids browser CORS concerns
- keeps request logic centralized
- prevents frontend-only tampering from being the primary path

Verification endpoint:

- `POST https://api.gumroad.com/v2/licenses/verify`

Request fields:

- `product_id`
- `license_key`

Success rule:

- activation succeeds only if Gumroad returns `success: true`

Failure rule:

- anything else is invalid for unlock purposes

## Local Data Model

Create a dedicated app-global license file in `app_config_dir()`, separate from normal UI settings.

Suggested file:

- `app_config_dir()/license.json`

Schema:

```json
{
  "version": 1,
  "trial_started_at": "2026-03-01T08:00:00Z",
  "trial_expires_at": "2026-03-03T08:00:00Z",
  "licensed": true,
  "activated_at": "2026-03-01T09:00:00Z",
  "license_key_masked": "ABCD-****-****-WXYZ",
  "license_key_hash": "sha256:...",
  "last_verified_at": "2026-03-01T09:00:00Z",
  "last_error_code": null
}
```

Rules:

- `licensed` is the local source of truth after successful activation.
- `license_key_hash` is a hash of the normalized key, not the raw key.
- `license_key_masked` is only for display in Settings.
- raw license key is never written to disk.
- if file is missing and official build, start trial.
- if file is corrupt, recover safely and treat as missing.
- if `licensed=true`, app is allowed offline forever.

## Rust Backend Plan

Add a new `license` module under [src-tauri/src](/Users/karatsidhu/Code/Glyph/src-tauri/src):

- `src-tauri/src/license/mod.rs`
- `src-tauri/src/license/types.rs`
- `src-tauri/src/license/store.rs`
- `src-tauri/src/license/service.rs`
- `src-tauri/src/license/commands.rs`

### `types.rs`

Define:

- `LicenseMode`
- `LicenseStatus`
- `LicenseRecord`
- `LicenseActivateRequest`
- `LicenseActivateResult`

### `store.rs`

Responsibilities:

- resolve `app_config_dir()/license.json`
- load/save using `io_atomic::write_atomic()`
- normalize corrupt or partial state
- initialize trial timestamps if needed

### `service.rs`

Responsibilities:

- perform Gumroad `POST /v2/licenses/verify`
- normalize key input
- hash key for local storage
- mask key for UI display
- map Gumroad errors into Glyph error codes

### `commands.rs`

Expose Tauri commands:

- `license_bootstrap_status`
- `license_activate`
- `license_clear_local`

Register them in [src-tauri/src/lib.rs](/Users/karatsidhu/Code/Glyph/src-tauri/src/lib.rs) and add TS types in [src/lib/tauri.ts](/Users/karatsidhu/Code/Glyph/src/lib/tauri.ts).

## License State Machine

States:

- `community_build`
- `licensed`
- `trial_active`
- `trial_expired`
- `activation_error`

Bootstrap logic for official builds:

1. Load `license.json`.
2. If `licensed=true`, return `licensed`.
3. If no trial timestamps exist, set:
   - `trial_started_at = now`
   - `trial_expires_at = now + 48h`
4. If now is before expiry, return `trial_active`.
5. Otherwise return `trial_expired`.

Activation logic:

1. User enters license key.
2. Rust normalizes and sends it to Gumroad.
3. If Gumroad validates it:
   - compute masked key
   - compute key hash
   - write `licensed=true`
   - write `activated_at`
   - write `last_verified_at`
   - write masked key + key hash
   - clear last error
4. Return `licensed`.
5. If Gumroad rejects it:
   - do not mutate successful license state
   - keep trial timestamps as-is
   - return typed activation error

## Frontend Plan

### New gate layer

Add a licensing gate before the main app renders.

New files:

- `src/components/licensing/LicenseGate.tsx`
- `src/components/licensing/LicenseLockScreen.tsx`
- `src/components/licensing/TrialBanner.tsx`
- `src/components/licensing/LicenseSettingsCard.tsx`
- `src/lib/license.ts`

### Boot flow

Update [src/main.tsx](/Users/karatsidhu/Code/Glyph/src/main.tsx):

- call `license_bootstrap_status` before rendering `<Root />`
- if `community_build`, continue normally
- if `trial_active` or `licensed`, render app
- if `trial_expired`, render full-screen lock UI instead of the app shell

### Trial UX

During active trial:

- show a small persistent banner in the app
- include remaining time
- include `Enter License Key`
- include `Buy on Gumroad`

### Expired UX

After expiry:

- full-window lock screen
- license input
- activate button
- buy button
- support/help copy
- no access to app shell or note content until activation

### Settings UX

Add a licensing card to [src/components/settings/GeneralSettingsPane.tsx](/Users/karatsidhu/Code/Glyph/src/components/settings/GeneralSettingsPane.tsx) showing:

- build type: `Official` or `Community`
- state: `Licensed`, `Trial active`, `Trial expired`
- remaining trial time
- activated date
- masked key
- `Remove local activation` action
- `Buy on Gumroad` link

## Updater and Release Behavior

### Updater

Keep public GitHub releases and current updater structure.

Change behavior only so updater checks run when the app is usable:

- allowed: `community_build`, `licensed`, `trial_active`
- blocked: `trial_expired`

This avoids checking/downloading updates from the hard-lock screen.

### GitHub Releases

Keep all release assets public.

Add release copy noting:

- official binaries require a license after the 48-hour trial
- source code remains open
- self-builds are separate from official licensed binaries

## CI / Release Changes

### Official release workflow

Update [.github/workflows/tauri-release.yml](/Users/karatsidhu/Code/Glyph/.github/workflows/tauri-release.yml):

- set `GLYPH_OFFICIAL_BUILD=1`
- set `GLYPH_GUMROAD_PRODUCT_ID`
- set `GLYPH_GUMROAD_PRODUCT_URL`

No Worker secrets are needed because there is no Worker.

### Local/dev behavior

Do not set `GLYPH_OFFICIAL_BUILD` for local builds, preview builds, or contributor workflows.

Default:

- ungated build
- no trial creation
- no license enforcement

## Documentation Changes

Add:

- `docs/licensing.md`
- README section for official binaries vs source code
- Gumroad product description updates
- GitHub release template note

Document clearly:

- 48-hour trial
- lifetime key
- unlimited devices
- offline forever after first successful activation
- official binaries are licensed
- source code remains public

## Important Public API / Interface Changes

Add to [src/lib/tauri.ts](/Users/karatsidhu/Code/Glyph/src/lib/tauri.ts):

```ts
export type LicenseMode =
  | "community_build"
  | "licensed"
  | "trial_active"
  | "trial_expired";

export interface LicenseStatus {
  mode: LicenseMode;
  can_use_app: boolean;
  is_official_build: boolean;
  trial_started_at: string | null;
  trial_expires_at: string | null;
  trial_remaining_seconds: number | null;
  activated_at: string | null;
  license_key_masked: string | null;
  error_code: string | null;
}

export interface LicenseActivateResult {
  status: LicenseStatus;
}
```

New Tauri commands:

- `license_bootstrap_status()`
- `license_activate({ license_key })`
- `license_clear_local()`

New frontend helper module:

- `getLicenseStatus()`
- `activateLicenseKey()`
- `clearLocalLicense()`
- `formatTrialRemaining()`

## Analytics Additions

If anonymous analytics is enabled, add these events:

- `license_trial_started`
- `license_trial_expired`
- `license_activation_succeeded`
- `license_activation_failed`

Update allowlists in [src-tauri/src/analytics.rs](/Users/karatsidhu/Code/Glyph/src-tauri/src/analytics.rs) and wrappers in [src/lib/analytics.ts](/Users/karatsidhu/Code/Glyph/src/lib/analytics.ts).

Do not include raw license keys or hashes in analytics.

## Test Plan

### Rust unit tests

- official build with no state starts a 48-hour trial
- trial remains active before expiry
- trial expires correctly after 48 hours
- licensed state bypasses trial
- activation success writes masked key, hash, timestamps, and `licensed=true`
- activation failure does not destroy trial state
- community build always returns usable state
- corrupt `license.json` recovers safely
- raw key is never persisted

### Frontend tests

- `LicenseGate` renders app for `licensed`
- `LicenseGate` renders app for `trial_active`
- `LicenseGate` renders lock screen for `trial_expired`
- trial banner shows remaining time
- activation submit handles success and error transitions
- settings card renders correct state text and actions
- updater hook is not mounted on expired trial lock screen

### Manual scenarios

- fresh official install, first launch online
- fresh official install, first launch offline
- trial running, user activates successfully
- trial expired, user activates successfully
- trial expired, invalid key stays locked
- licensed user restarts offline
- licensed user updates via GitHub release updater
- local dev build remains ungated
- clearing local activation on official build falls back to trial/expired logic

## Rollout Plan

1. Build the Rust license module and direct Gumroad verification path.
2. Add the frontend gate and settings UI.
3. Add tests and a small fake Gumroad response harness for unit coverage.
4. Ship an internal official build with `GLYPH_OFFICIAL_BUILD=1`.
5. Verify trial, activation, restart, and offline behavior manually.
6. Update README, Gumroad product copy, and release notes template.
7. Enable official-build env vars in production release workflow.
8. Publish the first licensed official GitHub Release.

## Acceptance Criteria

- Official GitHub binaries start a 48-hour trial on first launch.
- Official binaries hard-lock after the trial expires.
- A valid Gumroad key unlocks Glyph.
- Activated users can keep using Glyph offline forever.
- No raw license key is stored locally.
- Community/local builds remain ungated.
- GitHub Releases and Tauri auto-updates still work.
- The plan uses only Gumroad directly and no Worker/service layer.

## Assumptions and Defaults Chosen

- Gumroad's live verification endpoint remains usable from the app with `product_id` and `license_key`.
- Glyph will call Gumroad from Rust, not from frontend JavaScript.
- Offline forever is implemented by trusting a local activation record after first successful verification.
- You accept that this is weaker than a signed offline entitlement.
- No refund or revocation enforcement will exist after activation.
- Official binaries are the licensed product; source access is not restricted.
- This remains an honest-user licensing model, not DRM.

## References

- Gumroad API entry: [https://gumroad.com/api](https://gumroad.com/api)
- Gumroad API domain/docs entry: [https://gumroad.com/ping](https://gumroad.com/ping)
- Gumroad live verify endpoint used for planning: [https://api.gumroad.com/v2/licenses/verify](https://api.gumroad.com/v2/licenses/verify)
- Tauri updater docs: [https://v2.tauri.app/plugin/updater/](https://v2.tauri.app/plugin/updater/)
- Tauri store docs: [https://v2.tauri.app/plugin/store/](https://v2.tauri.app/plugin/store/)
- GitHub Releases docs: [https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
