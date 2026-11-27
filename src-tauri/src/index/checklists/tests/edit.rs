use super::super::api::{TaskEdit, TaskFieldEdits};
use super::super::edit::{apply_task_edits, TaskConflict};

const TODAY: &str = "2026-11-27";

fn edit(start: usize, text: &str) -> TaskEdit {
    TaskEdit {
        note_path: "Tasks.md".to_string(),
        etag: String::new(),
        start,
        text: text.to_string(),
        set_status: None,
        set_fields: None,
        set_title: None,
    }
}

fn status(start: usize, text: &str, status: &str) -> TaskEdit {
    TaskEdit {
        set_status: Some(status.to_string()),
        ..edit(start, text)
    }
}

fn fields(start: usize, text: &str, set: TaskFieldEdits) -> TaskEdit {
    TaskEdit {
        set_fields: Some(set),
        ..edit(start, text)
    }
}

fn apply(markdown: &str, edits: &[TaskEdit]) -> Result<Option<String>, TaskConflict> {
    apply_task_edits(markdown, &edits.iter().collect::<Vec<_>>(), TODAY)
}

fn applied(markdown: &str, edits: &[TaskEdit]) -> String {
    apply(markdown, edits).unwrap().unwrap()
}

#[test]
fn completing_stamps_completion_and_completes_open_descendants() {
    let note = "- [ ] Parent\n  - [/] Child\n    - [-] Dropped\n    - [x] Done\n  - [ ] Moved ***Moved to*** [[2026-01-02]]\n\n  Detail\n- [ ] Sibling\n";
    assert_eq!(
        applied(note, &[status(0, "Parent", "x")]),
        "- [x] Parent  [completion:: 2026-11-27]\n  - [x] Child  [completion:: 2026-11-27]\n    - [-] Dropped\n    - [x] Done\n  - [ ] Moved ***Moved to*** [[2026-01-02]]\n\n  Detail\n- [ ] Sibling\n"
    );
}

#[test]
fn existing_completion_is_kept_and_cancelled_removed_when_done() {
    let note = "- [-] Task [cancelled:: 2026-01-01] [completion:: 2026-01-02]\n";
    assert_eq!(
        applied(
            note,
            &[status(
                0,
                "Task [cancelled:: 2026-01-01] [completion:: 2026-01-02]",
                "X"
            )]
        ),
        "- [X] Task [completion:: 2026-01-02]\n"
    );
}

#[test]
fn reopening_and_cancelling_rewrite_stamps() {
    let done = "- [x] Renew [due:: 2026-11-20]  [completion:: 2026-11-19]\n";
    let text = "Renew [due:: 2026-11-20]  [completion:: 2026-11-19]";
    assert_eq!(
        applied(done, &[status(0, text, " ")]),
        "- [ ] Renew [due:: 2026-11-20]\n"
    );
    assert_eq!(
        applied(done, &[status(0, text, "-")]),
        "- [-] Renew [due:: 2026-11-20]  [cancelled:: 2026-11-27]\n"
    );
    assert_eq!(
        applied(
            "- [x] Emoji ✅ 2026-01-01 📅 2026-01-03\n",
            &[status(0, "Emoji ✅ 2026-01-01 📅 2026-01-03", "/")]
        ),
        "- [/] Emoji 📅 2026-01-03\n"
    );
}

#[test]
fn reopening_only_touches_the_target_line() {
    let note = "- [x] Parent\n  - [x] Child\n";
    assert_eq!(
        applied(note, &[status(0, "Parent", " ")]),
        "- [ ] Parent\n  - [x] Child\n"
    );
}

#[test]
fn set_fields_replaces_appends_and_removes_in_write_order() {
    let note = "1. [ ] Send deck #work  [due:: 2026-12-04] trailing\n";
    let text = "Send deck #work  [due:: 2026-12-04] trailing";
    let both = TaskFieldEdits {
        due: Some(Some("2026-12-05".to_string())),
        priority: Some(Some(3)),
    };
    assert_eq!(
        applied(note, &[fields(0, text, both)]),
        "1. [ ] Send deck #work  [due:: 2026-12-05] trailing  [priority:: high]\n"
    );
    let removed = TaskFieldEdits {
        due: Some(None),
        priority: None,
    };
    assert_eq!(
        applied(note, &[fields(0, text, removed)]),
        "1. [ ] Send deck #work trailing\n"
    );
    let appended = TaskFieldEdits {
        due: Some(Some("2026-12-06".to_string())),
        priority: Some(Some(0)),
    };
    assert_eq!(
        applied(
            "- [ ] Plain ***Moved from*** [[2026-01-01]]\n",
            &[fields(0, "Plain ***Moved from*** [[2026-01-01]]", appended)]
        ),
        "- [ ] Plain  [priority:: lowest]  [due:: 2026-12-06] ***Moved from*** [[2026-01-01]]\n"
    );
}

