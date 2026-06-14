use std::collections::{HashMap, HashSet};
use std::path::Path;

use serde::Serialize;
use tauri::{State, WebviewWindow};

use crate::space::SpaceState;

use super::checklists::{
    query_note_checklist_summaries, summarize_tasks, NoteTaskSummary, NoteTaskSummaryItem,
};
use super::db::open_db;
use super::indexer::rebuild;
use super::relationships::{query_note_relationships, NoteRelationship};
use super::search_advanced::{run_search_advanced, SearchAdvancedRequest};
use super::search_hybrid::hybrid_search;
use super::tags::{people_tag_to_handle, tag_depth, PEOPLE_TAG_NAMESPACE};
use super::types::{
    BacklinkItem, IndexRebuildResult, LocalConnectionsEdge, LocalConnectionsNode, LocalConnectionsTagEdge,
    LocalConnectionsTagNode, LocalNoteConnections, PersonCount, SearchResult, SpaceConnectionKind, SpaceConnections,
    SpaceConnectionsEdge, SpaceConnectionsNode, SpaceConnectionsTagEdge, SpaceConnectionsTagNode, TagCount,
};
use crate::index::{people_mentions_as_tags_enabled, set_people_mentions_as_tags_enabled};

#[derive(Serialize)]
pub struct AllDocsItem {
    pub note_path: String,
    pub title: String,
    pub preview: String,
    pub updated: String,
    pub created: String,
    pub tags: Vec<String>,
    pub people: Vec<String>,
}

