use std::{
    path::{Path, PathBuf},
    time::Duration,
};
use url::Url;

use crate::{glyph_paths, net};

pub const MAX_HTML_BYTES: u64 = 1024 * 512;
pub const MAX_IMAGE_BYTES: u64 = 1024 * 1024 * 2;
pub const TTL_OK_MS: u64 = 1000 * 60 * 60 * 24;
pub const TTL_ERR_MS: u64 = 1000 * 60 * 10;

pub use crate::utils::now_ms;

pub fn sha256_hex(s: &str) -> String {
    crate::utils::sha256_hex(s.as_bytes())
}

pub fn cache_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let base = glyph_paths::ensure_glyph_cache_dir(vault_root)?;
    Ok(base.join("link-previews"))
}

pub fn cache_path(vault_root: &Path, normalized_url: &str) -> Result<PathBuf, String> {
    let dir = cache_dir(vault_root)?;
    Ok(dir.join(format!("{}.json", sha256_hex(normalized_url))))
}

pub fn image_rel_path(image_url: &Url) -> PathBuf {
    let mut ext = ".img";
    if let Some(seg) = image_url.path().rsplit('/').next() {
        if let Some(dot) = seg.rfind('.') {
            let cand = &seg[dot..];
            if matches!(
                cand.to_ascii_lowercase().as_str(),
                ".png" | ".jpg" | ".jpeg" | ".webp" | ".gif"
            ) {
                ext = cand;
            }
        }
    }
    PathBuf::from(".glyph/cache/link-previews").join(format!(
        "{}{}",
        sha256_hex(image_url.as_str()),
        ext
    ))
}

pub fn normalize_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "invalid url".to_string())?;
    match url.scheme() {
        "http" | "https" => {}
        _ => return Err("only http(s) urls are allowed".to_string()),
    }
    net::validate_url_host(&url, false)?;
    Ok(url)
}

pub fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())
}

pub fn resolve_image_url(page: &Url, raw: &str) -> Option<Url> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let parsed = Url::parse(trimmed).or_else(|_| page.join(trimmed)).ok()?;
    match parsed.scheme() {
        "http" | "https" => {}
        _ => return None,
    }
    Some(parsed)
}
