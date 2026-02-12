use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use regex::Regex;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::json;

use crate::{index::open_db, io_atomic, paths};

const MAX_READ_BYTES: u64 = 512 * 1024;
const MAX_READ_CHARS: usize = 12_000;
const MAX_LIST_LIMIT: usize = 5_000;
const MAX_SEARCH_LIMIT: usize = 200;
const CONFIRM_TOKEN: &str = "CONFIRM";

#[derive(Debug, Clone)]
pub struct ToolError(pub String);

impl std::fmt::Display for ToolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for ToolError {}
impl From<String> for ToolError {
    fn from(value: String) -> Self {
        Self(value)
    }
}
impl From<std::io::Error> for ToolError {
    fn from(value: std::io::Error) -> Self {
        Self(value.to_string())
    }
}

fn deny_hidden_rel_path(rel: &Path) -> Result<(), ToolError> {
    for c in rel.components() {
        if c.as_os_str().to_string_lossy().starts_with('.') {
            return Err(ToolError("hidden paths are not accessible".to_string()));
        }
    }
    Ok(())
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
        .unwrap_or(false)
}

fn is_utf8_text(path: &Path) -> bool {
    let Ok(bytes) = fs::read(path) else { return false };
    std::str::from_utf8(&bytes).is_ok()
}

fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, ToolError> {
    let rel = PathBuf::from(rel.trim());
    deny_hidden_rel_path(&rel)?;
    Ok(paths::join_under(root, &rel).map_err(ToolError)?)
}

fn mtime_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn ok(payload: serde_json::Value) -> String {
    json!({"ok": true, "payload": payload}).to_string()
}

fn err_payload(error: &str) -> String {
    json!({"ok": false, "error": error}).to_string()
}

fn tool_definition<T: JsonSchema>(name: &str, description: &str) -> ToolDefinition {
    let parameters = serde_json::to_value(schemars::schema_for!(T))
        .unwrap_or_else(|_| json!({"type": "object"}));
    ToolDefinition {
        name: name.to_string(),
        description: description.to_string(),
        parameters,
    }
}

#[derive(Clone)]
pub struct ListDirTool {
    pub root: PathBuf,
}
#[derive(Deserialize, JsonSchema)]
pub struct ListDirArgs {
    path: Option<String>,
    recursive: Option<bool>,
    depth: Option<u32>,
    limit: Option<u32>,
}
impl Tool for ListDirTool {
    const NAME: &'static str = "list_dir";
    type Args = ListDirArgs;
    type Output = String;
    type Error = ToolError;
    async fn definition(&self, _prompt: String) -> ToolDefinition {
        tool_definition::<ListDirArgs>(
            Self::NAME,
            "List files and folders under a vault-relative path.",
        )
    }
    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let dir = args.path.unwrap_or_default();
        let start = safe_join(&self.root, &dir)?;
        if !start.exists() {
            return Ok(ok(json!({"files": [], "truncated": false})));
        }
        let recursive = args.recursive.unwrap_or(false);
        let depth = args.depth.unwrap_or(3) as usize;
        let limit = args.limit.unwrap_or(200).min(MAX_LIST_LIMIT as u32) as usize;
        let mut out = Vec::new();
        let mut stack = vec![(PathBuf::from(dir.clone()), 0usize)];
        while let Some((rel, d)) = stack.pop() {
            let abs = safe_join(&self.root, &rel.to_string_lossy())?;
            let entries = match fs::read_dir(abs) {
                Ok(v) => v,
                Err(_) => continue,
            };
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') {
                    continue;
                }
                let child_rel = rel.join(&name);
                let meta = match entry.metadata() {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                out.push(json!({
                    "name": name,
                    "rel_path": child_rel.to_string_lossy().to_string(),
                    "kind": if meta.is_dir() { "dir" } else { "file" },
                    "is_markdown": meta.is_file() && is_markdown_path(&child_rel),
                    "size_bytes": if meta.is_file() { meta.len() } else { 0 },
                    "mtime_ms": mtime_ms(&meta),
                }));
                if out.len() >= limit {
                    return Ok(ok(json!({"files": out, "truncated": true})));
                }
                if recursive && meta.is_dir() && d < depth {
                    stack.push((child_rel, d + 1));
                }
            }
        }
        Ok(ok(json!({"files": out, "truncated": false})))
    }
}

