use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
};

use chrono::{Datelike, Duration, Local, NaiveDate};
use rusqlite::Connection;
use tauri::{State, WebviewWindow};

use crate::space::SpaceState;

use super::{
    db::open_db,
    types::{UsageActivityDay, UsageFolder, UsageFolderWeek, UsageInsights, UsageTag},
};

fn count(conn: &Connection, sql: &str) -> Result<u32, String> {
    conn.query_row(sql, [], |row| row.get::<_, i64>(0))
        .map(|value| value.max(0) as u32)
        .map_err(|error| error.to_string())
}

fn visible_space_file_bytes(root: &Path) -> Result<u64, String> {
    let mut total = 0_u64;
    let mut directories = vec![root.to_path_buf()];

    while let Some(directory) = directories.pop() {
        let entries = match std::fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.to_string()),
        };
        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                Err(error) => return Err(error.to_string()),
            };
            let name = entry.file_name();
            if crate::utils::should_hide(&name.to_string_lossy()) {
                continue;
            }
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                Err(error) => return Err(error.to_string()),
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                directories.push(entry.path());
            } else if file_type.is_file() {
                let metadata = match entry.metadata() {
                    Ok(metadata) => metadata,
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                    Err(error) => return Err(error.to_string()),
                };
                total = total.saturating_add(metadata.len());
            }
        }
    }

    Ok(total)
}

fn longest_streak(activity: &BTreeMap<String, UsageActivityDay>) -> u32 {
    let mut longest = 0;
    let mut current = 0;
    let mut previous = None;
    for date in activity.keys() {
        let consecutive = previous
            .as_ref()
            .and_then(|previous: &String| {
                chrono::NaiveDate::parse_from_str(previous, "%Y-%m-%d")
                    .ok()?
                    .succ_opt()
                    .map(|next| next.format("%Y-%m-%d").to_string())
            })
            .as_deref()
            == Some(date.as_str());
        current = if consecutive { current + 1 } else { 1 };
        longest = longest.max(current);
        previous = Some(date.clone());
    }
    longest
}

const STREAM_WEEKS: i64 = 12;
const STREAM_DAYS: i64 = 84;
const STREAM_TOP_FOLDERS: usize = 7;
const OTHER_FOLDER: &str = "__other__";

fn folder_created_by_week(conn: &Connection) -> Result<Vec<UsageFolderWeek>, String> {
    let today = Local::now().date_naive();
    let start = today - Duration::days(today.weekday().num_days_from_sunday() as i64 + 77);
    let end = start + Duration::days(STREAM_DAYS - 1);
    let mut statement = conn
        .prepare(
            "SELECT substr(created, 1, 10), \
             CASE WHEN instr(path, '/') = 0 THEN '/' ELSE substr(path, 1, instr(path, '/') - 1) END, \
             COUNT(*) \
             FROM notes WHERE length(created) >= 10 GROUP BY 1, 2",
        )
        .map_err(|error| error.to_string())?;
    let query_rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|error| error.to_string())?;

    let mut folder_totals = BTreeMap::<String, u32>::new();
    let mut cells = BTreeMap::<(String, String), u32>::new();
    for row in query_rows {
        let (date, folder, signed) = row.map_err(|error| error.to_string())?;
        let Ok(parsed) = NaiveDate::parse_from_str(&date, "%Y-%m-%d") else {
            continue;
        };
        if parsed < start || parsed > end {
            continue;
        }
        let week_index = (parsed - start).num_days() / 7;
        if week_index < 0 || week_index >= STREAM_WEEKS {
            continue;
        }
        let week = (start + Duration::days(week_index * 7))
            .format("%Y-%m-%d")
            .to_string();
        let count = signed.max(0) as u32;
        *folder_totals.entry(folder.clone()).or_insert(0) += count;
        *cells.entry((week, folder)).or_insert(0) += count;
    }

    let mut ranked: Vec<(String, u32)> = folder_totals.into_iter().collect();
    ranked.sort_by(|left, right| {
        right
            .1
            .cmp(&left.1)
            .then_with(|| left.0.to_lowercase().cmp(&right.0.to_lowercase()))
    });
    let keep: Vec<String> = ranked
        .iter()
        .take(STREAM_TOP_FOLDERS)
        .map(|(name, _)| name.clone())
        .collect();
    let keep_set: BTreeSet<String> = keep.iter().cloned().collect();
    let mut folders = keep;
    if ranked.len() > STREAM_TOP_FOLDERS {
        folders.push(OTHER_FOLDER.to_string());
    }

    let weeks: Vec<String> = (0..STREAM_WEEKS)
        .map(|index| {
            (start + Duration::days(index * 7))
                .format("%Y-%m-%d")
                .to_string()
        })
        .collect();

    let mut remapped = BTreeMap::<(String, String), u32>::new();
    for ((week, folder), count) in cells {
        let name = if keep_set.contains(&folder) {
            folder
        } else {
            OTHER_FOLDER.to_string()
        };
        *remapped.entry((week, name)).or_insert(0) += count;
    }

    let mut output = Vec::with_capacity(weeks.len() * folders.len());
    for week in &weeks {
        for folder in &folders {
            output.push(UsageFolderWeek {
                week: week.clone(),
                folder: folder.clone(),
                count: remapped
                    .get(&(week.clone(), folder.clone()))
                    .copied()
                    .unwrap_or(0),
            });
        }
    }
    Ok(output)
}

