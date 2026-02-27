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
        _ => "text",
    }
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

pub fn delete_note_properties(
    tx: &rusqlite::Transaction<'_>,
    note_id: &str,
) -> Result<(), String> {
    tx.execute("DELETE FROM note_properties WHERE note_id = ?", [note_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