#[derive(Clone)]
pub struct SearchTool {
    pub root: PathBuf,
}
#[derive(Deserialize, JsonSchema)]
pub struct SearchArgs {
    query: String,
    path: Option<String>,
    regex: Option<bool>,
    file_types: Option<Vec<String>>,
    limit: Option<u32>,
}
impl Tool for SearchTool {
    const NAME: &'static str = "search";
    type Args = SearchArgs;
    type Output = String;
    type Error = ToolError;
    async fn definition(&self, _prompt: String) -> ToolDefinition {
        tool_definition::<SearchArgs>(
            Self::NAME,
            "Search file names and text content in the vault.",
        )
    }
    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let query = args.query.trim();
        if query.is_empty() {
            return Ok(err_payload("query is required"));
        }
        let limit = args.limit.unwrap_or(30).min(MAX_SEARCH_LIMIT as u32) as usize;
        let dir = args.path.unwrap_or_default();
        let root = safe_join(&self.root, &dir)?;
        if !root.exists() {
            return Ok(ok(json!({"results": [], "truncated": false})));
        }
        if dir.trim().is_empty() && !args.regex.unwrap_or(false) {
            let conn = open_db(&self.root).map_err(ToolError)?;
            let mut rows = Vec::new();
            if let Ok(mut stmt) = conn.prepare("SELECT id, title, snippet(notes_fts, 2, '⟦', '⟧', '…', 10) AS snip, bm25(notes_fts) AS score FROM notes_fts WHERE notes_fts MATCH ? ORDER BY score LIMIT ?") {
                if let Ok(mut q) = stmt.query(rusqlite::params![query, limit as i64]) {
                    while let Some(row) = q.next().map_err(|e| ToolError(e.to_string()))? {
                        rows.push(json!({
                            "id": row.get::<_, String>(0).map_err(|e| ToolError(e.to_string()))?,
                            "title": row.get::<_, String>(1).map_err(|e| ToolError(e.to_string()))?,
                            "snippet": row.get::<_, String>(2).map_err(|e| ToolError(e.to_string()))?,
                            "score": row.get::<_, f64>(3).map_err(|e| ToolError(e.to_string()))?,
                        }));
                    }
                }
            }
            if !rows.is_empty() {
                return Ok(ok(json!({"results": rows, "truncated": false, "source": "fts"})));
            }
        }
        let matcher = if args.regex.unwrap_or(false) {
            Some(Regex::new(query).map_err(|e| ToolError(e.to_string()))?)
        } else {
            None
        };
        let exts = args.file_types.unwrap_or_default();
        let mut out = Vec::new();
        let mut stack = vec![PathBuf::from(dir)];
        while let Some(rel_dir) = stack.pop() {
            let abs_dir = safe_join(&self.root, &rel_dir.to_string_lossy())?;
            let entries = match fs::read_dir(abs_dir) {
                Ok(v) => v,
                Err(_) => continue,
            };
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') {
                    continue;
                }
                let meta = match entry.metadata() {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let rel = rel_dir.join(&name);
                if meta.is_dir() {
                    stack.push(rel);
                    continue;
                }
                if !meta.is_file() || meta.len() > MAX_READ_BYTES || !is_utf8_text(&entry.path()) {
                    continue;
                }
                if !exts.is_empty() {
                    let ext = rel.extension().and_then(|s| s.to_str()).unwrap_or("").to_string();
                    if !exts.iter().any(|x| x.eq_ignore_ascii_case(&ext)) {
                        continue;
                    }
                }
                let text = match fs::read_to_string(entry.path()) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let idx = if let Some(re) = &matcher {
                    re.find(&text).map(|m| m.start())
                } else {
                    text.to_lowercase().find(&query.to_lowercase())
                };
                if let Some(i) = idx {
                    let start = i.saturating_sub(80);
                    let end = (i + 220).min(text.len());
                    let snippet = text.get(start..end).unwrap_or("").replace('\n', " ");
                    out.push(json!({"rel_path": rel.to_string_lossy().to_string(), "snippet": snippet.trim()}));
                    if out.len() >= limit {
                        return Ok(ok(json!({"results": out, "truncated": true, "source": "fs"})));
                    }
                }
            }
        }
        Ok(ok(json!({"results": out, "truncated": false, "source": "fs"})))
    }
}

