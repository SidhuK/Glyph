use std::path::Path;

pub use crate::utils::{file_mtime_ms, should_hide};

pub fn etag_for(bytes: &[u8]) -> String {
    crate::utils::sha256_hex(bytes)
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
