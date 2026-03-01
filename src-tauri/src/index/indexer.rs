use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};

use crate::utils;

use super::db::{open_db, resolve_title_to_id};
use super::frontmatter::{
    parse_frontmatter_title_created_updated, preview_from_markdown, split_frontmatter,
};
use super::helpers::{path_to_slash_string, sha256_hex, should_skip_entry};
use super::links::parse_outgoing_links;
use super::properties::{delete_note_properties, reindex_note_properties};
use super::tags::parse_all_tags;
use super::tasks::{delete_note_tasks, reindex_note_tasks};
use super::types::IndexRebuildResult;

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
        return Ok(());
    }

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    let (mut title, created, updated) = parse_frontmatter_title_created_updated(markdown, file_path);
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

    tx.execute(
        "INSERT OR REPLACE INTO notes(id, title, created, updated, path, etag, preview) VALUES(?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![note_id, title, created, updated, rel_path, etag, preview],
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

    for tag in parse_all_tags(markdown) {
        tx.execute(
            "INSERT OR IGNORE INTO tags(note_id, tag) VALUES(?, ?)",
            rusqlite::params![note_id, tag],
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
    reindex_note_tasks(&tx, note_id, &rel_path, &updated, &etag, markdown)?;

    let (to_ids, to_titles) = parse_outgoing_links(note_id, markdown);
    let mut inserted = HashSet::<(Option<String>, Option<String>, &'static str)>::new();

    for to_id in to_ids {
        inserted.insert((Some(to_id), None, "note"));
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
    delete_note_tasks(&tx, note_id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn rebuild(space_root: &Path) -> Result<IndexRebuildResult, String> {
    let mut conn = open_db(space_root)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

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
    tx.execute("DELETE FROM tasks", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM tasks_fts", [])
        .map_err(|e| e.to_string())?;

    let note_paths = collect_markdown_files(space_root)?;
    let mut link_data: Vec<(String, HashSet<String>, HashSet<String>)> =
        Vec::with_capacity(note_paths.len());
    let count = note_paths.len();

    for (rel, path) in &note_paths {
        let markdown = std::fs::read_to_string(path).map_err(|e| e.to_string())?;

        let (mut title, created, updated) = parse_frontmatter_title_created_updated(&markdown, path);
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

        tx.execute(
            "INSERT OR REPLACE INTO notes(id, title, created, updated, path, etag, preview) VALUES(?, ?, ?, ?, ?, ?, ?)",
            rusqlite::params![rel, title, created, updated, rel, etag, preview],
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

        for tag in parse_all_tags(&markdown) {
            tx.execute(
                "INSERT OR IGNORE INTO tags(note_id, tag) VALUES(?, ?)",
                rusqlite::params![rel, tag],
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
        reindex_note_tasks(&tx, rel, rel, &updated, &etag, &markdown)?;

        let (to_ids, to_titles) = parse_outgoing_links(rel, &markdown);
        link_data.push((rel.clone(), to_ids, to_titles));
    }

    for (rel, to_ids, to_titles) in &link_data {
        let mut inserted = HashSet::<(Option<String>, Option<String>, &'static str)>::new();
        for to_id in to_ids {
            inserted.insert((Some(to_id.clone()), None, "file"));
        }
        for to_title in to_titles {
            if let Some(to_id) = resolve_title_to_id(&tx, to_title)? {
                inserted.insert((Some(to_id), None, "file"));
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

    tx.commit().map_err(|e| e.to_string())?;
    Ok(IndexRebuildResult { indexed: count })
}

#[cfg(test)]
mod tests {
    use super::index_note;
    use crate::index::db::open_db;
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
    fn skips_reindex_when_etag_matches_existing_note() {
        let temp_space = TempSpace::new();
        let root = temp_space.path();
        let note_id = "Projects/Idle Churn.md";
        let markdown = "- [ ] Keep index stable\n";

        index_note(root, note_id, markdown).expect("first index should succeed");

        let conn = open_db(root).expect("db should open");
        let first_updated: String = conn
            .query_row("SELECT updated FROM notes WHERE id = ?", [note_id], |row| {
                row.get(0)
            })
            .expect("note row should exist");
        let first_indexed_at: String = conn
            .query_row(
                "SELECT indexed_at FROM tasks WHERE note_id = ? LIMIT 1",
                [note_id],
                |row| row.get(0),
            )
            .expect("task row should exist");
        drop(conn);

        thread::sleep(Duration::from_millis(1100));
        index_note(root, note_id, markdown).expect("second index should succeed");

        let conn = open_db(root).expect("db should reopen");
        let second_updated: String = conn
            .query_row("SELECT updated FROM notes WHERE id = ?", [note_id], |row| {
                row.get(0)
            })
            .expect("note row should still exist");
        let second_indexed_at: String = conn
            .query_row(
                "SELECT indexed_at FROM tasks WHERE note_id = ? LIMIT 1",
                [note_id],
                |row| row.get(0),
            )
            .expect("task row should still exist");

        assert_eq!(second_updated, first_updated);
        assert_eq!(second_indexed_at, first_indexed_at);
    }
}
