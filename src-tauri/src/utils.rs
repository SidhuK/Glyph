use sha2::{Digest, Sha256};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

fn timestamp_strings_from_metadata(metadata: &std::fs::Metadata) -> (String, String) {
    let fallback = system_time_to_rfc3339(SystemTime::now())
        .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string());
    let updated = metadata
        .modified()
        .ok()
        .and_then(system_time_to_rfc3339)
        .unwrap_or_else(|| fallback.clone());
    let created = metadata
        .created()
        .ok()
        .and_then(system_time_to_rfc3339)
        .unwrap_or_else(|| updated.clone());
    (created, updated)
}

pub fn system_time_to_rfc3339(time: SystemTime) -> Option<String> {
    let dt = time::OffsetDateTime::from(time);
    dt.format(&time::format_description::well_known::Rfc3339)
        .ok()
}

pub fn file_timestamp_strings(path: &Path) -> (String, String) {
    let metadata = match std::fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => {
            let fallback = system_time_to_rfc3339(SystemTime::now())
                .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string());
            return (fallback.clone(), fallback);
        }
    };
    timestamp_strings_from_metadata(&metadata)
}

pub fn file_timestamp_strings_if_exists(path: &Path) -> Option<(String, String)> {
    std::fs::metadata(path)
        .ok()
        .map(|metadata| timestamp_strings_from_metadata(&metadata))
}

pub fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
        .unwrap_or(false)
}

pub fn path_extension_lower(path: &str) -> Option<String> {
    Path::new(path)
        .file_name()
        .and_then(|name| Path::new(name).extension())
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
}

pub fn has_explicit_file_extension(path: &str) -> bool {
    path_extension_lower(path)
        .is_some_and(|ext| !ext.is_empty() && !ext.chars().any(char::is_whitespace))
}

pub fn is_markdown_extension(ext: &str) -> bool {
    ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown")
}

pub fn is_pdf_extension(ext: &str) -> bool {
    ext.eq_ignore_ascii_case("pdf")
}

pub fn is_image_extension(ext: &str) -> bool {
    matches!(
        ext.to_ascii_lowercase().as_str(),
        "png" | "jpg" | "jpeg" | "webp" | "gif" | "svg" | "bmp" | "avif" | "tif" | "tiff"
    )
}

pub fn is_wikilink_file_extension(ext: &str) -> bool {
    is_markdown_extension(ext) || is_pdf_extension(ext) || is_image_extension(ext)
}

pub fn has_wikilink_file_extension(path: &str) -> bool {
    path_extension_lower(path).is_some_and(|ext| is_wikilink_file_extension(&ext))
}

pub fn is_image_path(path: &str) -> bool {
    path_extension_lower(path).is_some_and(|ext| is_image_extension(&ext))
}

pub fn is_pdf_path(path: &str) -> bool {
    path_extension_lower(path).is_some_and(|ext| is_pdf_extension(&ext))
}

pub fn should_hide(name: &str) -> bool {
    name.starts_with('.')
}

pub fn to_slash(path: &Path) -> String {
    path.components()
        .filter_map(|c| c.as_os_str().to_str())
        .collect::<Vec<_>>()
        .join("/")
}

pub fn file_mtime_ms(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    hex::encode(h.finalize())
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
