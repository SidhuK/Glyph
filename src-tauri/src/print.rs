use tauri::{AppHandle, Manager};

use crate::io_atomic;

fn sanitized_print_file_name(file_stem: &str) -> String {
    let stem = file_stem
        .trim()
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            _ if ch.is_control() => '-',
            _ => ch,
        })
        .collect::<String>();
    let trimmed = stem.trim_matches(|ch| matches!(ch, ' ' | '.' | '-'));
    if trimmed.is_empty() {
        "Glyph Print.html".to_string()
    } else {
        format!("{trimmed}.html")
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn print_write_html(
    app: AppHandle,
    file_stem: String,
    html: String,
) -> Result<String, String> {
    let print_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("print");
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        std::fs::create_dir_all(&print_dir).map_err(|error| error.to_string())?;
        let path = print_dir.join(sanitized_print_file_name(&file_stem));
        io_atomic::write_atomic(&path, html.as_bytes()).map_err(|error| error.to_string())?;
        Ok(path.to_string_lossy().to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}