fn tokenize_search_query(raw: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut cur = String::new();
    let mut in_quotes = false;
    for ch in raw.chars() {
        if ch == '"' {
            in_quotes = !in_quotes;
            continue;
        }
        if ch.is_whitespace() && !in_quotes {
            if !cur.trim().is_empty() {
                out.push(cur.trim().to_string());
            }
            cur.clear();
            continue;
        }
        cur.push(ch);
    }
    if !cur.trim().is_empty() {
        out.push(cur.trim().to_string());
    }
    out
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

pub(crate) fn parse_raw_search_query(raw_query: &str, limit: Option<u32>) -> SearchAdvancedRequest {
    let mut req = SearchAdvancedRequest {
        limit: Some(limit.unwrap_or(1500).clamp(1, 2_000)),
        ..SearchAdvancedRequest::default()
    };
    let mut tags: Vec<String> = Vec::new();
    let mut people: Vec<String> = Vec::new();
    let mut text_parts: Vec<String> = Vec::new();

    for token in tokenize_search_query(raw_query.trim()) {
        let lower = token.to_lowercase();
        if lower == "title:only" {
            req.title_only = true;
            continue;
        }
        if lower == "tag:only" {
            req.tag_only = true;
            continue;
        }
        if token.starts_with('#') {
            tags.push(token);
            continue;
        }
        if people_mentions_as_tags_enabled() && token.starts_with('@') {
            people.push(token);
            continue;
        }
        if lower.starts_with("tag:") {
            let rest = token[4..].trim();
            if !rest.is_empty() {
                tags.push(if rest.starts_with('#') {
                    rest.to_string()
                } else {
                    format!("#{rest}")
                });
            }
            continue;
        }
        if people_mentions_as_tags_enabled() && lower.starts_with("person:") {
            let rest = token[7..].trim();
            if !rest.is_empty() {
                people.push(if rest.starts_with('@') {
                    rest.to_string()
                } else {
                    format!("@{rest}")
                });
            }
            continue;
        }
        text_parts.push(token);
    }

    req.tags = tags;
    req.people = people;
    let text = text_parts.join(" ").trim().to_string();
    req.query = if text.is_empty() { None } else { Some(text) };
    req
}

#[tauri::command]
pub async fn index_rebuild(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
) -> Result<IndexRebuildResult, String> {
    let root = state.root_for_window(&window)?;
    let res = tauri::async_runtime::spawn_blocking(move || rebuild(&root))
        .await
        .map_err(|e| e.to_string())??;
    Ok(res)
}

#[tauri::command]
pub async fn search(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<SearchResult>, String> {
        let conn = open_db(&root)?;
        hybrid_search(&conn, &query, &[], 50)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn search_advanced(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    request: SearchAdvancedRequest,
) -> Result<Vec<SearchResult>, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<SearchResult>, String> {
        let conn = open_db(&root)?;
        run_search_advanced(&conn, request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn search_parse_and_run(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    raw_query: String,
    limit: Option<u32>,
) -> Result<Vec<SearchResult>, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<SearchResult>, String> {
        let req = parse_raw_search_query(&raw_query, limit);
        let conn = open_db(&root)?;
        run_search_advanced(&conn, req)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn index_set_people_mentions_as_tags_enabled(enabled: bool) -> Result<(), String> {
    set_people_mentions_as_tags_enabled(enabled);
    Ok(())
}

#[tauri::command]
pub async fn all_docs_list(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    limit: Option<u32>,
    folder_prefix: Option<String>,
) -> Result<Vec<AllDocsItem>, String> {
    let root = state.root_for_window(&window)?;
    let limit = limit.unwrap_or(2_000).clamp(1, 5_000) as i64;
    let folder_prefix = folder_prefix
        .map(|value| value.trim().trim_matches('/').replace('\\', "/"))
        .filter(|value| !value.is_empty());
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<AllDocsItem>, String> {
        let conn = open_db(&root)?;
        let mut sql = String::from(
            "WITH visible_notes AS (
                 SELECT n.id, n.path, n.title, n.preview, n.updated, n.created
                 FROM notes n ",
        );
        let mut params: Vec<rusqlite::types::Value> = Vec::new();
        if let Some(prefix) = folder_prefix.as_ref() {
            sql.push_str("WHERE n.path LIKE ? ESCAPE '\\' ");
            params.push(rusqlite::types::Value::from(format!(
                "{}/%",
                escape_like(prefix)
            )));
        }
        sql.push_str(
            "ORDER BY n.updated DESC LIMIT ?
             ),
             tag_blob AS (
                 SELECT ordered_tags.note_id, GROUP_CONCAT(ordered_tags.tag, '\n') AS tags
                 FROM (
                     SELECT t.note_id, t.tag, t.is_explicit
                     FROM tags t
                     JOIN visible_notes vn ON vn.id = t.note_id
                     WHERE t.tag NOT LIKE 'people/%'
                     ORDER BY t.note_id, t.is_explicit DESC, t.tag COLLATE NOCASE ASC
                 ) ordered_tags
                 GROUP BY ordered_tags.note_id
             ),
             people_blob AS (
                 SELECT ordered_people.note_id, GROUP_CONCAT(ordered_people.tag, '\n') AS people
                 FROM (
                     SELECT t.note_id, t.tag
                     FROM tags t
                     JOIN visible_notes vn ON vn.id = t.note_id
                     WHERE t.tag LIKE 'people/%'
                     ORDER BY t.note_id, t.tag COLLATE NOCASE ASC
                 ) ordered_people
                 GROUP BY ordered_people.note_id
             )
             SELECT vn.path, vn.title, vn.preview, vn.updated, vn.created,
                    COALESCE(tag_blob.tags, ''), COALESCE(people_blob.people, '')
             FROM visible_notes vn
             LEFT JOIN tag_blob ON tag_blob.note_id = vn.id
             LEFT JOIN people_blob ON people_blob.note_id = vn.id
             ORDER BY vn.updated DESC",
        );
        params.push(rusqlite::types::Value::from(limit));
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query(rusqlite::params_from_iter(params.iter()))
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let tag_blob: String = row.get(5).map_err(|e| e.to_string())?;
            let people_blob: String = row.get(6).map_err(|e| e.to_string())?;
            out.push(AllDocsItem {
                note_path: row.get(0).map_err(|e| e.to_string())?,
                title: row.get(1).map_err(|e| e.to_string())?,
                preview: row.get(2).map_err(|e| e.to_string())?,
                updated: row.get(3).map_err(|e| e.to_string())?,
                created: row.get(4).map_err(|e| e.to_string())?,
                tags: tag_blob
                    .split('\n')
                    .map(str::trim)
                    .filter(|tag| !tag.is_empty())
                    .map(ToOwned::to_owned)
                    .collect(),
                people: people_blob
                    .split('\n')
                    .filter_map(people_tag_to_handle)
                    .collect(),
            });
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn all_docs_count(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    folder_prefix: Option<String>,
) -> Result<u32, String> {
    let root = state.root_for_window(&window)?;
    let folder_prefix = folder_prefix
        .map(|value| value.trim().trim_matches('/').replace('\\', "/"))
        .filter(|value| !value.is_empty());
    tauri::async_runtime::spawn_blocking(move || -> Result<u32, String> {
        let conn = open_db(&root)?;
        let mut sql = String::from("SELECT COUNT(*) FROM notes n ");
        let mut params: Vec<rusqlite::types::Value> = Vec::new();
        if let Some(prefix) = folder_prefix.as_ref() {
            sql.push_str("WHERE n.path LIKE ? ESCAPE '\\' ");
            params.push(rusqlite::types::Value::from(format!(
                "{}/%",
                escape_like(prefix)
            )));
        }
        let count: i64 = conn
            .query_row(&sql, rusqlite::params_from_iter(params.iter()), |row| {
                row.get(0)
            })
            .map_err(|e| e.to_string())?;
        Ok(count.max(0) as u32)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn tags_list(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<TagCount>, String> {
    let root = state.root_for_window(&window)?;
    let limit = limit.unwrap_or(200).min(2000) as i64;
    let offset = offset.unwrap_or(0) as i64;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<TagCount>, String> {
        let conn = open_db(&root)?;
        list_tags(&conn, limit, offset)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn list_tags(
    conn: &rusqlite::Connection,
    limit: i64,
    offset: i64,
) -> Result<Vec<TagCount>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT tag,
                    SUM(CASE WHEN is_explicit = 1 THEN 1 ELSE 0 END) AS direct_count,
                    COUNT(*) AS total_count,
                    MAX(is_explicit) AS is_explicit
             FROM tags
             WHERE tag NOT LIKE 'people/%'
             GROUP BY tag
             ORDER BY tag ASC
             LIMIT ? OFFSET ?",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params![limit, offset])
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let tag = row.get::<_, String>(0).map_err(|e| e.to_string())?;
        out.push(TagCount {
            depth: tag_depth(&tag) as u32,
            direct_count: row.get::<_, i64>(1).map_err(|e| e.to_string())? as u32,
            total_count: row.get::<_, i64>(2).map_err(|e| e.to_string())? as u32,
            is_explicit: row.get::<_, i64>(3).map_err(|e| e.to_string())? > 0,
            tag,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn people_list(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<PersonCount>, String> {
    let root = state.root_for_window(&window)?;
    let limit = limit.unwrap_or(200).min(2000) as i64;
    let offset = offset.unwrap_or(0) as i64;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<PersonCount>, String> {
        let conn = open_db(&root)?;
        list_people(&conn, limit, offset)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn list_people(
    conn: &rusqlite::Connection,
    limit: i64,
    offset: i64,
) -> Result<Vec<PersonCount>, String> {
    if !people_mentions_as_tags_enabled() {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare(
            "SELECT tag, COUNT(*) AS total_count
             FROM tags
             WHERE tag LIKE ? AND is_explicit = 1
             GROUP BY tag
             ORDER BY tag ASC
             LIMIT ? OFFSET ?",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params![
            format!("{PEOPLE_TAG_NAMESPACE}%"),
            limit,
            offset
        ])
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let tag = row.get::<_, String>(0).map_err(|e| e.to_string())?;
        let Some(handle) = people_tag_to_handle(&tag) else {
            continue;
        };
        out.push(PersonCount {
            handle,
            count: row.get::<_, i64>(1).map_err(|e| e.to_string())? as u32,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::index::schema::ensure_schema;
    use crate::index::set_people_mentions_as_tags_enabled;
    use crate::index::tags::{expand_indexed_people, expand_indexed_tags};

    use super::{list_people, list_tags};

    #[test]
    fn list_tags_reports_direct_and_total_counts_for_virtual_parents() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        for tag in expand_indexed_tags(&["work/today/further".to_string()]) {
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES(?, ?, ?)",
                rusqlite::params![
                    "notes/leaf.md",
                    tag.tag,
                    if tag.is_explicit { 1 } else { 0 }
                ],
            )
            .unwrap();
        }
        for tag in expand_indexed_tags(&["work".to_string()]) {
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES(?, ?, ?)",
                rusqlite::params![
                    "notes/root.md",
                    tag.tag,
                    if tag.is_explicit { 1 } else { 0 }
                ],
            )
            .unwrap();
        }

        let tags = list_tags(&conn, 50, 0).unwrap();
        assert_eq!(tags.len(), 3);

        let root = tags.iter().find(|tag| tag.tag == "work").unwrap();
        assert_eq!(root.direct_count, 1);
        assert_eq!(root.total_count, 2);
        assert!(root.is_explicit);
        assert_eq!(root.depth, 0);

        let intermediate = tags.iter().find(|tag| tag.tag == "work/today").unwrap();
        assert_eq!(intermediate.direct_count, 0);
        assert_eq!(intermediate.total_count, 1);
        assert!(!intermediate.is_explicit);
        assert_eq!(intermediate.depth, 1);
    }

    #[test]
    fn list_tags_excludes_people_namespace_and_people_list_strips_prefix() {
        set_people_mentions_as_tags_enabled(true);
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        for tag in expand_indexed_tags(&["work".to_string()]) {
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES(?, ?, ?)",
                rusqlite::params![
                    "notes/work.md",
                    tag.tag,
                    if tag.is_explicit { 1 } else { 0 }
                ],
            )
            .unwrap();
        }
        for tag in expand_indexed_people(&["alice".to_string()]) {
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES(?, ?, ?)",
                rusqlite::params![
                    "notes/person.md",
                    tag.tag,
                    if tag.is_explicit { 1 } else { 0 }
                ],
            )
            .unwrap();
        }

        let tags = list_tags(&conn, 50, 0).unwrap();
        assert_eq!(
            tags.iter().map(|tag| tag.tag.as_str()).collect::<Vec<_>>(),
            vec!["work"]
        );

        let people = list_people(&conn, 50, 0).unwrap();
        assert_eq!(people.len(), 1);
        assert_eq!(people[0].handle, "alice");
        assert_eq!(people[0].count, 1);
        set_people_mentions_as_tags_enabled(false);
    }
}

#[tauri::command(rename_all = "snake_case")]
pub fn task_summary(markdown: String) -> NoteTaskSummary {
    summarize_tasks(&markdown)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn task_summaries_for_paths(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    note_paths: Vec<String>,
) -> Result<Vec<NoteTaskSummaryItem>, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<NoteTaskSummaryItem>, String> {
        let normalized_paths = note_paths
            .into_iter()
            .map(|path| path.trim().replace('\\', "/"))
            .filter(|path| !path.is_empty())
            .collect::<Vec<_>>();

        let conn = open_db(&root)?;
        query_note_checklist_summaries(&conn, &normalized_paths)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn backlinks(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    note_id: String,
    _space_path: Option<String>,
) -> Result<Vec<BacklinkItem>, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<BacklinkItem>, String> {
        let conn = open_db(&root)?;
        let stem = Path::new(&note_id)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT n.id, n.title, n.updated
                 FROM notes n
                 JOIN (
                    SELECT l.from_id
                    FROM links l
                    WHERE l.to_id = ? OR (l.to_title IS NOT NULL AND l.to_title = ?)
                    UNION
                    SELECT r.from_id
                    FROM note_relationships r
                    WHERE r.to_id = ? OR r.to_title = ? OR r.target_title = ?
                 ) refs ON refs.from_id = n.id
                 ORDER BY n.updated DESC
                 LIMIT 100",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query(rusqlite::params![note_id, stem, note_id, stem, stem])
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            out.push(BacklinkItem {
                id: row.get(0).map_err(|e| e.to_string())?,
                title: row.get(1).map_err(|e| e.to_string())?,
                updated: row.get(2).map_err(|e| e.to_string())?,
            });
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn note_relationships(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    note_id: String,
) -> Result<Vec<NoteRelationship>, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<NoteRelationship>, String> {
        let conn = open_db(&root)?;
        query_note_relationships(&conn, &note_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn local_note_connections_for_conn(
    conn: &rusqlite::Connection,
    note_id: &str,
) -> Result<LocalNoteConnections, String> {
    const COMMON_TAG_LIMIT: usize = 12;
    const TAGGED_NOTES_PER_TAG_LIMIT: usize = 12;
    const TOTAL_TAGGED_NOTES_LIMIT: usize = 64;

    let center = conn
        .query_row(
            "SELECT id, title FROM notes WHERE id = ? LIMIT 1",
            [note_id],
            |row| {
                Ok(LocalConnectionsNode {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    is_center: true,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    let mut nodes_by_id = HashMap::new();
    nodes_by_id.insert(center.id.clone(), LocalConnectionsNode { ..center.clone() });

    let mut neighbor_stmt = conn
        .prepare(
            "SELECT DISTINCT n.id, n.title
             FROM notes n
             JOIN (
                SELECT l.to_id AS note_id
                FROM links l
                WHERE l.from_id = ? AND l.to_id IS NOT NULL
                UNION
                SELECT l.from_id AS note_id
                FROM links l
                WHERE l.to_id = ?
                UNION
                SELECT r.to_id AS note_id
                FROM note_relationships r
                WHERE r.from_id = ? AND r.to_id IS NOT NULL
                UNION
                SELECT r.from_id AS note_id
                FROM note_relationships r
                WHERE r.to_id = ?
             ) related ON related.note_id = n.id
             WHERE n.id <> ?",
        )
        .map_err(|e| e.to_string())?;
    let mut neighbor_rows = neighbor_stmt
        .query(rusqlite::params![
            note_id, note_id, note_id, note_id, note_id
        ])
        .map_err(|e| e.to_string())?;
    while let Some(row) = neighbor_rows.next().map_err(|e| e.to_string())? {
        let id: String = row.get(0).map_err(|e| e.to_string())?;
        let title: String = row.get(1).map_err(|e| e.to_string())?;
        nodes_by_id.insert(
            id.clone(),
            LocalConnectionsNode {
                id,
                title,
                is_center: false,
            },
        );
    }

    let seed_node_ids = nodes_by_id.keys().cloned().collect::<Vec<_>>();
    let (tags, tagged_nodes, tag_edges) = local_connections_tag_expansion_for_seed_nodes(
        conn,
        &seed_node_ids,
        COMMON_TAG_LIMIT,
        TAGGED_NOTES_PER_TAG_LIMIT,
        TOTAL_TAGGED_NOTES_LIMIT,
    )?;
    for node in tagged_nodes {
        nodes_by_id.entry(node.id.clone()).or_insert(node);
    }

    let node_ids = nodes_by_id.keys().cloned().collect::<Vec<_>>();
    let placeholders = std::iter::repeat_n("?", node_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let edge_query = format!(
        "SELECT DISTINCT from_id, to_id
         FROM (
            SELECT from_id, to_id
            FROM links
            WHERE to_id IS NOT NULL
            UNION
            SELECT from_id, to_id
            FROM note_relationships
            WHERE to_id IS NOT NULL
         )
         WHERE from_id IN ({placeholders})
           AND to_id IN ({placeholders})
           AND from_id <> to_id"
    );
    let mut edge_stmt = conn.prepare(&edge_query).map_err(|e| e.to_string())?;
    let params = rusqlite::params_from_iter(node_ids.iter().chain(node_ids.iter()));
    let mut edge_rows = edge_stmt.query(params).map_err(|e| e.to_string())?;
    let mut edges = Vec::new();
    while let Some(row) = edge_rows.next().map_err(|e| e.to_string())? {
        edges.push(LocalConnectionsEdge {
            source: row.get(0).map_err(|e| e.to_string())?,
            target: row.get(1).map_err(|e| e.to_string())?,
        });
    }

    let mut nodes = nodes_by_id.into_values().collect::<Vec<_>>();
    nodes.sort_by(|left, right| {
        right
            .is_center
            .cmp(&left.is_center)
            .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase()))
            .then_with(|| left.id.cmp(&right.id))
    });

    Ok(LocalNoteConnections {
        center,
        nodes,
        edges,
        tags,
        tag_edges,
    })
}

fn local_connections_tag_id(tag: &str) -> String {
    format!("glyph:tag:{tag}")
}

fn local_connections_tag_expansion_for_seed_nodes(
    conn: &rusqlite::Connection,
    seed_node_ids: &[String],
    tag_limit: usize,
    notes_per_tag_limit: usize,
    total_tagged_notes_limit: usize,
) -> Result<
    (
        Vec<LocalConnectionsTagNode>,
        Vec<LocalConnectionsNode>,
        Vec<LocalConnectionsTagEdge>,
    ),
    String,
> {
    if seed_node_ids.len() < 2 {
        return Ok((Vec::new(), Vec::new(), Vec::new()));
    }

    let seed_placeholders = std::iter::repeat_n("?", seed_node_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let tag_query = format!(
        "SELECT tag
         FROM tags
         WHERE is_explicit = 1
           AND tag NOT LIKE ?
           AND note_id IN ({seed_placeholders})
         GROUP BY tag
         HAVING COUNT(*) > 1
         ORDER BY COUNT(*) DESC, tag COLLATE NOCASE ASC
         LIMIT ?"
    );
    let mut params = Vec::<rusqlite::types::Value>::new();
    params.push(format!("{PEOPLE_TAG_NAMESPACE}%").into());
    params.extend(seed_node_ids.iter().cloned().map(Into::into));
    params.push((tag_limit as i64).into());

    let mut tag_stmt = conn.prepare(&tag_query).map_err(|e| e.to_string())?;
    let mut tag_rows = tag_stmt
        .query(rusqlite::params_from_iter(params))
        .map_err(|e| e.to_string())?;
    let mut tag_names = Vec::new();
    while let Some(row) = tag_rows.next().map_err(|e| e.to_string())? {
        tag_names.push(row.get::<_, String>(0).map_err(|e| e.to_string())?);
    }

    if tag_names.is_empty() {
        return Ok((Vec::new(), Vec::new(), Vec::new()));
    }

    let edge_query = format!(
        "SELECT n.id, n.title
         FROM tags t
         JOIN notes n ON n.id = t.note_id
         WHERE t.is_explicit = 1
           AND t.tag = ?
         ORDER BY CASE WHEN n.id IN ({seed_placeholders}) THEN 0 ELSE 1 END,
                  n.title COLLATE NOCASE ASC,
                  n.id ASC
         LIMIT ?"
    );
    let mut tag_edges = Vec::new();
    let mut tagged_nodes_by_id = HashMap::<String, LocalConnectionsNode>::new();
    let mut note_count_by_tag = HashMap::<String, u32>::new();
    let mut edge_stmt = conn.prepare(&edge_query).map_err(|e| e.to_string())?;
    for tag in &tag_names {
        if tagged_nodes_by_id.len() >= total_tagged_notes_limit {
            break;
        }

        let mut edge_params = Vec::<rusqlite::types::Value>::new();
        edge_params.push(tag.clone().into());
        edge_params.extend(seed_node_ids.iter().cloned().map(Into::into));
        edge_params.push((notes_per_tag_limit as i64).into());
        let mut edge_rows = edge_stmt
            .query(rusqlite::params_from_iter(edge_params))
            .map_err(|e| e.to_string())?;
        while let Some(row) = edge_rows.next().map_err(|e| e.to_string())? {
            if tagged_nodes_by_id.len() >= total_tagged_notes_limit {
                break;
            }

            let tag_note_count = note_count_by_tag.get(tag).copied().unwrap_or(0) as usize;
            if tag_note_count >= notes_per_tag_limit {
                break;
            }

            let note_id: String = row.get(0).map_err(|e| e.to_string())?;
            let title: String = row.get(1).map_err(|e| e.to_string())?;
            tagged_nodes_by_id
                .entry(note_id.clone())
                .or_insert(LocalConnectionsNode {
                    id: note_id.clone(),
                    title,
                    is_center: false,
                });
            *note_count_by_tag.entry(tag.clone()).or_insert(0) += 1;
            tag_edges.push(LocalConnectionsTagEdge {
                tag_id: local_connections_tag_id(tag),
                note_id,
            });
        }
    }

    let tags = tag_names
        .into_iter()
        .filter_map(|tag| {
            let note_count = note_count_by_tag.get(&tag).copied()?;
            Some(LocalConnectionsTagNode {
                id: local_connections_tag_id(&tag),
                title: format!("#{tag}"),
                tag,
                note_count,
            })
        })
        .collect::<Vec<_>>();

    Ok((
        tags,
        tagged_nodes_by_id.into_values().collect::<Vec<_>>(),
        tag_edges,
    ))
}

struct SpaceConnectionsNodeSeed {
    id: String,
    title: String,
    link_count: u32,
    tag_count: u32,
}

fn space_connections_for_conn(
    conn: &rusqlite::Connection,
    max_nodes: usize,
    max_tags: usize,
) -> Result<SpaceConnections, String> {
    let total_notes = conn
        .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get::<_, i64>(0))
        .map(|count| count as u32)
        .map_err(|e| e.to_string())?;
    let truncated = total_notes as usize > max_nodes;
    let people_tag_like = format!("{PEOPLE_TAG_NAMESPACE}%");
    let node_limit = max_nodes.max(1);
    let node_order = if truncated {
        "(COALESCE(edge_counts.link_count, 0) + COALESCE(tag_counts.tag_count, 0)) DESC,
         n.title COLLATE NOCASE ASC,
         n.id ASC"
    } else {
        "n.title COLLATE NOCASE ASC, n.id ASC"
    };
    let node_query = format!(
        "WITH edge_counts AS (
            SELECT note_id, COUNT(*) AS link_count
            FROM (
                SELECT l.from_id AS note_id
                FROM links l
                JOIN notes target ON target.id = l.to_id
                WHERE l.to_id IS NOT NULL AND l.from_id <> l.to_id
                UNION ALL
                SELECT l.to_id AS note_id
                FROM links l
                JOIN notes source ON source.id = l.from_id
                WHERE l.to_id IS NOT NULL AND l.from_id <> l.to_id
                UNION ALL
                SELECT r.from_id AS note_id
                FROM note_relationships r
                JOIN notes target ON target.id = r.to_id
                WHERE r.to_id IS NOT NULL AND r.from_id <> r.to_id
                UNION ALL
                SELECT r.to_id AS note_id
                FROM note_relationships r
                JOIN notes source ON source.id = r.from_id
                WHERE r.to_id IS NOT NULL AND r.from_id <> r.to_id
            )
            GROUP BY note_id
         ),
         tag_counts AS (
            SELECT note_id, COUNT(DISTINCT tag) AS tag_count
            FROM tags
            WHERE is_explicit = 1
              AND tag NOT LIKE ?
            GROUP BY note_id
         )
         SELECT n.id,
                n.title,
                COALESCE(edge_counts.link_count, 0) AS link_count,
                COALESCE(tag_counts.tag_count, 0) AS tag_count
         FROM notes n
         LEFT JOIN edge_counts ON edge_counts.note_id = n.id
         LEFT JOIN tag_counts ON tag_counts.note_id = n.id
         ORDER BY {node_order}
         LIMIT ?"
    );
    let mut node_stmt = conn.prepare(&node_query).map_err(|e| e.to_string())?;
    let mut node_rows = node_stmt
        .query(rusqlite::params![people_tag_like, node_limit as i64])
        .map_err(|e| e.to_string())?;
    let mut node_seeds = Vec::new();
    while let Some(row) = node_rows.next().map_err(|e| e.to_string())? {
        node_seeds.push(SpaceConnectionsNodeSeed {
            id: row.get(0).map_err(|e| e.to_string())?,
            title: row.get(1).map_err(|e| e.to_string())?,
            link_count: row.get::<_, i64>(2).map_err(|e| e.to_string())? as u32,
            tag_count: row.get::<_, i64>(3).map_err(|e| e.to_string())? as u32,
        });
    }

    if node_seeds.is_empty() {
        return Ok(SpaceConnections {
            nodes: Vec::new(),
            edges: Vec::new(),
            tags: Vec::new(),
            tag_edges: Vec::new(),
            truncated,
            truncated_tags: false,
            total_notes,
            total_tags: 0,
        });
    }

    let selected_ids = node_seeds
        .iter()
        .map(|node| node.id.as_str())
        .collect::<Vec<_>>();
    let selected_id_values = std::iter::repeat("(?)")
        .take(selected_ids.len())
        .collect::<Vec<_>>()
        .join(", ");

    let edge_query = format!(
        "WITH selected_ids(id) AS (VALUES {selected_id_values})
         SELECT DISTINCT from_id, to_id, kind
         FROM (
            SELECT from_id, to_id, 'link' AS kind
            FROM links
            WHERE to_id IS NOT NULL
            UNION
            SELECT from_id, to_id, 'relationship' AS kind
            FROM note_relationships
            WHERE to_id IS NOT NULL
         )
         WHERE from_id <> to_id
           AND from_id IN (SELECT id FROM selected_ids)
           AND to_id IN (SELECT id FROM selected_ids)
         ORDER BY from_id COLLATE NOCASE ASC, to_id COLLATE NOCASE ASC, kind ASC"
    );
    let mut edge_stmt = conn.prepare(&edge_query).map_err(|e| e.to_string())?;
    let mut edge_rows = edge_stmt
        .query(rusqlite::params_from_iter(selected_ids.iter().copied()))
        .map_err(|e| e.to_string())?;
    let mut edges = Vec::new();
    while let Some(row) = edge_rows.next().map_err(|e| e.to_string())? {
        let from_id: String = row.get(0).map_err(|e| e.to_string())?;
        let to_id: String = row.get(1).map_err(|e| e.to_string())?;
        let kind = match row.get::<_, String>(2).map_err(|e| e.to_string())?.as_str() {
            "link" => SpaceConnectionKind::Link,
            "relationship" => SpaceConnectionKind::Relationship,
            other => return Err(format!("unsupported connection kind '{other}'")),
        };
        edges.push(SpaceConnectionsEdge {
            from_id,
            to_id,
            kind,
        });
    }

    let tag_query = format!(
        "WITH selected_ids(id) AS (VALUES {selected_id_values})
         SELECT note_id, tag
         FROM tags
         WHERE is_explicit = 1
           AND tag NOT LIKE ?
           AND note_id IN (SELECT id FROM selected_ids)
         ORDER BY tag COLLATE NOCASE ASC, note_id COLLATE NOCASE ASC"
    );
    let mut tag_stmt = conn.prepare(&tag_query).map_err(|e| e.to_string())?;
    let tag_params = selected_ids
        .iter()
        .map(|id| (*id).to_string())
        .chain(std::iter::once(format!("{PEOPLE_TAG_NAMESPACE}%")));
    let mut tag_rows = tag_stmt
        .query(rusqlite::params_from_iter(tag_params))
        .map_err(|e| e.to_string())?;
    let mut note_ids_by_tag = HashMap::<String, HashSet<String>>::new();
    while let Some(row) = tag_rows.next().map_err(|e| e.to_string())? {
        let note_id: String = row.get(0).map_err(|e| e.to_string())?;
        let tag: String = row.get(1).map_err(|e| e.to_string())?;
        note_ids_by_tag.entry(tag).or_default().insert(note_id);
    }

    let total_tags = note_ids_by_tag.len() as u32;
    let truncated_tags = total_tags as usize > max_tags;

    let mut tags = Vec::new();
    let mut tag_edges = Vec::new();
    if max_tags > 0 && total_tags > 0 {
        let mut selected_tags = note_ids_by_tag
            .iter()
            .map(|(tag, note_ids)| (tag.clone(), note_ids.len() as u32))
            .collect::<Vec<_>>();
        selected_tags.sort_by(|(left_tag, left_count), (right_tag, right_count)| {
            right_count
                .cmp(left_count)
                .then_with(|| {
                    left_tag
                        .to_ascii_lowercase()
                        .cmp(&right_tag.to_ascii_lowercase())
                })
                .then_with(|| left_tag.cmp(right_tag))
        });
        selected_tags.truncate(max_tags);

        for (tag, note_count) in &selected_tags {
            tags.push(SpaceConnectionsTagNode {
                id: local_connections_tag_id(tag),
                title: format!("#{tag}"),
                tag: tag.clone(),
                note_count: *note_count,
            });
        }

        if !selected_tags.is_empty() {
            let mut selected_tag_edges = selected_tags
                .iter()
                .flat_map(|(tag, _)| {
                    note_ids_by_tag[tag]
                        .iter()
                        .map(|note_id| (tag.clone(), note_id.clone()))
                })
                .collect::<Vec<_>>();
            selected_tag_edges.sort_by(|(left_tag, left_note_id), (right_tag, right_note_id)| {
                left_tag
                    .to_ascii_lowercase()
                    .cmp(&right_tag.to_ascii_lowercase())
                    .then_with(|| left_tag.cmp(right_tag))
                    .then_with(|| {
                        left_note_id
                            .to_ascii_lowercase()
                            .cmp(&right_note_id.to_ascii_lowercase())
                    })
                    .then_with(|| left_note_id.cmp(right_note_id))
            });
            for (tag, note_id) in selected_tag_edges {
                tag_edges.push(SpaceConnectionsTagEdge {
                    tag_id: local_connections_tag_id(&tag),
                    note_id,
                });
            }
        }
    }
    let nodes = node_seeds
        .into_iter()
        .map(|node| SpaceConnectionsNode {
            id: node.id,
            title: node.title,
            link_count: node.link_count,
            tag_count: node.tag_count,
            is_isolated: node.link_count == 0 && node.tag_count == 0,
        })
        .collect::<Vec<_>>();

    Ok(SpaceConnections {
        nodes,
        edges,
        tags,
        tag_edges,
        truncated,
        truncated_tags,
        total_notes,
        total_tags,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn note_local_connections(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    note_id: String,
) -> Result<LocalNoteConnections, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<LocalNoteConnections, String> {
        let conn = open_db(&root)?;
        local_note_connections_for_conn(&conn, &note_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_connections(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    max_nodes: Option<u32>,
    max_tags: Option<u32>,
) -> Result<SpaceConnections, String> {
    let root = state.root_for_window(&window)?;
    let max_nodes = max_nodes.unwrap_or(1000).clamp(1, 10_000) as usize;
    let max_tags = max_tags.unwrap_or(250).clamp(0, 1000) as usize;
    tauri::async_runtime::spawn_blocking(move || -> Result<SpaceConnections, String> {
        let conn = open_db(&root)?;
        space_connections_for_conn(&conn, max_nodes, max_tags)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod local_connections_tests {
    use rusqlite::Connection;

    use crate::index::schema::ensure_schema;

    use super::{local_connections_tag_expansion_for_seed_nodes, local_note_connections_for_conn};

    #[test]
    fn local_note_connections_returns_center_neighbors_and_internal_edges() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        for (id, title) in [
            ("notes/center.md", "Center"),
            ("notes/outgoing.md", "Outgoing"),
            ("notes/incoming.md", "Incoming"),
            ("notes/mutual.md", "Mutual"),
            ("notes/neighbor-link.md", "Neighbor Link"),
        ] {
            conn.execute(
                "INSERT INTO notes(id, title, created, updated, path, etag, preview)
                 VALUES(?, ?, '2026-01-01', '2026-01-01', ?, ?, '')",
                rusqlite::params![id, title, id, format!("{id}-etag")],
            )
            .unwrap();
        }

        for (from_id, to_id) in [
            ("notes/center.md", "notes/outgoing.md"),
            ("notes/incoming.md", "notes/center.md"),
            ("notes/center.md", "notes/mutual.md"),
            ("notes/mutual.md", "notes/center.md"),
            ("notes/outgoing.md", "notes/neighbor-link.md"),
        ] {
            conn.execute(
                "INSERT INTO links(from_id, to_id, to_title, kind) VALUES(?, ?, NULL, 'note')",
                rusqlite::params![from_id, to_id],
            )
            .unwrap();
        }

        conn.execute(
            "INSERT INTO links(from_id, to_id, to_title, kind) VALUES(?, NULL, ?, 'wikilink')",
            rusqlite::params!["notes/center.md", "Missing Note"],
        )
        .unwrap();

        let graph = local_note_connections_for_conn(&conn, "notes/center.md").unwrap();
        assert_eq!(graph.center.id, "notes/center.md");
        assert_eq!(graph.nodes.len(), 4);

        let node_ids = graph
            .nodes
            .iter()
            .map(|node| node.id.as_str())
            .collect::<Vec<_>>();
        assert!(node_ids.contains(&"notes/center.md"));
        assert!(node_ids.contains(&"notes/outgoing.md"));
        assert!(node_ids.contains(&"notes/incoming.md"));
        assert!(node_ids.contains(&"notes/mutual.md"));
        assert!(!node_ids.contains(&"notes/neighbor-link.md"));

        let edges = graph
            .edges
            .iter()
            .map(|edge| (edge.source.as_str(), edge.target.as_str()))
            .collect::<Vec<_>>();
        assert!(edges.contains(&("notes/center.md", "notes/outgoing.md")));
        assert!(edges.contains(&("notes/incoming.md", "notes/center.md")));
        assert!(edges.contains(&("notes/center.md", "notes/mutual.md")));
        assert!(edges.contains(&("notes/mutual.md", "notes/center.md")));
        assert!(!edges.contains(&("notes/outgoing.md", "notes/neighbor-link.md")));
    }

    #[test]
    fn local_note_connections_handles_single_isolated_note() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        conn.execute(
            "INSERT INTO notes(id, title, created, updated, path, etag, preview)
             VALUES('notes/solo.md', 'Solo', '2026-01-01', '2026-01-01', 'notes/solo.md', 'solo-etag', '')",
            [],
        )
        .unwrap();

        let graph = local_note_connections_for_conn(&conn, "notes/solo.md").unwrap();
        assert_eq!(graph.center.id, "notes/solo.md");
        assert_eq!(graph.nodes.len(), 1);
        assert!(graph.nodes[0].is_center);
        assert!(graph.edges.is_empty());
    }

    #[test]
    fn local_note_connections_caps_tag_expansion_per_tag() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        for (id, title) in [
            ("notes/center.md".to_string(), "Center".to_string()),
            ("notes/neighbor.md".to_string(), "Neighbor".to_string()),
        ]
        .into_iter()
        .chain((0..20).map(|index| {
            (
                format!("notes/common-{index:02}.md"),
                format!("Common {index:02}"),
            )
        })) {
            conn.execute(
                "INSERT INTO notes(id, title, created, updated, path, etag, preview)
                 VALUES(?, ?, '2026-01-01', '2026-01-01', ?, ?, '')",
                rusqlite::params![&id, &title, &id, format!("{id}-etag")],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES(?, 'project', 1)",
                [&id],
            )
            .unwrap();
        }

        conn.execute(
            "INSERT INTO links(from_id, to_id, to_title, kind) VALUES(?, ?, NULL, 'note')",
            rusqlite::params!["notes/center.md", "notes/neighbor.md"],
        )
        .unwrap();

        let graph = local_note_connections_for_conn(&conn, "notes/center.md").unwrap();
        assert_eq!(graph.nodes.len(), 12);
        assert_eq!(graph.tag_edges.len(), 12);
        assert!(graph.nodes.iter().any(|node| node.id == "notes/center.md"));
        assert!(graph
            .nodes
            .iter()
            .any(|node| node.id == "notes/neighbor.md"));
        assert!(!graph
            .nodes
            .iter()
            .any(|node| node.id == "notes/common-10.md"));
        assert_eq!(graph.tags.len(), 1);
        assert_eq!(graph.tags[0].tag, "project");
        assert_eq!(graph.tags[0].note_count, 12);
    }

    #[test]
    fn local_connections_tag_expansion_caps_total_expanded_nodes() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        for (id, title) in [
            ("notes/center.md".to_string(), "Center".to_string()),
            ("notes/neighbor.md".to_string(), "Neighbor".to_string()),
        ]
        .into_iter()
        .chain((0..20).map(|index| {
            (
                format!("notes/tagged-{index:02}.md"),
                format!("Tagged {index:02}"),
            )
        })) {
            conn.execute(
                "INSERT INTO notes(id, title, created, updated, path, etag, preview)
                 VALUES(?, ?, '2026-01-01', '2026-01-01', ?, ?, '')",
                rusqlite::params![&id, &title, &id, format!("{id}-etag")],
            )
            .unwrap();
            for tag in ["project", "todo"] {
                conn.execute(
                    "INSERT INTO tags(note_id, tag, is_explicit) VALUES(?, ?, 1)",
                    rusqlite::params![&id, tag],
                )
                .unwrap();
            }
        }

        let seed_node_ids = vec![
            "notes/center.md".to_string(),
            "notes/neighbor.md".to_string(),
        ];
        let (tags, tagged_nodes, tag_edges) =
            local_connections_tag_expansion_for_seed_nodes(&conn, &seed_node_ids, 12, 12, 5).unwrap();

        assert_eq!(tagged_nodes.len(), 5);
        assert_eq!(tag_edges.len(), 5);
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].note_count, 5);
    }
}

#[cfg(test)]
mod space_connections_tests {
    use std::{env, time::Instant};

    use rusqlite::Connection;

    use crate::index::schema::ensure_schema;
    use crate::index::tags::PEOPLE_TAG_NAMESPACE;

    use super::space_connections_for_conn;

    fn insert_note(conn: &Connection, id: &str, title: &str) {
        conn.execute(
            "INSERT INTO notes(id, title, created, updated, path, etag, preview)
             VALUES(?, ?, '2026-01-01', '2026-01-01', ?, ?, '')",
            rusqlite::params![id, title, id, format!("{id}-etag")],
        )
        .unwrap();
    }

    #[test]
    fn space_connections_under_cap_includes_linked_tagged_and_isolated_notes() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        for (id, title) in [
            ("notes/alpha.md", "Alpha"),
            ("notes/beta.md", "Beta"),
            ("notes/tagged.md", "Tagged"),
            ("notes/isolated.md", "Isolated"),
        ] {
            insert_note(&conn, id, title);
        }
        conn.execute(
            "INSERT INTO links(from_id, to_id, to_title, kind) VALUES(?, ?, NULL, 'note')",
            rusqlite::params!["notes/alpha.md", "notes/beta.md"],
        )
        .unwrap();
        for note_id in ["notes/alpha.md", "notes/tagged.md"] {
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES(?, 'project', 1)",
                [note_id],
            )
            .unwrap();
        }

        let graph = space_connections_for_conn(&conn, 10, 10).unwrap();
        assert!(!graph.truncated);
        assert_eq!(graph.total_notes, 4);
        assert_eq!(graph.nodes.len(), 4);
        assert_eq!(graph.edges.len(), 1);
        assert_eq!(graph.edges[0].kind, "link");
        assert_eq!(graph.tags.len(), 1);
        assert_eq!(graph.tag_edges.len(), 2);

        let isolated = graph
            .nodes
            .iter()
            .find(|node| node.id == "notes/isolated.md")
            .unwrap();
        assert!(isolated.is_isolated);

        let tagged = graph
            .nodes
            .iter()
            .find(|node| node.id == "notes/tagged.md")
            .unwrap();
        assert!(!tagged.is_isolated);
    }

    #[test]
    fn space_connections_truncates_to_highest_degree_nodes() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        for (id, title) in [
            ("notes/high.md", "High"),
            ("notes/medium.md", "Medium"),
            ("notes/low.md", "Low"),
            ("notes/zero.md", "Zero"),
        ] {
            insert_note(&conn, id, title);
        }
        for (from_id, to_id) in [
            ("notes/high.md", "notes/medium.md"),
            ("notes/high.md", "notes/low.md"),
            ("notes/medium.md", "notes/high.md"),
        ] {
            conn.execute(
                "INSERT INTO links(from_id, to_id, to_title, kind) VALUES(?, ?, NULL, 'note')",
                rusqlite::params![from_id, to_id],
            )
            .unwrap();
        }
        for tag in ["one", "two"] {
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES('notes/high.md', ?, 1)",
                [tag],
            )
            .unwrap();
        }

        let graph = space_connections_for_conn(&conn, 2, 10).unwrap();
        let node_ids = graph
            .nodes
            .iter()
            .map(|node| node.id.as_str())
            .collect::<Vec<_>>();
        assert!(graph.truncated);
        assert_eq!(graph.total_notes, 4);
        assert_eq!(node_ids, vec!["notes/high.md", "notes/medium.md"]);
        assert!(!node_ids.contains(&"notes/zero.md"));
    }

    #[test]
    fn space_connections_excludes_edges_with_missing_endpoints() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        insert_note(&conn, "notes/source.md", "Source");

        conn.execute(
            "INSERT INTO links(from_id, to_id, to_title, kind) VALUES(?, ?, NULL, 'note')",
            rusqlite::params!["notes/source.md", "notes/missing.md"],
        )
        .unwrap();

        let graph = space_connections_for_conn(&conn, 10, 10).unwrap();
        assert!(graph.edges.is_empty());
        assert_eq!(graph.nodes[0].link_count, 0);
        assert!(graph.nodes[0].is_isolated);
    }

    #[test]
    fn space_connections_returns_explicit_tags_and_excludes_people_and_virtual_tags() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        insert_note(&conn, "notes/tagged.md", "Tagged");

        for (tag, is_explicit) in [
            ("work".to_string(), 1),
            (format!("{PEOPLE_TAG_NAMESPACE}ada"), 1),
            ("virtual-parent".to_string(), 0),
        ] {
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES('notes/tagged.md', ?, ?)",
                rusqlite::params![tag, is_explicit],
            )
            .unwrap();
        }

        let graph = space_connections_for_conn(&conn, 10, 10).unwrap();
        assert_eq!(graph.total_tags, 1);
        assert_eq!(graph.tags.len(), 1);
        assert_eq!(graph.tags[0].tag, "work");
        assert_eq!(graph.tag_edges.len(), 1);
    }

    #[test]
    fn space_connections_tag_cap_sets_truncated_tags() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        insert_note(&conn, "notes/tagged.md", "Tagged");

        for tag in ["alpha", "beta"] {
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES('notes/tagged.md', ?, 1)",
                [tag],
            )
            .unwrap();
        }

        let graph = space_connections_for_conn(&conn, 10, 1).unwrap();
        assert_eq!(graph.total_tags, 2);
        assert!(graph.truncated_tags);
        assert_eq!(graph.tags.len(), 1);
        assert_eq!(graph.tags[0].tag, "alpha");
        assert_eq!(graph.tag_edges.len(), 1);
    }

    #[test]
    fn space_connections_includes_relationship_edges() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        insert_note(&conn, "notes/source.md", "Source");
        insert_note(&conn, "notes/target.md", "Target");

        conn.execute(
            "INSERT INTO note_relationships(from_id, field_key, to_id, to_title, target_title, ordinal)
             VALUES(?, 'related', ?, NULL, 'Target', 0)",
            rusqlite::params!["notes/source.md", "notes/target.md"],
        )
        .unwrap();

        let graph = space_connections_for_conn(&conn, 10, 10).unwrap();
        assert_eq!(graph.edges.len(), 1);
        assert_eq!(graph.edges[0].kind, "relationship");
        assert_eq!(graph.edges[0].from_id, "notes/source.md");
        assert_eq!(graph.edges[0].to_id, "notes/target.md");
    }

    #[test]
    fn space_connections_synthetic_scale_stays_under_spike_budget() {
        if env::var("RUN_PERF_TESTS").ok().as_deref() != Some("1") {
            return;
        }

        let mut conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        let tx = conn.transaction().unwrap();
        for index in 0..2_000 {
            let id = format!("notes/n{index:04}.md");
            let title = format!("Note {index:04}");
            tx.execute(
                "INSERT INTO notes(id, title, created, updated, path, etag, preview)
                 VALUES(?, ?, '2026-01-01', '2026-01-01', ?, ?, '')",
                rusqlite::params![&id, &title, &id, format!("{id}-etag")],
            )
            .unwrap();
        }
        for index in 0..10_000 {
            let from_id = format!("notes/n{:04}.md", index % 2_000);
            let to_id = format!("notes/n{:04}.md", (index * 7 + 11) % 2_000);
            if from_id == to_id {
                continue;
            }
            tx.execute(
                "INSERT OR IGNORE INTO links(from_id, to_id, to_title, kind)
                 VALUES(?, ?, NULL, 'note')",
                rusqlite::params![from_id, to_id],
            )
            .unwrap();
        }
        for index in 0..500 {
            let note_id = format!("notes/n{:04}.md", index % 2_000);
            let tag = format!("topic-{:03}", index % 125);
            tx.execute(
                "INSERT OR IGNORE INTO tags(note_id, tag, is_explicit) VALUES(?, ?, 1)",
                rusqlite::params![note_id, tag],
            )
            .unwrap();
        }
        tx.commit().unwrap();

        let started = Instant::now();
        let graph = space_connections_for_conn(&conn, 1_000, 250).unwrap();
        let elapsed = started.elapsed();
        println!("space_connections synthetic scale duration: {elapsed:?}");

        assert!(graph.truncated);
        assert_eq!(graph.nodes.len(), 1_000);
    }
}
