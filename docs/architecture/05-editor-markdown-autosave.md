# Editor, Markdown, and Autosave

Glyph edits Markdown files through a TipTap rich editor, but the durable document remains Markdown text on disk. The editor stack has three jobs: convert Markdown into an editable ProseMirror document, keep React state in sync with editor changes, and persist the file through Rust with conflict detection.

## Main Files

Frontend:

- `src/components/preview/MarkdownEditorPane.tsx`: document load, save, autosave, external reload, note sidebars
- `src/components/editor/NoteInlineEditor.tsx`: editor surface, toolbar overlays, frontmatter panel, backlinks, interactions
- `src/components/editor/hooks/useNoteEditor.ts`: TipTap instance, Markdown conversion, paste handling, image paste
- `src/components/editor/extensions/index.ts`: extension composition
- `src/components/editor/markdown/`: wiki link and Markdown bridge helpers
- `src/components/editor/hooks/useHydrateInlineImages.ts`: image path hydration
- `src/components/editor/hooks/useTaskInlineDates.ts`: inline task date editing
- `src/components/editor/hooks/useExtractSelectionToNote.ts`: extract selection flow
- `src/contexts/EditorContext.tsx`: current editor save registration

Backend:

- `src-tauri/src/space_fs/read_write/text.rs`: read/write text docs
- `src-tauri/src/space_fs/read_write/binary.rs`: pasted image persistence
- `src-tauri/src/index/indexer.rs`: reindex note after write
- `src-tauri/src/notes/frontmatter.rs`: parse and render frontmatter mappings
- `src-tauri/src/notes/properties.rs`: property conversion

## Ownership Split

`MarkdownEditorPane` owns the file.

It knows:

- current text
- last saved text
- last saved mtime
- dirty state
- autosave state
- external change reload state
- note info sidebar state
- local graph dialog state

`NoteInlineEditor` owns the editing UI.

It knows:

- rich/raw editor mode
- TipTap editor instance
- frontmatter draft
- selection ribbon
- table controls
- find bar
- backlinks display
- code block controls
- extract-to-note dialog

`useNoteEditor` owns the TipTap integration.

It knows:

- extension list
- Markdown preprocessing and postprocessing
- editor click handling
- paste behavior
- image upload placeholders
- settings that change editor features

Keep those roles separate. File persistence should stay in `MarkdownEditorPane`. TipTap transaction logic should stay in `useNoteEditor`.

## Document Load Flow

When a markdown tab opens:

1. `MainContent` renders `MarkdownEditorPane` for the tab target.
2. `MarkdownEditorPane` checks prefetched/cached docs.
3. If no initial doc exists, it calls `space_read_text`.
4. Rust validates the path and returns `TextFileDoc`.
5. React stores:
   - `text`
   - `savedText`
   - `lastSavedMtimeMs`
6. `NoteInlineEditor` receives `markdown={text}`.
7. `useNoteEditor` splits frontmatter from body and loads the body into TipTap.

`TextFileDoc` includes:

- `rel_path`
- `text`
- `etag`
- `mtime_ms`

The editor uses `mtime_ms` for conflict detection. It does not use `etag` for the autosave conflict check.

## Markdown Conversion

The durable file includes optional YAML frontmatter and Markdown body.

`useNoteEditor` calls:

- `splitYamlFrontmatter()` to separate frontmatter and body
- `preprocessMarkdownForEditor()` before loading body into TipTap
- `postprocessMarkdownFromEditor()` after `editor.getMarkdown()`
- `joinYamlFrontmatter()` to rebuild the full document

Wiki links need bridge logic because TipTap and Markdown need different representations for editing and serialization.

Use the bridge helpers rather than ad hoc string replacement when changing wiki-link Markdown behavior.

## TipTap Extensions

`createEditorExtensions()` composes:

- StarterKit
- Link
- Table, TableRow, TableHeader, TableCell
- TaskList and TaskItem
- TipTap Markdown extension
- Slash commands
- Code block highlighting
- colored text
- highlighted text
- collapsible headings
- markdown images
- markdown link autocomplete
- mermaid preview
- note search
- person autocomplete
- tag decorations
- Vim mode
- wiki links
- callout decorations
- details/toggle blocks
- task list shortcuts
- markdown image shortcuts

