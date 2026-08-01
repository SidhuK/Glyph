use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use encoding_rs::{Encoding, UTF_8};
use flate2::read::GzDecoder;
use futures_util::StreamExt;
use regex::{Captures, Regex};
use reqwest::{header, redirect::Policy, Client, StatusCode};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::net::SocketAddr;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use url::{Host, Url};

use crate::net;

const MAX_REDIRECTS: usize = 4;
const MAX_RESPONSE_BYTES: usize = 512 * 1024;
const MAX_FAVICON_BYTES: usize = 128 * 1024;
const MAX_PREVIEW_IMAGE_BYTES: usize = 256 * 1024;
const MAX_DECODED_IMAGE_BYTES: u64 = 4 * 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_CACHED_PREVIEWS: usize = 20;

#[derive(Clone, Serialize)]
pub struct ExternalLinkPreview {
    pub title: String,
    pub site_name: String,
    pub favicon_data_url: Option<String>,
    pub image_data_url: Option<String>,
    pub accent_color: Option<String>,
    pub accent_is_light: bool,
}

struct FetchedImage {
    accent_color: Option<String>,
    data_url: String,
}

fn preview_cache() -> &'static Mutex<HashMap<String, ExternalLinkPreview>> {
    static CACHE: OnceLock<Mutex<HashMap<String, ExternalLinkPreview>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn meta_tag_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(r"(?is)<meta\b[^>]*>").expect("valid meta tag regex"))
}

fn attribute_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r#"(?i)([^\s=/>]+)\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s\"'=<>`]+))"#)
            .expect("valid attribute regex")
    })
}

fn title_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(r"(?is)<title\b[^>]*>(.*?)</title>").expect("valid title regex"))
}

fn link_tag_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(r"(?is)<link\b[^>]*>").expect("valid link tag regex"))
}

fn numeric_entity_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"(?i)&#(?:x([0-9a-f]+)|([0-9]+));").expect("valid numeric entity regex")
    })
}

fn decode_html(value: &str) -> String {
    let named = value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ");
    numeric_entity_pattern()
        .replace_all(&named, |captures: &Captures| {
            let code_point = match (captures.get(1), captures.get(2)) {
                (Some(hex), _) => u32::from_str_radix(hex.as_str(), 16).ok(),
                (_, Some(decimal)) => decimal.as_str().parse::<u32>().ok(),
                _ => None,
            };
            code_point
                .and_then(char::from_u32)
                .map(|character| character.to_string())
                .unwrap_or_else(|| captures[0].to_string())
        })
        .into_owned()
}

fn normalized_text(value: &str, max_chars: usize) -> String {
    let collapsed = decode_html(value)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if collapsed.chars().count() <= max_chars {
        return collapsed;
    }
    let truncated: String = collapsed.chars().take(max_chars.saturating_sub(1)).collect();
    format!("{truncated}…")
}

fn tag_attributes(tag: &str) -> Vec<(String, String)> {
    attribute_pattern()
        .captures_iter(tag)
        .filter_map(|attr| {
            let name = attr.get(1)?.as_str().to_ascii_lowercase();
            let value = attr
                .get(2)
                .or_else(|| attr.get(3))
                .or_else(|| attr.get(4))?
                .as_str()
                .to_string();
            Some((name, value))
        })
        .collect()
}

fn meta_values(html: &str) -> Vec<(String, String)> {
    meta_tag_pattern()
        .find_iter(html)
        .filter_map(|tag| {
            let attributes = tag_attributes(tag.as_str());
            let key = attributes.iter().find_map(|(name, value)| {
                matches!(name.as_str(), "property" | "name").then_some(value.to_ascii_lowercase())
            });
            let content = attributes
                .iter()
                .find_map(|(name, value)| (name == "content").then_some(value.clone()));
            Some((key?, content?))
        })
        .collect()
}

fn favicon_url(page_url: &Url, html: &str) -> Option<Url> {
    let href = link_tag_pattern().find_iter(html).find_map(|tag| {
        let attributes = tag_attributes(tag.as_str());
        let rel = attributes
            .iter()
            .find_map(|(name, value)| (name == "rel").then_some(value))?;
        let is_icon = rel
            .split_ascii_whitespace()
            .any(|value| {
                value.eq_ignore_ascii_case("icon")
                    || value.to_ascii_lowercase().ends_with("-icon")
            });
        if !is_icon {
            return None;
        }
        attributes
            .iter()
            .find_map(|(name, value)| (name == "href").then_some(value.clone()))
    });
    href.and_then(|value| page_url.join(&decode_html(&value)).ok())
}

