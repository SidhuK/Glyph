use super::query::field_catalog;
use super::store::default_view;
use super::types::{
    default_gallery_card_size, DatabaseColumn, DatabaseDefinition, DatabaseViewDefinition,
};

fn is_supported_layout(layout: &str) -> bool {
    matches!(layout, "table" | "board" | "calendar" | "gallery")
}

fn is_date_column(column: &DatabaseColumn) -> bool {
    column.column_type == "property"
        && column.property_key.is_some()
        && column.property_kind.as_deref() == Some("date")
}

fn known_date_column(catalog: &[DatabaseColumn], id: Option<&str>) -> Option<String> {
    let id = id?;
    catalog
        .iter()
        .find(|column| column.id == id && is_date_column(column))
        .map(|column| column.id.clone())
}

fn normalize_gallery_cover(catalog: &[DatabaseColumn], cover: Option<&str>) -> Option<String> {
    match cover? {
        "none" => Some("none".to_string()),
        value => {
            let column_id = value.strip_prefix("property:")?;
            catalog
                .iter()
                .any(|column| column.id == column_id && column.column_type == "property")
                .then(|| value.to_string())
        }
    }
}

fn normalize_view_settings(database: &DatabaseDefinition, view: &mut DatabaseViewDefinition) {
    let catalog = field_catalog(database, view);
    view.calendar_date_column = known_date_column(&catalog, view.calendar_date_column.as_deref())
        .or_else(|| {
            catalog
                .iter()
                .find(|column| is_date_column(column))
                .map(|column| column.id.clone())
        });
    view.calendar_end_date_column =
        known_date_column(&catalog, view.calendar_end_date_column.as_deref())
            .filter(|id| view.calendar_date_column.as_deref() != Some(id.as_str()));
    view.gallery_cover = normalize_gallery_cover(&catalog, view.gallery_cover.as_deref());
    if !matches!(
        view.gallery_card_size.as_str(),
        "small" | "medium" | "large"
    ) {
        view.gallery_card_size = default_gallery_card_size();
    }
}

/// Drops views with layouts this build cannot render and repairs per-layout
/// settings that reference columns which no longer exist.
pub(super) fn normalize_database_views(database: &mut DatabaseDefinition) {
    database
        .views
        .retain(|view| is_supported_layout(&view.layout));
    if database.views.is_empty() {
        database.views.push(default_view("View 1"));
    }
    let mut views = std::mem::take(&mut database.views);
    for view in &mut views {
        normalize_view_settings(database, view);
    }
    database.views = views;
}
