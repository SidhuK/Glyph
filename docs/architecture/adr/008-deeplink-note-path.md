# ADR 008: Note path in deeplinks

## Status

Accepted

## Context

`glyph://open/note` must name a note within the required `space=`. Absolute file paths would duplicate space identity and complicate traversal checks.

## Decision

Name notes with a **path relative to the space root** (e.g. `path=notes/foo.md`). Resolve with space-root join / `paths::join_under()`-style validation; reject traversal outside the space.

## Consequences

- URLs stay portable within a vault layout; `space=` carries the absolute root.
- Absolute note paths in query params are invalid for v1 note opens.
- Encoding of relative paths (slashes, spaces) must be documented for callers.