fn usage_insights_for_conn(conn: &Connection, root: &Path) -> Result<UsageInsights, String> {
    let note_count = count(conn, "SELECT COUNT(*) FROM notes")?;
    let task_total = count(conn, "SELECT COALESCE(SUM(checklist_total), 0) FROM notes")?;
    let task_completed = count(
        conn,
        "SELECT COALESCE(SUM(checklist_completed), 0) FROM notes",
    )?;
    let link_count = count(conn, "SELECT COUNT(*) FROM links")?;
    let isolated_note_count = count(conn, "SELECT COUNT(*) FROM notes n WHERE NOT EXISTS (SELECT 1 FROM links l WHERE l.from_id = n.id OR l.to_id = n.id) AND NOT EXISTS (SELECT 1 FROM note_relationships r WHERE r.from_id = n.id OR r.to_id = n.id)")?;
    let tag_count = count(
        conn,
        "SELECT COUNT(DISTINCT tag) FROM tags WHERE tag NOT LIKE 'people/%'",
    )?;
    let daily_notes_count = count(
        conn,
        "SELECT COUNT(*) FROM notes WHERE path GLOB '????-??-??.md' OR path GLOB '*/????-??-??.md'",
    )?;
    let total_file_bytes = visible_space_file_bytes(root)?;

    let mut activity = BTreeMap::<String, UsageActivityDay>::new();
    let mut statement = conn.prepare("SELECT substr(created, 1, 10), COUNT(*) FROM notes WHERE length(created) >= 10 GROUP BY substr(created, 1, 10) UNION ALL SELECT substr(updated, 1, 10), -COUNT(*) FROM notes WHERE length(updated) >= 10 GROUP BY substr(updated, 1, 10)").map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|error| error.to_string())?;
    for row in rows {
        let (date, signed_count) = row.map_err(|error| error.to_string())?;
        let day = activity.entry(date.clone()).or_insert(UsageActivityDay {
            date,
            created: 0,
            last_edited: 0,
        });
        if signed_count >= 0 {
            day.created = signed_count as u32;
        } else {
            day.last_edited = (-signed_count) as u32;
        }
    }
    let active_day_count = activity.len() as u32;
    let longest_activity_streak = longest_streak(&activity);

    let mut folder_statement = conn.prepare(
        "SELECT CASE WHEN instr(n.path, '/') = 0 THEN '/' ELSE substr(n.path, 1, instr(n.path, '/') - 1) END, \
         COUNT(*), \
         COALESCE(SUM(n.checklist_total), 0), \
         COALESCE(SUM(n.checklist_completed), 0), \
         COALESCE(SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM links l WHERE l.from_id = n.id OR l.to_id = n.id) \
           AND NOT EXISTS (SELECT 1 FROM note_relationships r WHERE r.from_id = n.id OR r.to_id = n.id) \
           THEN 1 ELSE 0 END), 0) \
         FROM notes n GROUP BY 1 ORDER BY COUNT(*) DESC, 1 COLLATE NOCASE ASC",
    )
    .map_err(|error| error.to_string())?;
    let folders = folder_statement
        .query_map([], |row| {
            Ok(UsageFolder {
                name: row.get(0)?,
                note_count: row.get::<_, i64>(1)?.max(0) as u32,
                task_total: row.get::<_, i64>(2)?.max(0) as u32,
                task_completed: row.get::<_, i64>(3)?.max(0) as u32,
                isolated_note_count: row.get::<_, i64>(4)?.max(0) as u32,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let mut tag_statement = conn.prepare("SELECT tag, COUNT(*) FROM tags WHERE tag NOT LIKE 'people/%' GROUP BY tag ORDER BY COUNT(*) DESC, tag COLLATE NOCASE ASC LIMIT 8").map_err(|error| error.to_string())?;
    let tags = tag_statement
        .query_map([], |row| {
            Ok(UsageTag {
                tag: row.get(0)?,
                note_count: row.get::<_, i64>(1)?.max(0) as u32,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let folder_weeks = folder_created_by_week(conn)?;

    Ok(UsageInsights {
        note_count,
        task_total,
        task_completed,
        link_count,
        isolated_note_count,
        tag_count,
        total_file_bytes,
        daily_notes_count,
        active_day_count,
        longest_activity_streak,
        activity: activity.into_values().collect(),
        folder_weeks,
        folders,
        tags,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn usage_insights(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
) -> Result<UsageInsights, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let conn = open_db(&root)?;
        usage_insights_for_conn(&conn, &root)
    })
    .await
    .map_err(|error| error.to_string())?
}
