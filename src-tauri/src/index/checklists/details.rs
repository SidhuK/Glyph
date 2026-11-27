use crate::index::tags::{inline_tag_spans, normalize_tag, PEOPLE_TAG_NAMESPACE};

use super::fields::{is_valid_date, priority_from_name, scan_fields, TaskField};
use super::types::{ParsedChecklistItem, TaskFieldKey};

#[derive(Debug, Default, PartialEq)]
pub(crate) struct TaskDetails {
    pub title: String,
    pub due: Option<String>,
    pub priority: Option<u8>,
    pub completion: Option<String>,
    pub cancelled: Option<String>,
    pub tags: Vec<String>,
    pub invalid: Vec<TaskFieldKey>,
}

pub(crate) fn description_fields(markdown: &str, item: &ParsedChecklistItem) -> Vec<TaskField> {
    let offset = item.body_start;
    scan_fields(&markdown[item.description()])
        .into_iter()
        .map(|field| TaskField {
            range: field.range.start + offset..field.range.end + offset,
            ..field
        })
        .collect()
}

pub(crate) fn task_details(markdown: &str, item: &ParsedChecklistItem) -> TaskDetails {
    let description = &markdown[item.description()];
    let fields = scan_fields(description);
    let mut details = TaskDetails::default();
    let mut seen = Vec::new();
    for field in &fields {
        let Some(key) = field.known_key() else {
            continue;
        };
        if seen.contains(&key) {
            continue;
        }
        seen.push(key);
        let valid = match key {
            TaskFieldKey::Priority => {
                details.priority = priority_from_name(&field.value);
                details.priority.is_some()
            }
            TaskFieldKey::Due => set_date(&mut details.due, &field.value),
            TaskFieldKey::Completion => set_date(&mut details.completion, &field.value),
            TaskFieldKey::Cancelled => set_date(&mut details.cancelled, &field.value),
        };
        if !valid {
            details.invalid.push(key);
        }
    }
    details.invalid.sort();
    let visible = without_fields(description, &fields);
    details.tags = line_tags(&visible);
    details.title = visible.split_whitespace().collect::<Vec<_>>().join(" ");
    details
}

fn set_date(slot: &mut Option<String>, value: &str) -> bool {
    let valid = is_valid_date(value);
    if valid {
        *slot = Some(value.to_string());
    }
    valid
}

fn without_fields(description: &str, fields: &[TaskField]) -> String {
    let mut visible = String::with_capacity(description.len());
    let mut cursor = 0;
    for field in fields {
        visible.push_str(&description[cursor..field.range.start]);
        visible.push(' ');
        cursor = field.range.end;
    }
    visible.push_str(&description[cursor..]);
    visible
}

fn line_tags(text: &str) -> Vec<String> {
    let mut tags: Vec<String> = Vec::new();
    for span in inline_tag_spans(text) {
        let Some(tag) = normalize_tag(&text[span]) else {
            continue;
        };
        if !tag.starts_with(PEOPLE_TAG_NAMESPACE) && !tags.contains(&tag) {
            tags.push(tag);
        }
    }
    tags
}
