use crate::index::tags::inline_tag_spans;

use super::TagRefactor;

fn is_blank(ch: char) -> bool {
    ch == ' ' || ch == '\t'
}

/// Rewrites inline `#tag` tokens in `text[body_start..]`; deleting a token also
/// drops one adjacent space. The whole note is scanned so fence and comment state
/// matches the index.
pub(super) fn rewrite_inline(
    text: &str,
    body_start: usize,
    refactor: &TagRefactor,
) -> (String, usize) {
    let mut out = String::with_capacity(text.len() - body_start);
    let mut cursor = body_start;
    let mut count = 0;
    for range in inline_tag_spans(text) {
        if range.start < body_start {
            continue;
        }
        let Some(next) = refactor.map(&text[range.start + 1..range.end]) else {
            continue;
        };
        count += 1;
        out.push_str(&text[cursor..range.start]);
        cursor = range.end;
        match next {
            Some(written) => {
                out.push('#');
                out.push_str(&written);
            }
            None if out.ends_with(is_blank) => {
                out.pop();
            }
            None => {
                if text[cursor..].starts_with(is_blank) {
                    cursor += 1;
                }
            }
        }
    }
    out.push_str(&text[cursor..]);
    (out, count)
}
