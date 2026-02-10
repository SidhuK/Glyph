# WikiLink Support in Tiptap Markdown Pipeline

## Scope

v1 adds Obsidian-style wikink parsing/serialization for:

- `[[Target]]`
- `[[Target|Alias]]`
- `[[Target#Heading]]`
- `[[Target#Heading|Alias]]`
- `[[Target#^blockId]]`
- `[[Target#^blockId|Alias]]`

Non-goals in v1:

- no embeds (`![[...]]`)
- no autocomplete picker UI
- no automatic unresolved-link resolution against vault index

## Data Model

`wikiLink` is an inline atomic node with attributes:

- `raw: string` (original source fallback)
- `target: string`
- `alias: string | null`
- `anchorKind: "none" | "heading" | "block"`
- `anchor: string | null`
- `unresolved: boolean`

## Invariants

- round-trip safety: `markdown -> editor -> markdown` must preserve semantics
- invalid forms are preserved as plain text
- if node attrs are incomplete, serializer falls back to `raw`
- frontmatter handling remains unchanged

## Integration Notes

- markdown parsing and serialization are implemented as first-class markdown tokenizer/renderer on the extension
- lightweight markdown bridge canonicalizes wikilink spellings before parse and after serialize
- external URL behavior and regular markdown links remain unchanged
