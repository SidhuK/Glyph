# ADR 009: Finder / file:// opens stay external

## Status

Accepted

## Context

Glyph already opens `file://` / Finder-associated markdown in an external markdown window. Deeplinks introduce an intentional in-space open path via `glyph://`. Unifying Finder opens into the space would change existing behavior and blur two entry points.

## Decision

Keep **Finder / `file://` opens on the existing external markdown window** path. Do not auto-promote those opens into an in-space tab when the file happens to lie under a known space.

In-space opens use `glyph://` only.

## Consequences

- Clear split: association/preview vs intentional deeplink navigation.
- Unifying Finder → in-space remains a separate future effort if desired.
- `handle_opened_urls` file:// behavior is out of scope for the deeplink plan except to leave it alone.
