use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use serde_yaml::Value;

use super::frontmatter::split_frontmatter;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrontmatterRelationship {
    pub field_key: String,
    pub target_title: String,
    pub ordinal: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct NoteRelationship {
    pub from_id: String,
    pub field_key: String,
    pub to_id: Option<String>,
    pub to_title: Option<String>,
    pub target_title: String,
    pub ordinal: i64,
}

pub fn parse_frontmatter_relationships(markdown: &str) -> Vec<FrontmatterRelationship> {
    let (yaml, _body) = split_frontmatter(markdown);
    if yaml.trim().is_empty() {
        return Vec::new();
    }

    let Ok(value) = serde_yaml::from_str::<Value>(yaml) else {
        return Vec::new();
    };
    let Some(mapping) = value.as_mapping() else {
        return Vec::new();
    };

    let mut out = Vec::new();
    for (key, value) in mapping {
        let Some(key) = key.as_str() else {
            continue;
        };
        collect_relationship_values(key, value, &mut out);
    }
    out
}

pub fn delete_note_relationships(conn: &Connection, note_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM note_relationships WHERE from_id = ?",
        [note_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn reindex_note_relationships(
    conn: &Connection,
    note_id: &str,
    markdown: &str,
) -> Result<(), String> {
    delete_note_relationships(conn, note_id)?;
    insert_note_relationships(conn, note_id, parse_frontmatter_relationships(markdown))
}

pub fn ensure_note_relationships_indexed(
    conn: &Connection,
    note_id: &str,
    markdown: &str,
) -> Result<(), String> {
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM note_relationships WHERE from_id = ? LIMIT 1)",
            [note_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if exists {
        return Ok(());
    }
    let relationships = parse_frontmatter_relationships(markdown);
    if relationships.is_empty() {
        return Ok(());
    }
    insert_note_relationships(conn, note_id, relationships)
}

pub fn insert_note_relationships(
    conn: &Connection,
    note_id: &str,
    relationships: Vec<FrontmatterRelationship>,
) -> Result<(), String> {
    for relationship in relationships {
        let to_id = resolve_title_to_id(conn, &relationship.target_title)?;
        let to_title = if to_id.is_some() {
            None
        } else {
            Some(relationship.target_title.clone())
        };
        conn.execute(
            "INSERT OR REPLACE INTO note_relationships(from_id, field_key, to_id, to_title, target_title, ordinal)
             VALUES(?, ?, ?, ?, ?, ?)",
            rusqlite::params![
                note_id,
                relationship.field_key,
                to_id,
                to_title,
                relationship.target_title,
                relationship.ordinal,
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn query_note_relationships(
    conn: &Connection,
    note_id: &str,
) -> Result<Vec<NoteRelationship>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT from_id, field_key, to_id, to_title, target_title, ordinal
             FROM note_relationships
             WHERE from_id = ?
             ORDER BY field_key COLLATE NOCASE, ordinal, target_title COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([note_id]).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        out.push(NoteRelationship {
            from_id: row.get(0).map_err(|e| e.to_string())?,
            field_key: row.get(1).map_err(|e| e.to_string())?,
            to_id: row.get(2).map_err(|e| e.to_string())?,
            to_title: row.get(3).map_err(|e| e.to_string())?,
            target_title: row.get(4).map_err(|e| e.to_string())?,
            ordinal: row.get(5).map_err(|e| e.to_string())?,
        });
    }
    Ok(out)
}

fn collect_relationship_values(key: &str, value: &Value, out: &mut Vec<FrontmatterRelationship>) {
    match value {
        Value::String(text) => {
            for (ordinal, target) in extract_wikilink_targets(text).into_iter().enumerate() {
                out.push(FrontmatterRelationship {
                    field_key: key.to_string(),
                    target_title: target,
                    ordinal: ordinal as i64,
                });
            }
        }
        Value::Sequence(items) => {
            let mut ordinal = 0_i64;
            for item in items {
                let targets = match item {
                    Value::String(text) => extract_wikilink_targets(text),
                    Value::Sequence(nested) => collect_unquoted_wikilink_targets(nested),
                    _ => Vec::new(),
                };
                for target in targets {
                    out.push(FrontmatterRelationship {
                        field_key: key.to_string(),
                        target_title: target,
                        ordinal,
                    });
                    ordinal += 1;
                }
            }
        }
        _ => {}
    }
}

fn collect_unquoted_wikilink_targets(items: &[Value]) -> Vec<String> {
    items
        .iter()
        .filter_map(|item| match item {
            Value::String(text) => Some(text.trim().to_string()),
            _ => None,
        })
        .filter(|text| !text.is_empty())
        .collect()
}

fn extract_wikilink_targets(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut i = 0;
    let bytes = text.as_bytes();
    while i + 4 <= bytes.len() {
        if bytes[i] == b'[' && bytes[i + 1] == b'[' {
            if let Some(end) = text[i + 2..].find("]]") {
                let inner = &text[i + 2..i + 2 + end];
                let target = inner
                    .split('|')
                    .next()
                    .unwrap_or(inner)
                    .split('#')
                    .next()
                    .unwrap_or(inner)
                    .trim();
                if !target.is_empty() {
                    out.push(target.to_string());
                }
                i += 2 + end + 2;
                continue;
            }
        }
        i += 1;
    }
    out
}

fn resolve_title_to_id(conn: &Connection, title: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT id FROM notes WHERE title = ? COLLATE NOCASE ORDER BY updated DESC LIMIT 1",
        [title],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::{
        ensure_note_relationships_indexed, parse_frontmatter_relationships,
        reindex_note_relationships,
    };
    use crate::index::schema::ensure_schema;

    #[test]
    fn parses_scalar_list_alias_and_heading_relationships() {
        let markdown = r#"---
project: [[Launch]]
related:
  - "[[Pricing]] and [[Budget]]"
  - "[[Onboarding|Start here]]"
source: "[[Research#Section]]"
plain: no link
---
Body
"#;

        let relationships = parse_frontmatter_relationships(markdown);
        let values = relationships
            .iter()
            .map(|item| {
                (
                    item.field_key.as_str(),
                    item.target_title.as_str(),
                    item.ordinal,
                )
            })
            .collect::<Vec<_>>();

        assert_eq!(
            values,
            vec![
                ("project", "Launch", 0),
                ("related", "Pricing", 0),
                ("related", "Budget", 1),
                ("related", "Onboarding", 2),
                ("source", "Research", 0),
            ]
        );
    }

    #[test]
    fn reindex_removes_stale_relationships() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        conn.execute(
            "INSERT INTO notes(id, title, created, updated, path, etag, preview)
             VALUES('a.md', 'A', '2026-01-01', '2026-01-01', 'a.md', 'a', '')",
            [],
        )
        .unwrap();

        reindex_note_relationships(&conn, "source.md", "---\nproject: [[A]]\n---\n").unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM note_relationships", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);

        reindex_note_relationships(&conn, "source.md", "---\nproject: none\n---\n").unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM note_relationships", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn ensure_indexes_missing_rows_for_unchanged_notes() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        conn.execute(
            "INSERT INTO notes(id, title, created, updated, path, etag, preview)
             VALUES('a.md', 'A', '2026-01-01', '2026-01-01', 'a.md', 'a', '')",
            [],
        )
        .unwrap();

        ensure_note_relationships_indexed(&conn, "source.md", "---\nproject: [[A]]\n---\n")
            .unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM note_relationships", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
    }
}