#[test]
fn editing_an_emoji_alias_rewrites_it_in_bracket_form() {
    let note = "- [ ] Pay 🔼 rent 📅 2026-12-01\n";
    let set = TaskFieldEdits {
        due: Some(Some("2026-12-02".to_string())),
        priority: Some(None),
    };
    assert_eq!(
        applied(note, &[fields(0, "Pay 🔼 rent 📅 2026-12-01", set)]),
        "- [ ] Pay rent [due:: 2026-12-02]\n"
    );
}

#[test]
fn duplicate_fields_collapse_to_the_first_on_set() {
    let note = "- [ ] A [due:: 2026-01-01] B [due:: 2026-01-02]\n";
    let set = TaskFieldEdits {
        due: Some(Some("2026-02-01".to_string())),
        priority: None,
    };
    assert_eq!(
        applied(
            note,
            &[fields(0, "A [due:: 2026-01-01] B [due:: 2026-01-02]", set)]
        ),
        "- [ ] A [due:: 2026-02-01] B\n"
    );
}

#[test]
fn set_title_replaces_only_the_description() {
    let note = "- [/] Old title #tag  [priority:: high] more  [due:: 2026-12-04] ***Moved from*** [[2026-01-01]]\n";
    let text = "Old title #tag  [priority:: high] more  [due:: 2026-12-04] ***Moved from*** [[2026-01-01]]";
    let rename = TaskEdit {
        set_title: Some(" New title #tag ".to_string()),
        ..edit(0, text)
    };
    assert_eq!(
        applied(note, &[rename]),
        "- [/] New title #tag  [priority:: high]  [due:: 2026-12-04] ***Moved from*** [[2026-01-01]]\n"
    );
    let leading = TaskEdit {
        set_title: Some("Named".to_string()),
        ..edit(0, "[due:: 2026-12-04]")
    };
    assert_eq!(
        applied("- [ ] [due:: 2026-12-04]\n", &[leading]),
        "- [ ] Named  [due:: 2026-12-04]\n"
    );
    let empty = TaskEdit {
        set_title: Some("Fresh".to_string()),
        ..edit(0, "")
    };
    assert_eq!(applied("- [ ]\n", &[empty]), "- [ ] Fresh\n");
}

#[test]
fn several_edits_in_one_note_apply_without_clashing() {
    let note = "- [ ] a\n- [ ] b\n- [ ] c\n";
    let rename = TaskEdit {
        set_title: Some("longer b".to_string()),
        ..edit(8, "b")
    };
    let due = TaskFieldEdits {
        due: Some(Some("2026-12-01".to_string())),
        priority: None,
    };
    let next = applied(
        note,
        &[
            status(0, "a", "x"),
            rename,
            status(8, "b", "/"),
            fields(16, "c", due),
        ],
    );
    assert_eq!(
        next,
        "- [x] a  [completion:: 2026-11-27]\n- [/] longer b\n- [ ] c  [due:: 2026-12-01]\n"
    );
}

#[test]
fn untouched_text_round_trips_byte_for_byte() {
    let note = "---\ntags: [x]\n---\n# H\r\n\t- [>] keep  odd   spacing [due:: 2026-01-01]\t\r\n- [ ] target\r\n";
    let start = note.find("- [ ] target").unwrap();
    let next = applied(note, &[status(start, "target", "x")]);
    assert_eq!(
        next,
        "---\ntags: [x]\n---\n# H\r\n\t- [>] keep  odd   spacing [due:: 2026-01-01]\t\r\n- [x] target  [completion:: 2026-11-27]\r\n"
    );
    assert_eq!(apply(note, &[edit(start, "target")]).unwrap(), None);
}

#[test]
fn stale_offsets_text_or_moved_tasks_conflict() {
    let note = "- [ ] Parent\n- [ ] Old ***Moved to*** [[2026-01-02]]\n```\n- [ ] code\n```\n";
    assert_eq!(apply(note, &[status(3, "Parent", "x")]), Err(TaskConflict));
    assert_eq!(apply(note, &[status(0, "Renamed", "x")]), Err(TaskConflict));
    let moved = note.find("- [ ] Old").unwrap();
    assert_eq!(
        apply(
            note,
            &[status(moved, "Old ***Moved to*** [[2026-01-02]]", "x")]
        ),
        Err(TaskConflict)
    );
    let code = note.find("- [ ] code").unwrap();
    assert_eq!(apply(note, &[status(code, "code", "x")]), Err(TaskConflict));
}

#[test]
fn multibyte_status_and_crlf_children_are_rewritten() {
    assert_eq!(
        applied("- [é] é\r\n  - [ ] ü\r\n", &[status(0, "é", "x")]),
        "- [x] é  [completion:: 2026-11-27]\r\n  - [x] ü  [completion:: 2026-11-27]\r\n"
    );
}
