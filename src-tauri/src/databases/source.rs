use rusqlite::Connection;

use crate::index::commands::parse_raw_search_query;
use crate::index::search_advanced::run_search_advanced;
use crate::notes::archive::ACTIVE_NOTES;

use super::types::DatabaseDefinition;

// Search sources go through the ranked search engine, which caps its result set.
const SEARCH_SOURCE_LIMIT: usize = 2_000;

pub(super) struct SourceIds {
    pub ids: Vec<String>,
    pub truncated: bool,
}

fn collect_note_ids(
    conn: &Connection,
    sql: &str,
    bind_params: &[rusqlite::types::Value],
) -> Result<Vec<String>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params_from_iter(bind_params.iter()))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        out.push(row.get::<_, String>(0).map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn all_notes_source_ids(conn: &Connection) -> Result<Vec<String>, String> {
    collect_note_ids(
        conn,
        &format!("SELECT n.id FROM notes n WHERE {ACTIVE_NOTES} ORDER BY n.updated DESC, n.id ASC"),
        &[],
    )
}

fn direct_folder_clause(dir: &str) -> (String, Vec<String>) {
    if dir.is_empty() {
        return ("instr(id, '/') = 0".to_string(), Vec::new());
    }
    let char_len = dir.chars().count();
    (
        "id LIKE ? AND instr(substr(id, ?), '/') = 0".to_string(),
        vec![format!("{dir}/%"), (char_len + 2).to_string()],
    )
}

fn recursive_folder_clause(dir: &str) -> (String, Vec<String>) {
    if dir.is_empty() {
        return ("1 = 1".to_string(), Vec::new());
    }
    ("id LIKE ?".to_string(), vec![format!("{dir}/%")])
}

fn folder_source_ids(conn: &Connection, dir: &str, recursive: bool) -> Result<Vec<String>, String> {
    let (where_sql, bind_values) = if recursive {
        recursive_folder_clause(dir)
    } else {
        direct_folder_clause(dir)
    };
    let bind_params = bind_values
        .into_iter()
        .map(rusqlite::types::Value::from)
        .collect::<Vec<_>>();
    collect_note_ids(
        conn,
        &format!(
            "SELECT n.id FROM notes n WHERE ({where_sql}) AND {ACTIVE_NOTES} ORDER BY n.updated DESC, n.id ASC"
        ),
        &bind_params,
    )
}

fn tag_source_ids(conn: &Connection, tag: &str) -> Result<Vec<String>, String> {
    let normalized = tag.trim().trim_start_matches('#').to_lowercase();
    collect_note_ids(
        conn,
        &format!(
            "SELECT n.id
             FROM tags t
             JOIN notes n ON n.id = t.note_id
             WHERE t.tag = ? AND {ACTIVE_NOTES}
             ORDER BY n.updated DESC, n.id ASC",
        ),
        &[rusqlite::types::Value::from(normalized)],
    )
}

fn search_source_ids(conn: &Connection, query: &str) -> Result<SourceIds, String> {
    let request = parse_raw_search_query(query, Some(SEARCH_SOURCE_LIMIT as u32));
    let ids = run_search_advanced(conn, request)?
        .into_iter()
        .map(|result| result.id)
        .collect::<Vec<_>>();
    Ok(SourceIds {
        truncated: ids.len() >= SEARCH_SOURCE_LIMIT,
        ids,
    })
}

pub(super) fn source_ids(
    conn: &Connection,
    database: &DatabaseDefinition,
) -> Result<SourceIds, String> {
    let complete = |ids| SourceIds {
        ids,
        truncated: false,
    };
    match database.source.kind.as_str() {
        "all_notes" => all_notes_source_ids(conn).map(complete),
        "folder" => folder_source_ids(
            conn,
            database.source.value.trim_matches('/'),
            database.source.recursive,
        )
        .map(complete),
        "tag" => tag_source_ids(conn, &database.source.value).map(complete),
        "search" => search_source_ids(conn, &database.source.value),
        other => Err(format!("unsupported database source kind '{other}'")),
    }
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::index::schema::ensure_schema;

    use super::tag_source_ids;

    #[test]
    fn database_tag_sources_include_descendants() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        for (id, title, updated) in [
            ("notes/root.md", "Root", "2026-03-24T10:00:00Z"),
            ("notes/child.md", "Child", "2026-03-24T11:00:00Z"),
        ] {
            conn.execute(
                "INSERT INTO notes(id, title, created, updated, path, etag, preview)
                 VALUES(?, ?, ?, ?, ?, 'etag', '')",
                rusqlite::params![id, title, updated, updated, id],
            )
            .unwrap();
        }

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

        assert_eq!(
            tag_source_ids(&conn, "#work").unwrap(),
            vec!["notes/child.md".to_string(), "notes/root.md".to_string()]
        );
        assert_eq!(
            tag_source_ids(&conn, "#work/today").unwrap(),
            vec!["notes/child.md".to_string()]
        );
    }
}
