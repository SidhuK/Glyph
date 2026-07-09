# ADR 011: No HTTPS / Universal Links

## Status

Accepted

## Context

Some apps add `https://…` Universal Links / App Links alongside a custom scheme. That requires hosted `.well-known` files and a web property. Glyph is a local desktop app; deeplinks are for local automation (Shortcuts, scripts, other apps on the machine).

## Decision

**Never** ship HTTPS Universal Links / App Links for this feature. Deeplinks are **local `glyph://` only**.

## Consequences

- No dependency on glyph.app (or any host) for open links.
- Shareable web marketing links are out of product scope for deeplinks permanently under this decision.
- Callers must use the custom scheme registered with the OS.
