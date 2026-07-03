#[cfg(test)]
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};

use crate::utils::{self, file_timestamp_strings_if_exists};

use super::checklists::checklist_counts;
use super::db::{open_db, resolve_title_to_id};
use super::frontmatter::{
    parse_frontmatter_title_created_updated, preview_from_markdown, split_frontmatter,
};
use super::helpers::{path_to_slash_string, sha256_hex, should_skip_entry};
use super::links::parse_outgoing_links;
use super::properties::{delete_note_properties, reindex_note_properties};
use super::relationships::{
    delete_note_relationships, ensure_note_relationships_indexed, insert_note_relationships,
    parse_frontmatter_relationships, reindex_note_relationships,
};
use super::tags::{
    expand_indexed_people, expand_indexed_tags, parse_all_tags, parse_inline_people,
};
use super::types::IndexRebuildResult;

static PEOPLE_MENTIONS_AS_TAGS_ENABLED: AtomicBool = AtomicBool::new(false);

#[cfg(test)]
pub(crate) fn people_mentions_as_tags_test_lock() -> MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
}

pub fn set_people_mentions_as_tags_enabled(enabled: bool) {
    PEOPLE_MENTIONS_AS_TAGS_ENABLED.store(enabled, Ordering::Relaxed);
}

pub fn people_mentions_as_tags_enabled() -> bool {
    PEOPLE_MENTIONS_AS_TAGS_ENABLED.load(Ordering::Relaxed)
}

fn fts_body_with_frontmatter(markdown: &str) -> String {
    let (yaml, body) = split_frontmatter(markdown);
    if yaml.is_empty() {
        body.to_string()
    } else if body.is_empty() {
        yaml.to_string()
    } else {
        format!("{yaml}\n{body}")
    }
}

fn collect_markdown_files(space_root: &Path) -> Result<Vec<(String, PathBuf)>, String> {
    let mut out: Vec<(String, PathBuf)> = Vec::new();
    let mut stack: Vec<PathBuf> = vec![space_root.to_path_buf()];

    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let name = entry.file_name();
            if should_skip_entry(&name) {
                continue;
            }
            let path = entry.path();
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.is_dir() {
                stack.push(path);
                continue;
            }
            if !meta.is_file() {
                continue;
            }
            if !utils::is_markdown_path(&path) {
                continue;
            }
            let rel = match path.strip_prefix(space_root) {
                Ok(r) => r,
                Err(_) => continue,
            };
            let rel_s = path_to_slash_string(rel);
            if rel_s.is_empty() {
                continue;
            }
            out.push((rel_s, path));
        }
    }

    out.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
    Ok(out)
}

fn file_fingerprint(path: &Path) -> Result<(i64, i64), String> {
    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let modified_ns = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos().min(i64::MAX as u128) as i64)
        .unwrap_or_default();
    let size = metadata.len().min(i64::MAX as u64) as i64;
    Ok((modified_ns, size))
}

