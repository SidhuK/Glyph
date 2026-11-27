use super::super::create::{canonical_task_line, insert_task_line};

const LINE: &str = "- [ ] New";

fn insert(markdown: &str) -> (String, usize) {
    let (next, start) = insert_task_line(markdown, LINE);
    assert!(next[start..].starts_with(LINE));
    (next, start)
}

#[test]
fn canonical_line_writes_priority_then_due() {
    assert_eq!(
        canonical_task_line(" Send mockups #web ", Some(2), Some("2026-11-28")),
        "- [ ] Send mockups #web  [priority:: medium]  [due:: 2026-11-28]"
    );
    assert_eq!(canonical_task_line("Plain", None, None), "- [ ] Plain");
}

#[test]
fn appends_after_a_list_or_with_a_blank_line_after_prose() {
    assert_eq!(insert("- [ ] a\n").0, "- [ ] a\n- [ ] New\n");
    assert_eq!(insert("Some text\n\n\n").0, "Some text\n\n- [ ] New\n\n\n");
    assert_eq!(insert("Some text").0, "Some text\n\n- [ ] New\n");
    assert_eq!(insert("").0, "- [ ] New\n");
    assert_eq!(insert("# Title\r\n").0, "# Title\r\n- [ ] New\r\n");
}

#[test]
fn inserts_at_the_end_of_an_existing_tasks_section() {
    let markdown = "# Day\n\n## Tasks\n\n- [ ] a\n  - [ ] b\n\n## Notes\n\n```\n## Tasks\n```\n";
    assert_eq!(
        insert(markdown).0,
        "# Day\n\n## Tasks\n\n- [ ] a\n  - [ ] b\n- [ ] New\n\n## Notes\n\n```\n## Tasks\n```\n"
    );
    assert_eq!(
        insert("## tasks ##\n\n### Sub\ntext\n# Next\n").0,
        "## tasks ##\n\n### Sub\ntext\n\n- [ ] New\n# Next\n"
    );
    assert_eq!(insert("## Tasks\n").0, "## Tasks\n- [ ] New\n");
}

#[test]
fn ignores_tasks_headings_inside_fences() {
    let markdown = "```\n## Tasks\n```\nend\n";
    assert_eq!(insert(markdown).0, "```\n## Tasks\n```\nend\n\n- [ ] New\n");
}
