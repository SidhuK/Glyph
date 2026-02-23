# PostHog Integration Plan (Privacy-First, Minimal, Tauri-Native)

## Summary
Implement a **non-invasive analytics layer** for Glyph using the Rust PostHog client in the Tauri backend, with frontend-triggered event capture and a user-controlled opt-in toggle.  
This plan is scoped to basic product telemetry only (app lifecycle + core feature usage), with strict data minimization and no content capture.

Target plan document path (when execution mode allows file writes):  
`/Users/karatsidhu/Code/Glyph/docs/plans/2026-02-23-posthog-integration-plan.md`

---

## Goals
1. Add basic product analytics for product decisions (adoption, feature usage, rough reliability signals).
2. Keep telemetry explicitly non-invasive and privacy-preserving.
3. Make analytics fully optional with a clear user-facing control.
4. Integrate in a way that fits existing architecture (`src-tauri` commands + typed `invoke` on frontend).

## Non-Goals
1. No session replay.
2. No autocapture of UI events.
3. No note content, filenames, paths, prompts, URLs, or API keys in telemetry.
4. No user identity merge with email/account in v1.
5. No remote config / feature flags in v1.

---

## Current State (Grounded in Repo)
1. Frontend settings persisted through `LazyStore("settings.json")` in `/Users/karatsidhu/Code/Glyph/src/lib/settings.ts`.
2. Cross-window settings sync already exists via `settings:updated` event in `/Users/karatsidhu/Code/Glyph/src/lib/tauriEvents.ts`.
3. Tauri command registry is centralized in `/Users/karatsidhu/Code/Glyph/src-tauri/src/lib.rs`.
4. Key frontend feature actions occur through typed `invoke()` wrappers in `/Users/karatsidhu/Code/Glyph/src/lib/tauri.ts`.
5. Key candidate instrumentation call sites exist:
- vault open/create in `/Users/karatsidhu/Code/Glyph/src/contexts/VaultContext.tsx`
- search in `/Users/karatsidhu/Code/Glyph/src/hooks/useSearch.ts`
- AI chat start in `/Users/karatsidhu/Code/Glyph/src/components/ai/hooks/useRigChat.ts`
- settings interaction in `/Users/karatsidhu/Code/Glyph/src/components/settings/GeneralSettingsPane.tsx`

---

## Product Decisions (Locked)
1. **Consent model**: opt-in toggle in Settings, default `false`.
2. **Identity model**: anonymous `distinct_id` (UUID), stored locally.
3. **Transport layer**: Rust backend owns outbound analytics delivery; frontend never calls PostHog directly.
4. **Event model**: explicit allowlist only.
5. **Failure behavior**: best-effort non-blocking send; never fails user actions.
6. **Region default**: US host by default (`https://us.i.posthog.com`) with build-time override.
7. **Queueing**: in-memory batching only in v1; no disk queue.

---

## Public API / Interface Changes

### 1) Frontend settings model
File: `/Users/karatsidhu/Code/Glyph/src/lib/settings.ts`

Add to `AppSettings`:
1. `analytics: { enabled: boolean; distinctId: string }`

Add keys:
1. `analytics.enabled` -> boolean
2. `analytics.distinctId` -> string UUID

Add exports:
1. `getAnalyticsEnabled(): Promise<boolean>`
2. `setAnalyticsEnabled(enabled: boolean): Promise<void>`
3. `getOrCreateAnalyticsDistinctId(): Promise<string>`

Extend `emitSettingsUpdated` payload:
1. `analytics?: { enabled?: boolean }`

### 2) Frontend event typings
File: `/Users/karatsidhu/Code/Glyph/src/lib/tauriEvents.ts`

Extend `"settings:updated"` payload type:
1. `analytics?: { enabled?: boolean }`

### 3) New typed Tauri command contract
File: `/Users/karatsidhu/Code/Glyph/src/lib/tauri.ts`

