use super::super::toggle::{toggle_checklist_item, NOTE_CHANGED, TASK_ROLLED_OVER};
use super::super::commands::toggle_on_disk;
use super::super::types::{TaskToggleOutcome, TaskToggleRequest};
use crate::index::{paths, TempSpace};
use crate::note_mutation::CommitCtx;
use crate::space_fs::helpers::etag_for;

const NOTE: &str = "- [ ] Parent\n  - [ ] Child\n    - [ ] Grandchild\n  - [ ] Moved ***Moved to*** [[2026-01-02]]\n\n  Detail\n- [ ] Sibling\n";

#[test]
fn checking_a_parent_checks_its_children() {
    let next = toggle_checklist_item(NOTE, 0, true).unwrap().unwrap();
    assert_eq!(
        next,
        "- [x] Parent\n  - [x] Child\n    - [x] Grandchild\n  - [ ] Moved ***Moved to*** [[2026-01-02]]\n\n  Detail\n- [ ] Sibling\n"
    );
}

#[test]
fn reopening_only_touches_the_target_line() {
    let checked = "- [x] Parent\n  - [x] Child\n";
    let next = toggle_checklist_item(checked, 0, false).unwrap().unwrap();
    assert_eq!(next, "- [ ] Parent\n  - [x] Child\n");
}

#[test]
fn unchanged_status_returns_none() {
    assert_eq!(
        toggle_checklist_item("- [x] Done\n", 0, true).unwrap(),
        None
    );
}

#[test]
fn rolled_over_task_is_rejected() {
    let markdown = "- [ ] Old ***Moved to*** [[2026-01-02]]\n";
    assert_eq!(
        toggle_checklist_item(markdown, 0, true).unwrap_err(),
        TASK_ROLLED_OVER
    );
}

#[test]
fn stale_offset_is_rejected() {
    assert_eq!(
        toggle_checklist_item(NOTE, 3, true).unwrap_err(),
        NOTE_CHANGED
    );
    assert_eq!(
        toggle_checklist_item("```\n- [ ] code\n```\n", 4, true).unwrap_err(),
        NOTE_CHANGED
    );
}

#[test]
fn outcomes_serialize_with_kind_tag() {
    let saved = TaskToggleOutcome::Saved {
        etag: "abc".to_string(),
    };
    assert_eq!(
        serde_json::to_value(saved).unwrap(),
        serde_json::json!({ "kind": "saved", "etag": "abc" })
    );
    assert_eq!(
        serde_json::to_value(TaskToggleOutcome::IndexFailed {
            etag: "def".to_string()
        })
        .unwrap(),
        serde_json::json!({ "kind": "index_failed", "etag": "def" })
    );
}

#[test]
fn crlf_and_multibyte_children_are_checked() {
    let next = toggle_checklist_item("- [ ] é\r\n  - [ ] ü\r\n", 0, true)
        .unwrap()
        .unwrap();
    assert_eq!(next, "- [x] é\r\n  - [x] ü\r\n");
}

#[test]
fn toggle_on_disk_rejects_stale_etag_then_saves() {
    let _guard = paths::test_index_root_lock();
    let space = TempSpace::new();
    let root = space.path();
    paths::init_test_index_root(
        std::env::temp_dir().join(format!("glyph-tasks-index-{}", uuid::Uuid::new_v4())),
    );
    paths::register_space(root).expect("space should register");
    let source = "- [ ] a\n  - [ ] b\n";
    std::fs::write(root.join("Tasks.md"), source).expect("note should be written");

    let recent = Default::default();
    let space_path = root.to_string_lossy();
    let ctx = CommitCtx {
        root,
        recent: &recent,
        space_path: &space_path,
    };
    let mut request = TaskToggleRequest {
        space_path: space_path.to_string(),
        note_path: "Tasks.md".to_string(),
        etag: "stale".to_string(),
        start: 0,
        checked: true,
    };
    assert_eq!(toggle_on_disk(&ctx, &request).unwrap_err(), NOTE_CHANGED);

    request.etag = etag_for(source.as_bytes());
    let (outcome, change) = toggle_on_disk(&ctx, &request).expect("toggle should save");
    let written = std::fs::read_to_string(root.join("Tasks.md")).expect("note should read");
    assert_eq!(written, "- [x] a\n  - [x] b\n");
    assert_eq!(
        outcome,
        TaskToggleOutcome::Saved {
            etag: etag_for(written.as_bytes())
        }
    );
    assert!(change.is_some());
}
