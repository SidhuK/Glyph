# Codex App Server Troubleshooting

## Common Errors

### "failed to start codex app-server"
- Ensure `codex` is installed and available in `PATH`.
- Verify by running `codex app-server` in a terminal.

### Login opens browser but app still shows disconnected
- Click `Refresh` in AI Settings under `Codex (ChatGPT OAuth)`.
- Some providers report login completion asynchronously through notifications.

### "codex request timed out"
- Check network connectivity.
- Restart the app to restart the internal Codex app-server process.
- Re-run login if auth expired.

### AI responses fail immediately with Codex provider
- Confirm profile provider is `Codex (ChatGPT OAuth)` and model is selected.
- Open AI Settings and verify account status is `connected`.

### No streaming text appears
- Check that turn notifications are arriving from app-server.
- If the process exited, restart the app and retry.

## Operational Notes

- Glyph runs Codex App Server as a managed child process over stdio JSON-RPC.
- OAuth is started via `account/login/start` with `type: "chatgpt"`.
- Chat requests use `thread/start` + `turn/start` and stream via notifications.
