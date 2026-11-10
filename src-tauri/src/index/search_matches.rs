use std::path::Path;

use super::frontmatter::split_frontmatter;
use super::types::SearchResult;

const MAX_MATCHES_PER_NOTE: usize = 40;
/// Reading note files is the cost here, so only the strongest hits are expanded.
const MAX_EXPANDED_NOTES: usize = 60;
const SNIPPET_RADIUS_CHARS: usize = 42;
/// How far a snippet edge may move to land on a word boundary.
const SNIPPET_WORD_SLACK_CHARS: usize = 12;
const SNIPPET_ESCAPE: char = '\u{001b}';
const SNIPPET_HIGHLIGHT_START: char = '\u{001c}';
const SNIPPET_HIGHLIGHT_END: char = '\u{001d}';

/// Expand note-level hits into one row per literal occurrence of `query` in the
/// note body, so search behaves like "find in files" instead of "find files".
///
/// The note file is read from disk rather than from `notes_fts`, because the
/// editor searches the raw markdown body and the FTS body is a lossy, stemmed
/// derivative. Reading the source keeps `match_index` aligned with the ordinal
/// the editor's find bar will compute for the same query.
///
/// Notes with no literal body hit (stemmed or semantic matches) stay as a single
/// note-level row.
pub fn expand_text_matches(
    space_root: &Path,
    notes: Vec<SearchResult>,
    query: &str,
    limit: usize,
) -> Vec<SearchResult> {
    let needle = query.trim();
    if needle.is_empty() || notes.is_empty() || limit == 0 {
        return notes;
    }
    let needle_lc = needle.to_lowercase();

    let mut out: Vec<SearchResult> = Vec::with_capacity(notes.len().min(limit));
    for (position, note) in notes.into_iter().enumerate() {
        if out.len() >= limit {
            break;
        }
        if position >= MAX_EXPANDED_NOTES {
            out.push(note);
            continue;
        }
        let Some(markdown) = read_note(space_root, &note.id) else {
            out.push(note);
            continue;
        };

        let (_, body) = split_frontmatter(&markdown);
        let body_start = markdown.len() - body.len();
        let matches = find_visible_matches(body, &needle_lc);
        if matches.is_empty() {
            out.push(note);
            continue;
        }

        // A note whose title also matches keeps its note-level row so it still
        // appears under the palette's title group alongside its body rows.
        if out.len() < limit && note.title.to_lowercase().contains(&needle_lc) {
            out.push(note.clone());
        }

        let mut line = 1 + count_newlines(&markdown[..body_start]);
        let mut counted_to = 0usize;
        for (match_index, range) in matches.into_iter().enumerate() {
            if out.len() >= limit {
                break;
            }
            line += count_newlines(&body[counted_to..range.start]);
            counted_to = range.start;
            out.push(SearchResult {
                id: note.id.clone(),
                title: note.title.clone(),
                snippet: snippet_around(body, range.start, range.end),
                score: note.score,
                match_index: Some(match_index as u32),
                match_query: Some(needle.to_string()),
                line: Some(line),
            });
        }
    }
    out
}

fn read_note(space_root: &Path, note_id: &str) -> Option<String> {
    let abs = crate::paths::join_under(space_root, Path::new(note_id)).ok()?;
    std::fs::read_to_string(abs).ok()
}

fn count_newlines(text: &str) -> u32 {
    text.bytes().filter(|byte| *byte == b'\n').count() as u32
}

struct ByteRange {
    start: usize,
    end: usize,
}

