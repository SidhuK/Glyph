//! Spotlight-style floating panels (Quick Note, Quick Search) and the global
//! shortcuts that summon them while another app is focused.

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State, TitleBarStyle, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tracing::warn;

pub(crate) const QUICK_NOTE_WINDOW_LABEL: &str = "quick-note";
pub(crate) const QUICK_SEARCH_WINDOW_LABEL: &str = "quick-search";
const QUICK_SEARCH_SHOWN_EVENT: &str = "quick-search:shown";

static FLOATING_WINDOW_LOCK: Mutex<()> = Mutex::new(());

/// Corner radius for the floating cards (CSS + macOS vibrancy).
const FLOATING_WINDOW_CORNER_RADIUS: f64 = 20.0;

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum FloatingWindow {
    QuickNote,
    QuickSearch,
}

impl FloatingWindow {
    fn label(self) -> &'static str {
        match self {
            Self::QuickNote => QUICK_NOTE_WINDOW_LABEL,
            Self::QuickSearch => QUICK_SEARCH_WINDOW_LABEL,
        }
    }
}

pub(crate) fn is_floating_window_label(label: &str) -> bool {
    label == QUICK_NOTE_WINDOW_LABEL || label == QUICK_SEARCH_WINDOW_LABEL
}

fn floating_window(
    app: &tauri::AppHandle,
    kind: FloatingWindow,
) -> Result<tauri::WebviewWindow, String> {
    let _guard = FLOATING_WINDOW_LOCK
        .lock()
        .map_err(|_| "failed to lock floating window state".to_string())?;

    let label = kind.label();
    if let Some(window) = app.get_webview_window(label) {
        return Ok(window);
    }

    let builder = WebviewWindowBuilder::new(
        app,
        label,
        WebviewUrl::App(format!("index.html?window={label}").into()),
    );
    let builder = match kind {
        // Starts compact; the webview grows the window to fit what is typed.
        FloatingWindow::QuickNote => builder
            .title("Quick Note")
            .inner_size(680.0, 240.0)
            .min_inner_size(420.0, 180.0)
            .resizable(true)
            .decorations(true)
            .title_bar_style(TitleBarStyle::Overlay)
            .hidden_title(true),
        // Borderless so it reads as the command palette, not a document window.
        FloatingWindow::QuickSearch => builder
            .title("Quick Search")
            .inner_size(560.0, 440.0)
            .resizable(false)
            .decorations(false),
    };
    let window = builder
        .transparent(true)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .shadow(true)
        .visible(false)
        .center()
        .build()
        .map_err(|error| error.to_string())?;

    // Match the floating card's CSS radius so vibrancy doesn't leave square
    // frosted corners with desktop leaking through the rounded clip.
    apply_floating_window_vibrancy(&window)?;

    Ok(window)
}

#[cfg(target_os = "macos")]
pub(crate) fn apply_floating_window_vibrancy(window: &tauri::WebviewWindow) -> Result<(), String> {
    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
    crate::clear_main_window_vibrancy(window)?;
    apply_vibrancy(
        window,
        NSVisualEffectMaterial::HudWindow,
        None,
        Some(FLOATING_WINDOW_CORNER_RADIUS),
    )
    .map_err(|error| error.to_string())
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn apply_floating_window_vibrancy(_window: &tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}

fn show_floating_window(app: &tauri::AppHandle, kind: FloatingWindow) -> Result<(), String> {
    let window = floating_window(app, kind)?;
    // Quick Note stays where the user parked it; Quick Search re-centers like
    // Spotlight and asks its UI to reset for a fresh query.
    if kind == FloatingWindow::QuickSearch {
        window.center().map_err(|error| error.to_string())?;
    }
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    if kind == FloatingWindow::QuickSearch {
        window
            .emit_to(QUICK_SEARCH_WINDOW_LABEL, QUICK_SEARCH_SHOWN_EVENT, ())
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn hide_floating_window(
    app: &tauri::AppHandle,
    kind: FloatingWindow,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(kind.label()) {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn on_global_shortcut(app: &tauri::AppHandle, kind: FloatingWindow) -> Result<(), String> {
    if kind == FloatingWindow::QuickSearch {
        let focused = app
            .get_webview_window(QUICK_SEARCH_WINDOW_LABEL)
            .is_some_and(|window| {
                window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false)
            });
        if focused {
            return hide_floating_window(app, kind);
        }
    }
    show_floating_window(app, kind)
}

#[derive(Default)]
pub(crate) struct FloatingShortcutState {
    accelerators: Mutex<HashMap<FloatingWindow, String>>,
}

fn set_global_shortcut(
    app: &tauri::AppHandle,
    state: &FloatingShortcutState,
    kind: FloatingWindow,
    accelerator: Option<String>,
) -> Result<(), String> {
    let next = accelerator
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let mut accelerators = state
        .accelerators
        .lock()
        .map_err(|_| "failed to lock global shortcut state".to_string())?;

    if accelerators.get(&kind) == next.as_ref() {
        return Ok(());
    }

    if let Some(next_accelerator) = &next {
        app.global_shortcut()
            .on_shortcut(next_accelerator.as_str(), move |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    if let Err(error) = on_global_shortcut(app, kind) {
                        warn!("Failed to show {} window: {error}", kind.label());
                    }
                }
            })
            .map_err(|error| error.to_string())?;
    }

    if let Some(previous) = accelerators.remove(&kind) {
        if let Err(error) = app.global_shortcut().unregister(previous.as_str()) {
            warn!(
                "Failed to unregister previous {} shortcut: {error}",
                kind.label()
            );
        }
    }
    if let Some(next_accelerator) = next {
        accelerators.insert(kind, next_accelerator);
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn show_quick_note_window(app: tauri::AppHandle) -> Result<(), String> {
    show_floating_window(&app, FloatingWindow::QuickNote)
}

#[tauri::command]
pub(crate) fn hide_quick_note_window(app: tauri::AppHandle) -> Result<(), String> {
    hide_floating_window(&app, FloatingWindow::QuickNote)
}

#[tauri::command]
pub(crate) fn show_quick_search_window(app: tauri::AppHandle) -> Result<(), String> {
    show_floating_window(&app, FloatingWindow::QuickSearch)
}

#[tauri::command]
pub(crate) fn hide_quick_search_window(app: tauri::AppHandle) -> Result<(), String> {
    hide_floating_window(&app, FloatingWindow::QuickSearch)
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) fn set_quick_note_global_shortcut(
    app: tauri::AppHandle,
    state: State<'_, FloatingShortcutState>,
    accelerator: Option<String>,
) -> Result<(), String> {
    set_global_shortcut(&app, &state, FloatingWindow::QuickNote, accelerator)
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) fn set_quick_search_global_shortcut(
    app: tauri::AppHandle,
    state: State<'_, FloatingShortcutState>,
    accelerator: Option<String>,
) -> Result<(), String> {
    set_global_shortcut(&app, &state, FloatingWindow::QuickSearch, accelerator)
}
