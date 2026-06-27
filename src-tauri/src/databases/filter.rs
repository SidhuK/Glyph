use chrono::Datelike;

use crate::index::tags::{normalize_tag, tag_matches_hierarchy};

use super::query::{cell_text_values, cell_value_from_row, normalize_text};
use super::types::{DatabaseColumn, DatabaseFilter, DatabaseRow};

fn normalize_tag_text(value: &str) -> Option<String> {
    normalize_tag(value)
}

fn date_matches_shortcut(value: &str, shortcut: &str) -> bool {
    let date = match chrono::DateTime::parse_from_rfc3339(value) {
        Ok(parsed) => parsed.with_timezone(&chrono::Local).date_naive(),
        Err(_) => match chrono::NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d") {
            Ok(parsed) => parsed,
            Err(_) => return false,
        },
    };
    let today = chrono::Local::now().date_naive();
    match normalize_text(shortcut).as_str() {
        "today" => date == today,
        "yesterday" => date == today - chrono::Days::new(1),
        "overdue" => date < today,
        "this week" => {
            let days_since_monday = today.weekday().num_days_from_monday();
            let week_start = today - chrono::Days::new(days_since_monday as u64);
            let days_until_sunday = 6 - today.weekday().num_days_from_monday();
            let week_end = today + chrono::Days::new(days_until_sunday as u64);
            date >= week_start && date <= week_end
        }
        "last 7 days" => date >= today - chrono::Days::new(6) && date <= today,
        "last 30 days" => date >= today - chrono::Days::new(29) && date <= today,
        _ => false,
    }
}

fn parse_filter_number(value: &str) -> Option<f64> {
    let normalized = value.trim().replace(['$', ',', '%'], "");
    let parsed = normalized.parse::<f64>().ok()?;
    parsed.is_finite().then_some(parsed)
}