fn preview_image_url(page_url: &Url, html: &str) -> Option<Url> {
    let values = meta_values(html);
    let image_url = values.iter().find_map(|(key, value)| {
        matches!(key.as_str(), "og:image" | "twitter:image").then_some(value)
    })?;
    page_url.join(&decode_html(image_url)).ok()
}

fn supported_favicon_content_type(content_type: &str) -> Option<&'static str> {
    match content_type {
        "image/avif" => Some("image/avif"),
        "image/gif" => Some("image/gif"),
        "image/jpeg" => Some("image/jpeg"),
        "image/png" => Some("image/png"),
        "image/vnd.microsoft.icon" | "image/x-icon" => Some("image/x-icon"),
        "image/webp" => Some("image/webp"),
        _ => None,
    }
}

fn theme_color(html: &str) -> Option<String> {
    meta_values(html)
        .iter()
        .find_map(|(key, value)| {
            matches!(
                key.as_str(),
                "theme-color" | "msapplication-tilecolor"
            )
            .then_some(value.trim())
        })
        .filter(|value| {
            value.starts_with('#')
                && matches!(value.len(), 4 | 7)
                && value[1..].chars().all(|character| character.is_ascii_hexdigit())
        })
        .map(str::to_string)
}

fn color_is_light(color: &str) -> bool {
    let hex = &color[1..];
    let channel = |index: usize| match hex.len() {
        3 => u8::from_str_radix(&hex[index..=index], 16)
            .ok()
            .map(|value| value * 17),
        6 => u8::from_str_radix(&hex[index * 2..index * 2 + 2], 16).ok(),
        _ => None,
    };
    let (Some(red), Some(green), Some(blue)) = (channel(0), channel(1), channel(2)) else {
        return false;
    };
    u32::from(red) * 299 + u32::from(green) * 587 + u32::from(blue) * 114 > 160_000
}

fn image_dimensions_fit(width: u32, height: u32) -> bool {
    width > 0
        && height > 0
        && u64::from(width)
            .saturating_mul(u64::from(height))
            .saturating_mul(4)
            <= MAX_DECODED_IMAGE_BYTES
}

fn png_dimensions_fit(bytes: &[u8]) -> bool {
    const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
    if bytes.len() < 24 || &bytes[..8] != PNG_SIGNATURE || &bytes[12..16] != b"IHDR" {
        return false;
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().unwrap_or_default());
    let height = u32::from_be_bytes(bytes[20..24].try_into().unwrap_or_default());
    image_dimensions_fit(width, height)
}

fn icon_dimensions_fit(entry: &ico::IconDirEntry) -> bool {
    if entry.is_png() {
        return png_dimensions_fit(entry.data());
    }
    let bytes = entry.data();
    if bytes.len() < 12 {
        return false;
    }
    let width = i32::from_le_bytes(bytes[4..8].try_into().unwrap_or_default());
    let height = i32::from_le_bytes(bytes[8..12].try_into().unwrap_or_default());
    width > 0
        && height > 1
        && image_dimensions_fit(width as u32, (height as u32) / 2)
}

fn prominent_image_color(content_type: &str, bytes: &[u8]) -> Option<String> {
    let image = match content_type {
        "image/png" if png_dimensions_fit(bytes) => {
            ico::IconImage::read_png(Cursor::new(bytes)).ok()?
        }
        "image/png" => return None,
        "image/vnd.microsoft.icon" | "image/x-icon" => {
            let icon_dir = ico::IconDir::read(Cursor::new(bytes)).ok()?;
            icon_dir
                .entries()
                .iter()
                .filter(|entry| {
                    image_dimensions_fit(entry.width(), entry.height())
                        && icon_dimensions_fit(entry)
                })
                .max_by_key(|entry| entry.width().saturating_mul(entry.height()))?
                .decode()
                .ok()?
        }
        _ => return None,
    };
    let mut buckets = [0_u32; 512];
    for pixel in image.rgba_data().chunks_exact(4) {
        let alpha = u32::from(pixel[3]);
        if alpha < 192 {
            continue;
        }
        let index = (usize::from(pixel[0] >> 5) << 6)
            | (usize::from(pixel[1] >> 5) << 3)
            | usize::from(pixel[2] >> 5);
        buckets[index] += alpha;
    }
    let (index, weight) = buckets
        .iter()
        .enumerate()
        .max_by_key(|(_, weight)| *weight)?;
    if *weight == 0 {
        return None;
    }
    let red = (((index >> 6) & 0b111) as u8) * 32 + 16;
    let green = (((index >> 3) & 0b111) as u8) * 32 + 16;
    let blue = ((index & 0b111) as u8) * 32 + 16;
    Some(format!("#{red:02x}{green:02x}{blue:02x}"))
}

