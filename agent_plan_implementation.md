# Agent Plan Implementation (Revised)

## Goal
Add autonomous vault tool use to the AI chat loop so the model can:
- Search notes (`search_vault`)
- List files/folders (`list_files`)
- Read file contents (`read_file`)

This should work inside the current Lattice AI flow without changing provider-specific APIs.

## Feasibility (Can We Do This Properly?)
Yes. The repo already has the primitives we need:
- Search: `src-tauri/src/index/commands.rs` (`search`)
- File listing: `src-tauri/src/vault_fs/list.rs`
- File reading: `src-tauri/src/vault_fs/read_write.rs`
- Path safety: `src-tauri/src/paths.rs` (`join_under`)
- Typed IPC boundary: `src/lib/tauri.ts`

Main missing pieces:
1. Agent loop orchestration (tool-call parse/execute/re-prompt)
2. Tool execution module with strict caps and validation
3. Prompt protocol and optional UI trace for tool activity

## Skill-Driven Plan
Skills to use for this implementation sequence:

| Skill | Source | How it is used |
|---|---|---|
| `brainstorming` | local | Lock scope and success criteria before coding |
| `typescript-advanced-types` | `.agents/skills/` | Strongly typed tool payloads/events across frontend |
| `frontend-patterns` | `.agents/skills/` | UI event wiring and non-invasive sidebar updates |
| `rust-async-patterns` | local | Cancellation-safe async loop and streaming behavior |
| `tauri` | local | Safe path handling and frontend/backend boundary rules |

Note: there is no Rust-specific skill under `.agents/skills` in this repo, so Rust guidance uses local fallback skills (`rust-async-patterns`, `tauri`).

## Existing AI Workflow Integration
Target flow:
1. User sends chat request.
2. Backend builds system prompt with tool schema.
3. Agent loop calls provider silently (`emit_chunks = false`).
4. Model response is parsed:
   - Tool call JSON: execute tool, append structured result, continue loop.
   - Final JSON: fake-stream final text to frontend and finish.
   - Plain text: fake-stream text and finish (graceful fallback).
5. Existing `ai:done` and `ai:error` behavior remains unchanged.

## Tool Contracts

### `search_vault`
- Args: `{ query: string; limit?: number }`
- Caps: `limit <= 20`
- Backend mapping: reuse search internals from `index` module
- Returns: `Array<{ id: string; title: string; snippet: string; score: number }>`

### `list_files`
- Args: `{ dir?: string | null; recursive?: boolean; limit?: number }`
- Caps: `limit <= 2000`
- Backend mapping: reuse `vault_fs/list.rs`
- Returns: `Array<{ name: string; rel_path: string; kind: "file" | "dir"; is_markdown: boolean }>`

### `read_file`
- Args: `{ path: string; max_bytes?: number }`
- Caps: `max_bytes <= 32000`
- Backend mapping: reuse `vault_read_text_preview` behavior
- Returns: `{ rel_path: string; text: string; truncated: boolean }`

## Implementation Plan

### Phase 0: Scope and Constraints
- Confirm MVP includes only `search_vault`, `list_files`, `read_file`.
- Keep Tauri IPC and frontend chat contracts backward-compatible.
- Enforce all caps server-side (never trust model-provided args).

### Phase 1: Rust Tool Executor
Files:
- `src-tauri/src/ai/tools.rs` (new)
- `src-tauri/src/ai/mod.rs`

Tasks:
1. Define tool request/response structs and enums.
2. Parse and validate args with defaults and hard caps.
3. Dispatch to internal vault/index functions (not `#[tauri::command]` wrappers).
4. Normalize error payloads (`success: false`, stable `error_code`, safe message).

Acceptance:
- Each tool can run independently in Rust with deterministic JSON output.

### Phase 2: Rust Agent Loop
Files:
- `src-tauri/src/ai/agent.rs` (new)
- `src-tauri/src/ai/helpers.rs`

Tasks:
1. Add `AgentResponse` parser: `tool_call` | `final` | `plain_text`.
2. Implement max iteration cap (`6`) and tool-output budget cap (`120_000 chars`).
3. Append tool results as explicitly untrusted data.
4. Add “budget exhausted => final answer now” nudge behavior.

Acceptance:
- Loop terminates safely under malformed output, infinite-call patterns, and budget limits.

### Phase 3: Streaming and Command Wiring
Files:
- `src-tauri/src/ai/streaming.rs`
- `src-tauri/src/ai/commands.rs`

Tasks:
1. Add `emit_chunks: bool` to all provider streaming functions.
2. In tool loop turns, capture response silently (`emit_chunks = false`).
3. On final/plain response, fake-stream chunks to existing `ai:chunk` consumers.
4. Preserve cancellation semantics (`ai_chat_cancel`) through loop boundaries.

Acceptance:
- Current chat UX still streams output and cancel still works during tool-enabled runs.

### Phase 4: TypeScript Typing and Optional Tool Trace UI
Files:
- `src/lib/tauri.ts`
- `src/components/ai/AIPane.tsx` or `src/components/ai/AISidebar.tsx`

Tasks (TypeScript skill focus):
1. Add typed `ai:tool` event payload type.
2. Optional: show lightweight “Searching vault… / Reading file…” status row.
3. Keep UI additive; no disruption to existing chat message rendering.

Acceptance:
- Tool activity is visible when enabled and no regressions in existing AI sidebar behavior.

### Phase 5: Security and Audit Hardening
Files:
- `src-tauri/src/ai/tools.rs`
- `src-tauri/src/ai/commands.rs`
- `src-tauri/src/ai/audit.rs` (if needed)

Tasks:
1. Block traversal/absolute paths via existing safe join strategy.
2. Redact or bound oversized tool outputs before prompt injection.
3. Audit tool calls and summarized results (not full sensitive payloads).
4. Keep secrets out of logs/events.

Acceptance:
- Security invariants match repository rules in `AGENTS.md` and `docs/security.md`.

## Guardrails
- Max tool iterations per user turn: `6`
- Max aggregate tool result chars: `120_000`
- Max read bytes per tool call: `32_000`
- Max search results per tool call: `20`
- Max list entries per tool call: `2_000`
- Any invalid JSON/protocol mismatch: treat as plain final text
- No vault open: return clear error and skip tool execution

## Test Plan

### Rust tests
1. Parser tests for valid tool/final JSON and malformed fallbacks.
2. Validation tests for caps and argument defaults.
3. Path safety tests (`..`, absolute path, hidden/system paths).
4. Loop termination tests (iteration/budget caps).

### Integration tests
1. `search_vault` then `read_file` chain works in one turn.
2. `list_files` scoped listing works for root and nested dirs.
3. Cancellation during loop exits cleanly.
4. No-vault behavior fails safely and predictably.

### Frontend checks
1. Existing chat still renders streamed chunks.
2. Optional tool trace appears and clears correctly.
3. No type regressions in `src/lib/tauri.ts` and AI components.

## Delivery Sequence
1. Implement Phase 1 + unit tests.
2. Implement Phase 2 + parser/loop tests.
3. Wire Phase 3 and run manual provider matrix checks.
4. Add Phase 4 UI trace (optional but recommended).
5. Finish Phase 5 hardening, then run:
   - `pnpm check`
   - `pnpm build`
   - `cd src-tauri && cargo check`

## Definition of Done
- Model can autonomously search/list/read vault data in one turn.
- Behavior is provider-agnostic across current AI providers.
- All guardrails enforced server-side.
- Existing chat UX and typed IPC boundaries remain stable.
