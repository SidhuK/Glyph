use serde::Deserialize;

use rusqlite::Connection;

use crate::index::people_mentions_as_tags_enabled;

use super::search_hybrid::hybrid_search;
use super::tags::{normalize_person_handle, normalize_tag, person_handle_to_tag};
use super::types::SearchResult;

#[derive(Deserialize, Clone, Default)]
pub struct SearchAdvancedRequest {
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
        select_candidates(
            conn,
            &query_text,
            req.title_only,
            &tags,
            (limit as i64 * 8).clamp(200, 5_000),
        )?
        .into_iter()
        .map(|item| item.result)
        .collect()
    };

    if out.len() > limit {
        out.truncate(limit);
    }
    Ok(out)
}

struct Candidate {
    result: SearchResult,
}

fn select_candidates(
    conn: &Connection,
    text: &str,
    title_only: bool,
    tags: &[String],
    limit: i64,
) -> Result<Vec<Candidate>, String> {
    let mut sql = String::from("SELECT n.id, n.title, n.preview FROM notes n ");
    for i in 0..tags.len() {
        sql.push_str(&format!(
            "JOIN tags t{idx} ON t{idx}.note_id = n.id AND t{idx}.tag = ? ",
            idx = i
        ));
    }
    let mut params: Vec<rusqlite::types::Value> = tags
        .iter()
        .map(|t| rusqlite::types::Value::from(t.clone()))
        .collect();
    if title_only && !text.is_empty() {
        sql.push_str("WHERE lower(n.title) LIKE ? ");
        params.push(rusqlite::types::Value::from(format!(
            "%{}%",
            text.to_lowercase()
        )));
    }
    sql.push_str("ORDER BY n.updated DESC LIMIT ?");
    params.push(rusqlite::types::Value::from(limit));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params_from_iter(params.iter()))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        out.push(Candidate {
            result: SearchResult {
                id: row.get(0).map_err(|e| e.to_string())?,
                title: row.get(1).map_err(|e| e.to_string())?,
                snippet: row.get(2).map_err(|e| e.to_string())?,
                score: 0.0,
            },
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
    use crate::index::{people_mentions_as_tags_enabled, set_people_mentions_as_tags_enabled};

    use super::{run_search_advanced, SearchAdvancedRequest};

    struct PeopleMentionsFlagGuard {
        previous: bool,
    }

    impl PeopleMentionsFlagGuard {
        fn set(enabled: bool) -> Self {
            let previous = people_mentions_as_tags_enabled();
            set_people_mentions_as_tags_enabled(enabled);
            Self { previous }
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
}
