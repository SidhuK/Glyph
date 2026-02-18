use regex::Regex;
use serde::Deserialize;
use std::{fs, io::Read, path::Path};
use url::Url;

use crate::{io_atomic, net, paths};

use super::helpers::{image_rel_path, now_ms, MAX_HTML_BYTES, MAX_IMAGE_BYTES};
use super::types::LinkPreview;

pub fn extract_meta(html: &str, key: &str) -> Option<String> {
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

pub fn extract_title(html: &str) -> Option<String> {
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

pub fn extract_description(html: &str) -> Option<String> {
    extract_meta(html, "og:description").or_else(|| extract_meta(html, "description"))
}

pub fn extract_image(html: &str) -> Option<String> {
    extract_meta(html, "og:image")
}

pub fn fetch_html(client: &reqwest::blocking::Client, url: &Url) -> Result<String, String> {
    let resp = client
        .get(url.clone())
        .header("User-Agent", "Glyph/0.1 (link preview)")
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

pub fn fetch_youtube_oembed(
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
    net::validate_url_host(&oembed, false)?;
    let resp = client
        .get(oembed)
        .header("User-Agent", "Glyph/0.1 (link preview)")
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

pub fn download_image(
    client: &reqwest::blocking::Client,
    vault_root: &Path,
    image_url: &Url,
) -> Result<Option<String>, String> {
    net::validate_url_host(image_url, false)?;
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
        .header("User-Agent", "Glyph/0.1 (link preview)")
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

pub fn build_preview(
    vault_root: &Path,
    client: &reqwest::blocking::Client,
    normalized: &Url,
    html: Option<&str>,
    err: Option<&str>,
    resolve_image_url_fn: fn(&Url, &str) -> Option<Url>,
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
        .and_then(|raw| resolve_image_url_fn(normalized, raw))
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
