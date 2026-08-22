use std::path::PathBuf;

use tauri::http::{header, StatusCode};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};
use tracing::warn;

use crate::paths;
use crate::space::SpaceState;
use crate::space_fs::helpers::deny_hidden_rel_path;

pub fn handle<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app = ctx.app_handle().clone();
    let webview_label = ctx.webview_label().to_string();
    let uri = request.uri().clone();
    std::thread::spawn(move || {
        responder.respond(response_for_request(&app, &webview_label, &uri));
    });
}

fn response_for_request<R: Runtime>(
    app: &tauri::AppHandle<R>,
    webview_label: &str,
    uri: &tauri::http::Uri,
) -> tauri::http::Response<Vec<u8>> {
    match load_image(app, webview_label, uri) {
        Ok((mime, bytes)) => http_response(
            StatusCode::OK,
            &[
                (header::CONTENT_TYPE, mime),
                (header::CACHE_CONTROL, "no-store"),
            ],
            bytes,
        ),
        Err(status) => {
            if status != StatusCode::NOT_FOUND {
                warn!(
                    webview = webview_label,
                    status = status.as_u16(),
                    "glyphasset request failed"
                );
            }
            http_response(status, &[], Vec::new())
        }
    }
}

fn load_image<R: Runtime>(
    app: &tauri::AppHandle<R>,
    webview_label: &str,
    uri: &tauri::http::Uri,
) -> Result<(&'static str, Vec<u8>), StatusCode> {
    let host = uri.host().unwrap_or("localhost");
    if host != "localhost" {
        return Err(StatusCode::NOT_FOUND);
    }

    let rel = decode_rel_path(uri.path()).ok_or(StatusCode::NOT_FOUND)?;
    deny_hidden_rel_path(&rel).map_err(|_| StatusCode::NOT_FOUND)?;

    let ext = rel
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    let mime = mime_for_image_ext(&ext).ok_or(StatusCode::NOT_FOUND)?;

    let space_state = app.try_state::<SpaceState>().ok_or(StatusCode::NOT_FOUND)?;
    let root = space_state
        .root_for_webview_label(webview_label)
        .map_err(|_| StatusCode::NOT_FOUND)?;
    let abs = paths::join_under(&root, &rel).map_err(|_| StatusCode::NOT_FOUND)?;
    let canonical_root = root.canonicalize().map_err(|_| StatusCode::NOT_FOUND)?;
    let canonical_path = abs.canonicalize().map_err(|_| StatusCode::NOT_FOUND)?;
    if !canonical_path.starts_with(&canonical_root) || !canonical_path.is_file() {
        return Err(StatusCode::NOT_FOUND);
    }

    let bytes = std::fs::read(&canonical_path).map_err(|_| StatusCode::NOT_FOUND)?;
    Ok((mime, bytes))
}

fn decode_rel_path(uri_path: &str) -> Option<PathBuf> {
    let trimmed = uri_path.trim_start_matches('/');
    if trimmed.is_empty() {
        return None;
    }
    let decoded = percent_decode_utf8(trimmed)?;
    let rel = PathBuf::from(decoded.replace('\\', "/"));
    if rel.as_os_str().is_empty() || rel.is_absolute() {
        return None;
    }
    Some(rel)
}

fn percent_decode_utf8(value: &str) -> Option<String> {
    if !value.as_bytes().contains(&b'%') {
        return Some(value.to_string());
    }

    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let Some(high) = hex_value(bytes[index + 1]) else {
                return None;
            };
            let Some(low) = hex_value(bytes[index + 2]) else {
                return None;
            };
            decoded.push((high << 4) | low);
            index += 3;
            continue;
        }
        decoded.push(bytes[index]);
        index += 1;
    }
    String::from_utf8(decoded).ok()
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn mime_for_image_ext(ext: &str) -> Option<&'static str> {
    match ext {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "svg" => Some("image/svg+xml"),
        "bmp" => Some("image/bmp"),
        "avif" => Some("image/avif"),
        "tif" | "tiff" => Some("image/tiff"),
        _ => None,
    }
}

fn http_response(
    status: StatusCode,
    headers: &[(header::HeaderName, &'static str)],
    body: Vec<u8>,
) -> tauri::http::Response<Vec<u8>> {
    let mut builder = tauri::http::Response::builder().status(status);
    for (name, value) in headers {
        builder = builder.header(name, *value);
    }
    builder.body(body).unwrap_or_else(|_| {
        tauri::http::Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(Vec::new())
            .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()))
    })
}