/// Case-insensitive, non-overlapping literal search.
///
/// The frontend (`findPlainTextSearchRanges`) lowercases the whole haystack and
/// then advances past each hit, so this does the same and maps offsets back to
/// the original text. Any other stepping rule would desynchronise `match_index`
/// from the editor's match list.
fn find_matches(haystack: &str, needle_lc: &str) -> Vec<ByteRange> {
    if needle_lc.is_empty() || haystack.is_empty() {
        return Vec::new();
    }

    // Lowercased copy plus, for every byte in it, the bounds of the source char
    // it came from. Case folding can change length (`İ` lowercases to two chars),
    // so a match can begin or end partway through one source char; mapping to
    // that char's bounds keeps every range non-empty and on a char boundary.
    let mut lower = String::with_capacity(haystack.len());
    let mut source_starts: Vec<usize> = Vec::with_capacity(haystack.len());
    let mut source_ends: Vec<usize> = Vec::with_capacity(haystack.len());
    for (offset, ch) in haystack.char_indices() {
        let before = lower.len();
        for lowered in ch.to_lowercase() {
            lower.push(lowered);
        }
        let end = offset + ch.len_utf8();
        source_starts.resize(lower.len(), offset);
        source_ends.resize(lower.len(), end);
        debug_assert!(lower.len() > before);
    }

    let mut out = Vec::new();
    let mut cursor = 0usize;
    while let Some(found) = lower[cursor..].find(needle_lc) {
        let at = cursor + found;
        let start = source_starts[at];
        let end = source_ends[at + needle_lc.len() - 1];
        out.push(ByteRange { start, end });
        cursor = at + needle_lc.len();
    }
    out
}

/// The rich editor renders a Markdown link's label but not its destination.
/// Excluding destinations keeps the occurrence ordinal passed to rich find in
/// sync with the visible text while retaining the source range for snippets.
fn find_visible_matches(haystack: &str, needle_lc: &str) -> Vec<ByteRange> {
    let hidden = markdown_link_destinations(haystack);
    find_matches(haystack, needle_lc)
        .into_iter()
        .filter(|range| {
            !hidden
                .iter()
                .any(|destination| range.start < destination.end && destination.start < range.end)
        })
        .take(MAX_MATCHES_PER_NOTE)
        .collect()
}

/// Return the content ranges of balanced inline Markdown link destinations.
fn markdown_link_destinations(markdown: &str) -> Vec<ByteRange> {
    let bytes = markdown.as_bytes();
    let mut destinations = Vec::new();
    let mut index = 0;
    while index + 1 < bytes.len() {
        if bytes[index] != b']' || bytes[index + 1] != b'(' {
            index += 1;
            continue;
        }

        let start = index + 2;
        let mut cursor = start;
        let mut depth = 1usize;
        while cursor < bytes.len() {
            match bytes[cursor] {
                b'\\' => cursor += 2,
                b'(' => {
                    depth += 1;
                    cursor += 1;
                }
                b')' => {
                    depth -= 1;
                    if depth == 0 {
                        destinations.push(ByteRange { start, end: cursor });
                        cursor += 1;
                        break;
                    }
                    cursor += 1;
                }
                _ => cursor += 1,
            }
        }
        index = cursor;
    }
    destinations
}

/// Step `count` chars backwards from `index`, staying on char boundaries.
fn step_back(text: &str, mut index: usize, count: usize) -> usize {
    for _ in 0..count {
        if index == 0 {
            break;
        }
        index -= 1;
        while index > 0 && !text.is_char_boundary(index) {
            index -= 1;
        }
    }
    index
}

/// Step `count` chars forwards from `index`, staying on char boundaries.
fn step_forward(text: &str, mut index: usize, count: usize) -> usize {
    for _ in 0..count {
        if index >= text.len() {
            break;
        }
        index += 1;
        while index < text.len() && !text.is_char_boundary(index) {
            index += 1;
        }
    }
    index
}

fn starts_word(text: &str, index: usize) -> bool {
    text[..index]
        .chars()
        .next_back()
        .is_none_or(char::is_whitespace)
}

fn ends_word(text: &str, index: usize) -> bool {
    text[index..].chars().next().is_none_or(char::is_whitespace)
}

