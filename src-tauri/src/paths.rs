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
