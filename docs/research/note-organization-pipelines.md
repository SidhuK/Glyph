# Note-organization pipelines

## Scope

This research looks at workflows people use to move notes from capture toward retrieval, thinking, action, publication, or deliberate neglect. It focuses on systems with a visible process, not just folder or tag schemes.

The strongest sources include method creators' documentation and public note collections where the author explains how the collection is maintained. The product recommendations at the end are Glyph-specific inferences from those sources.

## Findings

### 1. CODE, PARA, and Progressive Summarization

Tiago Forte's Building a Second Brain system separates the knowledge workflow into Capture, Organize, Distill, and Express. Capture is selective. Organize is based on actionability rather than an attempt to design a complete subject hierarchy. Distill progressively compresses notes as they are revisited. Express turns the accumulated material into a concrete output ([Building a Second Brain](https://fortelabs.com/blog/basboverview/)).

PARA supplies the storage model for the Organize step:

- Projects are active efforts with a desired outcome.
- Areas are ongoing responsibilities.
- Resources are topics of continuing interest.
- Archives hold inactive items that are worth keeping.

Forte's key distinction is between a responsibility that never ends and a project that can finish. He argues that broad areas such as "Hiring" or "Strategic planning" hide the amount of work involved until they are broken down into projects ([The PARA Method](https://fortelabs.com/blog/para/)).

