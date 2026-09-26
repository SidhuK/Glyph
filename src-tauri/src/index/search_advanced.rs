use serde::Deserialize;

use rusqlite::Connection;

use crate::index::people_mentions_as_tags_enabled;

use super::search_expression;
use super::search_hybrid::hybrid_search;
use super::tags::{normalize_person_handle, normalize_tag, person_handle_to_tag};
use super::types::SearchResult;

#[derive(Deserialize, Clone, Default)]
#[serde(deny_unknown_fields)]
pub struct SearchAdvancedRequest {
    /// Internal raw-query routing; not part of the structured-search IPC payload.
    #[serde(skip)]
    pub expression: Option<String>,
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub people: Vec<String>,
    #[serde(default)]
    pub title_only: bool,
    #[serde(default)]
    pub tag_only: bool,
    #[serde(default)]
    pub limit: Option<u32>,
}

pub fn run_search_advanced(
    conn: &Connection,
    req: SearchAdvancedRequest,
) -> Result<Vec<SearchResult>, String> {
    let limit = req.limit.unwrap_or(200).clamp(1, 2_000) as usize;
    if let Some(expression) = req.expression.as_deref() {
        let (predicate, params) = search_expression::compile(expression)?;
        return select_candidates(conn, &predicate, params, limit as i64);
    }
    let text = req.query.unwrap_or_default().trim().to_string();
    let mut tags = normalize_tags(req.tags)?;
    if people_mentions_as_tags_enabled() {
        for person in normalize_people(req.people)? {
            if !tags.contains(&person) {
                tags.push(person);
            }
        }
    }
    if req.tag_only {
        for token in text.split_whitespace() {
            let normalized = normalize_tag(token).or_else(|| normalize_tag(&format!("#{token}")));
            if let Some(tag) = normalized {
                if !tags.contains(&tag) {
                    tags.push(tag);
                }
                continue;
            }
            if people_mentions_as_tags_enabled() {
                let normalized_person = normalize_person_handle(token)
                    .or_else(|| normalize_person_handle(&format!("@{token}")))
                    .and_then(|handle| person_handle_to_tag(&handle));
                if let Some(person) = normalized_person {
                    if !tags.contains(&person) {
                        tags.push(person);
                    }
                }
            }
        }
    }

    let query_text = if req.tag_only { String::new() } else { text };

    let mut out = if !query_text.is_empty() && !req.title_only {
        hybrid_search(
            conn,
            &query_text,
            &tags,
            (limit as i64 * 8).clamp(200, 5_000),
        )?
    } else {
        let mut clauses = Vec::new();
        let mut params = Vec::new();
        for tag in &tags {
            clauses.push("EXISTS (SELECT 1 FROM tags t WHERE t.note_id = n.id AND t.tag = ?)".to_string());
            params.push(rusqlite::types::Value::from(tag.clone()));
        }
        if req.title_only && !query_text.is_empty() {
            clauses.push("instr(lower(n.title), lower(?)) > 0".to_string());
            params.push(rusqlite::types::Value::from(query_text.clone()));
        }
        select_candidates(conn, &clauses.join(" AND "), params, limit as i64)?
    };

    if out.len() > limit {
        out.truncate(limit);
    }
    Ok(out)
}

fn select_candidates(
    conn: &Connection,
    predicate: &str,
    mut params: Vec<rusqlite::types::Value>,
    limit: i64,
) -> Result<Vec<SearchResult>, String> {
    let mut sql = String::from("SELECT n.id, n.title, n.preview FROM notes n ");
    if !predicate.is_empty() {
        sql.push_str("WHERE ");
        sql.push_str(predicate);
    }
    sql.push_str(" ORDER BY n.updated DESC, n.id LIMIT ?");
    params.push(rusqlite::types::Value::from(limit));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params_from_iter(params.iter()))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        out.push(SearchResult {
            id: row.get(0).map_err(|e| e.to_string())?,
            title: row.get(1).map_err(|e| e.to_string())?,
            snippet: row.get(2).map_err(|e| e.to_string())?,
            score: 0.0,
            match_index: None,
            match_query: None,
            line: None,
        });
    }
    Ok(out)
}

