use std::{ops::Range, path::Path};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use super::frontmatter::split_frontmatter;

const MIN_TITLE_ALPHANUMERIC_CHARS: usize = 4;

#[derive(Clone, Deserialize, Serialize)]
pub struct UnlinkedMention {
    pub source_id: String,
    pub source_title: String,
    pub start: usize,
    pub end: usize,
    pub text: String,
    pub context: String,
}

#[derive(Serialize)]
pub struct UnlinkedMentionsResult {
    pub mentions: Vec<UnlinkedMention>,
}

#[derive(Serialize)]
pub struct LinkUnlinkedMentionsResult {
    pub linked_count: usize,
    pub skipped_count: usize,
}

#[derive(Clone)]
pub struct UnlinkedMentionTarget {
    pub id: String,
    pub title: String,
}

pub fn find_unlinked_mentions(
    conn: &Connection,
    space_root: &Path,
    note_id: &str,
) -> Result<UnlinkedMentionsResult, String> {
    let target = mention_target(conn, note_id)?;
    if !is_mentionable_title(&target.title) {
        return Ok(UnlinkedMentionsResult {
            mentions: Vec::new(),
        });
    }

    let fts_query = fts_candidate_query(&target.title);
    let mut stmt = conn
        .prepare(
            "SELECT n.id, n.title
             FROM notes_fts
             JOIN notes n ON n.id = notes_fts.id
             WHERE notes_fts MATCH ?
               AND notes_fts.id <> ?
             ORDER BY n.updated DESC, n.id COLLATE NOCASE ASC",
        )
        .map_err(|error| error.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params![fts_query, note_id])
        .map_err(|error| error.to_string())?;
    let mut mentions = Vec::new();

    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        let source_id: String = row.get(0).map_err(|error| error.to_string())?;
        let source_title: String = row.get(1).map_err(|error| error.to_string())?;
        let Ok(source_path) = crate::paths::join_under(space_root, Path::new(&source_id)) else {
            continue;
        };
        let Ok(markdown) = std::fs::read_to_string(&source_path) else {
            continue;
        };
        mentions.extend(find_mentions_in_markdown(
            &markdown,
            &target.title,
            &source_id,
            &source_title,
        ));
    }

    Ok(UnlinkedMentionsResult { mentions })
}

pub fn mention_target(conn: &Connection, note_id: &str) -> Result<UnlinkedMentionTarget, String> {
    conn.query_row(
        "SELECT id, title FROM notes WHERE id = ? LIMIT 1",
        [note_id],
        |row| {
            Ok(UnlinkedMentionTarget {
                id: row.get(0)?,
                title: row.get(1)?,
            })
        },
    )
    .map_err(|error| error.to_string())
}

pub fn replace_mentions(
    markdown: &str,
    target: &UnlinkedMentionTarget,
    mentions: &[UnlinkedMention],
) -> Result<String, String> {
    let mut ranges = mentions
        .iter()
        .map(|mention| (mention.start, mention.end, mention.text.as_str()))
        .collect::<Vec<_>>();
    ranges.sort_unstable_by(|left, right| right.0.cmp(&left.0));

    let replacement = wikilink_for_target(target)?;
    let mut next = markdown.to_string();
    let mut previous_start = next.len();
    for (start, end, text) in ranges {
        if start >= end
            || end > next.len()
            || !next.is_char_boundary(start)
            || !next.is_char_boundary(end)
        {
            return Err(
                "An unlinked mention is no longer valid. Refresh and try again.".to_string(),
            );
        }
        if end > previous_start || next.get(start..end) != Some(text) {
            return Err("An unlinked mention changed on disk. Refresh and try again.".to_string());
        }
        next.replace_range(start..end, &replacement);
        previous_start = start;
    }
    Ok(next)
}