Add types:
1. `AnalyticsEventName` union
2. `AnalyticsTrackRequest` interface
3. `AnalyticsContext` interface (strictly non-sensitive fields)

Add command in `TauriCommands`:
1. `analytics_track: CommandDef<{ request: AnalyticsTrackRequest }, void>`

### 4) New backend Tauri command
File: `/Users/karatsidhu/Code/Glyph/src-tauri/src/lib.rs` + new analytics module files

Expose:
1. `#[tauri::command] async fn analytics_track(request: AnalyticsTrackRequest, app: tauri::AppHandle) -> Result<(), String>`

---

## Event Taxonomy (v1 Allowlist)

### Required common properties on every event
1. `app_version`
2. `platform` (`macos` | `windows` | `linux`)
3. `app_channel` (`dev` | `release`) inferred at compile/runtime
4. `ts_ms` (client timestamp)
5. `schema_version` fixed `1`

### Event list
1. `app_started`
- properties: `has_previous_vault` (bool)

2. `vault_opened`
- properties: `source` (`continue_last` | `open_dialog` | `open_recent` | `create_dialog`)
- properties: `schema_version` (number)

3. `index_rebuild_started`
- properties: none beyond common

4. `search_executed`
- properties: `query_length_bucket` (`0` | `1_10` | `11_30` | `31_plus`)
- properties: `result_count_bucket` (`0` | `1_5` | `6_20` | `21_plus`)

5. `note_created`
- properties: `entrypoint` (`ui` | `daily_note` | `other`)

6. `ai_chat_started`
- properties: `provider` (already non-secret enum)
- properties: `mode` (`chat` | `create`)
- properties: `has_context` (bool)

7. `settings_changed`
- properties: `setting_key` allowlist (`aiAssistantMode`, `analyticsEnabled`)
- properties: `new_value` coarse enum/string only where safe

### Explicitly prohibited properties
1. Any vault path or filesystem path.
2. Note title/body/preview/frontmatter.
3. Search query text.
4. AI message text/context text.
5. URLs from link previews.
6. Secrets/API keys/tokens/headers.

---

## Data Minimization and Guardrails

### Frontend guardrails
1. All analytics calls route through a single helper (`/Users/karatsidhu/Code/Glyph/src/lib/analytics.ts`).
2. Helper enforces event name allowlist and property schemas.
3. Helper drops properties not on allowlist.

### Backend guardrails
1. Command-side validation repeats allowlist checks (defense in depth).
2. Distinct ID is validated as non-empty UUID-like string.
3. String property length cap: 80 chars.
4. Payload size cap: 2KB per event.
5. On validation failure: log warning with event name only, return `Ok(())`.

### Logging policy
1. Only log failures as: event name + error class.
2. Never log event payload content.

---

## Detailed Implementation Plan

## Phase 0: Configuration and Dependencies
Files:
- `/Users/karatsidhu/Code/Glyph/src-tauri/Cargo.toml`
- `/Users/karatsidhu/Code/Glyph/src-tauri/src/lib.rs`

Steps:
1. Add `posthog-rs` dependency.
2. Add `mod analytics;` in backend root.
3. Register analytics state via `.manage(...)`.
4. Register `analytics_track` command in `generate_handler!`.

Config defaults:
1. `POSTHOG_API_KEY` from env at build/run (non-secret project key).
2. `POSTHOG_HOST` default `https://us.i.posthog.com`.
3. If API key missing, analytics command becomes no-op.

---

## Phase 1: Backend analytics service
New files:
- `/Users/karatsidhu/Code/Glyph/src-tauri/src/analytics/mod.rs`
- `/Users/karatsidhu/Code/Glyph/src-tauri/src/analytics/types.rs`
- `/Users/karatsidhu/Code/Glyph/src-tauri/src/analytics/client.rs`
- `/Users/karatsidhu/Code/Glyph/src-tauri/src/analytics/commands.rs`

Responsibilities:
1. `types.rs`
- Define `AnalyticsEventName`, `AnalyticsTrackRequest`, property structs.
- Derive `Serialize`/`Deserialize`, deny unknown fields where possible.

