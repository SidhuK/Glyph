use std::ffi::OsStr;

pub use crate::utils::{sha256_hex, to_slash as path_to_slash_string};

pub fn now_sqlite_compatible_iso8601() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

pub fn should_skip_entry(name: &OsStr) -> bool {
    name.to_string_lossy().starts_with('.')
}
