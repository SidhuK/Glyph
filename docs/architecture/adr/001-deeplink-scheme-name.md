# ADR 001: Custom URL scheme name

## Status

Accepted

## Context

Glyph needs a custom URL scheme so external apps, scripts, Shortcuts, and pages can open the app to a specific note, space, search, or view. The scheme must be short enough for humans and scripts, and registerable via Tauri deep linking on desktop.

## Decision

Use the scheme `glyph` — URLs look like `glyph://…`.

## Consequences

- Brand-aligned, easy to type and document.
- Possible collision with another app registering `glyph` on the same machine; revisit only if that becomes a real problem (e.g. reverse-DNS scheme).
- Universal Links / `https://` app links remain a separate, later concern.
