use rusqlite::Connection;

use super::super::api::{TaskQueryFilters, TaskQueryRequest, TaskView};
use super::super::query::query_tasks;
use super::super::store::reindex_note_checklist_items;
use super::super::types::{TaskFieldKey, TaskStatusKind};
use crate::index::schema::ensure_schema;

const TODAY: &str = "2026-11-27";

fn add_note(conn: &Connection, id: &str, markdown: &str) {
    let (total, completed) = reindex_note_checklist_items(conn, id, markdown).unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO notes(id, title, created, updated, path, etag, preview, checklist_total, checklist_completed)
         VALUES(?, ?, '', '2026-01-02T03:04:05Z', ?, 'etag', '', ?, ?)",
        rusqlite::params![id, id, id, total, completed],
    )
    .unwrap();
}

fn fixture() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    ensure_schema(&conn).unwrap();
    add_note(
        &conn,
        "Work/a.md",
        "- [ ] overdue [due:: 2026-11-20] [priority:: high]\n  - [x] child [completion:: 2026-11-27]\n  - [ ] open child #Client\n  - [-] dropped\n- [/] today #work/Deep [due:: 2026-11-27]\n",
    );
    add_note(
        &conn,
        "Work/b.md",
        "---\ntags: [project, people/bob]\n---\n- [ ] later [due:: 2026-12-03]\n- [x] finished\n- [-] cancelled [cancelled:: 2026-11-01]\n",
    );
    add_note(
        &conn,
        "Work2/c.md",
        "1. [>] waiting\n- [ ] bad [due:: 2026-02-30]\n",
    );
    add_note(&conn, "archived.md", "- [ ] hidden [due:: 2026-11-01]\n");
    add_note(
        &conn,
        "moved.md",
        "- [ ] gone [due:: 2026-11-01] ***Moved to*** [[2026-01-02]]\n  - [x] nested\n",
    );
    conn.execute(
        "INSERT INTO note_properties(note_id, key, value_type, value_text, value_json)
         VALUES('archived.md', 'archived', 'checkbox', 'true', 'true')",
        [],
    )
    .unwrap();
    conn
}

fn request(view: TaskView, filters: TaskQueryFilters) -> TaskQueryRequest {
    TaskQueryRequest {
        space_path: String::new(),
        view,
        filters,
        today: TODAY.to_string(),
    }
}

fn titles(conn: &Connection, request: &TaskQueryRequest) -> Vec<String> {
    query_tasks(conn, request)
        .unwrap()
        .into_iter()
        .map(|record| record.title)
        .collect()
}

#[test]
fn stores_every_task_with_parsed_fields_and_links() {
    let conn = fixture();
    let all = request(
        TaskView::All,
        TaskQueryFilters {
            include_done: true,
            ..Default::default()
        },
    );
    let records = query_tasks(&conn, &all).unwrap();
    assert_eq!(records.len(), 10);
    let parent = &records[0];
    assert_eq!((parent.note_path.as_str(), parent.start), ("Work/a.md", 0));
    assert_eq!(
        (parent.priority, parent.due.as_deref()),
        (Some(3), Some("2026-11-20"))
    );
    assert_eq!((parent.subtask_total, parent.subtask_done), (2, 1));
    assert_eq!(parent.note_updated_ms, 1_767_323_045_000);
    assert_eq!(records[2].parent_start, Some(0));
    assert_eq!(records[2].tags, vec!["client"]);
    assert_eq!(records[3].status_kind, TaskStatusKind::Cancelled);
    let waiting = &records[8];
    assert_eq!(
        (waiting.status.as_str(), waiting.status_kind),
        (">", TaskStatusKind::Todo)
    );
    assert_eq!(records[9].invalid, vec![TaskFieldKey::Due]);
    assert!(!records.iter().any(|record| record.note_path == "moved.md"));
}

#[test]
fn reindex_reports_summary_counts() {
    let conn = fixture();
    let counts =
        reindex_note_checklist_items(&conn, "x.md", "- [x] a\n- [-] b\n- [/] c\n").unwrap();
    assert_eq!(counts, (2, 1));
}

#[test]
fn views_select_open_due_done_and_completed_today() {
    let conn = fixture();
    let today = titles(&conn, &request(TaskView::Today, Default::default()));
    assert_eq!(today, vec!["overdue", "child", "today #work/Deep"]);
    let upcoming = request(TaskView::Upcoming, Default::default());
    assert_eq!(
        titles(&conn, &upcoming),
        vec!["overdue", "today #work/Deep", "later"]
    );
    let open = titles(&conn, &request(TaskView::All, Default::default()));
    assert_eq!(
        open,
        vec![
            "overdue",
            "open child #Client",
            "today #work/Deep",
            "later",
            "waiting",
            "bad"
        ]
    );
    let done = titles(&conn, &request(TaskView::Done, Default::default()));
    assert_eq!(done, vec!["child", "dropped", "finished", "cancelled"]);
}

#[test]
fn tag_filters_match_line_tags_hierarchy_and_frontmatter() {
    let conn = fixture();
    let by_tags = |tags: &[&str]| {
        let filters = TaskQueryFilters {
            tags: tags.iter().map(|tag| tag.to_string()).collect(),
            ..Default::default()
        };
        titles(&conn, &request(TaskView::All, filters))
    };
    assert_eq!(by_tags(&["#Work"]), vec!["today #work/Deep"]);
    assert_eq!(by_tags(&["project"]), vec!["later"]);
    assert_eq!(by_tags(&["people/bob"]), Vec::<String>::new());
    assert_eq!(by_tags(&["client"]), vec!["open child #Client"]);
}

#[test]
fn location_filters_use_exact_prefixes() {
    let conn = fixture();
    let folder = TaskQueryFilters {
        folder_prefixes: vec![" /Work/ ".to_string()],
        ..Default::default()
    };
    assert_eq!(titles(&conn, &request(TaskView::All, folder)).len(), 4);
    let filters = TaskQueryFilters {
        folder_prefixes: vec!["Work2".to_string()],
        note_paths: vec!["Work2/c.md".to_string(), "Work/a.md".to_string()],
        ..Default::default()
    };
    assert_eq!(
        titles(&conn, &request(TaskView::All, filters)),
        vec!["waiting", "bad"]
    );
}

#[test]
fn priority_due_and_status_filters_combine() {
    let conn = fixture();
    let run = |filters: TaskQueryFilters| titles(&conn, &request(TaskView::All, filters));
    let high_or_none = TaskQueryFilters {
        priorities: vec![3],
        include_no_priority: false,
        ..Default::default()
    };
    assert_eq!(run(high_or_none), vec!["overdue"]);
    let due_window = TaskQueryFilters {
        due_after: Some("2026-11-20".to_string()),
        due_before: Some("2026-12-03".to_string()),
        ..Default::default()
    };
    assert_eq!(run(due_window), vec!["today #work/Deep"]);
    let undated = TaskQueryFilters {
        due_none: true,
        statuses: vec![TaskStatusKind::Todo],
        ..Default::default()
    };
    assert_eq!(run(undated), vec!["open child #Client", "waiting", "bad"]);
}
