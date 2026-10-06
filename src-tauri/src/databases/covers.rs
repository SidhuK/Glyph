use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;
use tauri::{State, WebviewWindow};

use crate::index::open_db;
use crate::notes::frontmatter::split_frontmatter;
use crate::space::SpaceState;
use crate::space_fs::link_ops::{resolve_cover_sources, CoverSource};
use crate::utils;

use super::query::{
    cell_value_from_row, field_catalog, hydrate_rows, read_note_markdown, PropertyFields, RowFields,
};
use super::store::find_database_view;
use super::types::{DatabaseDefinition, DatabaseViewDefinition};

const MAX_COVER_BATCH: usize = 200;

static EMBED_PATTERN: OnceLock<Regex> = OnceLock::new();

fn embed_pattern() -> &'static Regex {
    EMBED_PATTERN.get_or_init(|| {
        Regex::new(
            r#"!\[\[([^\]\n]+)\]\]|!\[[^\]\n]*\]\(\s*<?([^)\s>]+)>?[^)\n]*\)|<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']"#,
        )
        .expect("cover embed pattern must compile")
    })
}

fn first_embed(note_path: &str, markdown: &str) -> Option<CoverSource> {
    let (_, body) = split_frontmatter(markdown);
    let captures = embed_pattern().captures(body)?;
    let (href, wiki_embed) = match (captures.get(1), captures.get(2), captures.get(3)) {
        (Some(wiki), _, _) => (wiki.as_str(), true),
        (_, Some(link), _) | (_, _, Some(link)) => (link.as_str(), false),
        _ => return None,
    };
    Some(CoverSource {
        source_path: note_path.to_string(),
        href: href.trim().to_string(),
        wiki_embed,
    })
}

/// Property covers accept `[[image.png]]`, `![[image.png]]`, or a path/link.
fn property_source(note_path: &str, value: &str) -> Option<CoverSource> {
    let trimmed = value.trim().trim_start_matches('!');
    if trimmed.is_empty() {
        return None;
    }
    let wiki = trimmed
        .strip_prefix("[[")
        .and_then(|inner| inner.strip_suffix("]]"));
    Some(CoverSource {
        source_path: note_path.to_string(),
        href: wiki.unwrap_or(trimmed).to_string(),
        wiki_embed: wiki.is_some(),
    })
}

fn property_sources(
    root: &Path,
    database: &DatabaseDefinition,
    view: &DatabaseViewDefinition,
    column_id: &str,
    note_paths: &[String],
) -> Result<Vec<Option<CoverSource>>, String> {
    let catalog = field_catalog(database, view);
    let Some(column) = catalog.iter().find(|column| column.id == column_id) else {
        return Ok(note_paths.iter().map(|_| None).collect());
    };
    let key = column.property_key.clone().unwrap_or_default();
    let conn = open_db(root)?;
    let fields = RowFields {
        properties: PropertyFields::Keys(vec![key]),
        ..RowFields::default()
    };
    let rows = hydrate_rows(&conn, note_paths, &fields)?;
    Ok(note_paths
        .iter()
        .map(|path| {
            let row = rows.iter().find(|row| &row.note_path == path)?;
            let cell = cell_value_from_row(row, column);
            let value = cell
                .value_text
                .or_else(|| cell.value_list.into_iter().next())?;
            property_source(path, &value)
        })
        .collect())
}

fn row_covers(
    root: &Path,
    database: &DatabaseDefinition,
    view: &DatabaseViewDefinition,
    note_paths: &[String],
) -> Result<Vec<Option<String>>, String> {
    let sources = match view.gallery_cover.as_deref() {
        Some("none") => return Ok(note_paths.iter().map(|_| None).collect()),
        Some(cover) => match cover.strip_prefix("property:") {
            Some(column_id) => property_sources(root, database, view, column_id, note_paths)?,
            None => return Err(format!("unsupported gallery cover '{cover}'")),
        },
        None => note_paths
            .iter()
            .map(|path| {
                if !utils::is_markdown_path(Path::new(path)) {
                    return None;
                }
                let markdown = read_note_markdown(root, path).ok()?;
                first_embed(path, &markdown)
            })
            .collect(),
    };
    let (slots, requests): (Vec<_>, Vec<_>) = sources
        .into_iter()
        .enumerate()
        .filter_map(|(index, source)| source.map(|source| (index, source)))
        .unzip();
    let resolved = resolve_cover_sources(root, &requests)?;
    let mut covers = vec![None; note_paths.len()];
    for (slot, cover) in slots.into_iter().zip(resolved) {
        covers[slot] = cover;
    }
    Ok(covers)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn databases_row_covers(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    database_id: String,
    view_id: String,
    note_paths: Vec<String>,
) -> Result<Vec<Option<String>>, String> {
    if note_paths.len() > MAX_COVER_BATCH {
        return Err(format!("at most {MAX_COVER_BATCH} covers per request"));
    }
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (database, view) = find_database_view(&root, &database_id, &view_id)?;
        row_covers(&root, &database, &view, &note_paths)
    })
    .await
    .map_err(|e| e.to_string())?
}
