use std::path::{Component, Path, PathBuf};

pub fn join_under(root: &Path, rel: &Path) -> Result<PathBuf, String> {
    if rel.is_absolute() {
        return Err("relative path must not be absolute".to_string());
    }

    for c in rel.components() {
        match c {
            Component::Normal(_) | Component::CurDir => {}
            Component::ParentDir => return Err("relative path must not contain '..'".to_string()),
            Component::RootDir | Component::Prefix(_) => {
                return Err("invalid path component".to_string())
            }
        }
    }

    Ok(root.join(rel))
}

pub fn rewrite_entry_path(path: &str, from_path: &str, to_path: &str) -> Option<String> {
    if path == from_path {
        return Some(to_path.to_string());
    }
    let prefix = format!("{from_path}/");
    path.strip_prefix(&prefix)
        .map(|suffix| format!("{to_path}/{suffix}"))
}

pub fn should_remove_entry(path: &str, target_path: &str) -> bool {
    path == target_path || path.starts_with(&format!("{target_path}/"))
}