2. `client.rs`
- Build singleton PostHog client (lazy init).
- Provide `track(distinct_id, event_name, properties)` async fn.
- Add timeout and non-blocking best-effort semantics.

3. `mod.rs`
- Re-export command and types.

4. `commands.rs`
- Implement Tauri command `analytics_track`.
- Validate event + properties against allowlist.
- Enrich with common properties (`app_version`, platform).
- Forward to client and swallow failures (`Ok(())` always unless malformed request).

Concurrency and performance:
1. Use async send; never block UI-critical flows.
2. Optional tiny batch buffer (size 20, flush every 5s); if skipped for simplicity, direct send is acceptable in v1.

---

## Phase 2: Frontend analytics SDK wrapper
New file:
- `/Users/karatsidhu/Code/Glyph/src/lib/analytics.ts`

Responsibilities:
1. Expose `track(event, props)` API used by app code.
2. Internally:
- read `analytics.enabled`; if false, no-op.
- read/create `distinctId`.
- call typed `invoke("analytics_track", { request })`.
3. Provide property normalization helpers:
- query length bucket
- result count bucket
4. Never accept raw free-form text properties for sensitive domains.

---

## Phase 3: Settings + user control UI
Files:
- `/Users/karatsidhu/Code/Glyph/src/lib/settings.ts`
- `/Users/karatsidhu/Code/Glyph/src/lib/tauriEvents.ts`
- `/Users/karatsidhu/Code/Glyph/src/components/settings/GeneralSettingsPane.tsx`

Changes:
1. Add analytics fields to settings load/save.
2. Add setter/getter functions.
3. Emit `settings:updated` with `analytics.enabled`.
4. Add settings card in General pane:
- Label: “Anonymous Analytics”
- Control: select (`Enabled`/`Disabled`) or checkbox consistent with current settings UI primitives.
- Description: “Sends anonymous product usage metrics. Never sends note content.”
5. Track `settings_changed` when toggled (only after successful save).

---

## Phase 4: Instrumentation call sites (minimal, high-value)
1. `app_started`
- File: `/Users/karatsidhu/Code/Glyph/src/main.tsx`
- Trigger once after initial settings hydration in root lifecycle.

2. `vault_opened`
- File: `/Users/karatsidhu/Code/Glyph/src/contexts/VaultContext.tsx`
- Emit in:
  - `onOpenVault` (source `open_dialog`)
  - `onCreateVault` (source `create_dialog`)
  - `onContinueLastVault` (source `continue_last`)
  - recent vault open path (source `open_recent`)

3. `index_rebuild_started`
- File: `/Users/karatsidhu/Code/Glyph/src/contexts/VaultContext.tsx`
- Emit at `startIndexRebuild` invocation start.

4. `search_executed`
- File: `/Users/karatsidhu/Code/Glyph/src/hooks/useSearch.ts`
- Emit when search call resolves:
  - include length/result buckets only.

5. `ai_chat_started`
- File: `/Users/karatsidhu/Code/Glyph/src/components/ai/hooks/useRigChat.ts`
- Emit immediately after successful `ai_chat_start` invoke.
- properties: provider id enum, mode, has_context bool.

6. `note_created`
- File candidates:
  - `/Users/karatsidhu/Code/Glyph/src-tauri/src/notes/commands.rs` (backend)
  - or frontend creation entrypoint if singular
- Prefer frontend call site if unique; otherwise backend command instrumentation with strict redaction.

---

## Phase 5: Documentation updates
Files:
- `/Users/karatsidhu/Code/Glyph/docs/security.md`
- New runbook section in plan doc or separate:
  - `/Users/karatsidhu/Code/Glyph/docs/posthog-operations.md` (optional)

Additions:
1. What telemetry is collected.
2. What is explicitly never collected.
3. How to disable locally.
4. Host/key config and failure behavior.

---

## Validation Rules (Decision-Complete)

