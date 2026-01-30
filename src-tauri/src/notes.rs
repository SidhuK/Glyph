use crate::{io_atomic, paths, vault::VaultState};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    ffi::OsStr,
    fs::File,
    io::{Read, Write},
    path::{Path, PathBuf},
};
use tauri::State;
use time::format_description::well_known::Rfc3339;

#[derive(Serialize)]
pub struct NoteMeta {
    pub id: String,
    pub title: String,
    pub created: String,
    pub updated: String,
}

#[derive(Serialize)]
pub struct NoteDoc {
    pub meta: NoteMeta,
    pub markdown: String,
}

#[derive(Serialize)]
pub struct AttachmentResult {
    pub asset_rel_path: String,
    pub markdown: String,
}

#[derive(Default, Deserialize, Serialize)]
struct Frontmatter {
    id: Option<String>,
    title: Option<String>,
    created: Option<String>,
    updated: Option<String>,
    tags: Option<Vec<String>>,

    #[serde(flatten)]
    extra: std::collections::BTreeMap<String, serde_yaml::Value>,
}

fn now_rfc3339() -> String {
    time::OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn split_frontmatter(markdown: &str) -> (Option<&str>, &str) {
    let mut lines = markdown.lines();
    if lines.next() != Some("---") {
        return (None, markdown);
    }

    let mut end_byte = 0usize;
    let mut found_end = false;
    for (idx, line) in markdown.lines().enumerate() {
        if idx == 0 {
            end_byte += line.len() + 1;
            continue;
        }
        if line == "---" {
            found_end = true;
            break;
        }
        end_byte += line.len() + 1;
    }
    if !found_end {
        return (None, markdown);
    }

    // end_byte currently points to start of end marker line
    let fm = &markdown["---\n".len()..end_byte];
    // skip end marker line + trailing newline if present
    let rest = &markdown[end_byte..];
    let rest = rest.strip_prefix("---").unwrap_or(rest);
    let rest = rest.strip_prefix('\n').unwrap_or(rest);
    (Some(fm), rest)
}

fn render_frontmatter_yaml(fm: &Frontmatter) -> Result<String, String> {
    serde_yaml::to_string(fm).map_err(|e| e.to_string())
}

fn normalize_frontmatter(
    mut fm: Frontmatter,
    note_id: &str,
    default_title: Option<&str>,
    preserve_created: Option<&str>,
) -> Frontmatter {
    fm.id = Some(note_id.to_string());
    if fm.title.as_deref().unwrap_or("").is_empty() {
        fm.title = default_title.map(str::to_string).or_else(|| Some("Untitled".to_string()));
    }

    if fm.created.as_deref().unwrap_or("").is_empty() {
        fm.created = preserve_created.map(str::to_string).or_else(|| Some(now_rfc3339()));
    }

    fm.updated = Some(now_rfc3339());
    if fm.tags.is_none() {
        fm.tags = Some(Vec::new());
    }
    fm
}

fn parse_frontmatter(yaml: Option<&str>) -> Result<Frontmatter, String> {
    match yaml {
        None => Ok(Frontmatter::default()),
        Some(s) => {
            let v: Frontmatter = serde_yaml::from_str(s).map_err(|e| e.to_string())?;
            Ok(v)
        }
    }
}

fn note_rel_path(note_id: &str) -> Result<PathBuf, String> {
    let _ = uuid::Uuid::parse_str(note_id).map_err(|_| "invalid note id".to_string())?;
    Ok(PathBuf::from("notes").join(format!("{note_id}.md")))
}

fn note_abs_path(vault_root: &Path, note_id: &str) -> Result<PathBuf, String> {
    let rel = note_rel_path(note_id)?;
    paths::join_under(vault_root, &rel)
}

fn notes_dir(vault_root: &Path) -> Result<PathBuf, String> {
    paths::join_under(vault_root, Path::new("notes"))
}

fn assets_dir(vault_root: &Path) -> Result<PathBuf, String> {
    paths::join_under(vault_root, Path::new("assets"))
}

fn read_to_string(path: &Path) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

fn extract_meta(note_id: &str, markdown: &str) -> Result<NoteMeta, String> {
    let (yaml, _body) = split_frontmatter(markdown);
    let fm = parse_frontmatter(yaml)?;
    let created = fm.created.clone().unwrap_or_else(now_rfc3339);
    let updated = fm.updated.clone().unwrap_or_else(now_rfc3339);
    Ok(NoteMeta {
        id: note_id.to_string(),
        title: fm.title.unwrap_or_else(|| "Untitled".to_string()),
        created,
        updated,
    })
}

#[tauri::command]
pub async fn notes_list(state: State<'_, VaultState>) -> Result<Vec<NoteMeta>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<NoteMeta>, String> {
        let dir = notes_dir(&root)?;
        if !dir.exists() {
            return Ok(Vec::new());
        }

        let mut out: Vec<NoteMeta> = Vec::new();
        for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension() != Some(OsStr::new("md")) {
                continue;
            }
            let file_stem = match path.file_stem().and_then(|s| s.to_str()) {
                Some(s) => s,
                None => continue,
            };
            if uuid::Uuid::parse_str(file_stem).is_err() {
                continue;
            }
            let markdown = read_to_string(&path)?;
            out.push(extract_meta(file_stem, &markdown)?);
        }

        out.sort_by(|a, b| b.updated.cmp(&a.updated));
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn note_create(state: State<'_, VaultState>, title: String) -> Result<NoteMeta, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<NoteMeta, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let rel = note_rel_path(&id)?;
        let path = paths::join_under(&root, &rel)?;

        let now = now_rfc3339();
        let fm = Frontmatter {
            id: Some(id.clone()),
            title: Some(title.clone()),
            created: Some(now.clone()),
            updated: Some(now.clone()),
            tags: Some(Vec::new()),
            extra: Default::default(),
        };

        let yaml = render_frontmatter_yaml(&fm)?;
        let markdown = format!("---\n{yaml}---\n\n");
        io_atomic::write_atomic(&path, markdown.as_bytes()).map_err(|e| e.to_string())?;

        Ok(NoteMeta {
            id,
            title,
            created: now.clone(),
            updated: now,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn note_read(state: State<'_, VaultState>, id: String) -> Result<NoteDoc, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<NoteDoc, String> {
        let path = note_abs_path(&root, &id)?;
        let markdown = read_to_string(&path)?;
        let meta = extract_meta(&id, &markdown)?;
        Ok(NoteDoc { meta, markdown })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn read_existing_created(path: &Path) -> Option<String> {
    let markdown = std::fs::read_to_string(path).ok()?;
    let (yaml, _body) = split_frontmatter(&markdown);
    let fm = parse_frontmatter(yaml).ok()?;
    fm.created
}

#[tauri::command]
pub async fn note_write(state: State<'_, VaultState>, id: String, markdown: String) -> Result<(), String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let path = note_abs_path(&root, &id)?;
        let preserve_created = read_existing_created(&path);
        let (yaml, body) = split_frontmatter(&markdown);
        let fm = parse_frontmatter(yaml)?;
        let fm = normalize_frontmatter(fm, &id, None, preserve_created.as_deref());
        let yaml = render_frontmatter_yaml(&fm)?;
        let normalized = format!("---\n{yaml}---\n\n{}", body.trim_start_matches('\n'));
        io_atomic::write_atomic(&path, normalized.as_bytes()).map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn note_delete(state: State<'_, VaultState>, id: String) -> Result<(), String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let path = note_abs_path(&root, &id)?;
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn is_image_ext(ext: &str) -> bool {
    matches!(ext, "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg")
}

fn copy_into_assets_atomic(assets_dir: &Path, source: &Path) -> Result<(String, PathBuf), String> {
    let src_file = File::open(source).map_err(|e| e.to_string())?;
    let mut reader = std::io::BufReader::new(src_file);

    let original_ext = source
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    let ext = if original_ext.is_empty() {
        "".to_string()
    } else {
        format!(".{original_ext}")
    };

    // Write to a temp file while hashing, then rename to sha256.ext
    std::fs::create_dir_all(assets_dir).map_err(|e| e.to_string())?;
    let tmp_path = assets_dir.join(format!(".import.tmp.{}", uuid::Uuid::new_v4()));
    let mut tmp = File::create(&tmp_path).map_err(|e| e.to_string())?;

    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        tmp.write_all(&buf[..n]).map_err(|e| e.to_string())?;
    }
    tmp.sync_all().map_err(|e| e.to_string())?;

    let hash_hex = hex::encode(hasher.finalize());
    let file_name = format!("{hash_hex}{ext}");
    let dest_path = assets_dir.join(&file_name);

    if dest_path.exists() {
        let _ = std::fs::remove_file(&tmp_path);
        return Ok((file_name, dest_path));
    }

    std::fs::rename(&tmp_path, &dest_path).map_err(|e| e.to_string())?;
    Ok((file_name, dest_path))
}

#[tauri::command]
pub async fn note_attach_file(
    state: State<'_, VaultState>,
    note_id: String,
    source_path: String,
) -> Result<AttachmentResult, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<AttachmentResult, String> {
        let _ = note_rel_path(&note_id)?;
        let assets = assets_dir(&root)?;
        let source = PathBuf::from(source_path);
        if !source.is_file() {
            return Err("selected attachment is not a file".to_string());
        }

        let (file_name, _dest) = copy_into_assets_atomic(&assets, &source)?;
        let asset_rel_path = format!("assets/{file_name}");
        let note_rel = format!("../assets/{file_name}");

        let ext = Path::new(&file_name)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        let markdown = if !ext.is_empty() && is_image_ext(&ext) {
            format!("![]({note_rel})")
        } else {
            format!("[{file_name}]({note_rel})")
        };

        Ok(AttachmentResult {
            asset_rel_path,
            markdown,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

