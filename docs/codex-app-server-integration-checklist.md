# Codex App Server Integration Checklist (Full Scope, Single Go)

This checklist defines the complete end-to-end implementation for adding Codex App Server + ChatGPT OAuth into Glyph, integrated with the existing AI panel, streaming UX, history, and citations.

## 1. Product and UX Requirements Lock

- [ ] Confirm provider name and labels in UI.
- [ ] Decide final naming for mode/provider in code: `codex_chatgpt`.
- [ ] Define account states to render in UI:
- [ ] `disconnected`
- [ ] `connecting`
- [ ] `connected`
- [ ] `auth_expired`
- [ ] `error`
- [ ] Confirm OAuth UX copy for button, loading, and failure toasts.
- [ ] Confirm whether Codex provider is visible by default or behind a feature flag.
- [ ] Define explicit behavior when no vault is open (disable chat vs allow limited mode).

## 2. Data Model and Type Additions

### Frontend (`src/lib/tauri.ts`, AI types)
- [ ] Add `codex_chatgpt` to AI provider kind union.
- [ ] Add typed command defs for Codex commands:
- [ ] `codex_account_read`
- [ ] `codex_login_start`
- [ ] `codex_login_complete`
- [ ] `codex_logout`
- [ ] `codex_chat_start`
- [ ] `codex_chat_cancel`
- [ ] `codex_rate_limits_read` (if exposed separately)
- [ ] Add Codex event payload types in `src/lib/tauriEvents.ts`:
- [ ] `codex:chunk`
- [ ] `codex:done`
- [ ] `codex:error`
- [ ] `codex:status`
- [ ] `codex:tool` (if tool event stream is available)

### Backend (`src-tauri/src/ai_codex/types.rs`)
- [ ] Define JSON-RPC request/response envelope structs.
- [ ] Define account/session models.
- [ ] Define login start/completion payload structs.
- [ ] Define turn streaming event structs.
- [ ] Define standardized backend error payload shape mapped to frontend.

## 3. Rust Module Layout

- [ ] Create new module folder: `src-tauri/src/ai_codex/`.
- [ ] Add files:
- [ ] `mod.rs`
- [ ] `types.rs`
- [ ] `transport.rs`
- [ ] `process.rs`
- [ ] `auth.rs`
- [ ] `chat.rs`
- [ ] `store.rs`
- [ ] `events.rs`
- [ ] Export module in `src-tauri/src/lib.rs`.

## 4. Codex App Server Process Management

### `src-tauri/src/ai_codex/process.rs`
- [ ] Implement managed sidecar launch (child process).
- [ ] Add startup health-check handshake.
- [ ] Add process supervision and restart on unexpected exit.
- [ ] Add graceful shutdown when app exits.
- [ ] Add stderr/stdout capture for debug logs (without sensitive data).
- [ ] Add in-memory process state with thread-safe access.

### State registration
- [ ] Add shared `CodexState` in Tauri builder via `.manage(...)` in `src-tauri/src/lib.rs`.
- [ ] Ensure startup initialization in `.setup(...)`.

## 5. JSON-RPC Transport Layer

### `src-tauri/src/ai_codex/transport.rs`
- [ ] Implement request id generation.
- [ ] Implement async request/response dispatch.
- [ ] Implement timeout policy per RPC type.
- [ ] Implement stream/event subscription handling.
- [ ] Add robust parse and protocol error handling.
- [ ] Add reconnect handling if process restarts.

## 6. Auth Flow (ChatGPT OAuth)

### `src-tauri/src/ai_codex/auth.rs`
- [ ] Implement command: `codex_account_read`.
- [ ] Implement command: `codex_login_start`.
- [ ] Return auth URL and correlation id/session token.
- [ ] Implement command: `codex_login_complete`.
- [ ] Implement command: `codex_logout`.
- [ ] Map protocol account states into app-friendly states.

### Frontend wiring
- [ ] Add "Sign in with ChatGPT" in AI settings pane (`src/components/settings/AiSettingsPane.tsx`).
- [ ] Open auth URL via opener plugin.
- [ ] Poll account state during pending login or subscribe to update events.
- [ ] Show connected account summary in settings and AI panel.

## 7. Persisted Session/Provider State

### Backend store
- [ ] Extend AI store to support Codex provider metadata in `src-tauri/src/ai_rig/store.rs` or dedicated `ai_codex/store.rs`.
- [ ] Persist non-secret session metadata needed to restore UX state.
- [ ] Keep sensitive material outside logs and in secure storage if required by protocol.

### Frontend profile integration
- [ ] Include Codex provider in profile creation/editing UI (`src/components/settings/ai/AiProfileSections.tsx`).
- [ ] Ensure active profile switching works between Codex and existing providers.

## 8. Chat Runtime Integration

### Backend commands (`src-tauri/src/ai_codex/chat.rs`)
- [ ] Implement `codex_chat_start` command.
- [ ] Implement `codex_chat_cancel` command.
- [ ] Convert UI messages/context payload to Codex turn format.
- [ ] Emit chunk/status/done/error events to frontend.
- [ ] Capture tool execution events if protocol provides them.

