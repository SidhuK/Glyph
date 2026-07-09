# ADR 007: In-app deeplink copy and clickability

## Status

Accepted

## Context

Deeplinks are most useful if users can obtain a URL for a note and if `glyph://` URLs pasted or written in notes behave like links. The file tree is a natural place to copy a link for a note without opening it.

## Decision

v1 includes:

1. **Copy deeplink** — available from the **file tree** (for a note), producing a canonical `glyph://open/note?…` URL with required `space=` and note path.
2. **Clickable `glyph://` links inside notes** — activating such a link runs the same deeplink dispatch as an external open (match-by-space, require `space=`, etc.).

## Consequences

- Editor/markdown link handling must recognize the `glyph` scheme and route through deeplink dispatch (security rules apply the same as external opens).
- File-tree context menu (or equivalent) gains a copy-deeplink action; exact label/placement still open.
- Copy for non-note targets (space-only, search, daily note) is not required by this decision unless a later ticket adds it.