fn preview_from_html(
    url: &Url,
    html: &str,
    favicon_data_url: Option<String>,
    image_data_url: Option<String>,
    image_accent_color: Option<String>,
) -> ExternalLinkPreview {
    let values = meta_values(html);
    let find_meta = |keys: &[&str]| {
        values.iter().find_map(|(key, value)| {
            keys.contains(&key.as_str()).then_some(value.as_str())
        })
    };
    let document_title = title_pattern()
        .captures(html)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str());
    let site_name = find_meta(&["og:site_name", "twitter:site"])
        .map(|value| normalized_text(value, 100))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| url.host_str().unwrap_or_default().to_string());
    let title = find_meta(&["og:title", "twitter:title"])
        .or(document_title)
        .map(|value| normalized_text(value, 180))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| site_name.clone());
    let accent_color = image_accent_color.or_else(|| theme_color(html));
    let accent_is_light = match accent_color.as_deref() {
        Some(color) => color_is_light(color),
        None => false,
    };

    ExternalLinkPreview {
        title,
        site_name,
        favicon_data_url,
        image_data_url,
        accent_color,
        accent_is_light,
    }
}

struct CheckedUrl {
    url: Url,
    addresses: Vec<SocketAddr>,
}

async fn validate_public_url(url: Url) -> Result<CheckedUrl, String> {
    tokio::time::timeout(
        REQUEST_TIMEOUT,
        tauri::async_runtime::spawn_blocking(move || {
            let addresses = net::public_url_addresses(&url, false)?;
            Ok(CheckedUrl { url, addresses })
        }),
    )
    .await
    .map_err(|_| "dns lookup timed out".to_string())?
    .map_err(|error| error.to_string())?
}

fn preview_client(checked: &CheckedUrl) -> Result<Client, String> {
    let mut builder = Client::builder()
        .redirect(Policy::none())
        .no_proxy()
        .timeout(REQUEST_TIMEOUT)
        .user_agent("Glyph Link Preview");
    if let Some(Host::Domain(host)) = checked.url.host() {
        builder = builder.resolve_to_addrs(host, &checked.addresses);
    }
    builder.build().map_err(|error| error.to_string())
}

fn charset(content_type: Option<&str>) -> Option<&str> {
    content_type?.split(';').skip(1).find_map(|parameter| {
        let (name, value) = parameter.trim().split_once('=')?;
        name.trim()
            .eq_ignore_ascii_case("charset")
            .then_some(value.trim().trim_matches(['\"', '\'']))
    })
}

fn decode_html_bytes(
    content_encoding: Option<&str>,
    content_type: Option<&str>,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let is_gzip = content_encoding
        .is_some_and(|value| value.eq_ignore_ascii_case("gzip"));
    let bytes = if is_gzip {
        let mut decoder = GzDecoder::new(bytes.as_slice());
        let mut decoded = Vec::new();
        decoder
            .by_ref()
            .take((MAX_RESPONSE_BYTES + 1) as u64)
            .read_to_end(&mut decoded)
            .map_err(|error| error.to_string())?;
        if decoded.len() > MAX_RESPONSE_BYTES {
            return Err("response is too large".to_string());
        }
        decoded
    } else {
        bytes
    };
    let encoding = charset(content_type)
        .and_then(|value| Encoding::for_label(value.as_bytes()))
        .unwrap_or(UTF_8);
    Ok(encoding.decode(&bytes).0.into_owned())
}