#[derive(Clone)]
pub struct StatTool {
    pub root: PathBuf,
}
#[derive(Deserialize, JsonSchema)]
pub struct StatArgs {
    path: String,
}
impl Tool for StatTool {
    const NAME: &'static str = "stat";
    type Args = StatArgs;
    type Output = String;
    type Error = ToolError;
    async fn definition(&self, _prompt: String) -> ToolDefinition {
        tool_definition::<StatArgs>(Self::NAME, "Read metadata for a file or directory.")
    }
    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let abs = safe_join(&self.root, &args.path)?;
        let meta = fs::metadata(&abs)?;
        Ok(ok(json!({
            "path": args.path,
            "kind": if meta.is_dir() { "dir" } else { "file" },
            "size_bytes": meta.len(),
            "mtime_ms": mtime_ms(&meta),
            "is_markdown": meta.is_file() && is_markdown_path(Path::new(&args.path)),
        })))
    }
}

#[derive(Clone)]
pub struct ReadFileTool {
    pub root: PathBuf,
}
#[derive(Deserialize, JsonSchema)]
pub struct ReadFileArgs {
    path: String,
    offset: Option<usize>,
    length: Option<usize>,
    max_chars: Option<usize>,
}
impl Tool for ReadFileTool {
    const NAME: &'static str = "read_file";
    type Args = ReadFileArgs;
    type Output = String;
    type Error = ToolError;
    async fn definition(&self, _prompt: String) -> ToolDefinition {
        tool_definition::<ReadFileArgs>(
            Self::NAME,
            "Read UTF-8 text from a file with optional offsets and length limits.",
        )
    }
    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let abs = safe_join(&self.root, &args.path)?;
        let meta = fs::metadata(&abs)?;
        if meta.len() > MAX_READ_BYTES || !is_utf8_text(&abs) {
            return Ok(err_payload("binary or oversized file blocked"));
        }
        let text = fs::read_to_string(&abs)?;
        let start = args.offset.unwrap_or(0).min(text.len());
        let mut end = text.len();
        if let Some(len) = args.length {
            end = (start + len).min(text.len());
        }
        let window = text.get(start..end).unwrap_or("").to_string();
        let cap = args.max_chars.unwrap_or(MAX_READ_CHARS).min(MAX_READ_CHARS);
        let mut out = String::new();
        let mut total = 0usize;
        for ch in window.chars() {
            total += 1;
            if out.chars().count() < cap {
                out.push(ch);
            }
        }
        Ok(ok(json!({"path": args.path, "text": out, "truncated": total > cap, "total_chars": total})))
    }
}

#[derive(Clone)]
pub struct ReadFilesBatchTool {
    pub root: PathBuf,
}
#[derive(Deserialize, JsonSchema)]
pub struct ReadFilesBatchArgs {
    paths: Vec<String>,
    max_chars_each: Option<usize>,
}
impl Tool for ReadFilesBatchTool {
    const NAME: &'static str = "read_files_batch";
    type Args = ReadFilesBatchArgs;
    type Output = String;
    type Error = ToolError;
    async fn definition(&self, _prompt: String) -> ToolDefinition {
        tool_definition::<ReadFilesBatchArgs>(
            Self::NAME,
            "Read multiple UTF-8 text files in one call.",
        )
    }
    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let max_chars = args.max_chars_each.unwrap_or(3000).min(MAX_READ_CHARS);
        let mut results = Vec::new();
        for path in args.paths.into_iter().take(40) {
            let res = ReadFileTool { root: self.root.clone() }
                .call(ReadFileArgs { path, offset: None, length: None, max_chars: Some(max_chars) })
                .await
                .unwrap_or_else(|e| err_payload(&e.to_string()));
            results.push(serde_json::from_str::<serde_json::Value>(&res).unwrap_or_else(|_| json!({"ok": false})));
        }
        Ok(ok(json!({"results": results})))
    }
}

