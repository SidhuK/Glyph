use std::ops::Range;

#[derive(Debug)]
pub(super) struct Splice {
    pub range: Range<usize>,
    pub text: String,
}

impl Splice {
    pub fn replace(range: Range<usize>, text: impl Into<String>) -> Self {
        Self {
            range,
            text: text.into(),
        }
    }

    pub fn insert(at: usize, text: impl Into<String>) -> Self {
        Self::replace(at..at, text)
    }
}

pub(super) fn apply_splices(source: &str, mut splices: Vec<Splice>) -> String {
    splices.sort_by_key(|splice| (splice.range.start, splice.range.end));
    let mut merged: Vec<Splice> = Vec::with_capacity(splices.len());
    for splice in splices {
        match merged.last_mut() {
            Some(previous) if previous.range.end > splice.range.start => {
                previous.range.end = previous.range.end.max(splice.range.end);
                previous.text.push_str(&splice.text);
            }
            _ => merged.push(splice),
        }
    }
    let mut out = source.to_string();
    for splice in merged.into_iter().rev() {
        out.replace_range(splice.range, &splice.text);
    }
    out
}

fn blank(byte: u8) -> bool {
    matches!(byte, b' ' | b'\t')
}

pub(super) fn removal_range(
    source: &str,
    range: Range<usize>,
    bounds: Range<usize>,
) -> Range<usize> {
    let bytes = source.as_bytes();
    let mut start = range.start;
    while start > bounds.start && blank(bytes[start - 1]) {
        start -= 1;
    }
    if start > bounds.start {
        return start..range.end;
    }
    let mut end = range.end;
    while end < bounds.end && blank(bytes[end]) {
        end += 1;
    }
    range.start..end
}

pub(super) fn trimmed(source: &str, range: Range<usize>) -> Range<usize> {
    let text = &source[range.clone()];
    let start = range.start + text.len() - text.trim_start().len();
    let end = range.start + text.trim_end().len();
    start..end.max(start)
}
