---
name: KAR 47 Image Filenames
overview: Implement KAR-47 by changing only new image saves to use sanitized original filenames, keeping existing hash-named assets untouched and resolvable. The main work is backend allocation/collision handling in `binary.rs`, plus a small frontend IPC payload update and existing test/docs updates.
todos:
  - id: branch-setup
    content: Create and work from the dedicated `karatsidhu/kar-47-save-pasted-images-using-original-filename-instead-of` branch.
    status: completed
  - id: backend-filename-allocation
    content: Implement sanitized original-filename allocation and collision handling in `binary.rs`.
    status: completed
  - id: frontend-ipc
    content: Pass `original_filename` through `useNoteEditor.ts` and `src/lib/tauri.ts`.
    status: completed
  - id: tests-docs
    content: Update existing paste tests and architecture docs for the new naming behavior.
    status: completed
isProject: false
---

# KAR-47 Image Filename Plan

## Branching

- Do this work on its own branch: `karatsidhu/kar-47-save-pasted-images-using-original-filename-instead-of`.
- Before making implementation edits, create or check out that branch from the appropriate base so the hard cutover stays isolated from unrelated work.

## Current Flow

New pasted images currently go through:

```mermaid
flowchart LR
  pasteHandler[useNoteEditorPasteHandler] --> dataUrl[readFileAsDataUrl]
  dataUrl --> saveCommand[space_save_pasted_image]
  saveCommand --> hashName[HashFilename]
  hashName --> href[ReturnedHref]
  href --> originSrc[ImageOriginSrc]
  originSrc --> markdown[MarkdownImageSerialization]
  markdown --> hydrate[useHydrateInlineImages]
```

The key current backend code is in [`src-tauri/src/space_fs/read_write/binary.rs`](src-tauri/src/space_fs/read_write/binary.rs):

```rust
let hash = hex::encode(Sha256::digest(&bytes));
let file_name = format!("{hash}.{ext}");
```

The frontend already has the original filename at [`src/components/editor/hooks/useNoteEditor.ts`](src/components/editor/hooks/useNoteEditor.ts), but only sends it as `alt`, not as a filename input:

```ts
const saved = await invoke("space_save_pasted_image", {
  source_path: sourcePath,
  target_dir: targetDir,
  data_url: dataUrl,
  alt: item.file.name || null,
});
```

## Implementation Approach

1. Preserve the existing link model

- Do not rename or migrate old `assets/{hash}.{ext}` files.
- Do not change [`useHydrateInlineImages.ts`](src/components/editor/hooks/useHydrateInlineImages.ts), [`link_ops.rs`](src-tauri/src/space_fs/link_ops.rs), or link rewrite behavior unless implementation reveals a concrete bug.
- Continue returning a note-relative `href` from `space_save_pasted_image`; `originSrc` and markdown serialization already use that path.

2. Extend the IPC contract

- Update `space_save_pasted_image` in [`src-tauri/src/space_fs/read_write/binary.rs`](src-tauri/src/space_fs/read_write/binary.rs) to accept `original_filename: Option<String>`.
- Update `TauriCommands` in [`src/lib/tauri.ts`](src/lib/tauri.ts) to include `original_filename?: string | null`.
- Update [`src/components/editor/hooks/useNoteEditor.ts`](src/components/editor/hooks/useNoteEditor.ts) to pass `original_filename: item.file.name || null`, while keeping `alt` separate.

3. Add filename derivation helpers in `binary.rs`

- Add local helpers near `extension_for_mime` / `parse_data_url` so this stays scoped to the pasted-image command:
  - `basename_from_original_filename`: strip path components and separators.
  - `sanitize_filename_stem`: trim whitespace, remove control characters, replace unsafe filesystem/markdown-hostile characters with `-`, collapse repeated separators, and reject empty or hidden stems.
  - `split_filename_extension`: separate stem/ext without treating `.hidden` as a valid stem.
  - `filename_for_mime`: enforce the extension from detected MIME. If the pasted filename has no extension or the wrong one, use the MIME extension from `extension_for_mime`.
