use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
};

use serde::Serialize;

use crate::utils;

/// Longest filename macOS allows; bounds the backwards walk from an extension.
const MAX_NAME_BYTES: usize = 255;

/// Characters that can never sit inside a referenced filename, so they end a
/// candidate when walking backwards from its extension.
const NAME_DELIMITERS: &[char] = &[
    '/', '(', ')', '[', ']', '"', '\'', '<', '>', '|', '`', '=', ':', '\n', '\r', '\t', '*', '?',
    '{', '}',
];

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AttachmentKind {
    Image,
    Pdf,
    Audio,
    Video,
    Document,
    Archive,
}

#[derive(Serialize)]
pub struct AttachmentEntry {
    pub rel_path: String,
    pub name: String,
    pub kind: AttachmentKind,
    pub size: u64,
    pub referenced_by: Vec<String>,
}

#[derive(Serialize)]
pub struct AttachmentScan {
    pub attachments: Vec<AttachmentEntry>,
    pub note_count: usize,
}

fn attachment_kind(ext: &str) -> Option<AttachmentKind> {
    if utils::is_image_extension(ext) {
        return Some(AttachmentKind::Image);
    }
    if utils::is_pdf_extension(ext) {
        return Some(AttachmentKind::Pdf);
    }
    match ext {
        "heic" | "heif" | "ico" => Some(AttachmentKind::Image),
        "mp3" | "wav" | "m4a" | "aac" | "ogg" | "flac" | "aiff" => Some(AttachmentKind::Audio),
        "mp4" | "mov" | "m4v" | "webm" | "mkv" | "avi" => Some(AttachmentKind::Video),
        "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "key" | "pages" | "numbers" | "csv"
        | "rtf" | "epub" => Some(AttachmentKind::Document),
        "zip" => Some(AttachmentKind::Archive),
        _ => None,
    }
}

fn hex_value(byte: u8) -> Option<u8> {
    char::from(byte)
        .to_digit(16)
        .and_then(|v| u8::try_from(v).ok())
}

fn percent_decode(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (hex_value(bytes[i + 1]), hex_value(bytes[i + 2])) {
                out.push(hi * 16 + lo);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Records every known attachment name that `chunk` could be naming. Each
/// suffix that starts after a non-alphanumeric character is tried, so prose
/// like "see my photo.png" still matches a file named "my photo.png".
fn collect_chunk_matches(chunk: &str, names: &HashSet<String>, out: &mut HashSet<String>) {
    let decoded = percent_decode(chunk);
    let unescaped = decoded.replace('\\', "");
    for variant in [chunk, decoded.as_str(), unescaped.as_str()] {
        let starts = variant
            .char_indices()
            .filter(|(_, c)| !c.is_alphanumeric())
            .map(|(i, c)| i + c.len_utf8());
        for start in std::iter::once(0).chain(starts) {
            let candidate = variant[start..].trim();
            if names.contains(candidate) {
                out.insert(candidate.to_string());
            }
        }
    }
}

/// Finds attachment names referenced anywhere in a note: wikilinks, markdown
/// links, HTML tags, frontmatter values, or plain text. Matching is by file
/// name, so a reference never goes unnoticed because of how its path was
/// written; the cost is that same-named files in different folders count as
/// referenced together.
pub fn referenced_names(markdown: &str, names: &HashSet<String>) -> HashSet<String> {
    let text = markdown.to_lowercase();
    let mut out = HashSet::new();
    for (dot, _) in text.match_indices('.') {
        let ext_end = text[dot + 1..]
            .find(|c: char| !c.is_ascii_alphanumeric())
            .map_or(text.len(), |offset| dot + 1 + offset);
        if attachment_kind(&text[dot + 1..ext_end]).is_none() {
            continue;
        }
        let floor = dot.saturating_sub(MAX_NAME_BYTES);
        let start = text[..dot]
            .char_indices()
            .rev()
            .take_while(|(i, c)| *i >= floor && !NAME_DELIMITERS.contains(c))
            .last()
            .map_or(dot, |(i, _)| i);
        collect_chunk_matches(&text[start..ext_end], names, &mut out);
    }
    out
}

/// Walks the space once, splitting visible files into notes and attachments.
fn collect_space_files(root: &Path) -> (Vec<(String, PathBuf)>, Vec<AttachmentEntry>) {
    let mut notes = Vec::new();
    let mut attachments = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            if utils::should_hide(&entry.file_name().to_string_lossy()) {
                continue;
            }
            let path = entry.path();
            let Ok(meta) = entry.metadata() else {
                continue;
            };
            if meta.is_dir() {
                stack.push(path);
                continue;
            }
            let Ok(rel) = path.strip_prefix(root) else {
                continue;
            };
            let rel_path = utils::to_slash(rel);
            if utils::is_markdown_path(&path) {
                notes.push((rel_path, path));
                continue;
            }
            let Some(kind) =
                utils::path_extension_lower(&rel_path).and_then(|e| attachment_kind(&e))
            else {
                continue;
            };
            attachments.push(AttachmentEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                rel_path,
                kind,
                size: meta.len(),
                referenced_by: Vec::new(),
            });
        }
    }
    (notes, attachments)
}

pub fn scan_attachments(root: &Path) -> AttachmentScan {
    let (mut notes, mut attachments) = collect_space_files(root);
    // Sorted up front so each attachment's referencing notes come out in order.
    notes.sort_unstable();
    let names: HashSet<String> = attachments.iter().map(|a| a.name.to_lowercase()).collect();
    let mut referenced: HashMap<String, Vec<String>> = HashMap::new();
    for (rel_path, abs) in &notes {
        let Ok(markdown) = std::fs::read_to_string(abs) else {
            tracing::warn!(%rel_path, "skipping unreadable note during attachment scan");
            continue;
        };
        for name in referenced_names(&markdown, &names) {
            referenced.entry(name).or_default().push(rel_path.clone());
        }
    }
    for attachment in &mut attachments {
        // Same-named files share one entry, so clone rather than take it.
        if let Some(notes) = referenced.get(&attachment.name.to_lowercase()) {
            attachment.referenced_by.clone_from(notes);
        }
    }
    AttachmentScan {
        attachments,
        note_count: notes.len(),
    }
}
