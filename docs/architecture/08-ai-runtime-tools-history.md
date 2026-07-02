# AI Runtime, Tools, and History

Glyph has one AI panel in the frontend and several backend runtimes. Rig-backed providers use local workspace tools. Dedicated providers such as Codex, Amp, Claude Code, OpenCode, and Pi use native runtime modules. Completed and cancelled chat paths stream events back to React and write history under the active space.

## Main Files

Frontend:

- `src/components/ai/AIPanel.tsx`: panel composition
- `src/components/ai/AIComposer.tsx`: prompt input and context attachment
- `src/components/ai/AIChatThread.tsx`: conversation rendering
- `src/components/ai/AIToolTimeline.tsx`: tool/status rendering
- `src/components/ai/ModelSelector.tsx`: provider/model selection
- `src/components/ai/hooks/useRigChat.ts`: streaming chat hook
- `src/components/ai/useAiProfiles.ts`: profile state
- `src/components/ai/useAiContext.ts`: context attachment and build flow
- `src/components/settings/AiSettingsPane.tsx`: AI settings shell
- `src/components/settings/ai/`: provider, API key, model, Codex account settings

Backend:

- `src-tauri/src/ai_rig/types.rs`: shared AI types
- `src-tauri/src/ai_rig/commands.rs`: profiles, secrets, chat start/cancel, history commands
- `src-tauri/src/ai_rig/runtime.rs`: Rig provider runtime
- `src-tauri/src/ai_rig/tools.rs`: space-scoped tool bundle
- `src-tauri/src/ai_rig/context.rs`: context indexing and payload building
- `src-tauri/src/ai_rig/store.rs`: app-level AI profile store
- `src-tauri/src/ai_rig/local_secrets.rs`: per-space API keys
- `src-tauri/src/ai_rig/history.rs`: chat history readers
- `src-tauri/src/ai_rig/audit.rs`: audit/history writes
- `src-tauri/src/ai_codex/`: Codex account and chat runtime
- `src-tauri/src/ai_amp/`, `ai_claude_code/`, `ai_opencode/`, `ai_pi/`: dedicated provider runtimes

## Provider Model

`AiProviderKind` supports:

- OpenAI
- OpenAI-compatible
- OpenRouter
- Anthropic
- Gemini
- Ollama
- llama.cpp
- Codex ChatGPT
- Amp
- Claude Code
- OpenCode
- Pi

Profiles store:

- provider
- model
- base URL
- custom headers
- private-host permission
- reasoning effort

Profiles live in app config at `ai.json`, not in the space. API keys live per space through `local_secrets.rs` so each space can have separate credentials.

Default profiles are generated in `ensure_default_profiles()`. Provider ids are stable provider keys such as `openai`, `anthropic`, and `codex_chatgpt`.

## Profile Store

`ai_rig/store.rs` reads and writes `ai.json` under Tauri app config.

Rules:

- Every supported provider gets one normalized profile.
- Profile id and display name are derived from provider kind.
- Deleting a profile clears model/base URL/headers rather than removing the provider slot.
- Local providers default to `allow_private_hosts = true`.
- Store writes use `io_atomic::write_atomic()`.

Profile update commands emit `ai:profiles-updated`.

## Secrets

AI API keys are managed through commands:

- `ai_secret_set`
- `ai_secret_clear`
- `ai_secret_status`
- `ai_secret_list`

These commands require an open space. They store secrets outside note content and outside `ai.json`.

Current storage path:

```text
.glyph/Glyph/ai_secrets.json
```

Normal workspace file APIs and AI tools reject hidden `.glyph/` paths, so standard in-app file access cannot read this file. The file is sensitive app metadata, not an encrypted keychain item.

Never put API keys into:

- `.glyph/databases.json`
- the app-support search index database
- AI audit logs
- frontend settings JSON
- app traces

## Chat Start Flow

Frontend flow in `useRigChat()`:

1. User sends text.
2. The hook appends a user message and empty assistant message.
3. It subscribes to `ai:chunk`, `ai:done`, and `ai:error`.
4. It calls `ai_chat_start`.
5. It receives `job_id`.
6. It streams chunks into the assistant message.
7. Done settles after a short delay so late chunks can arrive.

Backend flow in `ai_chat_start()`:

1. Allocate `job_id`.
2. Resolve `history_id` from thread id or job id.
3. Register a cancellation token in `AiState`.
4. Force audit on unless caller explicitly already set it.
5. Resolve active space root.
6. Load normalized profiles and selected profile.
7. Validate model unless the provider runtime owns its model default.
8. Spawn an async task.
9. Resolve API key from local secrets.
10. Split system messages from chat messages.
11. Call `run_request()`.
12. Retry once for transient provider errors.
13. Emit done or error.
14. Write audit/history after successful or cancelled runs when a space exists.
15. Finish the job in `AiState`.

Cancellation calls `ai_chat_cancel`, which cancels the token by job id.

## Runtime Selection

`run_request()` chooses the runtime:

- `CodexChatgpt`: `ai_codex::chat::run_with_codex`
- `OpenCode`: `ai_opencode::run_with_opencode`
- `Amp`: `ai_amp::run_with_amp`
- `ClaudeCode`: `ai_claude_code::run_with_claude_code`
- `Pi`: `ai_pi::run_with_pi`
- everything else: `runtime::run_with_rig`

Dedicated runtimes return the same tuple as Rig:

```rust
(String, bool, Vec<AiStoredToolEvent>)
```

That keeps the command and history path shared even when provider internals differ.

## Rig Runtime

`run_with_rig()` supports OpenAI, OpenAI-compatible, OpenRouter, Anthropic, Gemini, Ollama, and llama.cpp.

