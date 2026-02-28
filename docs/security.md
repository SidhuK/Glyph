# Security Notes

## Filesystem Scoping

- All space file paths are joined under the active space root using `src-tauri/src/paths.rs` (`join_under()`), which rejects path traversal.
- Space writes use crash-safer atomic writes via `src-tauri/src/io_atomic.rs`.

## Network Hardening

- Link preview fetching blocks `localhost` and private IP ranges by default and uses strict timeouts and size limits.
- AI providers validate `base_url` hosts similarly; non-HTTPS base URLs are blocked unless the profile explicitly enables `allow_private_hosts` (intended for local providers like Ollama).

## Secrets Handling

- AI API keys are stored in the OS keychain via the Rust `keyring` crate.
- Secrets are not written to the space or to `ai.json` (legacy secrets are migrated on load when possible).

## Audit Logs

- AI requests/responses are optionally logged under `space/cache/ai/` without secrets.
- Logs include the user-approved context manifest and an `outcome` field (applied/rejected/created_*).

## Analytics (PostHog)

- Analytics is opt-in and disabled by default via Settings -> General -> Anonymous Analytics.
- Events are sent from the Rust backend only, using `POSTHOG_API_KEY` and optional `POSTHOG_HOST`.
- Only coarse product usage events are collected (for example app start, space open, search bucket metrics).
- Note content, note paths, AI prompts, search text, URLs, and API secrets are never sent.
