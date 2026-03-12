use chrono::{DateTime, NaiveDate};
use serde_yaml::Value;

use super::frontmatter::split_frontmatter;

fn property_summary(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::Bool(v) => v.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.clone(),
        Value::Sequence(items) => items
            .iter()
            .map(property_summary)
            .filter(|item| !item.trim().is_empty())
            .collect::<Vec<_>>()
            .join(", "),
        other => serde_yaml::to_string(other)
            .unwrap_or_default()
            .trim()
            .to_string(),
    }
}

fn property_kind(key: &str, value: &Value) -> &'static str {
    match value {
        Value::Bool(_) => "checkbox",
        Value::Number(_) => "number",
        Value::Sequence(_) if key.eq_ignore_ascii_case("tags") => "tags",
        Value::Sequence(_) => "list",
        Value::Mapping(_) => "yaml",
        Value::String(text) => infer_string_kind(text),
        _ => "text",
    }
}

fn infer_string_kind(value: &str) -> &'static str {
    let trimmed = value.trim();
    if trimmed != value {
        return "text";
    }
    if NaiveDate::parse_from_str(trimmed, "%Y-%m-%d")
        .ok()
        .is_some_and(|parsed| parsed.format("%F").to_string() == trimmed)
    {
        return "date";
    }
    if DateTime::parse_from_rfc3339(trimmed).is_ok() {
        return "datetime";
    }
    "text"
}

pub(crate) fn backfill_inferred_string_property_kinds(
    conn: &rusqlite::Connection,
) -> Result<usize, String> {
    let updates = {
        let mut stmt = conn
            .prepare(
                "SELECT note_id, key, value_text
                 FROM note_properties
                 WHERE value_type = 'text'",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        let mut updates = Vec::<(String, String, &'static str)>::new();

        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let note_id = row.get::<_, String>(0).map_err(|e| e.to_string())?;
            let key = row.get::<_, String>(1).map_err(|e| e.to_string())?;
            let value_text = row.get::<_, String>(2).map_err(|e| e.to_string())?;
            let next_kind = infer_string_kind(&value_text);
            if next_kind == "text" {
                continue;
            }
            updates.push((note_id, key, next_kind));
        }

        updates
    };

    if updates.is_empty() {
        return Ok(0);
    }

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for (note_id, key, next_kind) in &updates {
        tx.execute(
            "UPDATE note_properties
             SET value_type = ?
             WHERE note_id = ? AND key = ?",
            rusqlite::params![next_kind, note_id, key],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;

    Ok(updates.len())
}

pub fn reindex_note_properties(
    tx: &rusqlite::Transaction<'_>,
    note_id: &str,
    markdown: &str,
) -> Result<(), String> {
    tx.execute("DELETE FROM note_properties WHERE note_id = ?", [note_id])
        .map_err(|e| e.to_string())?;

    let (yaml, _body) = split_frontmatter(markdown);
    if yaml.is_empty() {
        return Ok(());
    }

    let value = serde_yaml::from_str::<Value>(yaml).map_err(|e| e.to_string())?;
    let Some(mapping) = value.as_mapping() else {
        return Ok(());
    };

    for (ordinal, (key, value)) in mapping.iter().enumerate() {
        let Some(key) = key.as_str() else {
            continue;
        };
        let value_json = serde_json::to_string(value).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT OR REPLACE INTO note_properties(note_id, key, value_type, value_text, value_json, ordinal) VALUES(?, ?, ?, ?, ?, ?)",
            rusqlite::params![
                note_id,
                key,
                property_kind(key, value),
                property_summary(value),
                value_json,
                ordinal as i64
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn delete_note_properties(tx: &rusqlite::Transaction<'_>, note_id: &str) -> Result<(), String> {
    tx.execute("DELETE FROM note_properties WHERE note_id = ?", [note_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};
    use serde_yaml::Value;

    use crate::index::schema::ensure_schema;

    use super::{backfill_inferred_string_property_kinds, property_kind};

    #[test]
    fn infers_date_and_datetime_string_kinds() {
        assert_eq!(
            property_kind("published", &Value::String("2026-03-12".to_string())),
            "date"
        );
        assert_eq!(
            property_kind(
                "starts_at",
                &Value::String("2026-03-12T09:30:00+05:30".to_string()),
            ),
            "datetime"
        );
        assert_eq!(
            property_kind("status", &Value::String("In Progress".to_string())),
            "text"
        );
        assert_eq!(
            property_kind("published", &Value::String(" 2026-03-12 ".to_string())),
            "text"
        );
        assert_eq!(
            property_kind("published", &Value::String("2026-13-12".to_string())),
            "text"
        );
    }

    #[test]
    fn backfills_existing_text_rows_with_date_kinds() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        conn.execute(
            "INSERT INTO note_properties(note_id, key, value_type, value_text, value_json, ordinal)
             VALUES(?, ?, 'text', ?, '\"2026-03-12\"', 0)",
            params!["work/one.md", "published", "2026-03-12"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO note_properties(note_id, key, value_type, value_text, value_json, ordinal)
             VALUES(?, ?, 'text', ?, '\"hello\"', 1)",
            params!["work/one.md", "status", "hello"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO note_properties(note_id, key, value_type, value_text, value_json, ordinal)
             VALUES(?, ?, 'text', ?, '\"2026-03-12T12:34:56Z\"', 2)",
            params![
                "work/one.md",
                "published_at_rfc3339",
                "2026-03-12T12:34:56Z"
            ],
        )
        .unwrap();

        let updated = backfill_inferred_string_property_kinds(&conn).unwrap();

        assert_eq!(updated, 2);
        let published_kind: String = conn
            .query_row(
                "SELECT value_type FROM note_properties WHERE note_id = ? AND key = ?",
                params!["work/one.md", "published"],
                |row| row.get(0),
            )
            .unwrap();
        let published_at_rfc3339_kind: String = conn
            .query_row(
                "SELECT value_type FROM note_properties WHERE note_id = ? AND key = ?",
                params!["work/one.md", "published_at_rfc3339"],
                |row| row.get(0),
            )
            .unwrap();
        let status_kind: String = conn
            .query_row(
                "SELECT value_type FROM note_properties WHERE note_id = ? AND key = ?",
                params!["work/one.md", "status"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(published_kind, "date");
        assert_eq!(published_at_rfc3339_kind, "datetime");
        assert_eq!(status_kind, "text");
    }
}