async fn fetch_html(url: Url) -> Result<(Url, String), String> {
    let mut current = url;

    for _ in 0..=MAX_REDIRECTS {
        let checked = validate_public_url(current).await?;
        let client = preview_client(&checked)?;
        let response = client
            .get(checked.url.clone())
            .header(header::ACCEPT, "text/html,application/xhtml+xml")
            .send()
            .await
            .map_err(|error| error.to_string())?;

        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| "redirect without a location".to_string())?;
            current = checked.url.join(location).map_err(|error| error.to_string())?;
            continue;
        }
        if response.status() != StatusCode::OK {
            return Err(format!("unexpected response status {}", response.status()));
        }
        let content_type = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let is_html = content_type.as_deref().is_none_or(|value| {
            matches!(
                value.split(';').next().map(str::trim),
                Some(media_type)
                    if media_type.eq_ignore_ascii_case("text/html")
                        || media_type.eq_ignore_ascii_case("application/xhtml+xml")
            )
        });
        if !is_html {
            return Err("response is not HTML".to_string());
        }
        let content_encoding = response
            .headers()
            .get(header::CONTENT_ENCODING)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);

        let mut bytes = Vec::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|error| error.to_string())?;
            if bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
                return Err("response is too large".to_string());
            }
            bytes.extend_from_slice(&chunk);
        }
        return decode_html_bytes(content_encoding.as_deref(), content_type.as_deref(), bytes)
            .map(|html| (checked.url, html));
    }

    Err("too many redirects".to_string())
}

async fn fetch_image(url: Url, max_bytes: usize) -> Option<FetchedImage> {
    let mut current = url;

    for _ in 0..=MAX_REDIRECTS {
        let checked = validate_public_url(current).await.ok()?;
        let client = preview_client(&checked).ok()?;
        let response = client
            .get(checked.url.clone())
            .header(header::ACCEPT, "image/avif,image/webp,image/png,image/jpeg,image/gif,image/x-icon,*/*;q=0.8")
            .send()
            .await
            .ok()?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(header::LOCATION)
                .and_then(|value| value.to_str().ok())?;
            current = checked.url.join(location).ok()?;
            continue;
        }
        if response.status() != StatusCode::OK {
            return None;
        }
        let raw_content_type = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("image/x-icon")
            .split(';')
            .next()
            .unwrap_or("image/x-icon")
            .trim()
            .to_ascii_lowercase();
        let content_type = supported_favicon_content_type(&raw_content_type)?;

        let mut bytes = Vec::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.ok()?;
            if bytes.len() + chunk.len() > max_bytes {
                return None;
            }
            bytes.extend_from_slice(&chunk);
        }
        if bytes.is_empty() {
            return None;
        }
        let data_url = format!("data:{content_type};base64,{}", BASE64.encode(&bytes));
        let accent_color = tauri::async_runtime::spawn_blocking(move || {
            prominent_image_color(content_type, &bytes)
        })
        .await
        .ok()
        .flatten();
        return Some(FetchedImage {
            accent_color,
            data_url,
        });
    }

    None
}

async fn fetch_favicon(url: Url) -> Option<FetchedImage> {
    fetch_image(url, MAX_FAVICON_BYTES).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn external_link_preview(url: String) -> Result<ExternalLinkPreview, String> {
    let url = Url::parse(url.trim()).map_err(|error| error.to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("only http(s) urls are allowed".to_string());
    }
    let cache_key = url.to_string();
    if let Ok(cache) = preview_cache().lock() {
        if let Some(preview) = cache.get(&cache_key) {
            return Ok(preview.clone());
        }
    }
    let (resolved_url, html) = fetch_html(url).await?;
    let image = match preview_image_url(&resolved_url, &html) {
        Some(url) => fetch_image(url, MAX_PREVIEW_IMAGE_BYTES).await,
        None => None,
    };
    let preferred_favicon_url = favicon_url(&resolved_url, &html);
    let fallback_favicon_url = resolved_url.join("/favicon.ico").ok();
    let favicon = match preferred_favicon_url {
        Some(url) => {
            let preview = fetch_favicon(url.clone()).await;
            if preview.is_some() || fallback_favicon_url.as_ref() == Some(&url) {
                preview
            } else {
                match fallback_favicon_url {
                    Some(fallback_url) => fetch_favicon(fallback_url).await,
                    None => None,
                }
            }
        }
        None => match fallback_favicon_url {
            Some(url) => fetch_favicon(url).await,
            None => None,
        },
    };
    let image_accent_color = favicon
        .as_ref()
        .and_then(|image| image.accent_color.clone())
        .or_else(|| image.as_ref().and_then(|image| image.accent_color.clone()));
    let favicon_data_url = favicon.map(|image| image.data_url);
    let image_data_url = image.map(|image| image.data_url);
    let preview = preview_from_html(
        &resolved_url,
        &html,
        favicon_data_url,
        image_data_url,
        image_accent_color,
    );
    if let Ok(mut cache) = preview_cache().lock() {
        if cache.len() >= MAX_CACHED_PREVIEWS {
            if let Some(key) = cache.keys().next().cloned() {
                cache.remove(&key);
            }
        }
        cache.insert(cache_key, preview.clone());
    }
    Ok(preview)
}