/// Move a snippet's start onto a word start: back to the previous whitespace when
/// one is near, else forward past the cut word (never past the match at `limit`).
fn word_start(text: &str, from: usize, limit: usize) -> usize {
    if starts_word(text, from) {
        return from;
    }
    let mut index = from;
    for _ in 0..SNIPPET_WORD_SLACK_CHARS {
        index = step_back(text, index, 1);
        if starts_word(text, index) {
            return index;
        }
    }
    text[from..limit]
        .char_indices()
        .find(|(_, ch)| ch.is_whitespace())
        .map_or(from, |(offset, ch)| from + offset + ch.len_utf8())
}

/// Pull a snippet's end back to the last word end after the match at `floor`.
fn word_end(text: &str, to: usize, floor: usize) -> usize {
    if ends_word(text, to) {
        return to;
    }
    text[floor..to]
        .rfind(char::is_whitespace)
        .map_or(to, |offset| floor + offset)
}

/// One-line preview with escaped source text and explicit highlight markers for
/// the palette renderer (see `PaletteSnippet` in `CommandPaletteSnippet.tsx`).
/// Both edges land on word boundaries, and `…` marks only text that was dropped.
fn snippet_around(text: &str, start: usize, end: usize) -> String {
    let from = word_start(text, step_back(text, start, SNIPPET_RADIUS_CHARS), start);
    let to = word_end(text, step_forward(text, end, SNIPPET_RADIUS_CHARS), end);

    let mut out = String::new();
    if !text[..from].trim().is_empty() {
        out.push('…');
    }
    push_flattened(&mut out, text[from..start].trim_start());
    out.push(SNIPPET_HIGHLIGHT_START);
    push_flattened(&mut out, &text[start..end]);
    out.push(SNIPPET_HIGHLIGHT_END);
    push_flattened(&mut out, text[end..to].trim_end());
    if !text[to..].trim().is_empty() {
        out.push('…');
    }
    out
}