It:

1. Requires an open space.
2. Adds create-mode tool discipline to the system prompt.
3. Builds a transcript.
4. Creates a `ToolBundle` for the active root.
5. Builds provider client and agent.
6. Attaches tools in create mode.
7. Streams text and tool events through `run_stream()`.
8. Emits finalizing status.

Create mode gets tools. Chat mode does not.

Ollama can retry without tools when the selected model rejects tool calling.

OpenAI-compatible and llama.cpp can try alternate base URLs when needed.

## Streaming Events

Backend emits:

- `ai:status`: thinking, tool_call, tool_result, finalizing, or provider-specific detail
- `ai:chunk`: assistant text delta
- `ai:tool`: tool call/result/error record
- `ai:done`: job completed or cancelled
- `ai:error`: job failed

Frontend uses:

- `useRigChat()` for chunk/done/error
- `useAiToolEvents()` for tool timeline/status

Events carry `job_id`. Frontend handlers must ignore events that do not match the active job.

## Tool Bundle

Rig create mode exposes tools from `ai_rig/tools.rs`:

- `list_dir`
- `search`
- `stat`
- `read_file`
- `read_files_batch`
- `write_file`
- `apply_patch`
- `move`
- `mkdir`
- `delete`

Tool safety rules:

- All paths are relative to active space.
- Paths are normalized.
- `..` is rejected.
- hidden path components are rejected.
- reads block binary or oversized files.
- read output is capped.
- list and search output is capped.
- recursive delete requires `CONFIRM`.
- overwrite move requires `CONFIRM`.
- writes use `io_atomic::write_atomic()`.

Tool writes currently operate at the filesystem level. If a tool writes Markdown, the normal watcher should update the index. If you add direct note-write tools, consider explicit `index_note()` calls and note-change events.

## Tool Loop Limit

`run_stream()` keeps at most 10 tool events. If the model loops through too many tools, the runtime returns:

```text
tool loop detected; stopping after too many tool calls
```

This protects the user from runaway tool use and unbounded history logs.

## AI Context

`ai_rig/context.rs` builds prompt context from selected attachments.

Commands:

- `ai_context_index`: list folders and files available for attachment
- `ai_context_build`: read selected files/folders into a bounded text payload
- `ai_context_resolve_paths`: expand attachments into concrete paths

Defaults and limits:

- file list limit: 20,000
- default context budget: 12,000 chars
- max context budget: 250,000 chars
- token estimate: chars divided by 4

Folders add a heading and then include files until budget runs out. Duplicate files are skipped.

Context response includes:

- `payload`
- `manifest`
- `resolved_paths`

The manifest gets written to audit logs so users can inspect what the model saw.

## Codex Account Runtime

`ai_codex/commands.rs` exposes account commands:

- `codex_account_read`
- `codex_login_start`
- `codex_login_complete`
- `codex_logout`
- `codex_rate_limits_read`

`ai_codex/chat.rs` runs Codex chat through a JSON-RPC transport held in `CodexState`.

Codex chat:

- defaults model to `gpt-5.1-codex` if profile model is empty
- starts or resumes a thread
- sets working directory to the active space root
- uses `approvalPolicy = "never"`
- converts Codex notifications into Glyph AI chunk/tool/status events

Because Codex owns its own account flow, it does not use API keys from `ai_secret_*`.

## History and Audit

After a successful or cancelled run, `ai_chat_start()` calls `write_audit_log()`.

`write_audit_log()` writes two records:

- per-run audit JSON under `.glyph/cache/ai/{job_id}.json`
- chat history under `.glyph/Glyph/ai_history/{history_id}.json`

Chat history lives under:

```text
.glyph/Glyph/ai_history/
```

The per-run audit JSON includes:

- job id
- profile details without secrets
- request messages
- context manifest
- truncated context
- truncated response
- cancellation state
- tool events
- `outcome`, currently initialized as `null`

The chat history includes:

- version: 1
- stored job id, using the resolved history id
- generated title
- creation timestamp
- cancellation state
- profile details without secrets
- messages with the assistant response appended when present
- tool events

The durable chat history schema currently uses version 1 to prevent migration
drift.

History commands:

- `ai_chat_history_list`
- `ai_chat_history_get`

The title generator uses the selected provider when possible. Dedicated runtimes return fixed titles such as `Codex Chat`.

## Provider Metadata

On startup, Rust refreshes provider support metadata from LiteLLM's provider endpoint support JSON. It caches the document in app config and falls back to cached data when network fetch fails.

This powers provider settings UI. The app should tolerate missing metadata because offline use remains a core constraint.

## Change Checklist

When changing AI behavior:

1. Keep profile config separate from API keys.
2. Require an open space for workspace context, tools, and local secrets.
3. Emit job-scoped events and ignore non-active jobs in React.
4. Keep create-mode tools space-scoped.
5. Cap tool reads, lists, searches, and context payloads.
6. Write audit/history without secrets.
7. Update `AiProviderKind`, default profiles, model lists, logos, settings UI, and runtime selection together when adding a provider.
8. Preserve cancellation token checks inside streaming loops.
9. Keep native runtimes returning the same tuple shape as Rig.

## Debugging Map

- Chat starts then no chunks: inspect event subscription timing in `useRigChat()`.
- Wrong provider runtime: inspect `run_request()`.
- Model setting ignored: inspect provider default profile and dedicated runtime defaults.
- Tools can read hidden files: inspect `normalize_rel_path()` and `safe_join()`.
- Context too large: inspect `ai_context_build` budget and manifest.
- History missing: inspect active space and `write_audit_log()`.
- Codex login hangs: inspect `codex_login_complete` notification matching by flow id.
