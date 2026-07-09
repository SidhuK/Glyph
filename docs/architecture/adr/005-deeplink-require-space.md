# ADR 005: Deeplinks always require a space

## Status

Accepted

## Context

Deeplinks may arrive when Glyph is not running, when no space is open, or when a different space is focused. Callers need a predictable rule for which vault an action applies to.

## Decision

Every v1 `glyph://` route **requires** an absolute `space=` parameter (filesystem path to the space root).

Cold-start / dispatch behavior:

1. Launch Glyph if needed (or focus the running app).
2. Open or focus the space named by `space=`.
3. Then perform the action (open note, open space only, search, daily note).

Do not fall back to “whatever space is already open.” Do not omit `space=` for search or any other v1 action. If `space=` is missing or invalid, fail clearly (do not guess).

## Consequences

- One consistent rule for Shortcuts, scripts, and docs.
- Every shared link is tied to a concrete vault path.
- Invalid or missing `space=` is a hard error path (exact UX still open).
