use crate::{index, io_atomic, paths, vault::VaultState};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    cmp::Reverse,
    collections::BinaryHeap,
    ffi::OsStr,
    path::{Path, PathBuf},
};
use tauri::State;

#[derive(Serialize)]
pub struct FsEntry {
    pub name: String,
    pub rel_path: String,
    pub kind: String, // "dir" | "file"
    pub is_markdown: bool,
}

#[derive(Serialize)]
pub struct TextFileDoc {
    pub rel_path: String,
    pub text: String,
    pub etag: String,
    pub mtime_ms: u64,
}

#[derive(Serialize)]
pub struct TextFileWriteResult {
    pub etag: String,
    pub mtime_ms: u64,
}

#[derive(Serialize, Clone)]
pub struct RecentMarkdown {
    pub rel_path: String,
    pub name: String,
    pub mtime_ms: u64,
}

#[derive(Serialize)]
pub struct DirChildSummary {
    pub dir_rel_path: String,
    pub name: String,
    pub total_files_recursive: u32,
    pub total_markdown_recursive: u32,
    pub recent_markdown: Vec<RecentMarkdown>,
    pub truncated: bool,
}

#[derive(Serialize, Clone)]
pub struct RecentEntry {
    pub rel_path: String,
    pub name: String,
    pub is_markdown: bool,
    pub mtime_ms: u64,
}

