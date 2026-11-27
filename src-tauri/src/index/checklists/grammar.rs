pub(crate) const MOVED_TO_MARKER_PREFIX: &str = " ***Moved to*** [[";
pub(crate) const MOVED_FROM_MARKER_PREFIX: &str = " ***Moved from*** [[";
const LEGACY_MOVED_TO_MARKER_PREFIX: &str = " ***Moved to [[";
pub(crate) const LEGACY_MOVED_FROM_MARKER_PREFIX: &str = " ***Moved from [[";

const MAX_ORDERED_DIGITS: usize = 9;

pub(super) struct TaskLine {
    pub indent: usize,
    pub status: char,
    pub status_offset: usize,
    pub body_start: usize,
    pub description_end: usize,
    pub separated: bool,
    pub moved: bool,
}

fn bullet_end(bytes: &[u8], start: usize) -> Option<usize> {
    if matches!(bytes.get(start), Some(b'-' | b'*' | b'+')) {
        return Some(start + 1);
    }
    let digits = bytes[start..]
        .iter()
        .take_while(|byte| byte.is_ascii_digit())
        .count();
    if !(1..=MAX_ORDERED_DIGITS).contains(&digits) {
        return None;
    }
    let marker = start + digits;
    matches!(bytes.get(marker), Some(b'.' | b')')).then_some(marker + 1)
}

fn is_blank_byte(byte: Option<&u8>) -> bool {
    matches!(byte, Some(b' ' | b'\t'))
}

pub(super) fn is_list_item(line: &str) -> bool {
    let indent = line.len() - line.trim_start_matches([' ', '\t']).len();
    let bytes = line.as_bytes();
    bullet_end(bytes, indent).is_some_and(|end| end == bytes.len() || is_blank_byte(bytes.get(end)))
}

pub(super) fn parse_task_line(line: &str) -> Option<TaskLine> {
    let indent = line.len() - line.trim_start_matches([' ', '\t']).len();
    let bytes = line.as_bytes();
    let after_bullet = bullet_end(bytes, indent)?;
    if !is_blank_byte(bytes.get(after_bullet)) || bytes.get(after_bullet + 1) != Some(&b'[') {
        return None;
    }
    let status_offset = after_bullet + 2;
    let status = line[status_offset..].chars().next()?;
    if status == ']' {
        return None;
    }
    let close = status_offset + status.len_utf8();
    if bytes.get(close) != Some(&b']') {
        return None;
    }
    let after_close = close + 1;
    let separated = is_blank_byte(bytes.get(after_close));
    if !separated && after_close != bytes.len() {
        return None;
    }
    let body_start = after_close + usize::from(separated);
    let tail = &line[after_close..];
    let description_end = [
        MOVED_TO_MARKER_PREFIX,
        MOVED_FROM_MARKER_PREFIX,
        LEGACY_MOVED_TO_MARKER_PREFIX,
        LEGACY_MOVED_FROM_MARKER_PREFIX,
    ]
    .into_iter()
    .filter_map(|marker| tail.find(marker))
    .min()
    .map_or(line.len(), |offset| after_close + offset)
    .max(body_start);
    Some(TaskLine {
        indent,
        status,
        status_offset,
        body_start,
        description_end,
        separated,
        moved: tail.contains(MOVED_TO_MARKER_PREFIX)
            || tail.contains(LEGACY_MOVED_TO_MARKER_PREFIX),
    })
}

pub(super) fn atx_heading_level(line: &str) -> Option<(usize, &str)> {
    let rest = line.trim_start_matches(' ');
    if line.len() - rest.len() > 3 {
        return None;
    }
    let hashes = rest.len() - rest.trim_start_matches('#').len();
    if !(1..=6).contains(&hashes) {
        return None;
    }
    let body = rest[hashes..].strip_prefix([' ', '\t'])?.trim();
    let open = body.trim_end_matches('#');
    if open.is_empty() || open.ends_with([' ', '\t']) {
        return Some((hashes, open.trim()));
    }
    Some((hashes, body))
}
