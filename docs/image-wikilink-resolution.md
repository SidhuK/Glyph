# Image Wikilink Resolution (`![[...]]`)

This document defines how embedded image wikilinks are parsed and rendered in Glyph.

## Parsing and Rendering Decisions

- `![[...]]` is parsed as a `wikiLink` node with `embed: true`.
- Image-like embed targets (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.svg`, `.bmp`, `.avif`, `.tif`, `.tiff`) are rendered as `<img data-wikilink-embed="true" ...>`.
- The initial `<img src>` is the raw wikilink target, then hydration resolves it to a preview data URL.
- Markdown serialization preserves wikilink syntax (`![[...]]`) instead of converting to `![...](...)`.

## Resolution Rules (Space-Root Semantics)

Image wikilinks are resolved by backend command `space_resolve_image_wikilink`:

1. Root-relative path:
   - `![[/images/cover.png]]` resolves only to `images/cover.png` at space root.
2. Nested path (contains `/`):
   - `![[assets/cover.png]]` is treated as space-root relative and must match that exact path.
   - No basename fallback is applied when an explicit nested path does not exist.
3. Filename-only target:
   - `![[cover.png]]` searches by basename across image files in the space.
   - If exactly one match exists, use it.
4. Ambiguous filename fallback:
   - If multiple basename matches exist, prefer the single root-level match if there is exactly one.
   - Otherwise choose the lexicographically smallest relative path (case-insensitive deterministic fallback).
5. Extensionless filename:
   - `![[cover]]` can match a unique image basename stem.

## Frontend Hydration Behavior

- Inline image hydration uses:
  - `space_resolve_image_wikilink` for `data-wikilink-embed="true"` images.
  - `space_resolve_markdown_link` for standard Markdown images.
- If resolution fails, the image remains unresolved (raw source is kept), which is the explicit fallback.
