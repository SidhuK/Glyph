use std::collections::HashSet;

use crate::index::commands::normalize_folder_prefix;
use crate::index::tags::{normalize_tag, tag_matches_hierarchy, PEOPLE_TAG_NAMESPACE};

use super::api::{TaskQueryFilters, TaskRecord};
use super::types::TaskStatusKind;

pub(super) struct TaskFilter<'a> {
    filters: &'a TaskQueryFilters,
    note_paths: HashSet<&'a str>,
    folder_prefixes: Vec<String>,
    tags: Vec<String>,
}

impl<'a> TaskFilter<'a> {
    pub fn new(filters: &'a TaskQueryFilters) -> Self {
        Self {
            filters,
            note_paths: filters.note_paths.iter().map(String::as_str).collect(),
            folder_prefixes: filters
                .folder_prefixes
                .iter()
                .filter_map(|prefix| normalize_folder_prefix(Some(prefix.clone())))
                .map(|prefix| format!("{prefix}/"))
                .collect(),
            tags: filters
                .tags
                .iter()
                .filter_map(|tag| normalize_tag(tag))
                .filter(|tag| !tag.starts_with(PEOPLE_TAG_NAMESPACE))
                .collect(),
        }
    }

    pub fn matches(&self, record: &TaskRecord, note_tags: &[String]) -> bool {
        self.matches_location(record)
            && self.matches_tags(record, note_tags)
            && self.matches_status(record.status_kind)
            && self.matches_priority(record.priority)
            && self.matches_due(record.due.as_deref())
    }

    fn matches_location(&self, record: &TaskRecord) -> bool {
        let path = record.note_path.as_str();
        (self.note_paths.is_empty() || self.note_paths.contains(path))
            && (self.folder_prefixes.is_empty()
                || self
                    .folder_prefixes
                    .iter()
                    .any(|prefix| path.starts_with(prefix.as_str())))
    }

    fn matches_tags(&self, record: &TaskRecord, note_tags: &[String]) -> bool {
        self.filters.tags.is_empty()
            || self.tags.iter().any(|tag| {
                record
                    .tags
                    .iter()
                    .chain(note_tags)
                    .any(|candidate| tag_matches_hierarchy(tag, candidate))
            })
    }

    fn matches_status(&self, kind: TaskStatusKind) -> bool {
        self.filters.statuses.is_empty() || self.filters.statuses.contains(&kind)
    }

    fn matches_priority(&self, priority: Option<u8>) -> bool {
        let filters = self.filters;
        if filters.priorities.is_empty() && !filters.include_no_priority {
            return true;
        }
        match priority {
            Some(priority) => filters.priorities.contains(&priority),
            None => filters.include_no_priority,
        }
    }

    fn matches_due(&self, due: Option<&str>) -> bool {
        let filters = self.filters;
        let before = filters.due_before.as_deref();
        let after = filters.due_after.as_deref();
        if before.is_none() && after.is_none() && !filters.due_none {
            return true;
        }
        match due {
            None => filters.due_none,
            Some(due) => {
                (before.is_some() || after.is_some())
                    && before.is_none_or(|before| due < before)
                    && after.is_none_or(|after| due > after)
            }
        }
    }
}