fn record_file_fingerprint(
    conn: &rusqlite::Connection,
    note_id: &str,
    file_path: &Path,
) -> Result<(), String> {
    let (modified_ns, size) = file_fingerprint(file_path)?;
    conn.execute(
        "INSERT OR REPLACE INTO indexed_files(path, modified_ns, size) VALUES(?, ?, ?)",
        rusqlite::params![note_id, modified_ns, size],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn link_kind_for_id(to_id: &str) -> &'static str {
    if utils::is_markdown_path(Path::new(to_id)) {
        "note"
    } else {
        "file"
    }
}

pub fn index_note(space_root: &Path, note_id: &str, markdown: &str) -> Result<(), String> {
    let conn = open_db(space_root)?;
    let file_path = space_root.join(note_id);
    index_note_with_conn(&conn, note_id, markdown, &file_path)
}

fn index_note_with_conn(
    conn: &rusqlite::Connection,
    note_id: &str,
    markdown: &str,
    file_path: &Path,
) -> Result<(), String> {
    let etag = sha256_hex(markdown.as_bytes());
    let existing_etag: Option<String> = conn
        .query_row(
            "SELECT etag FROM notes WHERE id = ? LIMIT 1",
            [note_id],
            |row| row.get(0),
        )
        .ok();
    if existing_etag.as_deref() == Some(etag.as_str()) {
        ensure_note_relationships_indexed(conn, note_id, markdown)?;
        refresh_indexed_timestamps_if_needed(conn, note_id, file_path)?;
        record_file_fingerprint(conn, note_id, file_path)?;
        return Ok(());
    }

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    let (mut title, created, updated) =
        parse_frontmatter_title_created_updated(markdown, file_path);
    if title == "Untitled" {
        if let Some(stem) = Path::new(note_id)
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            title = stem.to_string();
        }
    }
    let title_for_fts = title.clone();
    let preview = preview_from_markdown(note_id, markdown);
    let rel_path = note_id.to_string();
    let (checklist_total, checklist_completed) = checklist_counts(markdown);

    tx.execute(
        "INSERT OR REPLACE INTO notes(id, title, created, updated, path, etag, preview, checklist_total, checklist_completed) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![
            note_id,
            title,
            created,
            updated,
            rel_path,
            etag,
            preview,
            checklist_total,
            checklist_completed
        ],
    )
    .map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM notes_fts WHERE id = ?", [note_id])
        .map_err(|e| e.to_string())?;
    let body = fts_body_with_frontmatter(markdown);
    tx.execute(
        "INSERT INTO notes_fts(id, title, body) VALUES(?, ?, ?)",
        rusqlite::params![note_id, title_for_fts, body],
    )
    .map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM links WHERE from_id = ?", [note_id])
        .map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM tags WHERE note_id = ?", [note_id])
        .map_err(|e| e.to_string())?;

    let people_tags = if people_mentions_as_tags_enabled() {
        expand_indexed_people(&parse_inline_people(markdown))
    } else {
        Vec::new()
    };
    for tag in expand_indexed_tags(&parse_all_tags(markdown))
        .into_iter()
        .chain(people_tags.into_iter())
    {
        tx.execute(
            "INSERT OR IGNORE INTO tags(note_id, tag, is_explicit) VALUES(?, ?, ?)",
            rusqlite::params![note_id, tag.tag, if tag.is_explicit { 1 } else { 0 }],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Err(error) = reindex_note_properties(&tx, note_id, markdown) {
        tracing::warn!(
            note_id = note_id,
            rel_path = rel_path,
            error = %error,
            "Skipping note property indexing after frontmatter parse error"
        );
    }
    reindex_note_relationships(&tx, note_id, markdown)?;

    let (to_ids, to_titles) = parse_outgoing_links(note_id, markdown);
    let mut inserted = HashSet::<(Option<String>, Option<String>, &'static str)>::new();

    for to_id in to_ids {
        let kind = link_kind_for_id(&to_id);
        inserted.insert((Some(to_id), None, kind));
    }

    for to_title in to_titles {
        if let Some(to_id) = resolve_title_to_id(&tx, &to_title)? {
            inserted.insert((Some(to_id), None, "note"));
        } else {
            inserted.insert((None, Some(to_title), "wikilink"));
        }
    }

    for (to_id, to_title, kind) in inserted {
        tx.execute(
            "INSERT OR IGNORE INTO links(from_id, to_id, to_title, kind) VALUES(?, ?, ?, ?)",
            rusqlite::params![note_id, to_id, to_title, kind],
        )
        .map_err(|e| e.to_string())?;
    }

    record_file_fingerprint(&tx, note_id, file_path)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn refresh_indexed_timestamps_if_needed(
    conn: &rusqlite::Connection,
    note_id: &str,
    file_path: &Path,
) -> Result<(), String> {
    let Some((created, updated)) = file_timestamp_strings_if_exists(file_path) else {
        return Ok(());
    };

    let existing: Option<(String, String)> = conn
        .query_row(
            "SELECT created, updated FROM notes WHERE id = ? LIMIT 1",
            [note_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    let Some((existing_created, existing_updated)) = existing else {
        return Ok(());
    };

    if existing_created == created && existing_updated == updated {
        return Ok(());
    }

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE notes SET created = ?, updated = ? WHERE id = ?",
        rusqlite::params![created, updated, note_id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn remove_note(space_root: &Path, note_id: &str) -> Result<(), String> {
    let conn = open_db(space_root)?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM notes WHERE id = ?", [note_id])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM notes_fts WHERE id = ?", [note_id])
        .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM links WHERE from_id = ? OR to_id = ?",
        rusqlite::params![note_id, note_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM tags WHERE note_id = ?", [note_id])
        .map_err(|e| e.to_string())?;
    delete_note_properties(&tx, note_id)?;
    delete_note_relationships(&tx, note_id)?;
    tx.execute(
        "UPDATE note_relationships
         SET to_id = NULL, to_title = target_title
         WHERE to_id = ?",
        [note_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM indexed_files WHERE path = ?", [note_id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn rebuild_with_progress<F>(
    space_root: &Path,
    mut on_progress: F,
) -> Result<IndexRebuildResult, String>
where
    F: FnMut(usize, usize),
{
    let mut conn = open_db(space_root)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let people_tags_enabled = people_mentions_as_tags_enabled();

    tx.execute("DELETE FROM notes", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM notes_fts", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM links", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM tags", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM note_properties", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM note_relationships", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM indexed_files", [])
        .map_err(|e| e.to_string())?;

    let note_paths = collect_markdown_files(space_root)?;
    let mut link_data: Vec<(String, HashSet<String>, HashSet<String>)> =
        Vec::with_capacity(note_paths.len());
    let mut relationship_data = Vec::with_capacity(note_paths.len());
    let count = note_paths.len();
    on_progress(0, count);

    for (index, (rel, path)) in note_paths.iter().enumerate() {
        let markdown = std::fs::read_to_string(path).map_err(|e| e.to_string())?;

        let (mut title, created, updated) =
            parse_frontmatter_title_created_updated(&markdown, path);
        if title == "Untitled" {
            if let Some(stem) = Path::new(rel)
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
            {
                title = stem.to_string();
            }
        }
        let etag = sha256_hex(markdown.as_bytes());
        let preview = preview_from_markdown(rel, &markdown);
        let (checklist_total, checklist_completed) = checklist_counts(&markdown);

        tx.execute(
            "INSERT OR REPLACE INTO notes(id, title, created, updated, path, etag, preview, checklist_total, checklist_completed) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rusqlite::params![
                rel,
                title,
                created,
                updated,
                rel,
                etag,
                preview,
                checklist_total,
                checklist_completed
            ],
        )
        .map_err(|e| e.to_string())?;

        tx.execute("DELETE FROM notes_fts WHERE id = ?", [rel])
            .map_err(|e| e.to_string())?;
        let body = fts_body_with_frontmatter(&markdown);
        tx.execute(
            "INSERT INTO notes_fts(id, title, body) VALUES(?, ?, ?)",
            rusqlite::params![rel, title, body],
        )
        .map_err(|e| e.to_string())?;

        let people_tags = if people_tags_enabled {
            expand_indexed_people(&parse_inline_people(&markdown))
        } else {
            Vec::new()
        };
        for tag in expand_indexed_tags(&parse_all_tags(&markdown))
            .into_iter()
            .chain(people_tags.into_iter())
        {
            tx.execute(
                "INSERT OR IGNORE INTO tags(note_id, tag, is_explicit) VALUES(?, ?, ?)",
                rusqlite::params![rel, tag.tag, if tag.is_explicit { 1 } else { 0 }],
            )
            .map_err(|e| e.to_string())?;
        }
        if let Err(error) = reindex_note_properties(&tx, rel, &markdown) {
            tracing::warn!(
                note_id = rel,
                rel_path = rel,
                error = %error,
                "Skipping note property indexing during rebuild after frontmatter parse error"
            );
        }
        let (to_ids, to_titles) = parse_outgoing_links(rel, &markdown);
        link_data.push((rel.clone(), to_ids, to_titles));
        relationship_data.push((rel.clone(), parse_frontmatter_relationships(&markdown)));
        let (modified_ns, size) = file_fingerprint(path)?;
        tx.execute(
            "INSERT INTO indexed_files(path, modified_ns, size) VALUES(?, ?, ?)",
            rusqlite::params![rel, modified_ns, size],
        )
        .map_err(|e| e.to_string())?;
        if index + 1 < count {
            on_progress(index + 1, count);
        }
    }

    for (rel, to_ids, to_titles) in &link_data {
        let mut inserted = HashSet::<(Option<String>, Option<String>, &'static str)>::new();
        for to_id in to_ids {
            inserted.insert((Some(to_id.clone()), None, link_kind_for_id(to_id)));
        }
        for to_title in to_titles {
            if let Some(to_id) = resolve_title_to_id(&tx, to_title)? {
                inserted.insert((Some(to_id), None, "note"));
            } else {
                inserted.insert((None, Some(to_title.clone()), "wikilink"));
            }
        }
        for (to_id, to_title, kind) in inserted {
            tx.execute(
                "INSERT OR IGNORE INTO links(from_id, to_id, to_title, kind) VALUES(?, ?, ?, ?)",
                rusqlite::params![rel, to_id, to_title, kind],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    for (rel, relationships) in relationship_data {
        insert_note_relationships(&tx, &rel, relationships)?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    on_progress(count, count);
    Ok(IndexRebuildResult { indexed: count })
}

pub fn sync<F>(space_root: &Path, mut on_progress: F) -> Result<IndexRebuildResult, String>
where
    F: FnMut(usize, usize),
{
    let conn = open_db(space_root)?;
    let tracked = {
        let mut statement = conn
            .prepare("SELECT path, modified_ns, size FROM indexed_files")
            .map_err(|e| e.to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    (row.get::<_, i64>(1)?, row.get::<_, i64>(2)?),
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<HashMap<_, _>, _>>()
            .map_err(|e| e.to_string())?;
        rows
    };
    if tracked.is_empty() {
        drop(conn);
        return rebuild_with_progress(space_root, on_progress);
    }

    let note_paths = collect_markdown_files(space_root)?;
    let disk_paths = note_paths
        .iter()
        .map(|(path, _)| path.as_str())
        .collect::<HashSet<_>>();
    let removed = tracked
        .keys()
        .filter(|path| !disk_paths.contains(path.as_str()))
        .cloned()
        .collect::<Vec<_>>();
    let total = note_paths.len() + removed.len();
    let mut indexed = 0;
    on_progress(0, total);

    for (position, (note_id, path)) in note_paths.iter().enumerate() {
        let fingerprint = file_fingerprint(path)?;
        if tracked.get(note_id) != Some(&fingerprint) {
            let markdown = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
            index_note_with_conn(&conn, note_id, &markdown, path)?;
            indexed += 1;
        }
        on_progress(position + 1, total);
    }

    drop(conn);
    for (offset, note_id) in removed.iter().enumerate() {
        remove_note(space_root, note_id)?;
        indexed += 1;
        on_progress(note_paths.len() + offset + 1, total);
    }

    Ok(IndexRebuildResult { indexed })
}

#[cfg(test)]
mod tests {
    use super::index_note;
    use crate::index::db::open_db;
    use crate::index::paths;
    use std::path::{Path, PathBuf};
    use std::thread;
    use std::time::Duration;

    struct TempSpace {
        root: PathBuf,
    }

    impl TempSpace {
        fn new() -> Self {
            let root =
                std::env::temp_dir().join(format!("glyph-indexer-test-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&root).expect("temp space should be created");
            Self { root }
        }

        fn path(&self) -> &Path {
            &self.root
        }
    }

    impl Drop for TempSpace {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn refreshes_indexed_timestamps_when_mtime_changes_without_content_changes() {
        let _guard = paths::test_index_root_lock();
        let temp_space = TempSpace::new();
        let root = temp_space.path();
        let index_root =
            std::env::temp_dir().join(format!("glyph-indexer-index-root-{}", uuid::Uuid::new_v4()));
        paths::init_test_index_root(index_root);
        paths::register_space(root).expect("space should register");

        let note_id = "Projects/Idle Churn.md";
        let markdown = "- [ ] Keep index stable\n";
        let note_path = root.join(note_id);
        let note_dir = note_path.parent().expect("note path should have parent");
        std::fs::create_dir_all(note_dir).expect("note dir should be created");
        std::fs::write(&note_path, markdown).expect("note file should be written");

        index_note(root, note_id, markdown).expect("first index should succeed");

        let conn = open_db(root).expect("db should open");
        let first_updated: String = conn
            .query_row("SELECT updated FROM notes WHERE id = ?", [note_id], |row| {
                row.get(0)
            })
            .expect("note row should exist");
        let first_etag: String = conn
            .query_row("SELECT etag FROM notes WHERE id = ?", [note_id], |row| {
                row.get(0)
            })
            .expect("note row should exist");
        drop(conn);

        thread::sleep(Duration::from_millis(1100));
        std::fs::write(&note_path, markdown).expect("note file should be rewritten");
        index_note(root, note_id, markdown).expect("second index should succeed");

        let conn = open_db(root).expect("db should reopen");
        let second_updated: String = conn
            .query_row("SELECT updated FROM notes WHERE id = ?", [note_id], |row| {
                row.get(0)
            })
            .expect("note row should still exist");
        let second_etag: String = conn
            .query_row("SELECT etag FROM notes WHERE id = ?", [note_id], |row| {
                row.get(0)
            })
            .expect("note row should still exist");

        assert_ne!(second_updated, first_updated);
        assert_eq!(second_etag, first_etag);
    }
}
