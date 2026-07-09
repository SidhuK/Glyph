# ADR 006: Multi-window deeplink routing

## Status

Accepted

## Context

Glyph can have multiple windows open on different spaces. A deeplink must not land in a random focused window that has a different vault.

## Decision

**Match by space:** dispatch the deeplink to an existing window whose open space is the `space=` path. If no such window exists, open or focus a window for that space (reuse normal space-open-window behavior), then run the action.

Never deliver a deeplink into a window for a different space merely because it is focused.

## Consequences

- Predictable multi-window behavior aligned with required `space=`.
- Exact “reuse vs new window when space is closed” details follow existing space-open primitives unless a later decision narrows them.
