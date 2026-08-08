use std::path::Path;

use super::frontmatter::split_frontmatter;
use super::types::SearchResult;

const MAX_MATCHES_PER_NOTE: usize = 40;
/// Reading note files is the cost here, so only the strongest hits are expanded.
const MAX_EXPANDED_NOTES: usize = 60;
const SNIPPET_RADIUS_CHARS: usize = 42;

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
        let matches = find_matches(body, &needle_lc);
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
        if out.len() >= MAX_MATCHES_PER_NOTE {
            break;
        }
        cursor = at + needle_lc.len();
    }
    out
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

/// One-line preview with the hit wrapped in the `⟦⟧` markers the palette renders
/// as a highlight (see `HighlightedSnippet` in `CommandList.tsx`).
fn snippet_around(text: &str, start: usize, end: usize) -> String {
    let from = step_back(text, start, SNIPPET_RADIUS_CHARS);
    let to = step_forward(text, end, SNIPPET_RADIUS_CHARS);

    let mut out = String::new();
    if from > 0 {
        out.push('…');
    }
    push_flattened(&mut out, &text[from..start]);
    out.push('⟦');
    push_flattened(&mut out, &text[start..end]);
    out.push('⟧');
    push_flattened(&mut out, &text[end..to]);
    if to < text.len() {
        out.push('…');
    }
    out
}

fn push_flattened(out: &mut String, part: &str) {
    for ch in part.chars() {
        match ch {
            '⟦' => out.push_str("⟦⟦"),
            '⟧' => out.push_str("⟧⟧"),
            _ => out.push(if ch.is_whitespace() { ' ' } else { ch }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{count_newlines, expand_text_matches, find_matches, snippet_around};
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
        assert!(snippet_around(text, hits[0].start, hits[0].end).contains("⟦İ⟧"));
    }

    #[test]
    fn snippet_wraps_match_and_flattens_newlines() {
        let snippet = snippet_around("hello\ndeadline world", 6, 14);
        assert!(snippet.contains("⟦deadline⟧"));
        assert!(!snippet.contains('\n'));
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
        assert!(rows[0].snippet.contains("⟦deadline⟧"));
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

    #[test]
    fn counts_newlines() {
        assert_eq!(count_newlines("a\nb\nc"), 2);
    }
}
