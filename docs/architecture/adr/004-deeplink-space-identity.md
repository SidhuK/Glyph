# ADR 004: Space identity in deeplinks

## Status

Accepted

## Context

Deeplinks that open a note, space, or daily note need a way to name which space. Options include absolute filesystem path, space display name, or a stable app-assigned id.

## Decision

Identify spaces in deeplink query parameters by **absolute filesystem path to the space root** (e.g. `space=/Users/me/vault`).

No v1 aliases by display name or synthetic id.

## Consequences

- Matches how Glyph already opens spaces on disk; no new registry.
- Paths are OS-specific and may need encoding in URLs; callers (Shortcuts, scripts) must supply a real absolute path.
- Renaming/moving a folder breaks old links — acceptable for v1; name/id aliases remain out unless revisited later.
