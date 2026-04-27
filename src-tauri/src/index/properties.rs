use chrono::NaiveDate;
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
    if is_status_key(key) {
        return "status";
    }

    match value {
        Value::Bool(_) => "checkbox",
        Value::Sequence(_) if key.eq_ignore_ascii_case("tags") => "tags",
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
    "text"
}

fn normalized_status_text(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .replace(['_', '-'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn is_status_key(key: &str) -> bool {
    let normalized = normalized_status_text(key);
    normalized == "status" || normalized.ends_with(" status")
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
    use serde_yaml::Value;

    use super::property_kind;

    #[test]
    fn keeps_frontmatter_property_kinds_minimal() {
        assert_eq!(
            property_kind("published", &Value::String("2026-03-12".to_string())),
            "date"
        );
        assert_eq!(
            property_kind(
                "starts_at",
                &Value::String("2026-03-12T09:30:00+05:30".to_string()),
            ),
            "text"
        );
        assert_eq!(
            property_kind("status", &Value::String("In Progress".to_string())),
            "status"
        );
        assert_eq!(
            property_kind("stage", &Value::String("blocked".to_string())),
            "text"
        );
        assert_eq!(
            property_kind("status", &Value::String("someday".to_string())),
            "status"
        );
        assert_eq!(
            property_kind("review status", &Value::String("idea".to_string())),
            "status"
        );
        assert_eq!(property_kind("count", &Value::Number(3.into())), "text");
    }
}
