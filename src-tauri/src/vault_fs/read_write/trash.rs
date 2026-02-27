use std::path::{Path, PathBuf};

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn home_dir() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "could not resolve HOME directory for Trash".to_string())
}

#[cfg(target_os = "macos")]
fn resolve_trash_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".Trash"))
}

#[cfg(target_os = "linux")]
fn resolve_trash_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".local/share/Trash/files"))
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn resolve_trash_dir() -> Result<PathBuf, String> {
    Err("Move to Trash is not supported on this platform".to_string())
}

fn unique_trash_dest(trash_dir: &Path, src: &Path) -> Result<PathBuf, String> {
    let file_name = src
        .file_name()
        .ok_or_else(|| "invalid path: missing file name".to_string())?;
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("item")
        .to_string();
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default();

    let base = trash_dir.join(file_name);
    if !base.exists() {
        return Ok(base);
    }

    for i in 2..10_000 {
        let candidate = trash_dir.join(format!("{stem} {i}{ext}"));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("unable to find an available Trash destination name".to_string())
}

pub(super) fn move_path_to_trash(src: &Path) -> Result<(), String> {
    let trash_dir = resolve_trash_dir()?;
    std::fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;
    let dest = unique_trash_dest(&trash_dir, src)?;
    std::fs::rename(src, &dest).map_err(|e| e.to_string())
}
