use super::super::lines::markdown_lines;
use super::super::parse::{block_items, checklist_items_in, parse_checklist_items};

fn texts(markdown: &str) -> Vec<String> {
    parse_checklist_items(markdown)
        .into_iter()
        .map(|item| item.text)
        .collect()
}

#[test]
fn skips_fenced_code_until_matching_closer() {
    let markdown = "````md\n- [ ] in fence\n```\n- [ ] still in fence\n````\n~~~\n- [ ] tilde\n~~~\n- [ ] real\n";
    assert_eq!(texts(markdown), vec!["real"]);
}

#[test]
fn indented_fences_inside_list_items_are_skipped() {
    let markdown = "- [ ] parent\n    ```\n    - [ ] code\n    ```\n- [ ] after\n";
    assert_eq!(texts(markdown), vec!["parent", "after"]);
}

#[test]
fn skips_frontmatter_only_at_document_start() {
    let markdown = "---\nitems:\n- [ ] yaml\n---\n- [ ] body\n";
    let items = parse_checklist_items(markdown);
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].text, "body");
    assert_eq!(items[0].line_index, 4);

    let not_frontmatter = "Intro\n---\n- [ ] a\n---\n";
    assert_eq!(texts(not_frontmatter), vec!["a"]);
}

#[test]
fn skips_html_comments() {
    let markdown = "<!--\n- [ ] hidden\n-->\n<!-- - [ ] one line -->\n- [ ] inline <!-- note -->\n- [ ] opens <!-- start\n- [ ] not swallowed\n";
    assert_eq!(
        texts(markdown),
        vec!["inline <!-- note -->", "opens <!-- start", "not swallowed"]
    );
}

#[test]
fn reports_offsets_lines_indent_and_heading() {
    let markdown =
        "# Plan ##\n\n  - [x] Done\n- [ ] Open\n```\n## Not a heading\n```\n- [ ] After fence\n";
    let items = parse_checklist_items(markdown);
    assert_eq!(items.len(), 3);
    let done = &items[0];
    assert_eq!((done.start, done.checkbox), (11, 16));
    assert_eq!((done.line_index, done.indent, done.checked), (2, 2, true));
    assert_eq!(&markdown[done.checkbox..=done.checkbox], "x");
    assert_eq!(done.heading.as_deref(), Some("Plan"));
    assert_eq!((items[1].start, items[1].line_index, items[1].indent), (24, 3, 0));
    assert_eq!(items[2].heading.as_deref(), Some("Plan"));
}

#[test]
fn detects_moved_markers_and_strips_them_from_text() {
    let markdown = "- [x] Current ***Moved to*** [[2026-01-02]]\n- [x] Legacy ***Moved to [[2026-01-02]]\n- [ ] Arrived ***Moved from*** [[2026-01-01]]\n- [ ] Plain\n";
    let items = parse_checklist_items(markdown);
    let moved = items.iter().map(|item| item.moved).collect::<Vec<_>>();
    assert_eq!(moved, vec![true, true, false, false]);
    assert_eq!(
        texts(markdown),
        vec!["Current", "Legacy", "Arrived", "Plain"]
    );
}

#[test]
fn handles_crlf_line_endings() {
    let markdown = "- [ ] a\r\n```\r\n- [ ] code\r\n```\r\n- [x] b\r\n";
    let items = parse_checklist_items(markdown);
    assert_eq!(items.len(), 2);
    assert_eq!(items[0].start, 0);
    assert_eq!(items[0].text, "a");
    assert_eq!((items[1].start, items[1].line_index), (31, 4));
    assert_eq!(&markdown[items[1].checkbox..=items[1].checkbox], "x");
}

#[test]
fn closing_hashes_only_heading_is_none() {
    let items = parse_checklist_items("# ###\n- [ ] a\n");
    assert_eq!(items[0].heading, None);
}

#[test]
fn comment_line_ends_a_task_block() {
    let markdown = "- [ ] a\n<!-- note -->\n  - [ ] b\n";
    let lines = markdown_lines(markdown);
    let items = checklist_items_in(&lines);
    assert_eq!(items.len(), 2);
    assert_eq!(block_items(&lines, &items, 0).len(), 1);
}