#[derive(Clone)]
pub struct WriteFileTool { pub root: PathBuf }
#[derive(Deserialize, JsonSchema)]
pub struct WriteFileArgs { path: String, content: String, mode: Option<String>, confirm_token: Option<String> }
impl Tool for WriteFileTool {
    const NAME: &'static str = "write_file";
    type Args = WriteFileArgs;
    type Output = String;
    type Error = ToolError;
    async fn definition(&self, _prompt: String) -> ToolDefinition {
        tool_definition::<WriteFileArgs>(
            Self::NAME,
            "Create or overwrite a file. Overwrites require confirmation token.",
        )
    }
    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let abs = safe_join(&self.root, &args.path)?;
        if let Some(parent) = abs.parent() { fs::create_dir_all(parent)?; }
        let exists = abs.exists();
        let mode = args.mode.unwrap_or_else(|| "overwrite".to_string());
        if exists && mode == "create_only" {
            return Ok(err_payload("file already exists"));
        }
        if exists && mode == "overwrite" && args.confirm_token.as_deref() != Some(CONFIRM_TOKEN) {
            return Ok(json!({"ok": false, "requires_confirmation": true, "preview": {"path": args.path, "action": "overwrite"}}).to_string());
        }
        io_atomic::write_atomic(&abs, args.content.as_bytes()).map_err(|e| ToolError(e.to_string()))?;
        Ok(ok(json!({"path": args.path, "bytes_written": args.content.len()})))
    }
}

#[derive(Clone)]
pub struct ApplyPatchTool { pub root: PathBuf }
#[derive(Deserialize, JsonSchema)]
pub struct ApplyPatchArgs { path: String, find: String, replace: String, all: Option<bool>, confirm_token: Option<String> }
impl Tool for ApplyPatchTool {
    const NAME: &'static str = "apply_patch";
    type Args = ApplyPatchArgs;
    type Output = String;
    type Error = ToolError;
    async fn definition(&self, _prompt: String) -> ToolDefinition {
        tool_definition::<ApplyPatchArgs>(
            Self::NAME,
            "Apply a simple find/replace patch to a text file.",
        )
    }
    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let abs = safe_join(&self.root, &args.path)?;
        let text = fs::read_to_string(&abs).map_err(|e| ToolError(e.to_string()))?;
        let updated = if args.all.unwrap_or(false) { text.replace(&args.find, &args.replace) } else { text.replacen(&args.find, &args.replace, 1) };
        if updated == text {
            return Ok(err_payload("no matching text for patch"));
        }
        if args.confirm_token.as_deref() != Some(CONFIRM_TOKEN) {
            return Ok(json!({"ok": false, "requires_confirmation": true, "preview": {"path": args.path, "action": "patch"}}).to_string());
        }
        io_atomic::write_atomic(&abs, updated.as_bytes()).map_err(|e| ToolError(e.to_string()))?;
        Ok(ok(json!({"path": args.path, "patched": true})))
    }
}