Progressive Summarization adds a useful rule for old notes: add value each time a note is touched. A first pass might only give a note a better title. A later pass might highlight its important lines, add a summary, or connect it to a project. Forte explicitly warns against doing multiple expensive passes on material that may never be used ([Progressive Summarization VI](https://fortelabs.com/blog/progressive-summarization-vi-core-principles-of-knowledge-capture/)).

The practical pipeline is:

```text
capture -> place by current usefulness -> compress when revisited -> reuse in an output -> archive when inactive
```

What is useful for Glyph: actionability gives a user a concrete question to answer, and progressive summarization gives the system permission to leave a note imperfect until there is evidence that it matters.

What is risky: PARA's four labels are simple, but deciding between Area and Resource is still a judgment call. A note can also support several projects even though a folder usually gives it only one home.

### 2. GTD

Getting Things Done treats incoming material as an open loop that needs to be processed. Its official five-step model is Capture, Clarify, Organize, Reflect, and Engage ([What is GTD](https://gettingthingsdone.com/what-is-gtd/)). During Clarify, the user decides whether an item is actionable. If it is, the user defines the next action and project. If it is not, it becomes trash, reference, or something on hold.

The important part for notes is the Clarify step. "Organize" is not just assigning a folder. It first asks what the note means and what the user intends to do with it. Reflect then keeps the system current instead of allowing the inbox to become a permanent graveyard.

The practical pipeline is:

```text
capture -> clarify meaning and action -> route to project/reference/hold/trash -> review -> engage
```

What is useful for Glyph: a note-organizing assistant should ask one small decision at a time, such as "Is this a task, a reference, an idea, or something to ignore?" A giant metadata form is the opposite of the method.

### 3. Zettelkasten

The Zettelkasten community describes a progression from fleeting notes to more durable notes. Fleeting notes capture thoughts quickly. They are later rewritten as self-contained notes in the writer's own words. Source or literature notes preserve the relationship to the material that produced the idea. Project notes remain outside the main slip-box and support a specific piece of work ([From Fleeting Notes to Project Notes](https://zettelkasten.de/posts/concepts-sohnke-ahrens-explained/)).

The method is not just "make small notes and link them." It is a rewrite pipeline:

```text
fleeting capture -> source or idea note -> self-contained note -> link to related notes -> use in a project
```

The site also pushes back on the idea that a permanent note is finished forever. A community response recommends treating notes as permanently useful but still revisable, and reviewing them as new evidence arrives ([All notes are malleable](https://zettelkasten.de/posts/literature-notes-vs-permanent-notes/)).

What is useful for Glyph: the system distinguishes raw capture from a note that the user has understood and can reuse. It also gives a reason to split a long source note into several atomic ideas while preserving the source relationship.

What is risky: the vocabulary can become a taxonomic hobby. The Zettelkasten site itself notes that the terminology around fleeting, literature, and permanent notes creates confusion. Glyph should expose the behavior, not require users to learn the terminology.

### 4. Evergreen notes and Andy Matuschak's working system

Andy Matuschak's public notes describe evergreen notes as concept-oriented, atomic, densely linked notes that evolve across projects. He prefers associative relationships over a strict hierarchy ([Evergreen notes](https://notes.andymatuschak.org/z5E5QawiXCMbtNtupvxeoEX)).

His daily practice is unusually concrete. He begins with a writing inbox of transient and incomplete notes. He develops the notes that interest him, archives boring prompts, then turns to questions raised by his active creative projects. He also revisits reading that has not yet been converted into evergreen notes ([My morning writing practice](https://notes.andymatuschak.org/zHTevHGZQPu8QHpRhUmtsuK)).

The practical pipeline is:

```text
writing inbox -> choose an interesting prompt -> develop over multiple sessions -> link and revise -> reuse across projects
```

What is useful for Glyph: "interesting enough to develop" is a better promotion signal than completeness. The system can leave unfinished notes in place and bring them back when the user has attention for them.

What is risky: this is a writing and thinking practice, not a general-purpose filing system. It works for someone willing to revise notes regularly and is not a good default for receipts, meeting records, or quick reference material.

### 5. Maps of Content

Nick Milo's Linking Your Thinking system uses Maps of Content, or MOCs, as notes that gather, develop, and navigate related ideas. A MOC appears when a user has enough notes on a topic to feel they may lose track of them. The MOC begins as a gathering list, becomes a place where ideas collide, and can mature into a navigational map ([Maps](https://blog.linkingyourthinking.com/maps/), [The 3 Phases of MOCs](https://blog.linkingyourthinking.com/notes/the-3-phases-of-mocs)).

The Home note is a top-level launchpad to the user's important MOCs. The author explicitly says the structure should serve the person and can be changed as categories stop working ([Set Up Your Home Note](https://blog.linkingyourthinking.com/notes/set-up-your-home-note)).

The practical pipeline is:

```text
note -> more notes on the same question -> create a map -> gather and collide -> promote major ideas into navigation
```

What is useful for Glyph: maps are an answer to the "I have hundreds of notes but no way into them" problem. The map is not a folder that every note must pass through. It appears when a cluster becomes mentally important.

### 6. Digital gardens and public user workflows

Digital gardens make note maturity visible without pretending that every note is a finished article. Zach Nielsen labels notes as Seedling, Growing, or Evergreen, and lets readers browse by topic or follow links ([Digital Garden](https://www.zacharynielsen.com/garden/)). Josh Richards describes his garden as a working notebook, field notebook, archive, and attempt to connect ideas before they are polished ([Digital Garden](https://digitalgarden.joshrichards.com.au/)).

One especially clear user-built workflow is the Stultus garden. It distinguishes external inputs from internal thoughts:

1. Create a Source Note with author, source URL, and processing status.
2. Dump raw highlights and summaries into it.
3. Refactor individual concepts into Atomic Notes written in the user's own words.
4. Link the atomic note back to the source and to related notes.
5. Promote the note through Seeding, Growing, and Evergreen states ([Digital Garden Workflow](https://stultus.in/notes/digital-garden-workflow/)).

Another recent public garden uses Atoms, Molecules, and Organisms for the same general idea: atomic concepts become frameworks or comparisons, which can become complete articles or guides. The author says the garden is maintained with Claude for note creation and refinement, while still exposing domains, types, properties, links, and graph navigation ([heyMHK digital garden](https://garden-heymhk.com/)).

The practical pipeline is:

```text
source or rough idea -> atomic concept -> linked cluster/framework -> mature guide or output
```

What is useful for Glyph: a visible growth state lets users keep rough notes without feeling they are failures. It also creates a natural review queue: seeds with links and recent activity are good candidates for attention.

What is risky: "evergreen" can imply that a note is done. In practice, the public gardens continue to revise notes, and many seeds should stay seeds.

### 7. Johnny.Decimal

Johnny.Decimal solves a different problem. It gives stable numeric IDs, a shallow structure of areas and categories, and an index that links the system together. The no-more-than-ten constraint limits the number of choices at each level and prevents deep folder trees ([Introduction](https://johnnydecimal.com/documentation/introduction)).

The creator's recent AI workflow is worth studying because it is candid about the limits of automation. He connects an AI assistant to the documentation and his own index, points it at a downloads folder, and asks it where items should be filed. He also says he is still faster than Claude at filing receipts. The stable IDs remain useful because both the human and the assistant can refer to the same unambiguous locations ([Automated organisation is here](https://johnnydecimal.com/blog/0242-automated-organisation-is-here)).

The practical pipeline is:

```text
incoming file or note -> identify its stable location -> file it under a constrained ID -> find it through the index
```

What is useful for Glyph: stable, human-readable identifiers can make AI suggestions explainable. "Move this to 15.22 Travel insurance" is easier to approve than "I found a semantically similar group."

What is risky: numeric IDs are excellent for stable filing and poor at expressing the changing meaning of an idea. They should not be the only organizing mechanism for a thinking-oriented note system.

### 8. Pillars, Pipelines, and Vaults

August and Jane Bradley's PPV system connects life priorities, action pipelines, and knowledge vaults. Its official site describes the system as a personal Life Operating System that connects priorities and aspirations to daily actions while organizing knowledge and learning ([Notion Life Design](https://www.notionlifedesign.com/)).

A public implementation describes the three layers more directly: Pillars hold what matters, Pipelines move goals, projects, and actions through stages, and Vaults hold knowledge that supports the work ([PPV notes](https://dinhngocthuyvy.github.io/Demo/Pillars%2C%20Pipelines%2C%20Vaults%20%28PPV%29/)).

The practical pipeline is:

```text
value or life area -> goal outcome -> project -> action -> supporting note or resource
```

What is useful for Glyph: it gives a note a reason to exist. A note can be connected to an outcome or project rather than sitting in a generic "Work" or "Ideas" bucket.

What is risky: the full system can become a large operating system that users spend more time maintaining than using. The useful part for Glyph is the relationship between notes and active work, not a full life-management template.

## Cross-system pattern

The methods disagree about the final shape of the library, but they agree on the basic movement:

```text
low-friction capture
        ↓
clarify what the item is and why it matters
        ↓
give it a lightweight state and one or more contexts
        ↓
add value when the item is revisited
        ↓
connect it to related notes or active work
        ↓
reuse, publish, or act on it
        ↓
archive without destroying the history
```

The most important design conclusion is that a note's storage location and its processing state are different things. A note may be a source, belong to a project, and be part of a topic map at the same time. A single folder cannot represent all three relationships cleanly.

The second conclusion is that review is part of the system, not an optional cleanup chore. Matuschak has a writing inbox, GTD has Reflect, Forte later added Review to the CODE cycle, and the digital-garden examples use growth states as a visible review signal.

The third conclusion is that automation should propose and explain. Johnny.Decimal's own experience suggests that an AI can be useful inside a structured system without being faster or more trustworthy than a person for every item. The user should be able to accept, edit, skip, or undo each meaningful decision.

## Glyph product brainstorm

### A. Organize as a queue, not a reorganization wizard

The first experience should not be "choose your perfect system." It should be "here is one note; what should happen to it?"

For each item, Glyph could show:

- a short preview and why it appeared in the queue;
- likely type: source, idea, project note, meeting, journal, reference, or task;
- likely related notes and possible duplicates;
- possible project, collection, or map destinations;
- one recommended next action;
- explicit actions such as keep as-is, archive, merge, split, link, convert to task, or defer.

The queue can start with recent unprocessed notes, then work through the legacy backlog in small batches. Users should never need to process hundreds of notes before getting value.

### B. Give each note a small state machine

The state should describe where the note is in the user's workflow, not pretend to describe the whole note:

```text
inbox -> clarified -> placed -> developing -> useful -> archived
```

The exact names can be user-facing presets. The underlying behavior matters more than the labels. A user who does not want a formal system could use only Inbox, Useful, and Archived. A garden-oriented user could use Seedling, Growing, and Evergreen. A project-oriented user could use Inbox, Project support, and Done.

State should be separate from:

- note type, such as source or idea;
- context, such as a project, person, topic, or collection;
- relationships, such as supports, contradicts, derived from, or related to;
- location, such as the Markdown path.

### C. Make "why keep this?" the core clarification question

Instead of asking users to fill in tags, ask which job the note does:

```text
Is this something to do?
Is this something to remember?
Is this something I am developing?
Is this evidence or source material?
Is this part of a project?
Is this no longer worth attention?
```

The answer can drive suggested metadata, folders, links, and views. The user does not need to know whether the answer corresponds to PARA, GTD, Zettelkasten, or a garden.

### D. Build review around signals, not a calendar alone

Useful review queues could include:

- Inbox notes older than a chosen age.
- Notes with no outgoing links but strong similarity to an existing cluster.
- Notes with many backlinks but no clear title or summary.
- Possible duplicate notes.
- Source notes with highlights but no extracted ideas.
- Seedling notes that have been edited or linked repeatedly.
- Project notes whose project is complete or inactive.
- Notes recently used in search, context attachments, or AI conversations.

This is more personal than a rigid weekly checklist. It uses actual behavior to decide what deserves another look.

### E. Make AI a local organizing partner

For a local-first app, a good AI-assisted flow would be:

1. Compute deterministic signals first: title quality, length, tags, links, folder, age, checklist content, and search relationships.
2. Offer local clustering and duplicate candidates without sending note text anywhere.
3. If the user enables an AI provider, ask it for suggestions with the smallest useful context.
4. Show the proposed change and its reasons.
5. Apply only after explicit acceptance, with an undoable change set.
6. Learn from accept, edit, skip, and reject decisions locally.

The assistant should be able to say "this looks like a source note because it has a URL and quoted passages" or "these two notes appear to cover the same decision." It should not silently rewrite a user's note or move an entire space.

### F. Offer a few starting modes, then let the system adapt

Glyph could offer three small presets rather than forcing one ideology:

- **Simple inbox:** Inbox, Active, Reference, Archive. Best for users who want less mental overhead.
- **Project library:** Inbox, Projects, Areas, Resources, Archive. PARA-inspired and action-oriented.
- **Growing garden:** Inbox, Sources, Seeds, Growing, Evergreen, Maps. Zettelkasten and digital-garden inspired.

All presets should use the same underlying note state, context, link, and review primitives. Presets change labels and suggested actions, not the storage format or the user's data.

## Recommended first slice

The first version should target the user's existing backlog, not just future capture:

1. Add an Organize queue over existing notes.
2. Show one note at a time with a compact set of decisions.
3. Detect likely duplicates, orphan notes, source notes, and stale project notes.
4. Let the user batch-accept safe suggestions such as adding a tag or link, while requiring confirmation for merges, moves, and deletes.
5. Add a small review view that brings back notes based on age, links, activity, and project context.
6. Measure success by whether users find and reuse notes, not by how many notes they classified.

The product promise could be simple: "Turn a pile of notes into a library you can work from, a few notes at a time."

## Sources

- [Building a Second Brain, Tiago Forte](https://fortelabs.com/blog/basboverview/)
- [The PARA Method, Tiago Forte](https://fortelabs.com/blog/para/)
- [Progressive Summarization VI, Tiago Forte](https://fortelabs.com/blog/progressive-summarization-vi-core-principles-of-knowledge-capture/)
- [What is GTD, David Allen Company](https://gettingthingsdone.com/what-is-gtd/)
- [From Fleeting Notes to Project Notes, Zettelkasten Method](https://zettelkasten.de/posts/concepts-sohnke-ahrens-explained/)
- [All notes are malleable, Zettelkasten Method](https://zettelkasten.de/posts/literature-notes-vs-permanent-notes/)
- [Evergreen notes, Andy Matuschak](https://notes.andymatuschak.org/z5E5QawiXCMbtNtupvxeoEX)
- [My morning writing practice, Andy Matuschak](https://notes.andymatuschak.org/zHTevHGZQPu8QHpRhUmtsuK)
- [Maps, Linking Your Thinking](https://blog.linkingyourthinking.com/maps/)
- [The 3 Phases of MOCs, Linking Your Thinking](https://blog.linkingyourthinking.com/notes/the-3-phases-of-mocs)
- [Set Up Your Home Note, Linking Your Thinking](https://blog.linkingyourthinking.com/notes/set-up-your-home-note)
- [Digital Garden, Zach Nielsen](https://www.zacharynielsen.com/garden/)
- [Digital Garden, Josh Richards](https://digitalgarden.joshrichards.com.au/)
- [Digital Garden Workflow, Stultus](https://stultus.in/notes/digital-garden-workflow/)
- [heyMHK digital garden](https://garden-heymhk.com/)
- [Johnny.Decimal introduction](https://johnnydecimal.com/documentation/introduction)
- [Automated organisation is here, Johnny.Decimal](https://johnnydecimal.com/blog/0242-automated-organisation-is-here)
- [Notion Life Design, August and Jane Bradley](https://www.notionlifedesign.com/)
- [PPV notes and implementation, Đinh Ngọc Thúy Vy](https://dinhngocthuyvy.github.io/Demo/Pillars%2C%20Pipelines%2C%20Vaults%20%28PPV%29/)
