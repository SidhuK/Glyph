use notify::event::{EventKind, ModifyKind};
use notify::Watcher;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc as std_mpsc;
use std::time::{Duration, Instant};

use crate::note_mutation::{emit_changed, indexed_ids_at_or_under, SpaceChange};
use crate::{index, paths, utils};

use super::state::{has_recent_local_change, RecentLocalChanges};

const DEBOUNCE: Duration = Duration::from_millis(100);
const INDEX_OPEN_RETRY: Duration = Duration::from_secs(1);

/// FSEvents reports each side of a rename (including a Finder move to the Trash)
/// as its own single-path event and coalesces flags per path, so event kinds are
/// only hints. The index thread decides what happened from the disk once a batch
/// settles.
enum Signal {
    /// `structural` is set when the path may have appeared or disappeared.
    Path { rel: String, structural: bool },
    /// The kernel dropped events, so the whole space must be reconciled.
    Rescan,
}

#[derive(Default)]
struct Batch {
    paths: HashMap<String, bool>,
    rescan: bool,
}

impl Batch {
    fn add(&mut self, signal: Signal) {
        match signal {
            Signal::Path { rel, structural } => *self.paths.entry(rel).or_default() |= structural,
            Signal::Rescan => self.rescan = true,
        }
    }

    fn is_empty(&self) -> bool {
        self.paths.is_empty() && !self.rescan
    }
}

fn rel_under_root(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    let rel_s = rel
        .components()
        .filter_map(|c| c.as_os_str().to_str())
        .collect::<Vec<_>>()
        .join("/");
    if rel_s.is_empty() || rel_s.split('/').any(|part| part.starts_with('.')) {
        return None;
    }
    Some(rel_s)
}

fn index_markdown(conn: &rusqlite::Connection, rel: &str, abs: &Path) -> Result<(), String> {
    let markdown = std::fs::read_to_string(abs).map_err(|error| error.to_string())?;
    index::index_note_with_conn(conn, rel, &markdown, abs)
}

/// Whether a non-hidden markdown file exists anywhere under `dir`; stops at the first.
fn holds_markdown(dir: &Path) -> bool {
    let mut stack = vec![dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            if entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            let path = entry.path();
            match entry.file_type() {
                Ok(kind) if kind.is_dir() => stack.push(path),
                Ok(kind) if kind.is_file() && utils::is_markdown_path(&path) => return true,
                _ => {}
            }
        }
    }
    false
}

/// Drops the note at `rel`, or every note under it when `rel` was a directory.
fn unindex_vanished(conn: &rusqlite::Connection, rel: &str) -> Result<(), String> {
    for note_id in indexed_ids_at_or_under(conn, rel)? {
        index::remove_note_with_conn(conn, &note_id)?;
    }
    Ok(())
}

fn apply_batch(
    conn: rusqlite::Connection,
    root: &Path,
    space_path: &str,
    batch: Batch,
) -> Vec<SpaceChange> {
    let mut changes = Vec::new();
    let mut needs_sync = batch.rescan;
    for (rel, structural) in batch.paths {
        let Ok(abs) = paths::join_under(root, Path::new(&rel)) else {
            continue;
        };
        match std::fs::metadata(&abs) {
            Ok(meta) if meta.is_dir() => {
                // Directory metadata churns whenever a child changes, and the child
                // reports itself. A directory moved in may carry notes FSEvents never
                // lists individually, so reconcile the index when it holds any.
                if structural {
                    needs_sync |= holds_markdown(&abs);
                    changes.push(SpaceChange::create(space_path, rel));
                }
            }
            Ok(_) => {
                if utils::is_markdown_path(&abs) {
                    if let Err(error) = index_markdown(&conn, &rel, &abs) {
                        tracing::warn!(note_id = %rel, %error, "could not index external change");
                    }
                    changes.push(SpaceChange::content(space_path, rel));
                } else if structural {
                    changes.push(SpaceChange::create(space_path, rel));
                } else {
                    changes.push(SpaceChange::content(space_path, rel));
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                if let Err(error) = unindex_vanished(&conn, &rel) {
                    tracing::warn!(path = %rel, %error, "could not unindex external removal");
                }
                // The path may have been a file or a directory; recursive covers both.
                changes.push(SpaceChange::remove(space_path, rel, true));
            }
            Err(error) => tracing::warn!(path = %rel, %error, "could not stat external change"),
        }
    }
    drop(conn);
    if needs_sync {
        if let Err(error) = index::sync(root, |_, _| {}) {
            tracing::warn!(%error, "could not reconcile note index after external change");
        }
    }
    if batch.rescan {
        // An empty path marks the space root: reload the tree and every list.
        changes.push(SpaceChange::create(space_path, ""));
    }
    changes
}

fn run_index_thread(
    rx: std_mpsc::Receiver<Signal>,
    app: tauri::AppHandle,
    root: PathBuf,
    window_label: String,
) {
    let space_path = root.to_string_lossy().to_string();
    let mut batch = Batch::default();
    loop {
        if batch.is_empty() {
            let Ok(signal) = rx.recv() else {
                return;
            };
            batch.add(signal);
        }

        let deadline = Instant::now() + DEBOUNCE;
        while let Some(remaining) = deadline.checked_duration_since(Instant::now()) {
            match rx.recv_timeout(remaining) {
                Ok(signal) => batch.add(signal),
                Err(_) => break,
            }
        }

        let conn = match index::open_db(&root) {
            Ok(conn) => conn,
            Err(error) => {
                tracing::warn!(%error, "could not open note index for watcher batch");
                std::thread::sleep(INDEX_OPEN_RETRY);
                continue;
            }
        };
        let changes = apply_batch(conn, &root, &space_path, std::mem::take(&mut batch));
        if !changes.is_empty() {
            emit_changed(
                &app,
                &window_label,
                &SpaceChange::batch(&space_path, changes),
            );
        }
    }
}

pub fn create_notes_watcher(
    app: tauri::AppHandle,
    root: PathBuf,
    window_label: String,
    recent_local_changes: RecentLocalChanges,
) -> Result<notify::RecommendedWatcher, String> {
    let (tx, rx) = std_mpsc::channel::<Signal>();
    let index_root = root.clone();
    std::thread::spawn(move || run_index_thread(rx, app, index_root, window_label));

    let watch_root = root.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let event = match res {
            Ok(event) => event,
            Err(error) => {
                tracing::warn!(%error, "space watcher error");
                return;
            }
        };
        if event.need_rescan() {
            let _ = tx.send(Signal::Rescan);
            return;
        }
        let structural = match event.kind {
            EventKind::Create(_)
            | EventKind::Remove(_)
            | EventKind::Modify(ModifyKind::Name(_)) => true,
            EventKind::Modify(_) => false,
            _ => return,
        };
        for path in &event.paths {
            let Some(rel) = rel_under_root(&watch_root, path) else {
                continue;
            };
            if has_recent_local_change(&recent_local_changes, &rel) {
                continue;
            }
            let _ = tx.send(Signal::Path { rel, structural });
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&root, notify::RecursiveMode::Recursive)
        .map_err(|e: notify::Error| e.to_string())?;

    Ok(watcher)
}
