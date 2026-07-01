use serde::Serialize;
use std::path::{Path, PathBuf};

use crate::{glyph_paths, io_atomic, paths};

#[derive(Serialize)]
pub struct SpaceInfo {
    pub root: String,
    pub schema_version: u32,
    pub onboarding_note_path: Option<String>,
}

pub const VAULT_SCHEMA_VERSION: u32 = 1;
const ONBOARDING_NOTE_PATH: &str = "Welcome to Glyph.md";
const ONBOARDING_MARKER_NAME: &str = "onboarding-note-v2.json";
const ONBOARDING_NOTE_CONTENT: &str = r#"# Welcome to Glyph

Is Glyph the first notes app you have ever opened? Almost certainly not. Is it going to claim that writing things down was invented five minutes ago? Also no.

Glyph is a local-first desktop space for notes, collections, previews, and AI-assisted thinking. The important part is boring in the best way: your notes are plain Markdown files in the folder you chose. Use the same notes in Obsidian, VS Code, Typora, iA Writer, Logseq, or any app that understands Markdown.

This note is fully editable. Try things here, make a mess, or delete it when it has done its job.

## Learn `Cmd+K` first

If you remember one shortcut, make it `Cmd+K`. It opens the command palette, where you can create notes, jump to views, open settings, run editor actions, and find features without hunting through the UI.

## Write notes

- Create a note with `Cmd+N`.
- Create folders from the sidebar.
- Type `/` for headings, lists, callouts, tables, and code blocks.
- Type `[[` to link another note.
- Add `#tags` anywhere in your text.

## Find your way around

- Use `Cmd+P` to open files by name.
- Pin notes you open often.
- Open All Notes to scan everything in the space.
- Use local connections to see links around the current note.

## Plan your day

- Open today's note with `Cmd+Shift+D`.

## Add structure

- Open Collections for notes that work better as a table or board.
- Use properties to track status, dates, owners, or tags.
- Switch views when you want a different angle on the same notes.

## Use AI with context

- Open the AI panel with `Cmd+Shift+A`.
- Attach the current note, all open notes, or selected files.
- Pick the provider/account you want from AI settings.

## Try this first

- [ ] Create a new note
- [ ] Create a folder
- [ ] Link two notes with `[[`
- [ ] Add a `#tag`
- [ ] Pin a note
- [ ] Open today's daily note
- [ ] Create a Collection
- [ ] Run a command with `Cmd+K`
- [ ] Open Settings with `Cmd+,`
- [ ] Delete this note
- [x] Start writing
"#;

#[derive(Serialize)]
struct OnboardingMarker<'a> {
    version: u32,
    welcome_note_path: &'a str,
}

pub fn ensure_glyph_dirs(root: &Path) -> Result<(), String> {
    let _ = glyph_paths::ensure_glyph_dir(root)?;
    let _ = glyph_paths::ensure_glyph_cache_dir(root)?;
    let _ = glyph_paths::ensure_glyph_app_dir(root)?;
    Ok(())
}

pub fn canonicalize_dir(path: &Path) -> Result<PathBuf, String> {
    let p = path.canonicalize().map_err(|e| e.to_string())?;
    if !p.is_dir() {
        return Err("selected path is not a directory".to_string());
    }
    Ok(p)
}

pub fn create_or_open_impl(root: &Path) -> Result<SpaceInfo, String> {
    ensure_glyph_dirs(root)?;
    let _ = cleanup_tmp_files(root);
    let onboarding_note_path = ensure_onboarding_note_for_launch(root);
    Ok(SpaceInfo {
        root: root.to_string_lossy().to_string(),
        schema_version: VAULT_SCHEMA_VERSION,
        onboarding_note_path,
    })
}

pub fn onboarding_note_path() -> String {
    ONBOARDING_NOTE_PATH.to_string()
}

pub fn ensure_onboarding_note_for_command(root: &Path) -> Result<String, String> {
    ensure_onboarding_note_file(root)?;
    write_onboarding_marker(root);
    Ok(onboarding_note_path())
}

fn ensure_onboarding_note_for_launch(root: &Path) -> Option<String> {
    let marker = glyph_paths::glyph_app_dir(root)
        .ok()?
        .join(ONBOARDING_MARKER_NAME);
    if marker.exists() {
        return None;
    }

    ensure_onboarding_note_file(root).ok()?;
    write_onboarding_marker(root);
    Some(onboarding_note_path())
}

fn ensure_onboarding_note_file(root: &Path) -> Result<(), String> {
    let rel = Path::new(ONBOARDING_NOTE_PATH);
    let abs = paths::join_under(root, rel)?;
    if abs.exists() {
        return Ok(());
    }
    io_atomic::write_atomic(&abs, ONBOARDING_NOTE_CONTENT.as_bytes()).map_err(|e| e.to_string())
}

fn write_onboarding_marker(root: &Path) {
    let marker = match glyph_paths::glyph_app_dir(root) {
        Ok(dir) => dir.join(ONBOARDING_MARKER_NAME),
        Err(_) => return,
    };
    let marker_body = match serde_json::to_vec(&OnboardingMarker {
        version: 2,
        welcome_note_path: ONBOARDING_NOTE_PATH,
    }) {
        Ok(body) => body,
        Err(_) => return,
    };
    let _ = io_atomic::write_atomic(&marker, &marker_body);
}

fn cleanup_tmp_files(root: &Path) -> Result<(), String> {
    fn should_delete(file_name: &str) -> bool {
        (file_name.starts_with('.') && file_name.contains(".tmp."))
            || file_name.ends_with(".tmp")
            || file_name.contains(".import.tmp.")
    }

    fn recurse(dir: &Path) -> Result<(), String> {
        let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let path = entry.path();
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.is_dir() {
                let _ = recurse(&path);
                continue;
            }
            if !meta.is_file() {
                continue;
            }
            let name = match path.file_name().and_then(|s| s.to_str()) {
                Some(s) => s,
                None => continue,
            };
            if !should_delete(name) {
                continue;
            }
            let _ = std::fs::remove_file(&path);
        }
        Ok(())
    }

    if let Ok(dir) = glyph_paths::glyph_dir(root) {
        if dir.is_dir() {
            let _ = recurse(&dir);
        }
    }
    Ok(())
}
