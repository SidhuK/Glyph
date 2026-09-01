# Note organization landscape

Date: 2026-09-01

Question: Has anyone made the capture-to-use organization workflow feel seamless for general-purpose notes?

## Short answer

No general-purpose note-taking product appears to have solved the whole problem. The strongest products make different parts of the loop feel low-friction:

- Capacities removes the capture-time destination decision by using the daily note as an inbox, then explicitly relies on later review and triage.
- Mem minimizes manual organization through automatic context, related-note surfacing, and flexible collections.
- Tana turns capture into structured objects through user-defined supertags and default fields.
- Readwise makes revisiting and processing effortless, but its review loop is primarily for reading highlights rather than arbitrary notes.

The common lesson is not a six-stage user-facing pipeline. It is a split between frictionless capture, invisible indexing/context, contextual resurfacing, and occasional cleanup.

## What the products actually solve

### Capacities: remove the “where does this go?” decision

Capacities recommends sending everything to the current daily note so capture does not require choosing a destination. It then describes review as a second filter: users decide whether a captured line is useful or interesting, and may delete it, turn it into a task, link/create an object, tag it, or leave it in place. Their own documentation says there is no universal rule for that judgment.

Sources:

- https://docs.capacities.io/reference/use-cases/daily-notes#send-it-to-todays-daily-note
- https://docs.capacities.io/reference/use-cases/daily-notes#review-a-second-filter
- https://docs.capacities.io/reference/use-cases/daily-notes#turn-the-daily-note-into-structure

Implication for Glyph: capture and clarification should probably be separate moments. A user should be able to write without choosing a folder, type, state, or project. The app can help later, but review remains a judgment call.

### Mem: make organization ambient and largely invisible

Mem positions capture as something users do without stopping to organize. Its help center describes related notes and collections appearing while the user works, rough notes being cleaned up, and collections allowing a note to belong to multiple groups. It also says the user can let Mem organize collections for them.

Sources:

- https://mem.ai/
- https://help.mem.ai/

Implication for Glyph: the seamless version should not depend on a dedicated queue. Notes should become more organized as the user searches, links, edits, and works in context. A review surface can exist, but it should be a fallback or intentional maintenance mode.

Tradeoff: this depends on a proprietary, AI-mediated interpretation of the user's corpus. Glyph's local-first and Markdown commitments make an opaque remote memory layer a poor foundation for the core workflow.

### Tana: make capture structured by configuring the schema up front

Tana's supertags apply a user-defined object schema to a node. A supertag can add fields, gather matching nodes into a view, and provide defaults such as a task whose status starts as Inbox. This makes structured capture fast once the user has designed the schema.

Source:

- https://outliner.tana.inc/learn/features/supertags

Implication for Glyph: structure can make organization feel seamless, but only when the user's domain and vocabulary are stable. Asking every Glyph user to build a schema would reproduce the organizational burden the feature is meant to remove.

### Readwise: make review and resurfacing genuinely lightweight

Readwise's Review Mode shows one highlight at a time, prioritizes unprocessed highlights, supports Keep/Discard-style processing, related-highlight discovery, and keyboard shortcuts. It also supports themed reviews for a chosen topic or set of sources.

Sources:

- https://docs.readwise.io/readwise/docs/faqs/reviewing-highlights
- https://docs.readwise.io/readwise/docs

Implication for Glyph: one-at-a-time review, clear processing actions, and keyboard flow are proven interaction patterns. But Readwise has a narrower object: imported highlights with a source and a retention goal. Arbitrary notes have much more ambiguous possible outcomes, so Glyph should avoid pretending every note has an obvious action.

## Product conclusion

The seamless workflow is probably not:

```text
Capture -> Clarify -> Connect -> Grow -> Use -> Archive
```

as six steps a user must walk through.

It is more likely:

```text
Capture freely
  -> index quietly
  -> surface in the context where it may help
  -> offer one low-risk transformation
  -> let use create more context
  -> occasionally invite cleanup
```

The core design opportunity for Glyph is therefore contextual organization:

- While writing a project note, surface unconnected notes that may support it.
- While searching, offer to turn a cluster into a collection, map, or explicit link set.
- When reopening an old note, explain what has changed around it and offer one useful action.
- When a quick note contains a clear commitment, offer task extraction without forcing a full task system.
- When a note is obviously stale or isolated, offer archive/defer as an optional low-attention action.

The dedicated Review surface can collect these signals, but should not be the only place organization happens.

## What Glyph should probably not promise

- A universal classification of every note.
- A required six-stage lifecycle.
- A complete type/context taxonomy before users receive value.
- Automatic file moves as the primary organization mechanism.
- AI that silently decides what a note means.

The strongest promise is smaller and more credible: Glyph helps a note acquire useful context at the moment context becomes available.
