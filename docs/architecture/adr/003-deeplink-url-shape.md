# ADR 003: Deeplink URL shape

## Status

Accepted

## Context

External callers need a single canonical URL format. Two common patterns: path-style actions (`glyph://open/note?…`) vs catch-all query style (`glyph://open?vault=…&file=…`).

## Decision

Use **path-style** URLs: one action per path, parameters in the query string.

Illustrative shapes (exact parameter names still open):

- `glyph://open/note?path=…&space=…`
- `glyph://open/space?space=…`
- `glyph://search?q=…`
- `glyph://open/daily-note?space=…`

Do not adopt Obsidian-style catch-all `glyph://open?…` as the canonical format.

## Consequences

- Easy to document and extend with new paths later (within the locked action surface).
- Parser rejects unknown paths rather than interpreting ambiguous query bags.
- Parameter naming (`path` vs `file`, `space` vs `vault`) remains a follow-on decision.
