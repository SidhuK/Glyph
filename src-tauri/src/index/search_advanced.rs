use serde::Deserialize;

use rusqlite::Connection;

use super::search_hybrid::hybrid_search;
use super::tags::normalize_tag;
use super::types::SearchResult;

#[derive(Deserialize, Clone, Default)]
pub struct SearchAdvancedRequest {
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
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
    if req.tag_only {
        for token in text.split_whitespace() {
            let normalized = normalize_tag(token).or_else(|| normalize_tag(&format!("#{token}")));
            if let Some(tag) = normalized {
                if !tags.contains(&tag) {
                    tags.push(tag);
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

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::index::schema::ensure_schema;

    use super::{run_search_advanced, SearchAdvancedRequest};

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
}
