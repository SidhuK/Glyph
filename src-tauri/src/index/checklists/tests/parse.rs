use super::super::details::task_details;
use super::super::lines::markdown_lines;
use super::super::parse::{
    block_items, checklist_items_in, parse_checklist_items, summarize_items,
};
use super::super::types::TaskStatusKind;

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
    assert_eq!((done.line_index, done.indent), (2, 2));
    assert_eq!(done.status_kind, TaskStatusKind::Done);
    assert_eq!(&markdown[done.checkbox..=done.checkbox], "x");
    assert_eq!(done.heading.as_deref(), Some("Plan"));
    assert_eq!(
        (items[1].start, items[1].line_index, items[1].indent),
        (24, 3, 0)
    );
    assert_eq!(items[2].heading.as_deref(), Some("Plan"));
}

#[test]
fn detects_moved_markers_and_strips_them_from_titles() {
    let markdown = "- [x] Current ***Moved to*** [[2026-01-02]]\n- [x] Legacy ***Moved to [[2026-01-02]]\n- [ ] Arrived ***Moved from*** [[2026-01-01]]\n- [ ] Plain\n";
    let items = parse_checklist_items(markdown);
    let moved = items.iter().map(|item| item.moved).collect::<Vec<_>>();
    assert_eq!(moved, vec![true, true, false, false]);
    let titles = items
        .iter()
        .map(|item| task_details(markdown, item).title)
        .collect::<Vec<_>>();
    assert_eq!(titles, vec!["Current", "Legacy", "Arrived", "Plain"]);
    assert_eq!(items[2].text, "Arrived ***Moved from*** [[2026-01-01]]");
}

#[test]
fn descendants_of_moved_tasks_are_moved() {
    let markdown = "- [x] Parent ***Moved to*** [[2026-01-02]]\n  - [x] Child\n- [ ] Next\n";
    let items = parse_checklist_items(markdown);
    let moved = items.iter().map(|item| item.moved).collect::<Vec<_>>();
    assert_eq!(moved, vec![true, true, false]);
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

#[test]
fn accepts_any_status_char_and_numbered_bullets() {
    let markdown = "- [ ] a\n* [/] b\n+ [x] c\n- [X] d\n- [-] e\n- [>] f\n- [!] g\n1. [ ] h\n12) [x] i\n- [é] j\n";
    let items = parse_checklist_items(markdown);
    let kinds = items
        .iter()
        .map(|item| (item.status, item.status_kind))
        .collect::<Vec<_>>();
    use TaskStatusKind::{Cancelled, Done, InProgress, Todo};
    assert_eq!(
        kinds,
        vec![
            (' ', Todo),
            ('/', InProgress),
            ('x', Done),
            ('X', Done),
            ('-', Cancelled),
            ('>', Todo),
            ('!', Todo),
            (' ', Todo),
            ('x', Done),
            ('é', Todo),
        ]
    );
    let multibyte = &items[9];
    assert_eq!(&markdown[multibyte.status_range()], "é");
    assert_eq!(multibyte.text, "j");
}

#[test]
fn rejects_lines_outside_the_grammar() {
    let markdown =
        "-[ ] a\n- [] b\n- [ab] c\n- [ ]x d\n1234567890. [ ] e\n- [a](url)\n- []] f\n1.[ ] g\n";
    assert!(parse_checklist_items(markdown).is_empty());
}

#[test]
fn empty_body_tasks_parse_with_and_without_separator() {
    let items = parse_checklist_items("- [ ]\n- [x] \n\t- [/]\ttabbed\n");
    let texts = items
        .iter()
        .map(|item| item.text.as_str())
        .collect::<Vec<_>>();
    assert_eq!(texts, vec!["", "", "tabbed"]);
    assert!(!items[0].separated);
    assert!(items[1].separated);
    assert_eq!(items[2].parent, Some(1));
}

#[test]
fn links_nearest_enclosing_task_as_parent() {
    let markdown = "- [ ] a\n  - [ ] b\n    - [ ] c\n  - [ ] d\n- [ ] e\n1. [ ] f\n   1. [x] g\n";
    let parents = parse_checklist_items(markdown)
        .iter()
        .map(|item| item.parent)
        .collect::<Vec<_>>();
    assert_eq!(
        parents,
        vec![None, Some(0), Some(1), Some(0), None, None, Some(5)]
    );
}

#[test]
fn summaries_count_done_and_skip_cancelled() {
    let items = parse_checklist_items("- [ ] a\n- [/] b\n- [x] c\n- [-] d\n- [>] e\n");
    assert_eq!(summarize_items(&items), (4, 1));
}
