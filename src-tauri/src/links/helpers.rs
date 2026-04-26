use std::time::Duration;
use url::Url;

use crate::net;

pub const MAX_HTML_BYTES: u64 = 1024 * 512;

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