pub fn selected_mentions_are_valid(
    markdown: &str,
    target: &UnlinkedMentionTarget,
    mentions: &[UnlinkedMention],
) -> bool {
    if !is_mentionable_title(&target.title) {
        return false;
    }
    let valid_mentions = find_mentions_in_markdown(markdown, &target.title, "", "");
    mentions.iter().all(|mention| {
        valid_mentions.iter().any(|valid| {
            valid.start == mention.start && valid.end == mention.end && valid.text == mention.text
        })
    })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use rusqlite::Connection;
    use uuid::Uuid;

    use super::{
        find_mentions_in_markdown, find_unlinked_mentions, is_mentionable_title, replace_mentions,
        UnlinkedMentionTarget,
    };
    use crate::index::schema::ensure_schema;

    fn insert_note(conn: &Connection, id: &str, title: &str, body: &str) {
        conn.execute(
            "INSERT INTO notes(id, title, created, updated, path, etag, preview) VALUES(?, ?, '', '', ?, '', '')",
            rusqlite::params![id, title, id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes_fts(id, title, body) VALUES(?, ?, ?)",
            rusqlite::params![id, title, body],
        )
        .unwrap();
    }

    #[test]
    fn finds_plain_mentions_and_excludes_markdown_ranges() {
        let root = std::env::temp_dir().join(format!("glyph-unlinked-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let source_id = "Meeting.md";
        let source_markdown = "---\ntitle: Project Phoenix\n---\nDiscussed Project Phoenix timeline.\n[[Project Phoenix]]\n`Project Phoenix`\n[Project Phoenix](https://example.com)\nProject Phoenixville\n```text\nProject Phoenix\n```\n";
        fs::write(root.join(source_id), source_markdown).unwrap();

        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        insert_note(&conn, "Project Phoenix.md", "Project Phoenix", "");
        insert_note(&conn, source_id, "Meeting", source_markdown);

        let result = find_unlinked_mentions(&conn, &root, "Project Phoenix.md").unwrap();

        assert_eq!(result.mentions.len(), 1);
        assert_eq!(result.mentions[0].source_id, source_id);
        assert_eq!(result.mentions[0].text, "Project Phoenix");

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn allows_titles_of_four_or_more_alphanumeric_characters() {
        assert!(!is_mentionable_title("May"));
        assert!(is_mentionable_title("Plan"));
        assert_eq!(
            find_mentions_in_markdown("Plan plan", "Plan", "", "").len(),
            2
        );
    }

    #[test]
    fn replaces_a_plain_mention_with_a_wikilink() {
        let markdown = "Plan the project.";
        let mentions = find_mentions_in_markdown(markdown, "Plan", "source.md", "Source");
        let target = UnlinkedMentionTarget {
            id: "Projects/Plans/Plan.md".to_string(),
            title: "Plan".to_string(),
        };

        let rewritten = replace_mentions(markdown, &target, &mentions).unwrap();

        assert_eq!(rewritten, "[[Projects/Plans/Plan]] the project.");
    }
}

pub fn is_mentionable_title(title: &str) -> bool {
    title
        .chars()
        .filter(|character| character.is_alphanumeric())
        .count()
        >= MIN_TITLE_ALPHANUMERIC_CHARS
}

fn fts_candidate_query(title: &str) -> String {
    title
        .split(|character: char| !character.is_alphanumeric())
        .filter(|term| !term.is_empty())
        .map(|term| format!("\"{term}\""))
        .collect::<Vec<_>>()
        .join(" AND ")
}

fn find_mentions_in_markdown(
    markdown: &str,
    title: &str,
    source_id: &str,
    source_title: &str,
) -> Vec<UnlinkedMention> {
    let (_frontmatter, body) = split_frontmatter(markdown);
    let body_start = markdown.len().saturating_sub(body.len());
    let excluded_ranges = excluded_ranges(body);
    let title_lower = title.to_lowercase();
    let title_char_count = title.chars().count();
    let mut mentions = Vec::new();

    for (start, _) in body.char_indices() {
        if !has_word_boundary_before(body, start) {
            continue;
        }
        let Some(end) = end_after_char_count(body, start, title_char_count) else {
            break;
        };
        if !has_word_boundary_after(body, end)
            || is_excluded(&excluded_ranges, start..end)
        {
            continue;
        }
        let text = &body[start..end];
        if text.to_lowercase() != title_lower {
            continue;
        }
        mentions.push(UnlinkedMention {
            source_id: source_id.to_string(),
            source_title: source_title.to_string(),
            start: body_start + start,
            end: body_start + end,
            text: text.to_string(),
            context: context_for(body, start, end),
        });
    }

    mentions
}

fn wikilink_for_target(target: &UnlinkedMentionTarget) -> Result<String, String> {
    let path = target.id.strip_suffix(".md").unwrap_or(&target.id);
    if path.contains('[')
        || path.contains(']')
        || target.title.contains('[')
        || target.title.contains(']')
    {
        return Err("This note title cannot be represented as a wikilink.".to_string());
    }
    let escaped_path = path
        .replace('\\', "\\\\")
        .replace('|', "\\|")
        .replace('#', "\\#");
    let escaped_title = target.title.replace('\\', "\\\\").replace('|', "\\|");
    let path_label = path.rsplit('/').next().unwrap_or(path);
    if path_label.eq_ignore_ascii_case(&target.title) {
        Ok(format!("[[{escaped_path}]]"))
    } else {
        Ok(format!("[[{escaped_path}|{escaped_title}]]"))
    }
}

fn excluded_ranges(markdown: &str) -> Vec<Range<usize>> {
    let mut ranges = fenced_and_indented_code_ranges(markdown);
    let inline_ranges = inline_code_ranges(markdown, &ranges);
    ranges.extend(inline_ranges);
    ranges.extend(wikilink_ranges(markdown));
    ranges.extend(markdown_link_ranges(markdown));
    ranges.extend(url_ranges(markdown));
    ranges.sort_unstable_by_key(|range| range.start);
    let mut merged: Vec<Range<usize>> = Vec::new();
    for range in ranges {
        if let Some(previous) = merged.last_mut() {
            if range.start <= previous.end {
                previous.end = previous.end.max(range.end);
                continue;
            }
        }
        merged.push(range);
    }
    merged
}

fn fenced_and_indented_code_ranges(markdown: &str) -> Vec<Range<usize>> {
    let mut ranges = Vec::new();
    let mut active_fence: Option<(u8, usize, usize)> = None;
    let mut offset = 0;
    for line in markdown.split_inclusive('\n') {
        let line_end = offset + line.len();
        let trimmed = line.trim_start();
        let indentation = line.len() - trimmed.len();
        let indentation_prefix = &line[..indentation];
        if indentation <= 3 && !indentation_prefix.contains('\t') {
            if let Some((marker, length)) = fence_marker(trimmed) {
                match active_fence {
                    Some((open_marker, open_length, start))
                        if marker == open_marker && length >= open_length =>
                    {
                        ranges.push(start..line_end);
                        active_fence = None;
                    }
                    None => active_fence = Some((marker, length, offset)),
                    _ => {}
                }
            }
        } else if active_fence.is_none() && (line.starts_with("    ") || line.starts_with('\t')) {
            ranges.push(offset..line_end);
        }
        offset = line_end;
    }
    if let Some((_, _, start)) = active_fence {
        ranges.push(start..markdown.len());
    }
    ranges
}

fn fence_marker(line: &str) -> Option<(u8, usize)> {
    let bytes = line.as_bytes();
    let marker = *bytes.first()?;
    if marker != b'`' && marker != b'~' {
        return None;
    }
    let length = bytes.iter().take_while(|byte| **byte == marker).count();
    (length >= 3).then_some((marker, length))
}

fn inline_code_ranges(markdown: &str, excluded: &[Range<usize>]) -> Vec<Range<usize>> {
    let bytes = markdown.as_bytes();
    let mut ranges = Vec::new();
    let mut cursor = 0;
    while cursor < bytes.len() {
        if bytes[cursor] != b'`' {
            cursor += 1;
            continue;
        }
        if is_excluded(excluded, cursor..cursor.saturating_add(1)) {
            cursor += 1;
            continue;
        }
        let ticks = bytes[cursor..]
            .iter()
            .take_while(|byte| **byte == b'`')
            .count();
        let mut search = cursor + ticks;
        let mut found_closing_tick = false;
        while search + ticks <= bytes.len() {
            let Some(relative) = markdown[search..].find(&"`".repeat(ticks)) else {
                break;
            };
            let end_start = search + relative;
            let before = end_start.checked_sub(1).and_then(|index| bytes.get(index));
            let after = bytes.get(end_start + ticks);
            if before != Some(&b'`') && after != Some(&b'`') {
                ranges.push(cursor..end_start + ticks);
                cursor = end_start + ticks;
                found_closing_tick = true;
                break;
            }
            search = end_start + 1;
        }
        if !found_closing_tick {
            cursor += ticks;
        }
    }
    ranges
}

fn wikilink_ranges(markdown: &str) -> Vec<Range<usize>> {
    let mut ranges = Vec::new();
    let mut cursor = 0;
    while let Some(relative_start) = markdown[cursor..].find("[[") {
        let start = cursor + relative_start;
        let Some(relative_end) = markdown[start + 2..].find("]]") else {
            break;
        };
        let start = if start > 0 && markdown.as_bytes()[start - 1] == b'!' {
            start - 1
        } else {
            start
        };
        let end = start
            + (if markdown.as_bytes()[start] == b'!' {
                3
            } else {
                2
            })
            + relative_end
            + 2;
        ranges.push(start..end);
        cursor = end;
    }
    ranges
}

fn markdown_link_ranges(markdown: &str) -> Vec<Range<usize>> {
    let mut ranges = Vec::new();
    let mut cursor = 0;
    while let Some(relative_open_bracket) = markdown[cursor..].find('[') {
        let open_bracket = cursor + relative_open_bracket;
        let Some(relative_close_bracket) = markdown[open_bracket..].find(']') else {
            break;
        };
        let close_bracket = open_bracket + relative_close_bracket;
        let start = if open_bracket > 0 && markdown.as_bytes()[open_bracket - 1] == b'!' {
            open_bracket - 1
        } else {
            open_bracket
        };
        let after_label = close_bracket + 1;
        let Some(next) = markdown.as_bytes().get(after_label) else {
            ranges.push(start..after_label);
            break;
        };
        let end = match *next {
            b'(' => {
                let Some(relative_end) = markdown[after_label + 1..].find(')') else {
                    cursor = after_label + 1;
                    continue;
                };
                after_label + 1 + relative_end + 1
            }
            b'[' => {
                let Some(relative_end) = markdown[after_label + 1..].find(']') else {
                    cursor = after_label + 1;
                    continue;
                };
                after_label + 1 + relative_end + 1
            }
            _ => after_label,
        };
        if end == after_label && *next != b':' {
            // A shortcut reference link is indistinguishable from bracketed text
            // without resolving definitions, so leave bracketed text untouched.
            ranges.push(start..end);
            cursor = end;
            continue;
        }
        ranges.push(start..end);
        cursor = end;
    }
    ranges
}

fn url_ranges(markdown: &str) -> Vec<Range<usize>> {
    let mut ranges = Vec::new();
    for scheme in ["http://", "https://"] {
        let mut cursor = 0;
        while let Some(relative_start) = markdown[cursor..].find(scheme) {
            let start = cursor + relative_start;
            let end = markdown[start..]
                .find(char::is_whitespace)
                .map(|relative_end| start + relative_end)
                .unwrap_or(markdown.len());
            ranges.push(start..end);
            cursor = end;
        }
    }
    ranges
}

fn end_after_char_count(text: &str, start: usize, count: usize) -> Option<usize> {
    let mut chars = text[start..].char_indices();
    for _ in 0..count {
        chars.next()?;
    }
    Some(
        chars
            .next()
            .map(|(offset, _)| start + offset)
            .unwrap_or(text.len()),
    )
}

fn has_word_boundary_before(text: &str, start: usize) -> bool {
    text[..start]
        .chars()
        .next_back()
        .map_or(true, |character| !is_word_character(character))
}

fn has_word_boundary_after(text: &str, end: usize) -> bool {
    text[end..]
        .chars()
        .next()
        .map_or(true, |character| !is_word_character(character))
}

fn is_word_character(character: char) -> bool {
    character.is_alphanumeric() || character == '_'
}

fn is_excluded(excluded: &[Range<usize>], range: Range<usize>) -> bool {
    // Both fenced-code ranges and the merged final ranges are ordered and disjoint.
    excluded
        .get(excluded.partition_point(|excluded_range| excluded_range.end <= range.start))
        .is_some_and(|excluded_range| excluded_range.start < range.end)
}

fn context_for(markdown: &str, start: usize, end: usize) -> String {
    const BEFORE_CHARS: usize = 72;
    const AFTER_CHARS: usize = 96;
    let context_start = markdown[..start]
        .char_indices()
        .rev()
        .nth(BEFORE_CHARS)
        .map(|(offset, _)| offset)
        .unwrap_or(0);
    let context_end = markdown[end..]
        .char_indices()
        .nth(AFTER_CHARS)
        .map(|(offset, _)| end + offset)
        .unwrap_or(markdown.len());
    let prefix = (context_start > 0).then_some("…").unwrap_or("");
    let suffix = (context_end < markdown.len()).then_some("…").unwrap_or("");
    format!(
        "{prefix}{}{suffix}",
        markdown[context_start..context_end]
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    )
}