fn push_flattened(out: &mut String, part: &str) {
    for ch in part.chars() {
        match ch {
            SNIPPET_ESCAPE | SNIPPET_HIGHLIGHT_START | SNIPPET_HIGHLIGHT_END => {
                out.push(SNIPPET_ESCAPE);
                out.push(ch);
            }
            _ => out.push(if ch.is_whitespace() { ' ' } else { ch }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        expand_text_matches, find_matches, snippet_around, SNIPPET_HIGHLIGHT_END,
        SNIPPET_HIGHLIGHT_START,
    };
    use crate::index::types::SearchResult;

    fn temp_space() -> std::path::PathBuf {
        let root =
            std::env::temp_dir().join(format!("glyph-search-matches-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn note(id: &str, title: &str) -> SearchResult {
        SearchResult {
            id: id.into(),
            title: title.into(),
            snippet: "preview".into(),
            score: 1.0,
            match_index: None,
            match_query: None,
            line: None,
        }
    }

    #[test]
    fn finds_all_occurrences_case_insensitive() {
        let hits = find_matches("Deadline then deadline then DEADLINE", "deadline");
        assert_eq!(hits.len(), 3);
        assert_eq!(hits[0].start, 0);
        assert_eq!(hits[1].start, 14);
        assert_eq!(hits[2].start, 28);
    }

    #[test]
    fn matches_do_not_overlap() {
        // The editor's find bar advances past each hit, so this must too.
        assert_eq!(find_matches("aaaa", "aa").len(), 2);
    }

    #[test]
    fn offsets_survive_multibyte_text() {
        let text = "héllo deadline";
        let hits = find_matches(text, "deadline");
        assert_eq!(hits.len(), 1);
        assert_eq!(&text[hits[0].start..hits[0].end], "deadline");
    }

    #[test]
    fn a_match_inside_a_case_fold_expansion_covers_the_whole_source_char() {
        // "İ" lowercases to two chars, so a hit on "i" ends mid-expansion.
        let text = "İstanbul";
        let hits = find_matches(text, "i");
        assert_eq!(hits.len(), 1);
        assert_eq!(&text[hits[0].start..hits[0].end], "İ");
        assert!(snippet_around(text, hits[0].start, hits[0].end)
            .contains(&format!("{SNIPPET_HIGHLIGHT_START}İ{SNIPPET_HIGHLIGHT_END}")));
    }

    #[test]
    fn snippet_wraps_match_and_flattens_newlines() {
        let snippet = snippet_around("hello\ndeadline world", 6, 14);
        assert!(snippet.contains(&format!(
            "{SNIPPET_HIGHLIGHT_START}deadline{SNIPPET_HIGHLIGHT_END}"
        )));
        assert!(!snippet.contains('\n'));
    }

    #[test]
    fn snippet_edges_land_on_word_boundaries() {
        let text = format!("{} needle {}", "lorem ipsum ".repeat(8), "dolor sit ".repeat(8));
        let start = text.find("needle").unwrap();
        let snippet = snippet_around(&text, start, start + "needle".len());
        let inner = snippet.trim_start_matches('…').trim_end_matches('…');
        assert!(snippet.starts_with('…') && snippet.ends_with('…'));
        assert!(inner.starts_with("lorem ") || inner.starts_with("ipsum "));
        assert!(inner.ends_with("dolor") || inner.ends_with("sit"));
    }

    #[test]
    fn snippet_skips_the_ellipsis_when_only_whitespace_was_dropped() {
        // 43 chars before the match: the 42-char radius drops only the first newline.
        let text = format!("\n\n\n{}needle tail", "word ".repeat(8));
        let start = text.find("needle").unwrap();
        let snippet = snippet_around(&text, start, start + "needle".len());
        assert!(!snippet.starts_with('…'));
        assert!(!snippet.ends_with('…'));
    }

    #[test]
    fn expands_one_row_per_body_match_with_source_line_numbers() {
        let dir = temp_space();
        std::fs::write(
            dir.join("a.md"),
            "---\ntitle: Alpha\n---\none deadline\ntwo deadline",
        )
        .unwrap();

        let rows = expand_text_matches(&dir, vec![note("a.md", "Alpha")], "deadline", 50);

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].match_index, Some(0));
        assert_eq!(rows[0].line, Some(4));
        assert_eq!(rows[0].match_query.as_deref(), Some("deadline"));
        assert_eq!(rows[1].match_index, Some(1));
        assert_eq!(rows[1].line, Some(5));
        assert!(rows[0].snippet.contains(&format!(
            "{SNIPPET_HIGHLIGHT_START}deadline{SNIPPET_HIGHLIGHT_END}"
        )));
    }

    #[test]
    fn frontmatter_hits_do_not_shift_the_body_ordinal() {
        let dir = temp_space();
        std::fs::write(
            dir.join("a.md"),
            "---\ntags: [deadline]\n---\nthe deadline is near",
        )
        .unwrap();

        let rows = expand_text_matches(&dir, vec![note("a.md", "Alpha")], "deadline", 50);

        // Only the body hit is a jump target, and it is occurrence 0 of the body.
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].match_index, Some(0));
        assert_eq!(rows[0].line, Some(4));
    }

    #[test]
    fn a_title_hit_keeps_its_note_level_row() {
        let dir = temp_space();
        std::fs::write(dir.join("a.md"), "deadline one\ndeadline two").unwrap();

        let rows = expand_text_matches(
            &dir,
            vec![note("a.md", "Deadline planning")],
            "deadline",
            50,
        );

        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].match_index, None);
        assert_eq!(rows[1].match_index, Some(0));
        assert_eq!(rows[2].match_index, Some(1));
    }

    #[test]
    fn notes_without_a_literal_hit_stay_note_level() {
        let dir = temp_space();
        std::fs::write(dir.join("a.md"), "nothing relevant here").unwrap();

        let rows = expand_text_matches(&dir, vec![note("a.md", "Alpha")], "deadline", 50);

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].match_index, None);
    }

    #[test]
    fn missing_files_stay_note_level() {
        let dir = temp_space();
        let rows = expand_text_matches(&dir, vec![note("gone.md", "Gone")], "deadline", 50);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].match_index, None);
    }
}
