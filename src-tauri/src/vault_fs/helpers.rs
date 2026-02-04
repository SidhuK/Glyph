use sha2::{Digest, Sha256};
use std::path::Path;

pub fn etag_for(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

pub fn file_mtime_ms(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn should_hide(name: &str) -> bool {
    name.starts_with('.')
}

pub fn deny_hidden_rel_path(rel: &Path) -> Result<(), String> {
    for c in rel.components() {
        let s = c.as_os_str().to_string_lossy();
        if s.starts_with('.') {
            return Err("hidden paths are not accessible via vault FS".to_string());
        }
    }
    Ok(())
}