### Request schema validation (frontend + backend)
1. `event` must be enum from allowlist.
2. `distinct_id` required, 1..64 chars.
3. `properties` must match per-event map exactly.
4. Unknown property keys dropped or rejected (prefer reject + no-op).

### Runtime behavior
1. If disabled: immediate no-op.
2. If PostHog key missing: immediate no-op.
3. If network fails: no-op + warning log.
4. Analytics failure must never affect feature behavior.

---

## Testing Plan

### Unit tests (TypeScript)
1. `/Users/karatsidhu/Code/Glyph/src/lib/analytics.test.ts`
- disabled => no invoke
- enabled + new user => creates and persists distinct ID
- query/result bucketing correctness
- prohibited property stripping/rejection

2. `/Users/karatsidhu/Code/Glyph/src/lib/settings.test.ts` (or existing test location)
- load defaults for analytics fields
- set/get enabled flag
- distinct ID creation and stability across reloads
- settings:updated payload includes analytics section

### Unit tests (Rust)
1. `/Users/karatsidhu/Code/Glyph/src-tauri/src/analytics/tests.rs`
- allowlist event acceptance
- unknown event rejection
- payload size/length caps
- malformed distinct_id rejection
- disabled/missing-key paths return success no-op

### Integration scenarios (manual + automated where practical)
1. Fresh install:
- analytics disabled by default
- no outbound analytics attempted

2. Enable analytics:
- first event includes persisted distinct_id
- app restart preserves same distinct_id

3. Core events:
- opening vault emits `vault_opened` without path
- search emits only bucketed properties
- AI start emits provider/mode only

4. Failure:
- disconnect network, perform actions, app remains fully functional
- no crashes, no user-facing errors from analytics

5. Privacy regression checks:
- grep logs and event payload builders to ensure no note text/path/query text is sent

---

## Rollout Plan
1. Merge behind runtime toggle default `false`.
2. Internal dogfood build with toggle enabled.
3. Verify payloads in PostHog live events for 24-48h.
4. Public release with clear release-note line on anonymous telemetry toggle.
5. Collect one week of metrics and revisit event usefulness.

---

## Acceptance Criteria
1. Analytics toggle exists in Settings and persists.
2. Disabled state sends zero events.
3. Enabled state sends only allowlisted events/properties.
4. No sensitive data fields present in payloads.
5. All telemetry calls are non-blocking and failure-safe.
6. Type-safe frontend invocation and compile passes (`pnpm build`, `cargo check`).
7. Tests added and passing for critical validation/guardrails.

---

## Risks and Mitigations
1. Risk: accidental sensitive field inclusion.
- Mitigation: dual-layer allowlist + tests + payload caps.

2. Risk: telemetry noise from repeated events.
- Mitigation: emit only on explicit user actions, not renders.

3. Risk: backend dependency drift.
- Mitigation: isolate PostHog usage in single module with small API surface.

4. Risk: user trust concerns.
- Mitigation: explicit setting copy + docs update + default off.

---

## Implementation Task Breakdown (Engineer-Ready Checklist)
1. Add backend analytics module + command + dependency.
2. Add typed frontend command definitions.
3. Add analytics settings keys/getters/setters + settings event type update.
4. Add analytics wrapper helper in frontend.
5. Add settings UI control.
6. Instrument six event call sites.
7. Add TS + Rust tests.
8. Update security/docs.
9. Run validation commands:
- `pnpm check`
- `pnpm build`
- `cd /Users/karatsidhu/Code/Glyph/src-tauri && cargo check`
- targeted tests for new modules.

---

## Assumptions and Defaults Chosen
1. User location and infrastructure are US-first; default PostHog host is US endpoint.
2. Analytics remains opt-in (`false`) by default.
3. Event set is intentionally small and stable in v1.
4. Distinct ID is anonymous local UUID with no account linkage.
5. No disk queue in v1; reliability traded for simplicity and privacy minimization.
6. Any unresolved edge case defaults to “drop event safely.”
