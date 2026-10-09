use rusqlite::Connection;

use super::super::store::{query_open_tasks, reindex_note_checklist_items};
use super::super::types::{TaskNoteGroup, TaskScope};
use crate::index::schema::ensure_schema;

fn add_note(conn: &Connection, id: &str, updated: &str, markdown: &str) {
    let (total, completed) = reindex_note_checklist_items(conn, id, markdown).unwrap();
    conn.execute(
        "INSERT INTO notes(id, title, created, updated, path, etag, preview, checklist_total, checklist_completed)
         VALUES(?, ?, '', ?, ?, 'etag', '', ?, ?)",
        rusqlite::params![id, id, updated, id, total, completed],
    )
    .unwrap();
}

fn fixture() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    ensure_schema(&conn).unwrap();
    add_note(
        &conn,
        "Work/a.md",
        "2026-01-01",
        "- [ ] a1\n- [x] done\n  - [ ] a2\n",
    );
    add_note(&conn, "Work/b.md", "2026-01-03", "- [ ] b1\n");
    add_note(&conn, "Work2/c.md", "2026-01-02", "- [ ] c1\n");
    add_note(&conn, "work/d.md", "2026-01-04", "- [ ] d1\n");
    add_note(&conn, "done.md", "2026-01-05", "- [x] all done\n");
    add_note(&conn, "archived.md", "2026-01-06", "- [ ] hidden\n");
    conn.execute(
        "INSERT INTO note_properties(note_id, key, value_type, value_text, value_json)
         VALUES('archived.md', 'archived', 'checkbox', 'true', 'true')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO tags(note_id, tag, is_explicit)
         VALUES('Work/a.md', 'project', 1), ('Work2/c.md', 'project', 0), ('Work2/c.md', 'project/x', 1)",
        [],
    )
    .unwrap();
    conn
}

fn paths(groups: &[TaskNoteGroup]) -> Vec<&str> {
    groups
        .iter()
        .map(|group| group.note_path.as_str())
        .collect()
}

#[test]
fn all_scope_groups_open_items_by_note() {
    let groups = query_open_tasks(&fixture(), &TaskScope::All).unwrap();
    assert_eq!(
        paths(&groups),
        vec!["work/d.md", "Work/b.md", "Work2/c.md", "Work/a.md"]
    );
    let a = &groups[3];
    assert_eq!(a.total_count, 3);
    let items = a
        .items
        .iter()
        .map(|item| (item.start, item.indent, item.text.as_str()));
    assert_eq!(items.collect::<Vec<_>>(), vec![(0, 0, "a1"), (20, 2, "a2")]);
}

#[test]
fn folder_scope_matches_byte_exact_prefix() {
    let scope = TaskScope::Folder {
        folder_prefix: " /Work/ ".to_string(),
    };
    let groups = query_open_tasks(&fixture(), &scope).unwrap();
    assert_eq!(paths(&groups), vec!["Work/b.md", "Work/a.md"]);
}

#[test]
fn tag_scope_normalizes_and_includes_descendants() {
    let scope = TaskScope::Tag {
        tag: "#Project".to_string(),
    };
    let groups = query_open_tasks(&fixture(), &scope).unwrap();
    assert_eq!(paths(&groups), vec!["Work2/c.md", "Work/a.md"]);
}

#[test]
fn reindexing_replaces_previous_rows() {
    let conn = fixture();
    let counts = reindex_note_checklist_items(&conn, "Work/b.md", "- [x] b1\n- [ ] b2 ***Moved to*** [[2026-01-02]]\n").unwrap();
    assert_eq!(counts, (2, 1));
    let groups = query_open_tasks(&conn, &TaskScope::All).unwrap();
    assert!(!paths(&groups).contains(&"Work/b.md"));
}

#[test]
fn moved_open_tasks_are_never_listed() {
    let conn = fixture();
    add_note(&conn, "moved.md", "2026-01-09", "- [ ] gone ***Moved to*** [[2026-01-02]]\n");
    let groups = query_open_tasks(&conn, &TaskScope::All).unwrap();
    assert!(!paths(&groups).contains(&"moved.md"));
}