fn normalize_tags(tags: Vec<String>) -> Result<Vec<String>, String> {
    let mut out = Vec::<String>::new();
    for raw in tags {
        let t = normalize_tag(&raw).ok_or_else(|| "invalid tag".to_string())?;
        if !out.contains(&t) {
            out.push(t);
        }
    }
    Ok(out)
}

fn normalize_people(people: Vec<String>) -> Result<Vec<String>, String> {
    let mut out = Vec::<String>::new();
    for raw in people {
        let Some(handle) = normalize_person_handle(&raw) else {
            continue;
        };
        let Some(person_tag) = person_handle_to_tag(&handle) else {
            continue;
        };
        if !out.contains(&person_tag) {
            out.push(person_tag);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::index::schema::ensure_schema;
    use std::sync::MutexGuard;

    use crate::index::{
        people_mentions_as_tags_enabled, people_mentions_as_tags_test_lock,
        set_people_mentions_as_tags_enabled,
    };

    use super::{run_search_advanced, SearchAdvancedRequest};

    struct PeopleMentionsFlagGuard {
        previous: bool,
        _lock: MutexGuard<'static, ()>,
    }

    impl PeopleMentionsFlagGuard {
        fn set(enabled: bool) -> Self {
            let lock = people_mentions_as_tags_test_lock();
            let previous = people_mentions_as_tags_enabled();
            set_people_mentions_as_tags_enabled(enabled);
            Self {
                previous,
                _lock: lock,
            }
        }
    }

    impl Drop for PeopleMentionsFlagGuard {
        fn drop(&mut self) {
            set_people_mentions_as_tags_enabled(self.previous);
        }
    }

    fn seed_note(conn: &Connection, id: &str, title: &str, updated: &str) {
        conn.execute(
            "INSERT INTO notes(id, title, created, updated, path, etag, preview)
             VALUES(?, ?, ?, ?, ?, 'etag', '')",
            rusqlite::params![id, title, updated, updated, id],
        )
        .unwrap();
    }

    #[test]
    fn parent_tag_search_includes_descendants_but_child_search_stays_narrow() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        seed_note(&conn, "notes/root.md", "Root", "2026-03-24T10:00:00Z");
        seed_note(&conn, "notes/child.md", "Child", "2026-03-24T11:00:00Z");

        for (note_id, tag, is_explicit) in [
            ("notes/root.md", "work", 1),
            ("notes/child.md", "work", 0),
            ("notes/child.md", "work/today", 1),
        ] {
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES(?, ?, ?)",
                rusqlite::params![note_id, tag, is_explicit],
            )
            .unwrap();
        }

        let parent_results = run_search_advanced(
            &conn,
            SearchAdvancedRequest {
                tags: vec!["#work".to_string()],
                limit: Some(10),
                ..SearchAdvancedRequest::default()
            },
        )
        .unwrap();
        assert_eq!(
            parent_results
                .iter()
                .map(|result| result.id.as_str())
                .collect::<Vec<_>>(),
            vec!["notes/child.md", "notes/root.md"]
        );

        let child_results = run_search_advanced(
            &conn,
            SearchAdvancedRequest {
                tags: vec!["#work/today".to_string()],
                limit: Some(10),
                ..SearchAdvancedRequest::default()
            },
        )
        .unwrap();
        assert_eq!(
            child_results
                .iter()
                .map(|result| result.id.as_str())
                .collect::<Vec<_>>(),
            vec!["notes/child.md"]
        );
    }

    #[test]
    fn people_search_accepts_at_handles() {
        let _guard = PeopleMentionsFlagGuard::set(true);
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        seed_note(
            &conn,
            "notes/alice.md",
            "Alice note",
            "2026-03-24T10:00:00Z",
        );
        seed_note(&conn, "notes/bob.md", "Bob note", "2026-03-24T11:00:00Z");

        conn.execute(
            "INSERT INTO tags(note_id, tag, is_explicit) VALUES(?, ?, 1)",
            rusqlite::params!["notes/alice.md", "people/alice"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tags(note_id, tag, is_explicit) VALUES(?, ?, 1)",
            rusqlite::params!["notes/bob.md", "people/bob"],
        )
        .unwrap();

        let results = run_search_advanced(
            &conn,
            SearchAdvancedRequest {
                people: vec!["@alice".to_string()],
                limit: Some(10),
                ..SearchAdvancedRequest::default()
            },
        )
        .unwrap();

        assert_eq!(
            results
                .iter()
                .map(|result| result.id.as_str())
                .collect::<Vec<_>>(),
            vec!["notes/alice.md"]
        );
    }

    #[test]
    fn bare_at_token_does_not_error() {
        let _guard = PeopleMentionsFlagGuard::set(true);
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        let results = run_search_advanced(
            &conn,
            SearchAdvancedRequest {
                people: vec!["@".to_string()],
                limit: Some(10),
                ..SearchAdvancedRequest::default()
            },
        )
        .unwrap();

        assert!(results.is_empty());
    }

    #[test]
    fn precise_filters_run_before_limit_and_respect_folder_boundaries() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        for (id, date) in [
            ("research/old.md", "2026-09-01T00:00:00Z"),
            ("research/sub/new.md", "2026-09-12T00:00:00Z"),
            ("research-other/new.md", "2026-09-20T00:00:00Z"),
        ] {
            seed_note(&conn, id, "Research", date);
        }
        conn.execute(
            "INSERT INTO note_properties(note_id, key, value_type, value_text, value_json) VALUES (?, 'status', 'text', 'unprocessed', '\"unprocessed\"')",
            ["research/old.md"],
        ).unwrap();
        let results = run_search_advanced(&conn, SearchAdvancedRequest {
            expression: Some("folder:research property:status=unprocessed created:2026-08-31..2026-09-30".into()),
            limit: Some(1),
            ..Default::default()
        }).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "research/old.md");
        let results = run_search_advanced(&conn, SearchAdvancedRequest {
            expression: Some("folder:research".into()),
            ..Default::default()
        }).unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn precise_groups_preserve_precedence_and_quoted_values() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        seed_note(&conn, "a.md", "Alpha", "2026-09-01");
        seed_note(&conn, "b.md", "Beta", "2026-09-01");
        seed_note(&conn, "c.md", "Gamma", "2026-09-01");
        for (id, tag) in [("a.md", "work"), ("c.md", "work")] {
            conn.execute("INSERT INTO tags(note_id, tag) VALUES (?, ?)", [id, tag]).unwrap();
        }
        for (expression, expected) in [
            ("title:Alpha OR title:Beta AND #work", vec!["a.md"]),
            ("(title:Alpha OR title:Beta) AND #work", vec!["a.md"]),
            ("(title:Alpha OR title:Beta) OR #work", vec!["a.md", "b.md", "c.md"]),
            ("title:Alpha OR (title:Beta AND missing:status)", vec!["a.md", "b.md"]),
            ("title:\"Gamma\" AND has:status", vec![]),
        ] {
            let results = run_search_advanced(&conn, SearchAdvancedRequest {
                expression: Some(expression.into()),
                ..Default::default()
            }).unwrap();
            assert_eq!(results.iter().map(|r| r.id.as_str()).collect::<Vec<_>>(), expected);
        }
    }

    #[test]
    fn precise_queries_reject_incomplete_or_invalid_filters() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        for expression in [
            "title:only OR #work", "(tag:only)",
            "(#work OR)", "#work AND", "(#work", "()", "folder:",
            "created:2026-02-30", "updated:2026-09-30..2026-09-01",
            "property:status", "title:\"unclosed", "folder:../research",
        ] {
            assert!(run_search_advanced(&conn, SearchAdvancedRequest {
                expression: Some(expression.into()),
                ..Default::default()
            }).is_err(), "{expression}");
        }
    }

    #[test]
    fn precise_scope_modifiers_do_not_escape_their_group() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        seed_note(&conn, "alpha.md", "Alpha", "2026-09-01");
        seed_note(&conn, "beta.md", "Beta", "2026-09-01");
        conn.execute(
            "INSERT INTO notes_fts(id, title, body) VALUES ('beta.md', 'Beta', 'needle')",
            [],
        ).unwrap();
        let results = run_search_advanced(&conn, SearchAdvancedRequest {
            expression: Some("(title:only Alpha) OR needle".into()),
            ..Default::default()
        }).unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn structured_search_rejects_unknown_ipc_fields() {
        assert!(serde_json::from_str::<SearchAdvancedRequest>(
            r#"{"expression":"folder:research"}"#,
        ).is_err());
    }

}
