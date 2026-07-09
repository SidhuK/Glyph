# ADR 010: Deeplink failure UX

## Status

Accepted

## Context

Deeplinks can fail: missing/invalid `space=`, note path outside the space, note not found, unknown route. Callers and users need a visible failure mode.

## Decision

On failure, show a clear **error** (toast or equivalent in-app error surface). Do not silently no-op. Do not auto-create missing notes or spaces. Do not guess an alternate space.

## Consequences

- Exact copy and error-surface component can follow existing app error patterns.
- Security rejects (traversal, unknown scheme path) should stay generic enough not to leak sensitive filesystem detail.
