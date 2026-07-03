mod store;
mod types;

use std::sync::Mutex;

use tauri::{
    AppHandle, LogicalSize, Manager, Monitor, PhysicalPosition, PhysicalSize, Position, Size,
    WebviewWindow, WindowEvent,
};
use tracing::warn;

use store::{load_record, save_record, store_path};
use types::{WindowGeometryRecord, WINDOW_GEOMETRY_STORE_VERSION};

pub const MAIN_WINDOW_LABEL: &str = "main";

/// Must match `tauri.conf.json` `minWidth` / `minHeight` for the main window.
pub const MIN_INNER_WIDTH: u32 = 680;
/// Must match `tauri.conf.json` `minWidth` / `minHeight` for the main window.
pub const MIN_INNER_HEIGHT: u32 = 460;
/// Must match `tauri.conf.json` `width` for the main window.
const DEFAULT_INNER_WIDTH: f64 = 800.0;
/// Must match `tauri.conf.json` `height` for the main window.
const DEFAULT_INNER_HEIGHT: f64 = 600.0;

const MIN_VISIBLE_WIDTH: i32 = 200;
const MIN_VISIBLE_HEIGHT: i32 = 80;

static LATEST_HOST_WINDOW_GEOMETRY: Mutex<Option<WindowGeometryRecord>> = Mutex::new(None);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Rect {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

fn monitor_rect(monitor: &Monitor) -> Rect {
    let position = monitor.position();
    let size = monitor.size();
    Rect {
        x: position.x,
        y: position.y,
        width: size.width as i32,
        height: size.height as i32,
    }
}

fn intersection(window: Rect, monitor: Rect) -> Option<Rect> {
    let left = window.x.max(monitor.x);
    let top = window.y.max(monitor.y);
    let right = (window.x + window.width).min(monitor.x + monitor.width);
    let bottom = (window.y + window.height).min(monitor.y + monitor.height);
    if right <= left || bottom <= top {
        return None;
    }
    Some(Rect {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    })
}

fn is_geometry_visible_for_rects(
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    monitors: &[Rect],
) -> bool {
    if width < MIN_INNER_WIDTH || height < MIN_INNER_HEIGHT || monitors.is_empty() {
        return false;
    }

    let window = Rect {
        x,
        y,
        width: width as i32,
        height: height as i32,
    };

    monitors.iter().any(|monitor| {
        intersection(window, *monitor).is_some_and(|visible| {
            visible.width >= MIN_VISIBLE_WIDTH && visible.height >= MIN_VISIBLE_HEIGHT
        })
    })
}

fn is_geometry_visible_on_monitors(
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    monitors: &[Monitor],
) -> bool {
    if monitors.is_empty() {
        return false;
    }
    let rects: Vec<Rect> = monitors.iter().map(monitor_rect).collect();
    is_geometry_visible_for_rects(width, height, x, y, &rects)
}

fn should_restore_record(record: &WindowGeometryRecord, monitors: &[Monitor]) -> bool {
    is_geometry_visible_on_monitors(record.width, record.height, record.x, record.y, monitors)
}

fn apply_default_centered_geometry(window: &WebviewWindow) -> Result<(), String> {
    window
        .set_size(Size::Logical(LogicalSize::new(
            DEFAULT_INNER_WIDTH,
            DEFAULT_INNER_HEIGHT,
        )))
        .map_err(|error| error.to_string())?;
    window.center().map_err(|error| error.to_string())
}

fn apply_geometry(window: &WebviewWindow, record: &WindowGeometryRecord) -> Result<(), String> {
    window
        .set_size(Size::Physical(PhysicalSize::new(
            record.width,
            record.height,
        )))
        .map_err(|error| error.to_string())?;
    window
        .set_position(Position::Physical(PhysicalPosition::new(
            record.x, record.y,
        )))
        .map_err(|error| error.to_string())?;
    if record.maximized {
        window.maximize().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn capture_geometry(window: &WebviewWindow) -> Result<WindowGeometryRecord, String> {
    let size = window.inner_size().map_err(|error| error.to_string())?;
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let maximized = window.is_maximized().unwrap_or(false);

    Ok(WindowGeometryRecord {
        version: WINDOW_GEOMETRY_STORE_VERSION,
        width: size.width,
        height: size.height,
        x: position.x,
        y: position.y,
        maximized,
    })
}

fn save_host_window_geometry(window: &WebviewWindow) {
    let record = match capture_geometry(window) {
        Ok(record) => record,
        Err(error) => {
            warn!("Failed to capture host window geometry: {error}");
            return;
        }
    };
    save_host_window_geometry_record(window, &record);
}

fn save_host_window_geometry_record(window: &WebviewWindow, record: &WindowGeometryRecord) {
    save_host_window_geometry_record_for_app(window.app_handle(), record);
}

fn save_host_window_geometry_record_for_app(app: &AppHandle, record: &WindowGeometryRecord) {
    let path = match store_path(app) {
        Ok(path) => path,
        Err(error) => {
            warn!("Failed to resolve host window geometry store path: {error}");
            return;
        }
    };
    if let Err(error) = save_record(&path, record) {
        warn!("Failed to save host window geometry: {error}");
    }
}

fn remember_host_window_geometry(record: WindowGeometryRecord) {
    match LATEST_HOST_WINDOW_GEOMETRY.lock() {
        Ok(mut latest) => *latest = Some(record),
        Err(_) => warn!("Failed to lock host window geometry cache"),
    }
}

fn latest_host_window_geometry() -> Option<WindowGeometryRecord> {
    match LATEST_HOST_WINDOW_GEOMETRY.lock() {
        Ok(latest) => latest.clone(),
        Err(_) => {
            warn!("Failed to lock host window geometry cache");
            None
        }
    }
}

fn remember_captured_geometry(window: &WebviewWindow) {
    match capture_geometry(window) {
        Ok(record) => remember_host_window_geometry(record),
        Err(error) => warn!("Failed to capture host window geometry: {error}"),
    }
}

fn flush_latest_host_window_geometry(window: &WebviewWindow) {
    if let Some(record) = latest_host_window_geometry() {
        save_host_window_geometry_record(window, &record);
    } else {
        save_host_window_geometry(window);
    }
}

pub fn flush_host_window_geometry(app: &AppHandle) {
    if let Some(record) = latest_host_window_geometry() {
        save_host_window_geometry_record_for_app(app, &record);
    } else if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        save_host_window_geometry(&window);
    }
}

fn try_restore_saved_geometry(window: &WebviewWindow) -> Result<bool, String> {
    let path = store_path(window.app_handle())?;
    let Some(record) = load_record(&path)? else {
        return Ok(false);
    };
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    if !should_restore_record(&record, &monitors) {
        return Ok(false);
    }
    apply_geometry(window, &record)?;
    Ok(true)
}

fn restore_host_window(window: &WebviewWindow) {
    let use_default = match try_restore_saved_geometry(window) {
        Ok(true) => false,
        Ok(false) => true,
        Err(error) => {
            warn!("Failed to restore host window geometry, using default: {error}");
            true
        }
    };

    if use_default {
        if let Err(error) = apply_default_centered_geometry(window) {
            warn!("Failed to apply default host window geometry: {error}");
        }
    }
}

pub fn install_host_window_persistence(window: &WebviewWindow) {
    if window.label() != MAIN_WINDOW_LABEL {
        return;
    }

    restore_host_window(window);
    remember_captured_geometry(window);

    let window_for_events = window.clone();
    window_for_events
        .clone()
        .on_window_event(move |event| match event {
            WindowEvent::Resized(_)
            | WindowEvent::Moved(_)
            | WindowEvent::ScaleFactorChanged { .. } => {
                remember_captured_geometry(&window_for_events);
            }
            WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
                flush_latest_host_window_geometry(&window_for_events);
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::{
        intersection, is_geometry_visible_for_rects, Rect, MIN_INNER_HEIGHT, MIN_INNER_WIDTH,
    };

    #[test]
    fn intersection_returns_overlap_rect() {
        let window = Rect {
            x: 100,
            y: 100,
            width: 800,
            height: 600,
        };
        let monitor = Rect {
            x: 0,
            y: 0,
            width: 1440,
            height: 900,
        };
        let overlap = intersection(window, monitor).expect("overlap");
        assert_eq!(overlap.x, 100);
        assert_eq!(overlap.y, 100);
        assert_eq!(overlap.width, 800);
        assert_eq!(overlap.height, 600);
    }

    #[test]
    fn geometry_is_invalid_when_fully_off_screen() {
        let monitors = vec![Rect {
            x: 0,
            y: 0,
            width: 1440,
            height: 900,
        }];
        assert!(!is_geometry_visible_for_rects(
            MIN_INNER_WIDTH,
            MIN_INNER_HEIGHT,
            3000,
            3000,
            &monitors,
        ));
    }

    #[test]
    fn geometry_is_valid_when_partially_visible() {
        let monitors = vec![Rect {
            x: 0,
            y: 0,
            width: 1440,
            height: 900,
        }];
        assert!(is_geometry_visible_for_rects(900, 700, -100, 50, &monitors));
    }

    #[test]
    fn geometry_is_invalid_when_too_small() {
        let monitors = vec![Rect {
            x: 0,
            y: 0,
            width: 1440,
            height: 900,
        }];
        assert!(!is_geometry_visible_for_rects(
            MIN_INNER_WIDTH - 1,
            MIN_INNER_HEIGHT,
            100,
            100,
            &monitors,
        ));
    }
}
