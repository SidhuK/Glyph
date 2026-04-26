use regex::Regex;
use std::io::Read;
use url::Url;

use super::helpers::MAX_HTML_BYTES;

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

pub fn fetch_html(client: &reqwest::blocking::Client, url: &Url) -> Result<String, String> {
    let resp = client
        .get(url.clone())
        .header("User-Agent", "Glyph/0.1 (web clip)")
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
