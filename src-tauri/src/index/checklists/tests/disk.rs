use std::path::Path;

use super::super::api::{
    TaskCreateRequest, TaskEdit, TaskNoteWriteResult, TaskUpdateBatchRequest, TaskWriteOutcome,
};
use super::super::disk::{create_on_disk, update_on_disk};
use crate::index::{open_db, paths, TempSpace};
use crate::note_mutation::CommitCtx;
use crate::space_fs::helpers::etag_for;

fn with_space(test: impl FnOnce(&Path, &CommitCtx<'_>)) {
    let _guard = paths::test_index_root_lock();
    let space = TempSpace::new();
    let root = space.path();
    paths::init_test_index_root(
        std::env::temp_dir().join(format!("glyph-tasks-index-{}", uuid::Uuid::new_v4())),
    );
    paths::register_space(root).expect("space should register");
    let recent = Default::default();
    let space_path = root.to_string_lossy();
    let ctx = CommitCtx {
        root,
        recent: &recent,
        space_path: &space_path,
    };
    test(root, &ctx);
}

fn status_edit(note_path: &str, etag: String, start: usize, text: &str) -> TaskEdit {
    TaskEdit {
        note_path: note_path.to_string(),
        etag,
        start,
        text: text.to_string(),
        set_status: Some("x".to_string()),
        set_fields: None,
        set_title: None,
        skip_subtasks: false,
    }
}

fn read(root: &Path, rel: &str) -> String {
    std::fs::read_to_string(root.join(rel)).expect("note should read")
}

#[test]
fn update_batch_writes_each_note_once_and_isolates_conflicts() {
    with_space(|root, ctx| {
        std::fs::write(root.join("A.md"), "- [ ] a\n- [ ] b\n").unwrap();
        std::fs::write(root.join("B.md"), "- [ ] c\n").unwrap();
        let a_etag = etag_for(b"- [ ] a\n- [ ] b\n");
        let request = TaskUpdateBatchRequest {
            space_path: ctx.space_path.to_string(),
            today: "2026-11-27".to_string(),
            edits: vec![
                status_edit("A.md", a_etag.clone(), 0, "a"),
                status_edit("B.md", "stale".to_string(), 0, "c"),
                status_edit("A.md", a_etag, 8, "b"),
            ],
        };
        let (results, changes) = update_on_disk(ctx, &request).expect("batch should run");
        let written = read(root, "A.md");
        assert_eq!(
            written,
            "- [x] a  [completion:: 2026-11-27]\n- [x] b  [completion:: 2026-11-27]\n"
        );
        assert_eq!(
            results,
            vec![
                TaskNoteWriteResult {
                    note_path: "A.md".to_string(),
                    outcome: TaskWriteOutcome::Saved {
                        etag: etag_for(written.as_bytes())
                    },
                },
                TaskNoteWriteResult {
                    note_path: "B.md".to_string(),
                    outcome: TaskWriteOutcome::Conflict,
                },
            ]
        );
        assert_eq!(changes.len(), 1);
        assert_eq!(read(root, "B.md"), "- [ ] c\n");
        let conn = open_db(root).unwrap();
        let done: u32 = conn
            .query_row(
                "SELECT COUNT(*) FROM checklist_items WHERE note_id = 'A.md' AND completion = '2026-11-27'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(done, 2);
    });
}

#[test]
fn update_batch_rejects_invalid_input_before_writing() {
    with_space(|root, ctx| {
        std::fs::write(root.join("A.md"), "- [ ] a\n").unwrap();
        let mut edit = status_edit("A.md", etag_for(b"- [ ] a\n"), 0, "a");
        edit.set_status = Some("xx".to_string());
        let request = TaskUpdateBatchRequest {
            space_path: ctx.space_path.to_string(),
            today: "2026-11-27".to_string(),
            edits: vec![edit],
        };
        assert!(update_on_disk(ctx, &request).is_err());
        assert_eq!(read(root, "A.md"), "- [ ] a\n");
    });
}

#[test]
fn create_appends_under_tasks_or_creates_the_note() {
    with_space(|root, ctx| {
        std::fs::write(root.join("Day.md"), "## Tasks\n- [ ] a\n\n## Notes\n").unwrap();
        let mut request = TaskCreateRequest {
            space_path: ctx.space_path.to_string(),
            note_path: "Day.md".to_string(),
            title: "Call #home".to_string(),
            due: Some("2026-11-28".to_string()),
            priority: Some(4),
        };
        let (result, changes) = create_on_disk(ctx, &request).expect("create should run");
        let written = read(root, "Day.md");
        assert_eq!(
            written,
            "## Tasks\n- [ ] a\n- [ ] Call #home  [priority:: highest]  [due:: 2026-11-28]\n\n## Notes\n"
        );
        assert_eq!(result.start, 17);
        assert!(matches!(result.outcome, TaskWriteOutcome::Saved { .. }));
        assert_eq!(changes.len(), 1);

        request.note_path = "Daily/2026-11-27.md".to_string();
        request.due = None;
        request.priority = None;
        let (result, _) = create_on_disk(ctx, &request).expect("create should run");
        assert_eq!(read(root, "Daily/2026-11-27.md"), "- [ ] Call #home\n");
        assert_eq!(result.start, 0);

        request.title = "  ".to_string();
        assert!(create_on_disk(ctx, &request).is_err());
    });
}

#[test]
fn outcomes_serialize_with_kind_tag() {
    let saved = TaskWriteOutcome::Saved {
        etag: "abc".to_string(),
    };
    assert_eq!(
        serde_json::to_value(saved).unwrap(),
        serde_json::json!({ "kind": "saved", "etag": "abc" })
    );
    assert_eq!(
        serde_json::to_value(TaskWriteOutcome::Conflict).unwrap(),
        serde_json::json!({ "kind": "conflict" })
    );
}

#[test]
fn field_edits_distinguish_absent_null_and_value() {
    let edit: TaskEdit = serde_json::from_value(serde_json::json!({
        "note_path": "A.md", "etag": "e", "start": 0, "text": "a",
        "set_fields": { "due": null, "priority": 2 }
    }))
    .unwrap();
    let fields = edit.set_fields.unwrap();
    assert_eq!(fields.due, Some(None));
    assert_eq!(fields.priority, Some(Some(2)));
    let empty: TaskEdit = serde_json::from_value(serde_json::json!({
        "note_path": "A.md", "etag": "e", "start": 0, "text": "a", "set_fields": {}
    }))
    .unwrap();
    assert_eq!(empty.set_fields.unwrap().due, None);
}
