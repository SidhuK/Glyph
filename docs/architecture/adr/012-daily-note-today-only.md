# ADR 012: Daily-note deeplink is today only

## Status

Accepted

## Context

Daily notes can be opened for arbitrary dates. A dated query parameter would expand the v1 surface and calendar coupling.

## Decision

`glyph://open/daily-note?space=…` opens **today’s** daily note only. No `date=` (or equivalent) in v1.

Reuse the app’s existing “open today’s daily note” flow: **if today’s note does not exist, create it**, then open it. (This is the intentional exception to “never auto-create” for missing `path=` notes.)

## Consequences

- After required `space=` is open/focused, daily-note deeplinks match in-app daily-note behavior including create-if-needed.
- Opening a specific past/future daily note via deeplink remains out until explicitly revisited.
- Missing note via `glyph://open/note?path=…` still errors and does not create.
