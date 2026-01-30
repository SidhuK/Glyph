# Security Notes

## Filesystem Scoping

- All vault file paths are joined under the active vault root using `src-tauri/src/paths.rs` (`join_under()`), which rejects path traversal.
- Vault writes use crash-safer atomic writes via `src-tauri/src/io_atomic.rs`.

## Network Hardening

- Link preview fetching blocks `localhost` and private IP ranges by default and uses strict timeouts and size limits.
- AI providers validate `base_url` hosts similarly; non-HTTPS base URLs are blocked unless the profile explicitly enables `allow_private_hosts` (intended for local providers like Ollama).

## Secrets Handling

- AI API keys are stored in the OS keychain via the Rust `keyring` crate.
- Secrets are not written to the vault or to `ai.json` (legacy secrets are migrated on load when possible).

## Audit Logs

- AI requests/responses are optionally logged under `vault/cache/ai/` without secrets.
- Logs include the user-approved context manifest and an `outcome` field (applied/rejected/created_*).

