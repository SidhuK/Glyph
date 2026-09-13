use chrono::NaiveDate;

pub fn date(value: &str) -> Option<NaiveDate> {
    if value.len() != 10 {
        return None;
    }
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .ok()
        .filter(|d| d.format("%Y-%m-%d").to_string() == value)
}

// Only recognize a valid trailing date; ordinary task text remains untouched.
pub fn split_metadata(text: &str) -> (String, Option<String>) {
    let body = text.trim_end();
    if let Some((prefix, value)) = body.rsplit_once(" 📅 ") {
        if date(value).is_some() {
            return (prefix.to_string(), Some(value.to_string()));
        }
    }
    (body.to_string(), None)
}

pub fn with_metadata(text: &str, due: Option<&str>) -> String {
    match due {
        Some(due) => format!("{text} 📅 {due}"),
        None => text.to_string(),
    }
}
