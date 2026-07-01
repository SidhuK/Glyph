# Security Notes

## Filesystem Scoping

- All space file paths are joined under the active space root using `src-tauri/src/paths.rs` (`join_under()`), which rejects path traversal.
- Space writes use crash-safer atomic writes via `src-tauri/src/io_atomic.rs`.

## Network Hardening

- `src-tauri/src/net.rs` rejects `localhost`, private IPs, loopback, link-local, documentation ranges, multicast, unspecified hosts, and non-HTTP(S) schemes.
- AI provider `base_url` values pass through that host validation. Plain HTTP is blocked unless the profile enables `allow_private_hosts`, which is intended for local providers such as Ollama and llama.cpp.

## Secrets Handling

- AI API keys are stored per space in `.glyph/Glyph/ai_secrets.json` by `src-tauri/src/ai_rig/local_secrets.rs`.
- Normal workspace file APIs block hidden `.glyph/` paths, so the file tree, previews, and AI tools cannot read that file through standard space-relative access.
- Secrets are not written to `ai.json`, SQLite index rows, or AI history logs.

## Audit Logs

- Completed and cancelled AI requests write per-run audit JSON under `.glyph/cache/ai/` and chat history under `.glyph/Glyph/ai_history/`.
- Audit JSON includes request messages, context manifest, truncated context, truncated response, tool events, and an `outcome` field currently initialized as `null`.
