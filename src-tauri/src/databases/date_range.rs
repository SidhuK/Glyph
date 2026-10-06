use chrono::NaiveDate;

use super::filter::parse_cell_date;
use super::query::cell_value_from_row;
use super::types::{DatabaseColumn, DatabaseDateRange, DatabaseRow, DatabaseViewDefinition};

// A month grid spans six weeks; anything wider is a caller bug, not a calendar.
const MAX_RANGE_DAYS: i64 = 62;

enum Bounds {
    Range { start: NaiveDate, end: NaiveDate },
    Undated,
}

pub(super) struct DateRangeFilter {
    start_column: DatabaseColumn,
    end_column: Option<DatabaseColumn>,
    bounds: Bounds,
}

fn parse_bound(value: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
        .map_err(|_| format!("invalid calendar date '{value}'"))
}

fn find_column(catalog: &[DatabaseColumn], id: Option<&str>) -> Option<DatabaseColumn> {
    let id = id?;
    catalog.iter().find(|column| column.id == id).cloned()
}

fn cell_date(row: &DatabaseRow, column: &DatabaseColumn) -> Option<NaiveDate> {
    cell_value_from_row(row, column)
        .value_text
        .as_deref()
        .and_then(parse_cell_date)
}

impl DateRangeFilter {
    pub(super) fn resolve(
        catalog: &[DatabaseColumn],
        view: &DatabaseViewDefinition,
        range: &DatabaseDateRange,
    ) -> Result<Self, String> {
        let start_column = find_column(catalog, view.calendar_date_column.as_deref())
            .ok_or_else(|| "calendar view has no date column".to_string())?;
        let bounds = match range {
            DatabaseDateRange::Undated => Bounds::Undated,
            DatabaseDateRange::Range { start, end } => {
                let start = parse_bound(start)?;
                let end = parse_bound(end)?;
                if end < start || (end - start).num_days() > MAX_RANGE_DAYS {
                    return Err("calendar date range is out of bounds".to_string());
                }
                Bounds::Range { start, end }
            }
        };
        Ok(Self {
            start_column,
            end_column: find_column(catalog, view.calendar_end_date_column.as_deref()),
            bounds,
        })
    }

    pub(super) fn column_ids(&self) -> impl Iterator<Item = &String> {
        std::iter::once(&self.start_column.id).chain(self.end_column.iter().map(|c| &c.id))
    }

    /// Multi-day rows match when any day between their start and end overlaps
    /// the window; an end before the start collapses to a single day.
    pub(super) fn matches(&self, row: &DatabaseRow) -> bool {
        let start = cell_date(row, &self.start_column);
        match (&self.bounds, start) {
            (Bounds::Undated, start) => start.is_none(),
            (Bounds::Range { .. }, None) => false,
            (
                Bounds::Range {
                    start: from,
                    end: to,
                },
                Some(start),
            ) => {
                let end = self
                    .end_column
                    .as_ref()
                    .and_then(|column| cell_date(row, column))
                    .filter(|end| *end >= start)
                    .unwrap_or(start);
                start <= *to && end >= *from
            }
        }
    }
}
