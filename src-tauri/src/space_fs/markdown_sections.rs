use std::collections::HashMap;

pub(super) struct MarkdownHeading<'a> {
    pub depth: usize,
    pub title: &'a str,
    pub slug: String,
    pub offset: usize,
}

fn atx_heading(line: &str) -> Option<(usize, &str)> {
    let trimmed = line.trim_start();
    let depth = trimmed
        .chars()
        .take_while(|character| *character == '#')
        .count();
    if depth == 0 || depth > 6 || trimmed.as_bytes().get(depth) != Some(&b' ') {
        return None;
    }
    Some((depth, trimmed[depth + 1..].trim_end_matches('#').trim()))
}

fn fence_marker(line: &str) -> Option<(char, usize)> {
    let trimmed = line.trim_start();
    let marker = trimmed.chars().next()?;
    if marker != '`' && marker != '~' {
        return None;
    }
    let width = trimmed
        .chars()
        .take_while(|character| *character == marker)
        .count();
    (width >= 3).then_some((marker, width))
}

fn slugify_heading(title: &str) -> String {
    let mut slug = String::new();
    let mut previous_dash = false;
    for character in title.trim().to_lowercase().chars() {
        if character.is_alphanumeric() || character == '_' {
            slug.push(character);
            previous_dash = false;
        } else if (character.is_whitespace() || character == '-')
            && !slug.is_empty()
            && !previous_dash
        {
            slug.push('-');
            previous_dash = true;
        }
    }
    slug.trim_matches('-').to_string()
}

pub(super) fn markdown_headings(markdown: &str) -> Vec<MarkdownHeading<'_>> {
    let mut active_fence: Option<(char, usize)> = None;
    let mut slug_counts = HashMap::<String, usize>::new();
    let mut headings = Vec::new();
    let mut offset = 0;

    for line_with_newline in markdown.split_inclusive('\n') {
        let line = line_with_newline.trim_end_matches(['\r', '\n']);
        if let Some((marker, width)) = fence_marker(line) {
            match active_fence {
                Some((active_marker, active_width))
                    if marker == active_marker && width >= active_width =>
                {
                    active_fence = None;
                }
                None => active_fence = Some((marker, width)),
                _ => {}
            }
            offset += line_with_newline.len();
            continue;
        }
        if active_fence.is_none() {
            if let Some((depth, title)) = atx_heading(line) {
                let base_slug = slugify_heading(title);
                let seen = slug_counts.entry(base_slug.clone()).or_default();
                let slug = if *seen == 0 {
                    base_slug
                } else {
                    format!("{base_slug}-{seen}")
                };
                *seen += 1;
                headings.push(MarkdownHeading {
                    depth,
                    title,
                    slug,
                    offset,
                });
            }
        }
        offset += line_with_newline.len();
    }
    headings
}

pub(super) fn extract_heading_section(markdown: &str, anchor: &str) -> Option<String> {
    let requested = anchor.trim().trim_start_matches('#').to_lowercase();
    let headings = markdown_headings(markdown);
    let (index, heading) = headings.iter().enumerate().find(|(_, heading)| {
        heading.slug == requested || heading.title.trim().eq_ignore_ascii_case(&requested)
    })?;
    let end = headings[index + 1..]
        .iter()
        .find(|candidate| candidate.depth <= heading.depth)
        .map_or(markdown.len(), |candidate| candidate.offset);
    Some(markdown[heading.offset..end].trim_end().to_string())
}