- Prefer preserving readable Unicode characters rather than transliterating them. Avoid adding a Rust dependency unless strict Unicode normalization becomes a requirement.
- Use a fallback basename of `image.{ext}` for unnamed clipboard blobs; collision handling will produce `image-2.{ext}`, `image-3.{ext}`, etc. This avoids hashes for screenshots while remaining deterministic and simple.

4. Replace hash-only allocation with name-aware allocation

- Build the first candidate from `original_filename` or fallback, under the existing `target_dir` rules.
- Keep existing protections:
  - `normalize_rel_path` for source and target dirs.
  - `deny_hidden_rel_path` before filesystem access.
  - `paths::join_under` for all space-root joins.
  - `io_atomic::write_atomic_create_new` for non-overwriting writes.
- Implement paste-specific suffixing as `stem-2.ext`, `stem-3.ext`, etc. Do not reuse the file-tree duplicate helper because that produces `Copy` names and the issue asks for `picture-new-2.png` style names.
- Collision behavior:
  - If candidate does not exist, atomically create it and return that path.
  - If candidate exists and bytes are identical, reuse it and return that path.
  - If candidate exists and bytes differ, try the next suffix.
  - If an atomic create loses a race, read/compare and either reuse or continue suffixing.
- Compare existing files by reading bytes only after a candidate collision. Do not globally dedupe same bytes under different filenames; that is listed as a non-goal.

5. Keep returned markdown/alt behavior stable

- Keep `alt` as display text and use `original_filename` only for filesystem naming.
- For named files, `alt` and basename will normally match because both come from `item.file.name`.
- The returned `markdown` field should continue to use `![{alt_text}]({href})`; frontend currently uses `href`, but preserving the response shape avoids unnecessary API churn.

## Files To Touch

- [`src-tauri/src/space_fs/read_write/binary.rs`](src-tauri/src/space_fs/read_write/binary.rs)
  - Add `original_filename` arg.
  - Add sanitization, extension enforcement, byte-compare reuse, suffix allocation.
  - Remove the hash-based naming dependency from this path; `sha2`/`hex` may no longer be needed in this file.
  - Add unit tests inside the existing file for helper behavior and allocation logic if practical without large filesystem setup.

- [`src/lib/tauri.ts`](src/lib/tauri.ts)
  - Extend the typed command args for `space_save_pasted_image`.

- [`src/components/editor/hooks/useNoteEditor.ts`](src/components/editor/hooks/useNoteEditor.ts)
  - Pass `original_filename` in the invoke payload.

- [`src/components/editor/hooks/useNoteEditor.test.tsx`](src/components/editor/hooks/useNoteEditor.test.tsx)
  - Update existing invoke expectations in the three attachment-location tests.
  - Add or adjust a frontend test to assert `alt` and `original_filename` are both sent and remain distinct.

- [`docs/architecture/05-editor-markdown-autosave.md`](docs/architecture/05-editor-markdown-autosave.md)
  - Update the image paste section to describe readable filename storage, same-bytes reuse, and suffix collision behavior.

## Compatibility Notes

- Existing hash-named files keep working because markdown hydration resolves the literal href path through `space_resolve_markdown_link` and then reads the binary preview.
- No SQLite migration is needed; the note index stores markdown links, not attachment binary metadata.
- File-tree rename/link rewrite should keep working because it operates on paths and supported attachment extensions, not hash semantics.

## Validation Plan

- Use `ReadLints` after TypeScript edits.
- Recommended targeted checks after implementation, if you want me to run them:
  - `pnpm test -- src/components/editor/hooks/useNoteEditor.test.tsx`
  - `cd src-tauri && cargo test space_fs::read_write::binary`
  - `cd src-tauri && cargo check`

## Manual QA

- Paste `picture-new.png` into a note with default `assets` storage and verify markdown uses `assets/picture-new.png`.
- Paste the same `picture-new.png` bytes again and verify no duplicate file is created.
- Paste different bytes with the same filename and verify `picture-new-2.png` is created.
- Paste an unnamed screenshot and verify `image.png` or a suffixed variant is used.
- Reopen an old note with hash-named image links and verify images still render.