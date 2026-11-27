use std::ops::Range;

use super::types::TaskFieldKey;

const PRIORITY_NAMES: [&str; 5] = ["lowest", "low", "medium", "high", "highest"];

const VARIATION_SELECTOR: char = '\u{FE0F}';
const DATE_LEN: usize = 10;

const DATE_EMOJI: [(&str, TaskFieldKey); 5] = [
    ("📅", TaskFieldKey::Due),
    ("📆", TaskFieldKey::Due),
    ("🗓", TaskFieldKey::Due),
    ("✅", TaskFieldKey::Completion),
    ("❌", TaskFieldKey::Cancelled),
];

const PRIORITY_EMOJI: [(&str, usize); 5] = [("⏬", 0), ("🔽", 1), ("🔼", 2), ("⏫", 3), ("🔺", 4)];

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct TaskField {
    pub key: String,
    pub value: String,
    pub range: Range<usize>,
}

impl TaskField {
    pub fn known_key(&self) -> Option<TaskFieldKey> {
        TaskFieldKey::from_key(&self.key)
    }
}

pub(crate) fn priority_from_name(name: &str) -> Option<u8> {
    PRIORITY_NAMES
        .iter()
        .position(|candidate| candidate.eq_ignore_ascii_case(name.trim()))
        .map(|index| index as u8)
}

pub(crate) fn priority_name(priority: u8) -> Option<&'static str> {
    PRIORITY_NAMES.get(usize::from(priority)).copied()
}

fn date_shaped(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == DATE_LEN
        && bytes.iter().enumerate().all(|(index, byte)| {
            if matches!(index, 4 | 7) {
                *byte == b'-'
            } else {
                byte.is_ascii_digit()
            }
        })
}

pub(crate) fn is_valid_date(value: &str) -> bool {
    date_shaped(value) && chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
}

pub(crate) fn scan_fields(text: &str) -> Vec<TaskField> {
    let bytes = text.as_bytes();
    let mut fields = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'`' {
            index = code_span_end(text, index);
            continue;
        }
        if bytes[index..].starts_with(b"[[") {
            if let Some(end) = find_from(text, index + 2, "]]") {
                index = end + 2;
                continue;
            }
        }
        if bytes[index..].starts_with(b"](") {
            if let Some(end) = find_from(text, index + 2, ")") {
                index = end + 1;
                continue;
            }
        }
        if let Some(field) = bracket_field(text, index).or_else(|| emoji_field(text, index)) {
            index = field.range.end;
            fields.push(field);
            continue;
        }
        index += text[index..].chars().next().map_or(1, char::len_utf8);
    }
    fields
}

fn find_from(text: &str, start: usize, needle: &str) -> Option<usize> {
    text[start..].find(needle).map(|offset| start + offset)
}

fn code_span_end(text: &str, start: usize) -> usize {
    let bytes = text.as_bytes();
    let run = bytes[start..]
        .iter()
        .take_while(|byte| **byte == b'`')
        .count();
    let mut cursor = start + run;
    while let Some(offset) = text[cursor..].find('`') {
        let close = cursor + offset;
        let close_run = bytes[close..]
            .iter()
            .take_while(|byte| **byte == b'`')
            .count();
        if close_run == run {
            return close + close_run;
        }
        cursor = close + close_run;
    }
    start + run
}

fn is_word_char(ch: char) -> bool {
    ch.is_alphanumeric() || ch == '_'
}

fn bracket_field(text: &str, open: usize) -> Option<TaskField> {
    let bytes = text.as_bytes();
    if bytes[open] != b'[' {
        return None;
    }
    if text[..open]
        .chars()
        .next_back()
        .is_some_and(|ch| ch == '\\' || is_word_char(ch))
    {
        return None;
    }
    let key_start = open + 1;
    if !bytes.get(key_start)?.is_ascii_alphabetic() {
        return None;
    }
    let key_len = bytes[key_start..]
        .iter()
        .take_while(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
        .count();
    let key_end = key_start + key_len;
    if !bytes[key_end..].starts_with(b"::") {
        return None;
    }
    let value_start = key_end + 2;
    let mut cursor = value_start;
    loop {
        match bytes.get(cursor)? {
            b'[' if bytes[cursor..].starts_with(b"[[") => {
                let close = find_from(text, cursor + 2, "]]")?;
                let inner = &text[cursor + 2..close];
                if inner.is_empty() || inner.contains(['[', ']', '\n']) {
                    return None;
                }
                cursor = close + 2;
            }
            b']' => break,
            b'[' | b'\n' => return None,
            _ => cursor += text[cursor..].chars().next().map_or(1, char::len_utf8),
        }
    }
    let end = cursor + 1;
    if bytes.get(end) == Some(&b'(') {
        return None;
    }
    Some(TaskField {
        key: text[key_start..key_end].to_ascii_lowercase(),
        value: text[value_start..cursor]
            .trim_matches([' ', '\t'])
            .to_string(),
        range: open..end,
    })
}

fn after_emoji(text: &str, start: usize, emoji: &str) -> Option<usize> {
    let rest = text[start..].strip_prefix(emoji)?;
    let rest = rest.strip_prefix(VARIATION_SELECTOR).unwrap_or(rest);
    Some(text.len() - rest.len())
}

fn emoji_field(text: &str, start: usize) -> Option<TaskField> {
    if let Some((end, priority)) = PRIORITY_EMOJI
        .iter()
        .find_map(|(emoji, priority)| after_emoji(text, start, emoji).map(|end| (end, *priority)))
    {
        return Some(TaskField {
            key: TaskFieldKey::Priority.as_str().to_string(),
            value: PRIORITY_NAMES[priority].to_string(),
            range: start..end,
        });
    }
    let (emoji_end, key) = DATE_EMOJI
        .iter()
        .find_map(|(emoji, key)| after_emoji(text, start, emoji).map(|end| (end, *key)))?;
    let rest = &text[emoji_end..];
    let value_start = emoji_end + rest.len() - rest.trim_start_matches([' ', '\t']).len();
    let value = text.get(value_start..value_start + DATE_LEN)?;
    date_shaped(value).then(|| TaskField {
        key: key.as_str().to_string(),
        value: value.to_string(),
        range: start..value_start + DATE_LEN,
    })
}
