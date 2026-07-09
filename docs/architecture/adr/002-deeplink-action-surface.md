# ADR 002: Deeplink action surface

## Status

Accepted

## Context

Deeplinks can target many Glyph surfaces (notes, spaces, search, daily notes, special tabs like connections/collections/calendar). Breadth recreates a large, hard-to-secure surface. The product goal is external open/navigation into core note-taking flows, not every in-app view.

## Decision

Deeplinks only target **notes, spaces, search, and daily notes** (and closely related note/space open flows). **Special tabs are out of scope permanently** for this feature — not deferred: never exposed as `glyph://` routes (connections, collections/databases, calendar, and similar).

## Consequences

- Smaller parser, clearer security model, easier docs.
- External automation cannot deep-link into special tabs; users open those from inside Glyph.
- Exact v1 route list and URL shape are still open (follow-on decisions).