pub(super) fn row_matches_filters(
    row: &DatabaseRow,
    columns: &[DatabaseColumn],
    filters: &[DatabaseFilter],
) -> bool {
    filters.iter().all(|filter| {
        if filter.operator == "within_last_7_days" {
            let Some(column) = columns.iter().find(|entry| entry.id == filter.column_id) else {
                return false;
            };
            let cell = cell_value_from_row(row, column);
            let Some(value) = cell.value_text.as_deref() else {
                return false;
            };
            return date_matches_shortcut(
                value,
                filter.value_text.as_deref().unwrap_or("Last 7 Days"),
            );
        }
        let Some(column) = columns.iter().find(|entry| entry.id == filter.column_id) else {
            return false;
        };
        let cell = cell_value_from_row(row, column);
        let is_tags_column =
            column.column_type == "tags" || column.property_kind.as_deref() == Some("tags");
        let raw_filter_text = filter.value_text.as_deref().unwrap_or_default();
        let filter_text = if is_tags_column {
            String::new()
        } else {
            normalize_text(raw_filter_text)
        };
        let normalized_filter_tag = if is_tags_column {
            normalize_tag_text(raw_filter_text)
        } else {
            None
        };
        let text_values: Vec<String> = if is_tags_column {
            cell.value_list
                .iter()
                .filter_map(|v| normalize_tag_text(v))
                .collect()
        } else {
            cell_text_values(&cell)
        };
        match filter.operator.as_str() {
            "equals" => {
                if is_tags_column {
                    normalized_filter_tag
                        .as_ref()
                        .is_some_and(|tag| text_values.iter().any(|value| value == tag))
                } else {
                    !filter_text.is_empty() && text_values.iter().any(|value| value == &filter_text)
                }
            }
            "not_equals" => {
                if is_tags_column {
                    normalized_filter_tag
                        .as_ref()
                        .is_some_and(|tag| text_values.iter().all(|value| value != tag))
                } else {
                    filter_text.is_empty() || text_values.iter().all(|value| value != &filter_text)
                }
            }
            "contains" => {
                if is_tags_column {
                    false
                } else {
                    filter_text.is_empty()
                        || text_values.iter().any(|value| value.contains(&filter_text))
                }
            }
            "not_contains" => {
                if is_tags_column {
                    false
                } else {
                    filter_text.is_empty()
                        || text_values
                            .iter()
                            .all(|value| !value.contains(&filter_text))
                }
            }
            "starts_with" => {
                if is_tags_column {
                    false
                } else {
                    filter_text.is_empty()
                        || text_values
                            .iter()
                            .any(|value| value.starts_with(&filter_text))
                }
            }
            "ends_with" => {
                if is_tags_column {
                    false
                } else {
                    filter_text.is_empty()
                        || text_values
                            .iter()
                            .any(|value| value.ends_with(&filter_text))
                }
            }
            "greater_than" | "less_than" => {
                if is_tags_column {
                    false
                } else {
                    let Some(filter_number) = parse_filter_number(raw_filter_text) else {
                        return false;
                    };
                    text_values
                        .iter()
                        .filter_map(|value| parse_filter_number(value))
                        .any(|value| {
                            if filter.operator == "greater_than" {
                                value > filter_number
                            } else {
                                value < filter_number
                            }
                        })
                }
            }
            "tags_contains" => normalized_filter_tag.as_ref().is_some_and(|filter_tag| {
                text_values
                    .iter()
                    .any(|tag| tag_matches_hierarchy(filter_tag, tag))
            }),
            "is_empty" => text_values.is_empty() && cell.value_bool.is_none(),
            "is_not_empty" => !text_values.is_empty() || cell.value_bool.is_some(),
            "is_true" => cell.value_bool == Some(true),
            "is_false" => cell.value_bool == Some(false),
            "any_of" => {
                let filter_values = if filter.value_list.is_empty() {
                    filter
                        .value_text
                        .clone()
                        .map(|value| vec![value])
                        .unwrap_or_default()
                } else {
                    filter.value_list.clone()
                };
                if filter_values.is_empty() {
                    return true;
                }
                let normalized_tag_filters = if is_tags_column {
                    let filters = filter_values
                        .iter()
                        .map(|value| normalize_tag_text(value))
                        .collect::<Option<Vec<_>>>();
                    let Some(filters) = filters else {
                        return false;
                    };
                    Some(filters)
                } else {
                    None
                };
                if let Some(filters) = normalized_tag_filters {
                    filters.iter().any(|normalized| {
                        text_values
                            .iter()
                            .any(|cell_value| tag_matches_hierarchy(normalized, cell_value))
                    })
                } else {
                    filter_values.iter().any(|value| {
                        let normalized = normalize_text(value);
                        text_values
                            .iter()
                            .any(|cell_value| cell_value == &normalized)
                    })
                }
            }
            "none_of" => {
                let filter_values = if filter.value_list.is_empty() {
                    filter
                        .value_text
                        .clone()
                        .map(|value| vec![value])
                        .unwrap_or_default()
                } else {
                    filter.value_list.clone()
                };
                let normalized_tag_filters = if is_tags_column {
                    let filters = filter_values
                        .iter()
                        .map(|value| normalize_tag_text(value))
                        .collect::<Option<Vec<_>>>();
                    let Some(filters) = filters else {
                        return false;
                    };
                    Some(filters)
                } else {
                    None
                };
                if let Some(filters) = normalized_tag_filters {
                    filters.iter().all(|normalized| {
                        text_values
                            .iter()
                            .all(|cell_value| !tag_matches_hierarchy(normalized, cell_value))
                    })
                } else {
                    filter_values.iter().all(|value| {
                        let normalized = normalize_text(value);
                        text_values
                            .iter()
                            .all(|cell_value| cell_value != &normalized)
                    })
                }
            }
            _ => false,
        }
    })
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::super::types::DatabaseCellValue;
    use super::*;

    fn tags_column() -> DatabaseColumn {
        DatabaseColumn {
            id: "tags".to_string(),
            column_type: "tags".to_string(),
            label: "Tags".to_string(),
            icon: None,
            width: None,
            visible: true,
            property_key: None,
            property_kind: None,
        }
    }

    fn title_column() -> DatabaseColumn {
        DatabaseColumn {
            id: "title".to_string(),
            column_type: "title".to_string(),
            label: "Title".to_string(),
            icon: None,
            width: None,
            visible: true,
            property_key: None,
            property_kind: None,
        }
    }

    fn folder_column() -> DatabaseColumn {
        DatabaseColumn {
            id: "folder".to_string(),
            column_type: "folder".to_string(),
            label: "Folder".to_string(),
            icon: None,
            width: None,
            visible: true,
            property_key: None,
            property_kind: None,
        }
    }

    fn number_property_column(key: &str) -> DatabaseColumn {
        DatabaseColumn {
            id: format!("property:{key}"),
            column_type: "property".to_string(),
            label: key.to_string(),
            icon: None,
            width: None,
            visible: true,
            property_key: Some(key.to_string()),
            property_kind: Some("number".to_string()),
        }
    }

    fn sample_row(tags: Vec<&str>) -> DatabaseRow {
        DatabaseRow {
            note_path: "notes/child.md".to_string(),
            title: "Child".to_string(),
            folder: "notes".to_string(),
            created: "2026-03-24T10:00:00Z".to_string(),
            updated: "2026-03-24T10:00:00Z".to_string(),
            preview: String::new(),
            tags: tags.into_iter().map(str::to_string).collect(),
            linked_notes: Vec::new(),
            properties: BTreeMap::new(),
        }
    }

    #[test]
    fn tag_filters_match_descendant_explicit_tags() {
        let columns = vec![tags_column()];
        let row = sample_row(vec!["work/today/further"]);
        let filters = vec![DatabaseFilter {
            column_id: "tags".to_string(),
            operator: "tags_contains".to_string(),
            value_text: Some("#work".to_string()),
            value_bool: None,
            value_list: Vec::new(),
        }];

        assert!(row_matches_filters(&row, &columns, &filters));

        let non_matching_filters = vec![DatabaseFilter {
            column_id: "tags".to_string(),
            operator: "tags_contains".to_string(),
            value_text: Some("#personal".to_string()),
            value_bool: None,
            value_list: Vec::new(),
        }];
        assert!(!row_matches_filters(&row, &columns, &non_matching_filters));
    }

    #[test]
    fn malformed_tag_filters_fail_closed() {
        let columns = vec![tags_column()];
        let row = sample_row(vec!["work/today/further"]);
        let filters = vec![DatabaseFilter {
            column_id: "tags".to_string(),
            operator: "tags_contains".to_string(),
            value_text: Some("#work//today".to_string()),
            value_bool: None,
            value_list: Vec::new(),
        }];

        assert!(!row_matches_filters(&row, &columns, &filters));
    }

    #[test]
    fn unsupported_string_operators_fail_closed_for_tag_columns() {
        let columns = vec![tags_column()];
        let row = sample_row(vec!["work/today/further"]);
        let filters = vec![DatabaseFilter {
            column_id: "tags".to_string(),
            operator: "contains".to_string(),
            value_text: Some("work".to_string()),
            value_bool: None,
            value_list: Vec::new(),
        }];

        assert!(!row_matches_filters(&row, &columns, &filters));
    }

    #[test]
    fn unknown_filter_columns_fail_closed() {
        let columns = vec![title_column()];
        let row = sample_row(Vec::new());
        let filters = vec![DatabaseFilter {
            column_id: "missing".to_string(),
            operator: "contains".to_string(),
            value_text: Some("Child".to_string()),
            value_bool: None,
            value_list: Vec::new(),
        }];

        assert!(!row_matches_filters(&row, &columns, &filters));
    }

    #[test]
    fn multiple_filters_must_all_match() {
        let columns = vec![title_column(), tags_column()];
        let row = sample_row(vec!["work"]);
        let filters = vec![
            DatabaseFilter {
                column_id: "title".to_string(),
                operator: "contains".to_string(),
                value_text: Some("Child".to_string()),
                value_bool: None,
                value_list: Vec::new(),
            },
            DatabaseFilter {
                column_id: "tags".to_string(),
                operator: "tags_contains".to_string(),
                value_text: Some("#personal".to_string()),
                value_bool: None,
                value_list: Vec::new(),
            },
        ];

        assert!(!row_matches_filters(&row, &columns, &filters));
    }

    #[test]
    fn folder_filters_match_exact_folder_values() {
        let columns = vec![folder_column()];
        let row = sample_row(Vec::new());
        let matching_filters = vec![DatabaseFilter {
            column_id: "folder".to_string(),
            operator: "equals".to_string(),
            value_text: Some("notes".to_string()),
            value_bool: None,
            value_list: Vec::new(),
        }];
        let unrelated_filters = vec![DatabaseFilter {
            column_id: "folder".to_string(),
            operator: "equals".to_string(),
            value_text: Some("archive".to_string()),
            value_bool: None,
            value_list: Vec::new(),
        }];

        assert!(row_matches_filters(&row, &columns, &matching_filters));
        assert!(!row_matches_filters(&row, &columns, &unrelated_filters));
    }

    #[test]
    fn invalid_number_filters_fail_closed() {
        let columns = vec![number_property_column("score")];
        let mut row = sample_row(Vec::new());
        row.properties.insert(
            "score".to_string(),
            DatabaseCellValue {
                kind: "number".to_string(),
                value_text: Some("10".to_string()),
                value_bool: None,
                value_list: Vec::new(),
            },
        );
        let filters = vec![DatabaseFilter {
            column_id: "property:score".to_string(),
            operator: "greater_than".to_string(),
            value_text: Some("not a number".to_string()),
            value_bool: None,
            value_list: Vec::new(),
        }];

        assert!(!row_matches_filters(&row, &columns, &filters));
    }
}
