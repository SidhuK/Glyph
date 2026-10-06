use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
};

use icu_normalizer::ComposingNormalizerBorrowed;
use serde::Serialize;

use crate::utils;

/// Folded attachment names, plus their byte lengths so most candidate
/// suffixes are rejected without hashing.
struct AttachmentNames {
    names: HashSet<String>,
    lengths: HashSet<usize>,
    longest: usize,
}

impl AttachmentNames {
    fn new(names: HashSet<String>) -> Self {
        let lengths: HashSet<usize> = names.iter().map(String::len).collect();
        let longest = lengths.iter().copied().max().unwrap_or(0);
        Self {
            names,
            lengths,
            longest,
        }
    }
}

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

/// Lowercased NFC form used on both sides of a match. macOS often stores file
/// names decomposed (NFD) while typed note text is composed (NFC), so `café.png`
/// must compare equal either way.
fn fold(text: &str) -> String {
    ComposingNormalizerBorrowed::new_nfc()
        .normalize(&text.to_lowercase())
        .into_owned()
}

/// Records every known attachment name that `chunk` could be naming. Each
/// suffix that starts after a non-alphanumeric character is tried, so prose
/// like "see my photo.png" still matches a file named "my photo.png".
fn collect_chunk_matches(chunk: &str, names: &AttachmentNames, out: &mut HashSet<String>) {
    let unescaped = chunk.replace('\\', "");
    for variant in [chunk, unescaped.as_str()] {
        let starts = variant
            .char_indices()
            .filter(|(_, c)| !c.is_alphanumeric())
            .map(|(i, c)| i + c.len_utf8());
        for start in std::iter::once(0).chain(starts) {
            let candidate = variant[start..].trim();
            if names.lengths.contains(&candidate.len()) && names.names.contains(candidate) {
                out.insert(candidate.to_string());
            }
        }
    }
}

/// Finds attachment names referenced anywhere in a note: wikilinks, markdown
/// links, HTML tags, frontmatter values, or plain text. Matching is by file
/// name, so a reference never goes unnoticed because of how its path was
/// written; the cost is that same-named files in different folders count as
/// referenced together. The percent-decoded text is scanned too, so encoded
/// names (`my%20photo.png`, `photo%2Epng`) are found.
fn referenced_names(markdown: &str, names: &AttachmentNames) -> HashSet<String> {
    let raw = fold(markdown);
    let decoded = fold(&percent_decode(&raw));
    let mut out = HashSet::new();
    let texts = std::iter::once(raw.as_str()).chain((decoded != raw).then_some(decoded.as_str()));
    for text in texts {
        for (dot, _) in text.match_indices('.') {
            let ext_end = text[dot + 1..]
                .find(|c: char| !c.is_ascii_alphanumeric())
                .map_or(text.len(), |offset| dot + 1 + offset);
            if attachment_kind(&text[dot + 1..ext_end]).is_none() {
                continue;
            }
            // Filenames can hold any punctuation (`photo (1).png`), so only a
            // line break or the name-length limit bounds the candidate.
            // Only the window that can hold a name is searched, keeping long
            // single-line notes linear; doubled to leave room for markdown
            // backslash escapes.
            let mut floor = dot.saturating_sub(names.longest * 2);
            while !text.is_char_boundary(floor) {
                floor += 1;
            }
            let start = text[floor..dot]
                .rfind(['\n', '\r'])
                .map_or(floor, |i| floor + i + 1);
            collect_chunk_matches(&text[start..ext_end], names, &mut out);
        }
    }
    out
}

/// Notes as (relative path, absolute path), plus the attachments found.
type SpaceFiles = (Vec<(String, PathBuf)>, Vec<AttachmentEntry>);

fn read_error(path: &Path, error: std::io::Error) -> String {
    format!("could not read {}: {error}", path.display())
}

/// Walks the space once, splitting visible files into notes and attachments.
/// Any unreadable folder fails the scan: skipping it could hide references and
/// let a used attachment look unused. Symlinks are followed to find notes, but
/// files reached through one are never listed, since trashing them could touch
/// files outside the space. Each real directory is walked once, so a link
/// cycle such as `loop -> .` can't recurse forever.
fn collect_space_files(root: &Path) -> Result<SpaceFiles, String> {
    let mut notes = Vec::new();
    let mut attachments = Vec::new();
    let mut visited = HashSet::new();
    let mut stack = vec![(root.to_path_buf(), false)];
    while let Some((dir, dir_via_link)) = stack.pop() {
        if !visited.insert(dir.canonicalize().map_err(|e| read_error(&dir, e))?) {
            continue;
        }
        let entries = std::fs::read_dir(&dir).map_err(|e| read_error(&dir, e))?;
        for entry in entries {
            let entry = entry.map_err(|e| read_error(&dir, e))?;
            if utils::should_hide(&entry.file_name().to_string_lossy()) {
                continue;
            }
            let path = entry.path();
            let via_link = dir_via_link
                || entry
                    .file_type()
                    .map_err(|e| read_error(&path, e))?
                    .is_symlink();
            let meta = entry.metadata().map_err(|e| read_error(&path, e))?;
            if meta.is_dir() {
                stack.push((path, via_link));
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
            if via_link {
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
    Ok((notes, attachments))
}

pub fn scan_attachments(root: &Path) -> Result<AttachmentScan, String> {
    let (mut notes, mut attachments) = collect_space_files(root)?;
    // Sorted up front so each attachment's referencing notes come out in order.
    notes.sort_unstable();
    let names = AttachmentNames::new(attachments.iter().map(|a| fold(&a.name)).collect());
    let mut referenced: HashMap<String, Vec<String>> = HashMap::new();
    for (rel_path, abs) in &notes {
        let bytes = std::fs::read(abs).map_err(|e| read_error(abs, e))?;
        for name in referenced_names(&String::from_utf8_lossy(&bytes), &names) {
            referenced.entry(name).or_default().push(rel_path.clone());
        }
    }
    for attachment in &mut attachments {
        // Same-named files share one entry, so clone rather than take it.
        if let Some(notes) = referenced.get(&fold(&attachment.name)) {
            attachment.referenced_by.clone_from(notes);
        }
    }
    Ok(AttachmentScan {
        attachments,
        note_count: notes.len(),
    })
}
