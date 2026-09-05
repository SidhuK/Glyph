use objc2_app_kit::{NSApplication, NSImage};
use objc2_foundation::{MainThreadMarker, NSData};
use serde::Deserialize;
use tauri::Manager;
use tauri_plugin_store::StoreExt;

#[derive(Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AppIcon {
    #[default]
    Default,
    #[serde(rename = "blue-star")]
    BlueStar,
    #[serde(rename = "blue-glyph")]
    BlueGlyph,
    #[serde(rename = "confetti-star")]
    ConfettiStar,
}

fn apply(app: &tauri::AppHandle, icon: AppIcon) -> Result<(), String> {
    let mtm = MainThreadMarker::new().ok_or("app icon must be set on the main thread")?;
    let bytes: Option<&[u8]> = match icon {
        // Development runs do not have an installed app bundle to reset to.
        AppIcon::Default if tauri::is_dev() => Some(include_bytes!("../icons/icon.png")),
        AppIcon::Default => None,
        AppIcon::BlueStar => Some(include_bytes!("../icons/alternates/blue-star.png")),
        AppIcon::BlueGlyph => Some(include_bytes!("../icons/alternates/blue-glyph.png")),
        AppIcon::ConfettiStar => Some(include_bytes!("../icons/alternates/confetti-star.png")),
    };
    let image = bytes
        .map(|bytes| {
            NSImage::initWithData(mtm.alloc(), &NSData::with_bytes(bytes))
                .ok_or("failed to decode app icon")
        })
        .transpose()?;
    // SAFETY: AppKit is accessed on the main thread and the decoded image is
    // alive for the call. None restores the bundle's original icon.
    unsafe {
        NSApplication::sharedApplication(mtm).setApplicationIconImage(image.as_deref());
    }
    apply_badge(app, icon)
}

fn saved_icon(app: &tauri::AppHandle) -> Result<AppIcon, String> {
    let store = app.store("settings.json").map_err(|error| error.to_string())?;
    let icon = store
        .get("ui.appIcon")
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default();
    Ok(icon)
}

fn apply_badge(app: &tauri::AppHandle, icon: AppIcon) -> Result<(), String> {
    let is_alpha = app
        .package_info()
        .version
        .pre
        .as_str()
        .split('.')
        .any(|part| part == "alpha");
    let key = match icon {
        AppIcon::Default if tauri::is_dev() => Some("app.devBadge"),
        AppIcon::Default if is_alpha => Some("app.alphaBadge"),
        _ => None,
    };
    let state = app.state::<crate::MenuState>();
    let labels = state
        .menu_labels
        .lock()
        .map_err(|_| "failed to lock menu labels")?;
    // Translations arrive when the first webview initializes. Until then,
    // startup restores the artwork; the label sync below supplies the badge.
    let badge = key.and_then(|key| labels.get(key).cloned());
    drop(labels);
    if let Some(window) = app.webview_windows().values().next() {
        window
            .set_badge_label(badge)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn refresh_badge(app: &tauri::AppHandle) -> Result<(), String> {
    apply_badge(app, saved_icon(app)?)
}

pub fn restore(app: &tauri::AppHandle) -> Result<(), String> {
    apply(app, saved_icon(app)?)
}

#[tauri::command]
pub async fn app_set_icon(app: tauri::AppHandle, icon: AppIcon) -> Result<(), String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let result = apply(&handle, icon);
        if let Err(error) = &result {
            tracing::error!("failed to apply app icon: {error}");
        }
        let _ = sender.send(result);
    })
    .map_err(|error| error.to_string())?;
    receiver.await.map_err(|error| error.to_string())?
}