### Router in existing AI entry path
- [ ] In `src-tauri/src/ai_rig/commands.rs`, route requests by provider:
- [ ] Existing providers -> current Rig runtime
- [ ] `codex_chatgpt` -> `ai_codex` runtime path
- [ ] Keep same external command contract for frontend where possible.

## 9. Frontend Chat Hook Integration

### `src/components/ai/hooks/useRigChat.ts`
- [ ] Generalize or split hook to support Codex event namespace.
- [ ] Preserve existing status machine: `submitted`, `streaming`, `ready`, `error`.
- [ ] Keep stop/cancel semantics identical for UI consistency.
- [ ] Ensure thread id handling remains stable for both providers.

### `src/components/ai/AIPanel.tsx`
- [ ] Route send behavior by selected profile provider.
- [ ] Keep existing context attachment flow intact.
- [ ] Keep retry/new chat/history UX unchanged.

## 10. Context Attachment and Prompt Mapping

### Existing context flow
- [ ] Reuse current `ai_context_index` and `ai_context_build` commands.
- [ ] Include payload + manifest in Codex chat requests.
- [ ] Ensure context sizes remain bounded by existing char budget.

### Mapping quality
- [ ] Ensure role mapping from UI messages to Codex format is lossless.
- [ ] Preserve system instructions and tool discipline prompts.

## 11. Citations and Source Linking Parity

- [ ] Preserve clickable note citations for Codex responses.
- [ ] Keep numeric footnote citations and collapsible cited-notes panel behavior in AI thread UI.
- [ ] Populate citations from:
- [ ] Codex tool events when available
- [ ] fallback context manifest/resolved paths
- [ ] Verify citation links open notes in-app via markdown-link event path.

## 12. History and Audit Integration

### Backend
- [ ] Extend `src-tauri/src/ai_rig/history.rs` support for Codex provider sessions.
- [ ] Keep versioning and schema consistent with current history format.
- [ ] Store tool events/citation metadata for replay.

### Frontend
- [ ] Ensure `useAiHistory` can load and replay Codex chats + timeline.
- [ ] Ensure restoring a Codex chat keeps provider/model labels correct.

## 13. Rate Limits and Account Visibility

- [ ] Add command for account/rate limits read if available in protocol.
- [ ] Display readable limit status in AI settings pane.
- [ ] Surface proactive UI warnings before sending when limits are exhausted.

## 14. Error Handling and Recovery UX

- [ ] Standardize error categories:
- [ ] auth required
- [ ] auth expired
- [ ] app server unavailable
- [ ] transport timeout
- [ ] rate limit exceeded
- [ ] provider internal error
- [ ] Add user actions per error state:
- [ ] reconnect login
- [ ] retry request
- [ ] switch provider
- [ ] Provide clear toasts/banner messages in panel and settings.

## 15. Security and Privacy Controls

- [ ] Confirm no secret/token values are logged in Rust or TS.
- [ ] Redact sensitive payloads in diagnostics.
- [ ] Verify secure local storage handling for auth/session material.
- [ ] Verify SSRF/path controls remain unchanged for tooling.

## 16. Capability and Permission Checks

- [ ] Verify existing Tauri permissions for opener and window focus are sufficient for OAuth browser flow.
- [ ] Add/adjust capability permissions only if new APIs require them.
- [ ] Rebuild generated schemas if capability files change.

## 17. Observability and Debug Instrumentation

- [ ] Add structured tracing spans for:
- [ ] login start/complete
- [ ] chat start/cancel/done
- [ ] transport reconnects
- [ ] stream errors
- [ ] Add debug-level command to inspect codex connection status for support diagnostics.

## 18. Test Coverage (Required)

### Rust tests
- [ ] Unit tests for JSON-RPC envelope parsing.
- [ ] Unit tests for auth state transitions.
- [ ] Unit tests for event stream parsing.
- [ ] Unit tests for command error mapping.

### Frontend tests
- [ ] Hook tests for chat state transitions under Codex events.
- [ ] UI tests for auth states in settings.
- [ ] UI tests for citations and link opening events.

### End-to-end/manual matrix
- [ ] Fresh login happy path.
- [ ] App restart with persisted connected state.
- [ ] Expired auth recovery path.
- [ ] Mid-stream cancel.
- [ ] Network interruption during stream.
- [ ] Provider switch from Codex to existing providers and back.

## 19. Documentation Updates

- [ ] Update `README.md` with Codex provider support and setup notes.
- [ ] Add operator troubleshooting guide in `docs/`.
- [ ] Document known limitations and fallback behavior.

## 20. Definition of Done (Full Scope)

- [ ] User can sign in via ChatGPT OAuth from Glyph settings.
- [ ] User can select Codex profile and send chats in AI panel.
- [ ] Streaming response, cancel, retry, and history all work with Codex provider.
- [ ] Citations are shown as numeric footnotes and expandable cited-note list.
- [ ] Clicking citations opens referenced markdown notes in-app.
- [ ] Rate limit/account status is visible to the user.
- [ ] All tests/build checks pass:
- [ ] `pnpm check`
- [ ] `pnpm build`
- [ ] `cargo check`
- [ ] No regressions in existing non-Codex providers.