Feature settings can enable or disable parts of this list:

- people mentions as tags
- vim keybindings
- markdown link autocomplete
- collapsible headings

The extension list should stay centralized. Adding extensions from a component creates inconsistent editor behavior across rich editor surfaces.

Details blocks use TipTap's official `@tiptap/extension-details` package with `persist: true`, so open/closed state is stored on the `<details open>` attribute in the markdown file. The bridge in `src/components/editor/markdown/detailsMarkdown.ts` converts between TipTap's internal `:::details` fence syntax and standard HTML on disk. Only top-level `<details>` blocks are converted for editing; nested `<details>` stay as HTML inside the parent content. Fence sections close on a bare `:::` line, so user content with a standalone `:::` line can truncate a section on round-trip. Serialization format:

```html
<details open>
<summary>Toggle title</summary>

Toggle content.

</details>
```

## Editor Transaction Flow

`useNoteEditor` listens to TipTap transactions:

1. Ignore transactions without document changes.
2. Ignore suppressed updates caused by programmatic content replacement.
3. Ignore changes when not in rich edit mode.
4. Convert editor Markdown to durable Markdown.
5. Join the current frontmatter.
6. Compare with `lastEmittedMarkdownRef`.
7. Call `onChange(nextMarkdown)`.

`MarkdownEditorPane` receives `onChange` and updates `text`. It also marks that the user has edited the document, which enables autosave.

## Autosave

Autosave behavior lives in `MarkdownEditorPane`.

The core values:

- `text`: current editor text
- `savedText`: last persisted text
- `textRef`: current text ref for async code
- `savedTextRef`: last persisted text ref
- `mtimeRef`: last known saved mtime
- `autosaveInFlightRef`: one save in progress
- `autosaveQueuedRef`: another save should run after current save
- `hasUserEditsRef`: autosave should run only after user edits

Autosave triggers:

- 900ms after dirty user edits
- component cleanup if current text differs from saved text
- immediate save after property/frontmatter commits
- explicit save command from menus or shortcuts

`runAutosave()` serializes saves:

1. If a save is in flight, set `autosaveQueuedRef`.
2. Snapshot current text.
3. Skip if snapshot equals saved text.
4. Call `persistDoc()`.
5. If a queued save exists, run again.
6. If save succeeded but text changed during save, run again.

This avoids concurrent writes to the same note from the same pane.

## Save and Conflict Detection

`persistDoc()` calls:

```ts
invoke("space_write_text", {
  path,
  text: nextText,
  base_mtime_ms: mtimeRef.current,
});
```

Rust checks:

1. Current file mtime.
2. If `base_mtime_ms` exists and differs, return conflict.
3. Otherwise write atomically.
4. Reindex markdown.
5. Return new `mtime_ms`.

On conflict, `MarkdownEditorPane`:

1. Reads the latest file with `space_read_text`.
2. If latest text already equals the text being saved, accepts the latest mtime.
3. Otherwise updates `savedTextRef` and `mtimeRef` to the latest file.
4. Retries `space_write_text` once using the latest mtime.

This strategy favors the user's current editor text after one refresh. It does not merge concurrent edits. If you need merge behavior, design it as a new conflict flow rather than hiding it inside `persistDoc()`.

## External Changes

Rust emits `notes:external_changed` after external markdown changes and after local writes that the watcher suppresses.

`MarkdownEditorPane` handles it:

1. Normalize the event path and current path.
2. Ignore events for other notes.
3. Debounce for 180ms.
4. If editor is dirty, saving, or autosaving, set `pendingExternalReloadRef`.
5. Otherwise read the latest file and replace text/savedText.
6. When the editor later becomes clean, apply pending external reload.

This prevents the active note from reloading while the user has unsaved changes.

## Image Paste

`useNoteEditor` handles pasted images in rich mode:

1. Detect image clipboard files.
2. Resolve target folder from editor settings:
   - space root
   - specific attachment folder
   - note folder
   - subfolder under the note folder
3. Insert temporary object URL image nodes as placeholders.
4. Convert each file to a data URL.
5. Call `space_save_pasted_image` with the browser `File.name` as `original_filename`; the backend derives the on-disk filename from that dedicated parameter. Markdown `alt` remains separate display text on the editor image node.
6. Replace placeholders with final image attributes.
7. Revoke object URLs.

