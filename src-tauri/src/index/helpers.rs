use sha2::{Digest, Sha256};
use std::{ffi::OsStr, path::Path};

pub fn now_sqlite_compatible_iso8601() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    hex::encode(h.finalize())
}

pub fn should_skip_entry(name: &OsStr) -> bool {
    name.to_string_lossy().starts_with('.')
}

pub fn path_to_slash_string(rel: &Path) -> String {
    rel.components()
        .filter_map(|c| c.as_os_str().to_str())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("/")
}
