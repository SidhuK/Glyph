use crate::{io_atomic, paths, vault::VaultState};
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    net::{IpAddr, ToSocketAddrs},
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
  #[serde(default)]
  pub image_cache_rel_path: Option<String>,
  pub fetched_at_ms: u64,
  #[serde(default)]
  pub ok: bool,
}

const MAX_HTML_BYTES: u64 = 1024 * 512;
const MAX_IMAGE_BYTES: u64 = 1024 * 1024 * 2;
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

fn image_rel_path(image_url: &Url) -> PathBuf {
    let mut ext = ".img";
    if let Some(seg) = image_url.path().rsplit('/').next() {
        if let Some(dot) = seg.rfind('.') {
            let cand = &seg[dot..];
            if matches!(cand.to_ascii_lowercase().as_str(), ".png" | ".jpg" | ".jpeg" | ".webp" | ".gif") {
                ext = cand;
            }
        }
    }
    PathBuf::from("cache/link-previews").join(format!("{}{}", sha256_hex(image_url.as_str()), ext))
}

fn is_forbidden_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_documentation()
                || v4.is_unspecified()
                || v4.is_multicast()
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unicast_link_local()
                || v6.is_unique_local()
                || v6.is_unspecified()
                || v6.is_multicast()
        }
    }
}

fn validate_public_host(url: &Url) -> Result<(), String> {
    let host = url.host_str().ok_or_else(|| "invalid url host".to_string())?;
    if host.eq_ignore_ascii_case("localhost") {
        return Err("forbidden host".to_string());
    }

    // If the host is an IP literal, block private/loopback/etc directly.
    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_forbidden_ip(ip) {
            return Err("forbidden host".to_string());
        }
        return Ok(());
    }

    // Best-effort DNS check to avoid obvious SSRF to private ranges.
    let port = match url.scheme() {
        "http" => 80,
        "https" => 443,
        _ => return Err("only http(s) urls are allowed".to_string()),
    };
    let addrs: Vec<IpAddr> = (host, port)
        .to_socket_addrs()
        .map_err(|_| "dns lookup failed".to_string())?
        .map(|a| a.ip())
        .collect();
    if addrs.is_empty() {
        return Err("dns lookup failed".to_string());
    }
    if addrs.into_iter().any(is_forbidden_ip) {
        return Err("forbidden host".to_string());
    }
    Ok(())
}

fn normalize_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "invalid url".to_string())?;
    match url.scheme() {
        "http" | "https" => {}
        _ => return Err("only http(s) urls are allowed".to_string()),
    }
    validate_public_host(&url)?;
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

fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())
}

fn fetch_html(client: &reqwest::blocking::Client, url: &Url) -> Result<String, String> {
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

#[derive(Deserialize)]
struct YouTubeOEmbed {
    title: Option<String>,
    thumbnail_url: Option<String>,
}

fn is_youtube(url: &Url) -> bool {
    let host = url.host_str().unwrap_or("").to_ascii_lowercase();
    host == "youtube.com"
        || host.ends_with(".youtube.com")
        || host == "youtu.be"
        || host == "m.youtube.com"
}

fn fetch_youtube_oembed(
    client: &reqwest::blocking::Client,
    normalized: &Url,
) -> Result<Option<(String, Option<String>)>, String> {
    if !is_youtube(normalized) {
        return Ok(None);
    }
    let oembed = Url::parse_with_params(
        "https://www.youtube.com/oembed",
        &[("format", "json"), ("url", normalized.as_str())],
    )
    .map_err(|e| e.to_string())?;
    validate_public_host(&oembed)?;
    let resp = client
        .get(oembed)
        .header("User-Agent", "Tether/0.1 (link preview)")
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let bytes = resp.bytes().map_err(|e| e.to_string())?;
    let parsed: YouTubeOEmbed = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    let title = parsed.title.unwrap_or_default().trim().to_string();
    if title.is_empty() {
        return Ok(None);
    }
    Ok(Some((title, parsed.thumbnail_url)))
}

fn resolve_image_url(page: &Url, raw: &str) -> Option<Url> {
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

fn download_image(
    client: &reqwest::blocking::Client,
    vault_root: &Path,
    image_url: &Url,
) -> Result<Option<String>, String> {
    validate_public_host(image_url)?;
    let rel = image_rel_path(image_url);
    let abs = paths::join_under(vault_root, &rel)?;
    if abs.exists() {
        return Ok(Some(rel.to_string_lossy().to_string()));
    }
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let resp = client
        .get(image_url.clone())
        .header("User-Agent", "Tether/0.1 (link preview)")
        .header("Accept", "image/*")
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok(None);
    }

    let mut reader = resp.take(MAX_IMAGE_BYTES);
    let mut buf = Vec::<u8>::new();
    reader.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    if buf.is_empty() {
        return Ok(None);
    }
    io_atomic::write_atomic(&abs, &buf).map_err(|e| e.to_string())?;
    Ok(Some(rel.to_string_lossy().to_string()))
}

fn build_preview(
    vault_root: &Path,
    client: &reqwest::blocking::Client,
    normalized: &Url,
    html: Option<&str>,
    err: Option<&str>,
) -> LinkPreview {
    let hostname = normalized.host_str().unwrap_or("").to_string();
    let mut ok = html.is_some() && err.is_none();

    let mut title = hostname.clone();
    let mut description = "".to_string();
    let mut image_url: Option<String> = None;
    if let Ok(Some((yt_title, yt_thumb))) = fetch_youtube_oembed(client, normalized) {
        title = yt_title;
        image_url = yt_thumb;
        ok = true;
    }
    if let Some(html) = html {
        title = extract_title(html).unwrap_or_else(|| title.clone());
        description = extract_description(html).unwrap_or_default();
        image_url = extract_image(html).or(image_url);
        ok = true;
    }

    let (image_url, image_cache_rel_path) = match image_url
        .as_deref()
        .and_then(|raw| resolve_image_url(normalized, raw))
    {
        None => (image_url, None),
        Some(resolved) => {
            let rel = download_image(client, vault_root, &resolved).ok().flatten();
            (Some(resolved.as_str().to_string()), rel)
        }
    };

    LinkPreview {
        url: normalized.as_str().to_string(),
        hostname,
        title,
        description,
        image_url,
        image_cache_rel_path,
        fetched_at_ms: now_ms(),
        ok,
    }
}

#[tauri::command]
pub async fn link_preview(
    state: State<'_, VaultState>,
    url: String,
    force: Option<bool>,
) -> Result<LinkPreview, String> {
    let root = state.current_root()?;
    let force = force.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || -> Result<LinkPreview, String> {
        let client = http_client()?;
        let normalized = normalize_url(&url)?;
        let normalized_str = normalized.as_str().to_string();

        let path = cache_path(&root, &normalized_str)?;
        if !force {
            if let Some(cached) = read_cache(&path) {
                let age = now_ms().saturating_sub(cached.fetched_at_ms);
                let ttl = if cached.ok { TTL_OK_MS } else { TTL_ERR_MS };
                if age <= ttl {
                    return Ok(cached);
                }
            }
        }

        let dir = cache_dir(&root)?;
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

        match fetch_html(&client, &normalized) {
            Ok(html) => {
                let preview = build_preview(&root, &client, &normalized, Some(&html), None);
                let _ = write_cache(&path, &preview);
                Ok(preview)
            }
            Err(e) => {
                let preview = build_preview(&root, &client, &normalized, None, Some(&e));
                let _ = write_cache(&path, &preview);
                Ok(preview)
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