#[derive(Clone)]
pub struct MoveTool { pub root: PathBuf }
#[derive(Deserialize, JsonSchema)]
pub struct MoveArgs { src: String, dest: String, confirm_token: Option<String> }
impl Tool for MoveTool {
    const NAME: &'static str = "move";
    type Args = MoveArgs;
    type Output = String;
    type Error = ToolError;
    async fn definition(&self, _prompt: String) -> ToolDefinition {
        tool_definition::<MoveArgs>(
            Self::NAME,
            "Move or rename a path within the vault. Overwrites require confirmation.",
        )
    }
    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let src = safe_join(&self.root, &args.src)?;
        let dest = safe_join(&self.root, &args.dest)?;
        if let Some(parent) = dest.parent() { fs::create_dir_all(parent)?; }
        if dest.exists() && args.confirm_token.as_deref() != Some(CONFIRM_TOKEN) {
            return Ok(json!({"ok": false, "requires_confirmation": true, "preview": {"src": args.src, "dest": args.dest, "action": "overwrite_move"}}).to_string());
        }
        fs::rename(src, dest)?;
        Ok(ok(json!({"src": args.src, "dest": args.dest})))
    }
}

#[derive(Clone)]
pub struct MkdirTool { pub root: PathBuf }
#[derive(Deserialize, JsonSchema)]
pub struct MkdirArgs { path: String, parents: Option<bool> }
impl Tool for MkdirTool {
    const NAME: &'static str = "mkdir";
    type Args = MkdirArgs;
    type Output = String;
    type Error = ToolError;
    async fn definition(&self, _prompt: String) -> ToolDefinition {
        tool_definition::<MkdirArgs>(Self::NAME, "Create a directory path.")
    }
    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let abs = safe_join(&self.root, &args.path)?;
        if args.parents.unwrap_or(true) { fs::create_dir_all(&abs)?; } else { fs::create_dir(&abs)?; }
        Ok(ok(json!({"path": args.path})))
    }
}

#[derive(Clone)]
pub struct DeleteTool { pub root: PathBuf }
#[derive(Deserialize, JsonSchema)]
pub struct DeleteArgs { path: String, recursive: Option<bool>, confirm_token: Option<String> }
impl Tool for DeleteTool {
    const NAME: &'static str = "delete";
    type Args = DeleteArgs;
    type Output = String;
    type Error = ToolError;
    async fn definition(&self, _prompt: String) -> ToolDefinition {
        tool_definition::<DeleteArgs>(
            Self::NAME,
            "Delete a file or directory. Recursive deletes require confirmation token.",
        )
    }
    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let abs = safe_join(&self.root, &args.path)?;
        let recursive = args.recursive.unwrap_or(false);
        if (recursive || abs.is_dir()) && args.confirm_token.as_deref() != Some(CONFIRM_TOKEN) {
            return Ok(json!({"ok": false, "requires_confirmation": true, "preview": {"path": args.path, "recursive": recursive, "action": "delete"}}).to_string());
        }
        if abs.is_dir() {
            if recursive { fs::remove_dir_all(abs)?; } else { fs::remove_dir(abs)?; }
        } else if abs.exists() {
            fs::remove_file(abs)?;
        } else {
            return Ok(err_payload("path not found"));
        }
        Ok(ok(json!({"path": args.path, "deleted": true})))
    }
}

#[derive(Clone)]
pub struct ToolBundle {
    pub list_dir: ListDirTool,
    pub search: SearchTool,
    pub stat: StatTool,
    pub read_file: ReadFileTool,
    pub read_files_batch: ReadFilesBatchTool,
    pub write_file: WriteFileTool,
    pub apply_patch: ApplyPatchTool,
    pub move_path: MoveTool,
    pub mkdir: MkdirTool,
    pub delete: DeleteTool,
}

impl ToolBundle {
    pub fn new(root: PathBuf) -> Self {
        Self {
            list_dir: ListDirTool { root: root.clone() },
            search: SearchTool { root: root.clone() },
            stat: StatTool { root: root.clone() },
            read_file: ReadFileTool { root: root.clone() },
            read_files_batch: ReadFilesBatchTool { root: root.clone() },
            write_file: WriteFileTool { root: root.clone() },
            apply_patch: ApplyPatchTool { root: root.clone() },
            move_path: MoveTool { root: root.clone() },
            mkdir: MkdirTool { root: root.clone() },
            delete: DeleteTool { root },
        }
    }
}
