# Glossary: deeplinks

Terms for the custom URL scheme effort. Updated as decisions land.

| Term | Meaning |
| --- | --- |
| **Scheme** | The URL scheme registered with the OS. Locked: `glyph` → `glyph://…`. |
| **Deeplink** | A `glyph://` URL that asks Glyph to perform a navigation or open action. |
| **File open** | Existing `file://` / Finder association path that opens markdown in an external window — distinct from in-space deeplinks unless later unified. |
| **Special tab** | In-app views such as connections, collections/databases, calendar. **Never** targeted by `glyph://` deeplinks. |
| **Deeplink action surface** | Allowed targets: notes, spaces, search, daily notes (and closely related open flows). |
| **Path-style URL** | Canonical format: action in the path, args in the query (e.g. `glyph://open/note?path=…`). Not catch-all `glyph://open?…`. |
| **Space parameter** | Absolute filesystem path to the space root. **Required on every v1 deeplink.** No display-name or synthetic-id aliases. |
| **Cold start** | If Glyph is not running (or the target space is not open), launch/focus the app, open/focus `space=`, then run the action. Never guess the space. |
| **Match by space** | Multi-window rule: deliver the deeplink to a window already on that `space=`; otherwise open/focus a window for that space. Never use a different space’s focused window. |
| **Copy deeplink** | v1 file-tree action that copies a canonical `glyph://open/note?…` for a note (with required `space=`). |
| **In-note `glyph://`** | v1: `glyph://` links in notes are clickable and use the same dispatch as external deeplinks. |
| **Note path parameter** | Path **relative to the space root** (e.g. `path=notes/foo.md`). Not an absolute filesystem path. |
| **External markdown open** | Finder / `file://` association path — stays the external markdown window; not unified with `glyph://` in this effort. |
| **Deeplink failure** | Invalid/missing space, bad path, missing note, unknown route → visible **error**; never silent no-op or auto-create. |
| **Local scheme only** | Deeplinks are `glyph://` on-device only. No HTTPS Universal Links / App Links — ever, for this feature. |
| **Daily-note deeplink** | `glyph://open/daily-note?space=…` → **today’s** daily note only; create if missing (reuse in-app flow). No dated parameter in v1. |
