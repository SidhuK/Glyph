use super::markdown::{mark_moved, parse_candidates};

fn candidate_texts(markdown: &str) -> Vec<(String, u32)> {
    parse_candidates("Daily/2026-01-01.md", "2026-01-01", markdown, 0)
        .into_iter()
        .map(|candidate| (candidate.text, candidate.nested_count))
        .collect()
}

#[test]
fn fenced_lines_inside_nested_tasks_are_not_descendants() {
    let markdown = "- [ ] parent\n  - [ ] child\n    ```\n    - [ ] code\n    ```\n- [ ] next\n";
    assert_eq!(
        candidate_texts(markdown),
        vec![("parent".to_string(), 1), ("next".to_string(), 0)]
    );
}

#[test]
fn unclosed_inline_comment_does_not_swallow_later_tasks() {
    let markdown = "- [ ] first <!-- draft\n- [ ] second\n- [ ] third\n";
    let texts = candidate_texts(markdown)
        .into_iter()
        .map(|(text, _)| text)
        .collect::<Vec<_>>();
    assert_eq!(texts, vec!["first <!-- draft", "second", "third"]);
}

#[test]
fn mark_moved_checks_parent_and_children() {
    let block = "- [ ] parent\n  - [ ] child\n    ```\n    - [ ] code\n    ```";
    assert_eq!(
        mark_moved(block, "2026-01-02").unwrap(),
        "- [x] parent ***Moved to*** [[2026-01-02]]\n  - [x] child\n    ```\n    - [ ] code\n    ```"
    );
}
