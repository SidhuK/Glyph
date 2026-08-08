# ADR 014: Deeplink platform lifecycle and security policy

## Status

Accepted

## Context

ADRs 001–013 lock the product contract for `glyph://` deeplinks. Shipping them requires a single answer for OS delivery, multi-window routing, parser ownership, cold-start queueing, and path/symlink policy so implementation does not invent routes or guess spaces.

## Decision

### Platform delivery

| Platform | Registration | Runtime delivery |
| --- | --- | --- |
| macOS | Static scheme via `tauri-plugin-deep-link` (`CFBundleURLTypes`) | Plugin `on_open_url` only. The plugin hooks the same `RunEvent::Opened`, so our own handler stays `file://`-only to avoid dispatching twice |
| Windows / Linux | Static scheme in plugin config; runtime `register_all` in debug/dev where needed | Plugin `on_open_url`; second-process launches forwarded via `tauri-plugin-single-instance` with `deep-link` feature |

- `file://` / Finder association handling is unchanged (ADR 009).
- Only the configured scheme `glyph` is accepted. No HTTPS / Universal Links (ADR 011).

### Parser ownership

- **One allowlist parser at the native boundary** (`src-tauri/src/deeplink`).
- Frontend may build canonical URLs for copy and may call `deeplink_open` for in-note clicks; it does not re-implement route allowlisting.
- Unknown paths, wrong scheme, missing/extra required params, fragments, non-absolute `space=`, absolute/traversing note `path=` → reject with a visible error (ADR 010).

### Typed action contract

Routes map 1:1 to ADR 013:

| Route | Action |
| --- | --- |
| `glyph://open/note?space=&path=` | `OpenNote` |
| `glyph://open/space?space=` | `OpenSpace` |
| `glyph://search?space=&q=` | `Search` |
| `glyph://open/daily-note?space=` | `OpenDailyNote` |

URL shape: path-style with host + path (`glyph://open/note` → host `open`, path `/note`). Query holds parameters. Canonical encoding uses standard percent-encoding so spaces and Unicode round-trip.

### Window routing

Every route targets the main window. Auxiliary windows (quick note, external
markdown) deliberately inherit the main space session instead of owning one, so
there is no second window a deeplink could be routed to.

1. Normalize `space=` to an absolute path; canonicalize when the path exists.
2. Show and focus the main window, then open that space there (reuse `space_open` / the frontend open-space flow).
3. Emit with `emit_to(MAIN_WINDOW_LABEL, …)`. Plain `emit` is an app-wide broadcast in Tauri v2 regardless of the receiver, so it cannot be used for targeting.

### Native validation

The space directory and, for `open/note`, the resolved note are checked natively
before anything is dispatched. The shell therefore never re-reads the file to
test existence, and a stale link fails with one message instead of a
half-applied space switch.

### Window readiness / queue

- Parsed actions are enqueued in `DeeplinkState` *and* emitted as `deeplink:action`, because the webview is not listening yet on a cold start.
- Each dispatch carries a process-unique id. The frontend drains `deeplink_take_pending` and discards ids it already handled, so the live emit and its queue mirror cannot run twice and a drain cannot destroy an entry it did not deliver.
- Rejections are queued and emitted the same way, so a cold-start failure is still reported.
- The queue is bounded; the oldest entries are dropped first.

### Error wording

Native code emits a coarse machine code (`malformed`, `space_not_found`,
`note_not_found`, `note_not_markdown`); the frontend owns the wording so
deeplink failures are translated like every other user-facing string. The
precise cause stays in the log.

### Symlink and path policy

- **`space=`**: must be absolute. Prefer `canonicalize` so symlinked roots resolve to a real directory. If the path does not exist or is not a directory → error (do not create spaces).
- **`path=` (notes)**: space-relative only. Validate with `paths::join_under()` (rejects absolute segments and `..`). Lexical containment is the security boundary; the resolved absolute path is not re-canonicalized through user-controlled symlinks for escape (same model as other space FS ops). Missing note for `open/note` → error, no create. Daily note create-if-missing stays on the existing frontend daily-note flow (ADR 012).
- Do not treat lexical containment alone as full symlink containment for *space roots*; space identity always goes through canonicalize when the root exists.

### Failure UX (ADR 010)

- Parse/route failures emit `deeplink:error` (or an error-shaped action delivery) so the focused/main window shows a toast.
- Generic messages; avoid dumping raw sensitive path internals beyond what the user already supplied in the URL.

### In-app copy and click (ADR 007)

- File-tree “Copy deeplink” for markdown notes builds `glyph://open/note?space=<abs>&path=<rel>`.
- In-note `glyph://` activation invokes the same native `deeplink_open` dispatcher as external opens.

## Consequences

- Scheme registration and single-instance are required dependencies for desktop delivery.
- New routes require a new accepted ADR; the parser stays a closed allowlist.
- Frontend dispatch reuses existing open-note, open-space, search palette, and daily-note flows; it does not invent parallel navigation.
