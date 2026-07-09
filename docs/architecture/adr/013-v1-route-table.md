# ADR 013: v1 deeplink route table

## Status

Accepted

## Context

Callers and implementers need an exact, closed list of v1 routes. Broader surfaces (special tabs, HTTPS links, dated daily notes) are already ruled out.

## Decision

v1 supports **only** these path-style routes. Every route requires absolute `space=`.

| Route | Required params | Behavior |
| --- | --- | --- |
| `glyph://open/note` | `space=`, `path=` (relative to space) | Open/focus space, open note. Missing note → error (no create). |
| `glyph://open/space` | `space=` | Open/focus space. |
| `glyph://search` | `space=`, `q=` | Open/focus space, open search with query. |
| `glyph://open/daily-note` | `space=` | Open/focus space, open **today’s** daily note (create if missing). |

Unknown paths → error. No other routes in v1.

## Consequences

- Parser allowlist is this table only.
- Copy-deeplink from the file tree targets `glyph://open/note` for notes.
- Remaining open work is platform wiring, dispatch architecture, in-app UX details, and handoff criteria — not new product routes.