The backend writes the image into the space using a sanitized version of `original_filename`, for example `assets/picture-new.png`. The response keeps that filesystem identity in `asset_rel_path`, and returns a note-relative markdown `href` such as `../assets/picture-new.png`; pasted-image nodes store `href` in `originSrc` so markdown serialization, hydration, indexing, and attachment renames all use the same link shape. If that filename already exists with identical bytes, the existing file is reused; if it exists with different bytes, the backend allocates a non-destructive suffix such as `picture-new-2.png`. Unnamed clipboard images fall back to `image.{ext}` and use the same suffixing rules.

In `note-subfolder` mode, the target directory is the configured subfolder under the note's parent folder. For example, a note at `Projects/Upcoming/Plan.md` with subfolder `attachments` saves pasted images to `Projects/Upcoming/attachments/` and inserts links like `attachments/picture-new.png`. Root-level notes such as `Plan.md` save to `attachments/` at the space root.

Existing hash-named pasted assets are not migrated. Notes that already reference paths such as `assets/{hash}.png` keep resolving through the normal markdown-link hydration path.

The save command returns:

- `asset_rel_path`
- `href`

Do not store pasted images only in the editor document. They must become files in the space.

## Frontmatter and Properties

Frontmatter appears in two ways:

- raw frontmatter editing
- structured property editing

`NoteInlineEditor` keeps a frontmatter draft. Property tools call frontmatter render/parse commands or local helpers depending on the path. On frontmatter commit, `MarkdownEditorPane` runs autosave immediately.

Database cell edits also update note frontmatter from the backend. See `07-databases-frontmatter.md`.

## Links and Navigation

Editor click handling in `useNoteEditor` recognizes:

- tag tokens
- person tokens
- wiki links
- Markdown links
- external HTTP/HTTPS links

It dispatches app events:

- `dispatchTagClick()`
- `dispatchPersonClick()`
- `dispatchWikiLinkClick()`
- `dispatchMarkdownLinkClick()`

`AppShell` listens through `useWorkspaceLinkEvents()` and decides whether to open a note, open search, or open an external URL.

## Backlinks, Relationships, and Info Sidebar

`NoteInlineEditor` loads simple backlinks for display near the editor.

`MarkdownEditorPane` loads richer side panel data:

- backlinks
- linked notes extracted from Markdown
- frontmatter relationships
- preview context for database views
- word, character, line, and reading-time stats
- task progress summary
- local graph dialog

These values derive from either current editor text or index queries. Keep UI responsive by loading heavier data only when the sidebar or graph needs it.

## Editor Registration

`MarkdownEditorPane` registers with `EditorProvider`:

```ts
{
  relPath,
  isDirty,
  save: onSave,
  getMarkdown: () => textRef.current,
}
```

Shell commands use that registration for:

- Save Note
- Duplicate active markdown after flushing current edits
- Copy open note as Markdown
- Git sync before running
- AI context for current open note

If a note pane unmounts, `useEditorRegistration()` clears the registration.

## Change Checklist

When changing editor behavior:

1. Keep disk persistence in `MarkdownEditorPane`.
2. Keep TipTap transaction and paste behavior in `useNoteEditor`.
3. Use Markdown bridge helpers for wiki-link serialization.
4. Preserve `base_mtime_ms` conflict checks.
5. Reindex notes after backend writes.
6. Emit or handle `notes:external_changed` when note-derived UI must refresh.
7. Avoid programmatic content replacement loops by using suppression refs.
8. Flush the editor before operations that duplicate, sync, or export the current note.
9. Keep image paste storage tied to a real space file.

## Debugging Map

- Text jumps to old content: inspect external reload path and dirty checks.
- Autosave loops: inspect `lastEmittedMarkdownRef`, `savedTextRef`, and transaction suppression.
- Conflict message appears often: inspect mtime tracking and outside file writes.
- Wiki links serialize incorrectly: inspect `wikiLinkMarkdownBridge.ts`.
- Images show in editor but break after reload: inspect `space_save_pasted_image` and inline image hydration.
- Save shortcut misses active note: inspect `EditorProvider` registration and pane mount order.
