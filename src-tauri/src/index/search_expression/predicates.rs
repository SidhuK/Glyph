use chrono::{Datelike, Local, NaiveDate};
use rusqlite::types::Value;

use super::Scope;

use crate::index::people_mentions_as_tags_enabled;
use crate::index::tags::{normalize_tag, person_handle_to_tag};

pub(super) fn compile_term(
    term: &str,
    literal: bool,
    scope: Scope,
    params: &mut Vec<Value>,
) -> Result<String, String> {
    if !literal {
        if let Some((field, value)) = term.split_once(':') {
            let field = field.to_lowercase();
            if value.is_empty() {
                return Err("Search filter needs a value".to_string());
            }
            match field.as_str() {
                "folder" => {
                    let folder = value.trim_matches('/');
                    if folder.is_empty() || folder.split('/').any(|part| part == ".." || part == ".") {
                        return Err("Search folder must be a relative folder path".to_string());
                    }
                    params.push(Value::from(format!("{folder}/")));
                    return Ok("instr(n.path, ?) = 1".to_string());
                }
                "created" | "updated" => return date_predicate(&field, value, params),
                "has" | "missing" => {
                    params.push(Value::from(value.to_lowercase()));
                    return Ok(format!("{}EXISTS (SELECT 1 FROM note_properties p WHERE p.note_id = n.id AND lower(p.key) = ?)", if field == "missing" { "NOT " } else { "" }));
                }
                "property" => {
                    let (key, value) = value.split_once('=').ok_or("Property filter needs key=value")?;
                    if key.trim().is_empty() {
                        return Err("Property filter needs a key".to_string());
                    }
                    params.push(Value::from(key.to_lowercase()));
                    params.push(Value::from(value.to_lowercase()));
                    params.push(Value::from(value.to_lowercase()));
                    return Ok("EXISTS (SELECT 1 FROM note_properties p WHERE p.note_id = n.id AND lower(p.key) = ? AND (lower(p.value_text) = ? OR (json_type(p.value_json) = 'array' AND EXISTS (SELECT 1 FROM json_each(p.value_json) j WHERE lower(CAST(j.value AS TEXT)) = ?))))".to_string());
                }
                "tag" => return tag_predicate(value, params),
                "person" if people_mentions_as_tags_enabled() => return person_predicate(value, params),
                "title" => return Ok(text_predicate(value, true, params)),
                "text" => return Ok(text_predicate(value, false, params)),
                _ => {}
            }
        }
        if term.starts_with('#') {
            return tag_predicate(term, params);
        }
        if term.starts_with('@') && people_mentions_as_tags_enabled() {
            return person_predicate(term, params);
        }
    }
    if scope == Scope::Tag {
        return tag_predicate(term, params);
    }
    Ok(text_predicate(term, scope == Scope::Title, params))
}

fn text_predicate(value: &str, title_only: bool, params: &mut Vec<Value>) -> String {
    params.push(Value::from(value.to_string()));
    if title_only {
        return "instr(lower(n.title), lower(?)) > 0".to_string();
    }
    params.push(Value::from(value.to_string()));
    "(instr(lower(n.title), lower(?)) > 0 OR n.id IN (SELECT f.id FROM notes_fts f WHERE instr(lower(f.body), lower(?)) > 0))".to_string()
}

fn tag_predicate(value: &str, params: &mut Vec<Value>) -> Result<String, String> {
    let tag = normalize_tag(value).ok_or("Invalid search tag")?;
    params.push(Value::from(tag));
    Ok("EXISTS (SELECT 1 FROM tags t WHERE t.note_id = n.id AND t.tag = ?)".to_string())
}

fn person_predicate(value: &str, params: &mut Vec<Value>) -> Result<String, String> {
    let handle = person_handle_to_tag(value).ok_or("Invalid search person")?;
    tag_predicate(&handle, params)
}

fn date_predicate(field: &str, value: &str, params: &mut Vec<Value>) -> Result<String, String> {
    // Compare calendar dates in the user's timezone. Relative dates are resolved on every run.
    let column = match field {
        "created" => "date(n.created, 'localtime')",
        _ => "date(n.updated, 'localtime')",
    };
    let today = Local::now().date_naive();
    if value == "this-month" {
        let start = today.with_day(1).ok_or("Invalid current date")?;
        let end = start.checked_add_months(chrono::Months::new(1)).ok_or("Invalid current date")?;
        params.push(Value::from(start.to_string()));
        params.push(Value::from(end.to_string()));
        return Ok(format!("({column} >= ? AND {column} < ?)"));
    }
    if value == "today" {
        params.push(Value::from(today.to_string()));
        return Ok(format!("{column} = ?"));
    }
    if let Some((start, end)) = value.split_once("..") {
        let start = parse_date(start)?;
        let end = parse_date(end)?;
        if start > end {
            return Err("Search date range ends before it starts".to_string());
        }
        params.push(Value::from(start.to_string()));
        params.push(Value::from(end.to_string()));
        return Ok(format!("({column} >= ? AND {column} <= ?)"));
    }
    let (operator, date) = [">=", "<=", ">", "<", "="]
        .into_iter()
        .find_map(|op| value.strip_prefix(op).map(|date| (op, date)))
        .unwrap_or(("=", value));
    params.push(Value::from(parse_date(date)?.to_string()));
    Ok(format!("{column} {operator} ?"))
}

fn parse_date(value: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .ok()
        .filter(|date| date.to_string() == value)
        .ok_or_else(|| "Search dates must use YYYY-MM-DD, today, or this-month".to_string())
}
