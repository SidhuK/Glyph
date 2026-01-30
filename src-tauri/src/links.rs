use crate::{io_atomic, paths, vault::VaultState};
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::State;
use url::Url;

#[derive(Serialize, Deserialize, Clone)]
pub struct LinkPreview {
  pub url: String,
  pub hostname: String,
  pub title: String,
  pub description: String,
  pub image_url: Option<String>,
  pub fetched_at_ms: u64,
}

const MAX_HTML_BYTES: u64 = 1024 * 512;
const TTL_OK_MS: u64 = 1000 * 60 * 60 * 24; // 24h
const TTL_ERR_MS: u64 = 1000 * 60 * 10; // 10m

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn sha256_hex(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    hex::encode(h.finalize())
}

fn cache_dir(vault_root: &Path) -> Result<PathBuf, String> {
    paths::join_under(vault_root, Path::new("cache/link-previews"))
}

fn cache_path(vault_root: &Path, normalized_url: &str) -> Result<PathBuf, String> {
    let dir = cache_dir(vault_root)?;
    Ok(dir.join(format!("{}.json", sha256_hex(normalized_url))))
}

fn normalize_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "invalid url".to_string())?;
    match url.scheme() {
        "http" | "https" => {}
        _ => return Err("only http(s) urls are allowed".to_string()),
    }
    Ok(url)
}

fn extract_meta(html: &str, key: &str) -> Option<String> {
    // Handles both property/name and both attribute orders in common cases.
    let key_re = regex::escape(key);
    let patterns = [
        format!(r#"(?is)<meta[^>]+property=["']{key_re}["'][^>]+content=["']([^"']+)["']"#),
        format!(r#"(?is)<meta[^>]+name=["']{key_re}["'][^>]+content=["']([^"']+)["']"#),
        format!(r#"(?is)<meta[^>]+content=["']([^"']+)["'][^>]+property=["']{key_re}["']"#),
        format!(r#"(?is)<meta[^>]+content=["']([^"']+)["'][^>]+name=["']{key_re}["']"#),
    ];
    for pat in patterns {
        if let Ok(re) = Regex::new(&pat) {
            if let Some(c) = re.captures(html) {
                if let Some(m) = c.get(1) {
                    let v = m.as_str().trim();
                    if !v.is_empty() {
                        return Some(v.to_string());
                    }
                }
            }
        }
    }
    None
}

fn extract_title(html: &str) -> Option<String> {
    if let Some(v) = extract_meta(html, "og:title") {
        return Some(v);
    }
    let re = Regex::new(r#"(?is)<title[^>]*>(.*?)</title>"#).ok()?;
    let cap = re.captures(html)?;
    let title = cap.get(1)?.as_str().trim();
    if title.is_empty() {
        None
    } else {
        Some(title.to_string())
    }
}

fn extract_description(html: &str) -> Option<String> {
    extract_meta(html, "og:description").or_else(|| extract_meta(html, "description"))
}

fn extract_image(html: &str) -> Option<String> {
    extract_meta(html, "og:image")
}

fn read_cache(path: &Path) -> Option<LinkPreview> {
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn write_cache(path: &Path, preview: &LinkPreview) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(preview).map_err(|e| e.to_string())?;
    io_atomic::write_atomic(path, &bytes).map_err(|e| e.to_string())
}

fn fetch_html(url: &Url) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(url.clone())
        .header("User-Agent", "Tether/0.1 (link preview)")
        .send()
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("http {}", resp.status()));
    }

    let mut reader = resp.take(MAX_HTML_BYTES);
    let mut buf = Vec::<u8>::new();
    reader.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    String::from_utf8(buf).map_err(|_| "invalid utf-8 html".to_string())
}

fn build_preview(normalized: &Url, html: Option<&str>, err: Option<&str>) -> LinkPreview {
    let hostname = normalized.host_str().unwrap_or("").to_string();
    let (title, description, image_url) = match (html, err) {
        (Some(html), _) => (
            extract_title(html).unwrap_or_else(|| hostname.clone()),
            extract_description(html).unwrap_or_default(),
            extract_image(html),
        ),
        (None, Some(_)) => (hostname.clone(), "".to_string(), None),
        (None, None) => (hostname.clone(), "".to_string(), None),
    };

    LinkPreview {
        url: normalized.as_str().to_string(),
        hostname,
        title,
        description,
        image_url,
        fetched_at_ms: now_ms(),
    }
}

#[tauri::command]
pub async fn link_preview(state: State<'_, VaultState>, url: String) -> Result<LinkPreview, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<LinkPreview, String> {
        let normalized = normalize_url(&url)?;
        let normalized_str = normalized.as_str().to_string();

        let path = cache_path(&root, &normalized_str)?;
        if let Some(cached) = read_cache(&path) {
            let age = now_ms().saturating_sub(cached.fetched_at_ms);
            // If we cached a "fallback only" result, keep a shorter TTL.
            let ttl = if cached.description.is_empty() && cached.image_url.is_none() { TTL_ERR_MS } else { TTL_OK_MS };
            if age <= ttl {
                return Ok(cached);
            }
        }

        let dir = cache_dir(&root)?;
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

        match fetch_html(&normalized) {
            Ok(html) => {
                let preview = build_preview(&normalized, Some(&html), None);
                let _ = write_cache(&path, &preview);
                Ok(preview)
            }
            Err(e) => {
                let preview = build_preview(&normalized, None, Some(&e));
                let _ = write_cache(&path, &preview);
                Ok(preview)
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