fn etag_for(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn file_mtime_ms(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn should_hide(name: &str) -> bool {
    name.starts_with('.')
}

fn deny_hidden_rel_path(rel: &Path) -> Result<(), String> {
    for c in rel.components() {
        let s = c.as_os_str().to_string_lossy();
        if s.starts_with('.') {
            return Err("hidden paths are not accessible via vault FS".to_string());
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn vault_list_markdown_files(
    state: State<'_, VaultState>,
    dir: Option<String>,
    recursive: Option<bool>,
    limit: Option<u32>,
) -> Result<Vec<FsEntry>, String> {
    let root = state.current_root()?;
    let dir = dir.unwrap_or_default();
    let recursive = recursive.unwrap_or(true);
    let limit = limit.unwrap_or(2_000).min(50_000) as usize;

    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<FsEntry>, String> {
        let start_rel = if dir.trim().is_empty() {
            PathBuf::new()
        } else {
            PathBuf::from(&dir)
        };
        deny_hidden_rel_path(&start_rel)?;
        let start_abs = paths::join_under(&root, &start_rel)?;
        if !start_abs.exists() {
            return Ok(Vec::new());
        }

        let mut out: Vec<FsEntry> = Vec::new();
        if !recursive {
            for entry in std::fs::read_dir(&start_abs).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let name = entry.file_name().to_string_lossy().to_string();
                if should_hide(&name) {
                    continue;
                }
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                if path.extension() != Some(OsStr::new("md")) {
                    continue;
                }
                let rel_path = start_rel.join(&name);
                out.push(FsEntry {
                    name,
                    rel_path: rel_path.to_string_lossy().to_string(),
                    kind: "file".to_string(),
                    is_markdown: true,
                });
                if out.len() >= limit {
                    break;
                }
            }
        } else {
            let mut stack: Vec<PathBuf> = vec![start_rel];
            while let Some(rel_dir) = stack.pop() {
                let abs_dir = paths::join_under(&root, &rel_dir)?;
                let entries = match std::fs::read_dir(&abs_dir) {
                    Ok(e) => e,
                    Err(_) => continue,
                };
                for entry in entries {
                    let entry = match entry {
                        Ok(e) => e,
                        Err(_) => continue,
                    };
                    let name = entry.file_name().to_string_lossy().to_string();
                    if should_hide(&name) {
                        continue;
                    }
                    let meta = match entry.metadata() {
                        Ok(m) => m,
                        Err(_) => continue,
                    };
                    let child_rel = rel_dir.join(&name);
                    if meta.is_dir() {
                        // `deny_hidden_rel_path` already prevents a hidden component in `dir`,
                        // and `should_hide` prevents recursing into hidden folders.
                        stack.push(child_rel);
                        continue;
                    }
                    if !meta.is_file() {
                        continue;
                    }
                    if Path::new(&name).extension() != Some(OsStr::new("md")) {
                        continue;
                    }
                    out.push(FsEntry {
                        name,
                        rel_path: child_rel.to_string_lossy().to_string(),
                        kind: "file".to_string(),
                        is_markdown: true,
                    });
                    if out.len() >= limit {
                        break;
                    }
                }
                if out.len() >= limit {
                    break;
                }
            }
        }

        out.sort_by(|a, b| a.rel_path.to_lowercase().cmp(&b.rel_path.to_lowercase()));
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn vault_list_files(
    state: State<'_, VaultState>,
    dir: Option<String>,
    recursive: Option<bool>,
    limit: Option<u32>,
) -> Result<Vec<FsEntry>, String> {
    let root = state.current_root()?;
    let dir = dir.unwrap_or_default();
    let recursive = recursive.unwrap_or(true);
    let limit = limit.unwrap_or(10_000).min(200_000) as usize;

    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<FsEntry>, String> {
        let start_rel = if dir.trim().is_empty() {
            PathBuf::new()
        } else {
            PathBuf::from(&dir)
        };
        deny_hidden_rel_path(&start_rel)?;
        let start_abs = paths::join_under(&root, &start_rel)?;
        if !start_abs.exists() {
            return Ok(Vec::new());
        }

        let mut out: Vec<FsEntry> = Vec::new();
        if !recursive {
            for entry in std::fs::read_dir(&start_abs).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let name = entry.file_name().to_string_lossy().to_string();
                if should_hide(&name) {
                    continue;
                }
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                let rel_path = start_rel.join(&name);
                let is_markdown = rel_path.extension() == Some(OsStr::new("md"));
                out.push(FsEntry {
                    name,
                    rel_path: rel_path.to_string_lossy().to_string(),
                    kind: "file".to_string(),
                    is_markdown,
                });
                if out.len() >= limit {
                    break;
                }
            }
        } else {
            let mut stack: Vec<PathBuf> = vec![start_rel];
            while let Some(rel_dir) = stack.pop() {
                let abs_dir = paths::join_under(&root, &rel_dir)?;
                let entries = match std::fs::read_dir(&abs_dir) {
                    Ok(e) => e,
                    Err(_) => continue,
                };
                for entry in entries {
                    let entry = match entry {
                        Ok(e) => e,
                        Err(_) => continue,
                    };
                    let name = entry.file_name().to_string_lossy().to_string();
                    if should_hide(&name) {
                        continue;
                    }
                    let meta = match entry.metadata() {
                        Ok(m) => m,
                        Err(_) => continue,
                    };
                    let child_rel = rel_dir.join(&name);
                    if meta.is_dir() {
                        stack.push(child_rel);
                        continue;
                    }
                    if !meta.is_file() {
                        continue;
                    }
                    let is_markdown = Path::new(&name).extension() == Some(OsStr::new("md"));
                    out.push(FsEntry {
                        name,
                        rel_path: child_rel.to_string_lossy().to_string(),
                        kind: "file".to_string(),
                        is_markdown,
                    });
                    if out.len() >= limit {
                        break;
                    }
                }
                if out.len() >= limit {
                    break;
                }
            }
        }

        out.sort_by(|a, b| a.rel_path.to_lowercase().cmp(&b.rel_path.to_lowercase()));
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn vault_dir_children_summary(
    state: State<'_, VaultState>,
    dir: Option<String>,
    preview_limit: Option<u32>,
) -> Result<Vec<DirChildSummary>, String> {
    // Safety caps to avoid pathological vaults blocking the UI thread too long.
    const MAX_PREVIEW_LIMIT: usize = 20;
    const MAX_SCAN_FILES: usize = 200_000;

    let root = state.current_root()?;
    let dir = dir.unwrap_or_default();
    let limit = preview_limit.unwrap_or(5).max(1).min(MAX_PREVIEW_LIMIT as u32) as usize;

    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<DirChildSummary>, String> {
        let start_rel = if dir.trim().is_empty() {
            PathBuf::new()
        } else {
            PathBuf::from(&dir)
        };
        deny_hidden_rel_path(&start_rel)?;
        let start_abs = paths::join_under(&root, &start_rel)?;
        if !start_abs.exists() {
            return Ok(Vec::new());
        }

        let mut out: Vec<DirChildSummary> = Vec::new();

        let entries = std::fs::read_dir(&start_abs).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let name = entry.file_name().to_string_lossy().to_string();
            if should_hide(&name) {
                continue;
            }
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if !meta.is_dir() {
                continue;
            }

            let child_rel = start_rel.join(&name);
            // `deny_hidden_rel_path` already blocks hidden components, but keep it consistent.
            deny_hidden_rel_path(&child_rel)?;

            let mut total_files: u32 = 0;
            let mut total_markdown: u32 = 0;
            let mut truncated = false;
            let mut scanned_files: usize = 0;

            // Min-heap by mtime: keep only the top-N newest markdown files.
            let mut heap: BinaryHeap<Reverse<(u64, String, String)>> = BinaryHeap::new();

            let mut stack: Vec<PathBuf> = vec![child_rel.clone()];
            while let Some(rel_dir) = stack.pop() {
                let abs_dir = match paths::join_under(&root, &rel_dir) {
                    Ok(p) => p,
                    Err(_) => continue,
                };
                let dir_entries = match std::fs::read_dir(&abs_dir) {
                    Ok(e) => e,
                    Err(_) => continue,
                };

                for e in dir_entries {
                    let e = match e {
                        Ok(x) => x,
                        Err(_) => continue,
                    };
                    let child_name = e.file_name().to_string_lossy().to_string();
                    if should_hide(&child_name) {
                        continue;
                    }
                    let m = match e.metadata() {
                        Ok(m) => m,
                        Err(_) => continue,
                    };
                    let child_rel2 = rel_dir.join(&child_name);

                    if m.is_dir() {
                        stack.push(child_rel2);
                        continue;
                    }
                    if !m.is_file() {
                        continue;
                    }

                    total_files = total_files.saturating_add(1);
                    scanned_files += 1;
                    if scanned_files >= MAX_SCAN_FILES {
                        truncated = true;
                        break;
                    }

                    if child_rel2.extension() == Some(OsStr::new("md")) {
                        total_markdown = total_markdown.saturating_add(1);
                        let abs_file = match paths::join_under(&root, &child_rel2) {
                            Ok(p) => p,
                            Err(_) => continue,
                        };
                        let mtime = file_mtime_ms(&abs_file);
                        let rel_s = child_rel2.to_string_lossy().to_string();
                        let item = (mtime, rel_s, child_name);
                        if heap.len() < limit {
                            heap.push(Reverse(item));
                        } else if let Some(Reverse((min_mtime, _, _))) = heap.peek() {
                            if mtime > *min_mtime {
                                let _ = heap.pop();
                                heap.push(Reverse(item));
                            }
                        }
                    }
                }

                if truncated {
                    break;
                }
            }

            let mut recent: Vec<RecentMarkdown> = heap
                .into_iter()
                .map(|Reverse((mtime_ms, rel_path, file_name))| RecentMarkdown {
                    rel_path,
                    name: file_name,
                    mtime_ms,
                })
                .collect();
            recent.sort_by(|a, b| {
                b.mtime_ms
                    .cmp(&a.mtime_ms)
                    .then_with(|| a.rel_path.to_lowercase().cmp(&b.rel_path.to_lowercase()))
            });

            out.push(DirChildSummary {
                dir_rel_path: child_rel.to_string_lossy().to_string(),
                name,
                total_files_recursive: total_files,
                total_markdown_recursive: total_markdown,
                recent_markdown: recent,
                truncated,
            });
        }

        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn vault_dir_recent_entries(
    state: State<'_, VaultState>,
    dir: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<RecentEntry>, String> {
    // Safety caps to avoid pathological vaults blocking the UI thread too long.
    const MAX_LIMIT: usize = 50;

    let root = state.current_root()?;
    let dir = dir.unwrap_or_default();
    let limit = limit.unwrap_or(5).max(1).min(MAX_LIMIT as u32) as usize;

    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<RecentEntry>, String> {
        let start_rel = if dir.trim().is_empty() {
            PathBuf::new()
        } else {
            PathBuf::from(&dir)
        };
        deny_hidden_rel_path(&start_rel)?;
        let start_abs = paths::join_under(&root, &start_rel)?;
        if !start_abs.exists() {
            return Ok(Vec::new());
        }

        // Min-heap by mtime: keep only the top-N newest entries.
        let mut heap: BinaryHeap<Reverse<(u64, String, String, bool)>> = BinaryHeap::new();

        for entry in std::fs::read_dir(&start_abs).map_err(|e| e.to_string())? {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let name = entry.file_name().to_string_lossy().to_string();
            if should_hide(&name) {
                continue;
            }
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if !meta.is_file() {
                continue;
            }

            let child_rel = start_rel.join(&name);
            deny_hidden_rel_path(&child_rel)?;
            let mtime_ms = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            let is_markdown = child_rel.extension() == Some(OsStr::new("md"));

            heap.push(Reverse((
                mtime_ms,
                child_rel.to_string_lossy().to_string(),
                name,
                is_markdown,
            )));
            if heap.len() > limit {
                heap.pop();
            }
        }

        let mut out: Vec<RecentEntry> = heap
            .into_iter()
            .map(|Reverse((mtime_ms, rel_path, name, is_markdown))| RecentEntry {
                rel_path,
                name,
                is_markdown,
                mtime_ms,
            })
            .collect();

        out.sort_by(|a, b| b.mtime_ms.cmp(&a.mtime_ms));
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn vault_list_dir(
    state: State<'_, VaultState>,
    dir: Option<String>,
) -> Result<Vec<FsEntry>, String> {
    let root = state.current_root()?;
    let dir = dir.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<FsEntry>, String> {
        let rel = if dir.trim().is_empty() { PathBuf::new() } else { PathBuf::from(&dir) };
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        let mut entries: Vec<FsEntry> = Vec::new();
        for entry in std::fs::read_dir(&abs).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let name_os = entry.file_name();
            let name = name_os.to_string_lossy().to_string();
            if should_hide(&name) {
                continue;
            }
            let meta = entry.metadata().map_err(|e| e.to_string())?;
            let kind = if meta.is_dir() {
                "dir"
            } else if meta.is_file() {
                "file"
            } else {
                continue;
            };
            let rel_path = rel.join(&name);
            let is_markdown = rel_path.extension() == Some(OsStr::new("md"));
            entries.push(FsEntry {
                name,
                rel_path: rel_path.to_string_lossy().to_string(),
                kind: kind.to_string(),
                is_markdown,
            });
        }

        // Dirs first, then name.
        entries.sort_by(|a, b| match (a.kind.as_str(), b.kind.as_str()) {
            ("dir", "file") => std::cmp::Ordering::Less,
            ("file", "dir") => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });

        Ok(entries)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn vault_read_text(
    state: State<'_, VaultState>,
    path: String,
) -> Result<TextFileDoc, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<TextFileDoc, String> {
        let rel = PathBuf::from(&path);
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        let bytes = std::fs::read(&abs).map_err(|e| e.to_string())?;
        let etag = etag_for(&bytes);
        let text =
            String::from_utf8(bytes).map_err(|_| "file is not valid UTF-8".to_string())?;
        Ok(TextFileDoc {
            rel_path: rel.to_string_lossy().to_string(),
            etag,
            mtime_ms: file_mtime_ms(&abs),
            text,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub struct TextFileDocBatch {
    pub rel_path: String,
    pub text: Option<String>,
    pub etag: Option<String>,
    pub mtime_ms: u64,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn vault_read_texts_batch(
    state: State<'_, VaultState>,
    paths: Vec<String>,
) -> Result<Vec<TextFileDocBatch>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<TextFileDocBatch>, String> {
        let mut results = Vec::with_capacity(paths.len());
        for path in paths {
            let rel = PathBuf::from(&path);
            let result = (|| -> Result<TextFileDocBatch, String> {
                deny_hidden_rel_path(&rel)?;
                let abs = paths::join_under(&root, &rel)?;
                let bytes = std::fs::read(&abs).map_err(|e| e.to_string())?;
                let etag = etag_for(&bytes);
                let text = String::from_utf8(bytes)
                    .map_err(|_| "file is not valid UTF-8".to_string())?;
                Ok(TextFileDocBatch {
                    rel_path: rel.to_string_lossy().to_string(),
                    text: Some(text),
                    etag: Some(etag),
                    mtime_ms: file_mtime_ms(&abs),
                    error: None,
                })
            })();
            match result {
                Ok(doc) => results.push(doc),
                Err(e) => results.push(TextFileDocBatch {
                    rel_path: path,
                    text: None,
                    etag: None,
                    mtime_ms: 0,
                    error: Some(e),
                }),
            }
        }
        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn vault_write_text(
    state: State<'_, VaultState>,
    path: String,
    text: String,
    base_mtime_ms: Option<u64>,
) -> Result<TextFileWriteResult, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<TextFileWriteResult, String> {
        let rel = PathBuf::from(&path);
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        if let Some(expected) = base_mtime_ms {
            let actual = file_mtime_ms(&abs);
            if actual != 0 && actual != expected {
                return Err("conflict: on-disk file changed since it was opened".to_string());
            }
        }
        if let Some(parent) = abs.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let rel_s = rel.to_string_lossy().to_string();
        let should_index = rel.extension() == Some(OsStr::new("md"));
        let text_for_index = if should_index { Some(text.clone()) } else { None };
        let bytes = text.into_bytes();
        io_atomic::write_atomic(&abs, &bytes).map_err(|e| e.to_string())?;
        if let Some(markdown) = text_for_index {
            // Indexing is derived; saving the file should not fail if indexing fails.
            let _ = index::index_note(&root, &rel_s, &markdown);
        }
        Ok(TextFileWriteResult {
            etag: etag_for(&bytes),
            mtime_ms: file_mtime_ms(&abs),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn vault_relativize_path(
    state: State<'_, VaultState>,
    abs_path: String,
) -> Result<String, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let root = root.canonicalize().map_err(|e| e.to_string())?;
        let abs_input = PathBuf::from(abs_path);
        let abs = if abs_input.exists() {
            abs_input.canonicalize().map_err(|e| e.to_string())?
        } else {
            let parent = abs_input
                .parent()
                .ok_or_else(|| "path has no parent directory".to_string())?;
            let file_name = abs_input
                .file_name()
                .ok_or_else(|| "path has no file name".to_string())?;
            let parent = parent.canonicalize().map_err(|e| e.to_string())?;
            parent.join(file_name)
        };
        let rel = abs
            .strip_prefix(&root)
            .map_err(|_| "path is not inside the current vault".to_string())?;
        Ok(rel.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
