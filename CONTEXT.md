# Glyph Editor Context

Shared language for Glyph's note-editing surfaces and paste behavior.

## Language

**Editable rich-editor surface**:
An editor surface backed by the shared rich Markdown editor where the user can edit structured note content. In this context, this includes the main editor, external Markdown windows, and quick notes; it excludes read-only previews and the raw Markdown editor.
_Avoid_: rich editor when the surface is read-only or raw Markdown.

**Raw Markdown editor**:
The plain-text editing surface where Markdown source is edited directly rather than represented as structured rich content.

**Paste without formatting**:
An explicit paste command for an editable rich-editor surface that inserts the clipboard's plain-text value literally. It preserves line structure and meaningful whitespace, while leaving syntax such as headings, list markers, checkboxes, emphasis, links, tables, and code markers as ordinary text.
