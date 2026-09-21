mod store;
mod types;

use std::sync::Mutex;

use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, Monitor, PhysicalPosition, Position, Size,
    WebviewWindow, WindowEvent,
};
use tracing::warn;

use store::{load_record, save_record, store_path};
use types::{WindowGeometryRecord, WINDOW_GEOMETRY_STORE_VERSION};

pub const MAIN_WINDOW_LABEL: &str = "main";

/// Must match `tauri.conf.json` `minWidth` / `minHeight` for the main window.
const MIN_INNER_WIDTH: f64 = 680.0;
/// Must match `tauri.conf.json` `minWidth` / `minHeight` for the main window.
const MIN_INNER_HEIGHT: f64 = 460.0;
/// Must match `tauri.conf.json` `width` for the main window.
const DEFAULT_INNER_WIDTH: f64 = 800.0;
/// Must match `tauri.conf.json` `height` for the main window.
const DEFAULT_INNER_HEIGHT: f64 = 600.0;

const MIN_VISIBLE_WIDTH: f64 = 200.0;
const MIN_VISIBLE_HEIGHT: f64 = 80.0;

static LATEST_HOST_WINDOW_GEOMETRY: Mutex<Option<WindowGeometryRecord>> = Mutex::new(None);

#[derive(Clone, Copy, Debug, PartialEq)]
struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn monitor_rect(monitor: &Monitor) -> Rect {
    let scale_factor = monitor.scale_factor();
    let position = monitor.position().to_logical::<f64>(scale_factor);
    let size = monitor.size().to_logical::<f64>(scale_factor);
    Rect {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
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
    width: f64,
    height: f64,
    x: f64,
    y: f64,
    monitors: &[Rect],
) -> bool {
    if width < MIN_INNER_WIDTH || height < MIN_INNER_HEIGHT || monitors.is_empty() {
        return false;
    }

    let window = Rect {
        x,
        y,
        width,
        height,
    };

    monitors.iter().any(|monitor| {
        intersection(window, *monitor).is_some_and(|visible| {
            visible.width >= MIN_VISIBLE_WIDTH && visible.height >= MIN_VISIBLE_HEIGHT
        })
    })
}

fn is_geometry_visible_on_monitors(
    width: f64,
    height: f64,
    x: f64,
    y: f64,
    monitors: &[Monitor],
) -> bool {
    if monitors.is_empty() {
        return false;
    }
    let rects: Vec<Rect> = monitors.iter().map(monitor_rect).collect();
    is_geometry_visible_for_rects(width, height, x, y, &rects)
}

fn restore_position(record: &WindowGeometryRecord) -> LogicalPosition<f64> {
    if record.maximized || record.fullscreen {
        LogicalPosition::new(record.previous_x, record.previous_y)
    } else {
        LogicalPosition::new(record.x, record.y)
    }
}

fn should_restore_record(record: &WindowGeometryRecord, monitors: &[Monitor]) -> bool {
    let position = restore_position(record);
    is_geometry_visible_on_monitors(
        record.width,
        record.height,
        position.x,
        position.y,
        monitors,
    )
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
        .set_size(Size::Logical(LogicalSize::new(record.width, record.height)))
        .map_err(|error| error.to_string())?;
    window
        .set_position(Position::Logical(restore_position(record)))
        .map_err(|error| error.to_string())?;
    if record.maximized {
        window.maximize().map_err(|error| error.to_string())?;
    }
    if record.fullscreen {
        window
            .set_fullscreen(true)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn capture_geometry(window: &WebviewWindow) -> Result<WindowGeometryRecord, String> {
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let size = window
        .inner_size()
        .map_err(|error| error.to_string())?
        .to_logical::<f64>(scale_factor);
    let position = window
        .outer_position()
        .map_err(|error| error.to_string())?
        .to_logical::<f64>(scale_factor);
    let maximized = window.is_maximized().map_err(|error| error.to_string())?;
    let fullscreen = window.is_fullscreen().map_err(|error| error.to_string())?;

    Ok(WindowGeometryRecord {
        version: WINDOW_GEOMETRY_STORE_VERSION,
        width: size.width,
        height: size.height,
        x: position.x,
        y: position.y,
        previous_x: position.x,
        previous_y: position.y,
        maximized,
        fullscreen,
    })
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

fn update_position(record: &mut WindowGeometryRecord, position: LogicalPosition<f64>) {
    if record.x == position.x && record.y == position.y {
        return;
    }
    record.previous_x = record.x;
    record.previous_y = record.y;
    record.x = position.x;
    record.y = position.y;
}

fn remember_host_window_position(
    window: &WebviewWindow,
    position: PhysicalPosition<i32>,
) -> Result<(), String> {
    if window.is_minimized().map_err(|error| error.to_string())? {
        return Ok(());
    }
    let Some(mut record) = latest_host_window_geometry() else {
        return Ok(());
    };
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    update_position(&mut record, position.to_logical(scale_factor));
    remember_host_window_geometry(record);
    Ok(())
}

fn refresh_host_window_geometry(window: &WebviewWindow) -> Result<(), String> {
    let Some(mut record) = latest_host_window_geometry() else {
        remember_host_window_geometry(capture_geometry(window)?);
        return Ok(());
    };

    record.fullscreen = window.is_fullscreen().map_err(|error| error.to_string())?;
    if !record.fullscreen {
        record.maximized = window.is_maximized().map_err(|error| error.to_string())?;
        let minimized = window.is_minimized().map_err(|error| error.to_string())?;
        if !record.maximized && !minimized {
            let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
            let size = window
                .inner_size()
                .map_err(|error| error.to_string())?
                .to_logical::<f64>(scale_factor);
            let position = window
                .outer_position()
                .map_err(|error| error.to_string())?
                .to_logical::<f64>(scale_factor);
            record.width = size.width;
            record.height = size.height;
            update_position(&mut record, position);
        }
    }

    remember_host_window_geometry(record);
    Ok(())
}

fn flush_latest_host_window_geometry(window: &WebviewWindow) {
    if let Err(error) = refresh_host_window_geometry(window) {
        warn!("Failed to refresh host window geometry before save: {error}");
    }
    if let Some(record) = latest_host_window_geometry() {
        save_host_window_geometry_record_for_app(window.app_handle(), &record);
    }
}

pub fn flush_host_window_geometry(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        flush_latest_host_window_geometry(&window);
        return;
    }
    if let Some(record) = latest_host_window_geometry() {
        save_host_window_geometry_record_for_app(app, &record);
    }
}

fn try_restore_saved_geometry(
    window: &WebviewWindow,
) -> Result<Option<WindowGeometryRecord>, String> {
    let path = store_path(window.app_handle())?;
    let Some(record) = load_record(&path)? else {
        return Ok(None);
    };
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    if !should_restore_record(&record, &monitors) {
        return Ok(None);
    }
    apply_geometry(window, &record)?;
    Ok(Some(record))
}

fn restore_host_window(window: &WebviewWindow) {
    let restored_record = match try_restore_saved_geometry(window) {
        Ok(record) => record,
        Err(error) => {
            warn!("Failed to restore host window geometry, using default: {error}");
            None
        }
    };

    if let Some(record) = restored_record {
        remember_host_window_geometry(record);
        return;
    }

    if let Err(error) = apply_default_centered_geometry(window) {
        warn!("Failed to apply default host window geometry: {error}");
    }
    match capture_geometry(window) {
        Ok(record) => remember_host_window_geometry(record),
        Err(error) => warn!("Failed to capture default host window geometry: {error}"),
    }
}

pub fn install_host_window_persistence(window: &WebviewWindow) {
    if window.label() != MAIN_WINDOW_LABEL {
        return;
    }

    restore_host_window(window);

    let window_for_events = window.clone();
    window_for_events
        .clone()
        .on_window_event(move |event| match event {
            WindowEvent::Moved(position) => {
                if let Err(error) = remember_host_window_position(&window_for_events, *position) {
                    warn!("Failed to refresh host window position: {error}");
                }
            }
            WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
                if let Err(error) = refresh_host_window_geometry(&window_for_events) {
                    warn!("Failed to refresh host window geometry: {error}");
                }
            }
            WindowEvent::CloseRequested { .. } => {
                flush_latest_host_window_geometry(&window_for_events);
            }
            WindowEvent::Destroyed => {
                if let Some(record) = latest_host_window_geometry() {
                    save_host_window_geometry_record_for_app(
                        window_for_events.app_handle(),
                        &record,
                    );
                }
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
            x: 100.0,
            y: 100.0,
            width: 800.0,
            height: 600.0,
        };
        let monitor = Rect {
            x: 0.0,
            y: 0.0,
            width: 1440.0,
            height: 900.0,
        };
        let overlap = intersection(window, monitor).expect("overlap");
        assert_eq!(overlap.x, 100.0);
        assert_eq!(overlap.y, 100.0);
        assert_eq!(overlap.width, 800.0);
        assert_eq!(overlap.height, 600.0);
    }

    #[test]
    fn geometry_is_invalid_when_fully_off_screen() {
        let monitors = vec![Rect {
            x: 0.0,
            y: 0.0,
            width: 1440.0,
            height: 900.0,
        }];
        assert!(!is_geometry_visible_for_rects(
            MIN_INNER_WIDTH,
            MIN_INNER_HEIGHT,
            3000.0,
            3000.0,
            &monitors,
        ));
    }

    #[test]
    fn geometry_is_valid_when_partially_visible() {
        let monitors = vec![Rect {
            x: 0.0,
            y: 0.0,
            width: 1440.0,
            height: 900.0,
        }];
        assert!(is_geometry_visible_for_rects(
            900.0, 700.0, -100.0, 50.0, &monitors
        ));
    }

    #[test]
    fn geometry_is_invalid_when_too_small() {
        let monitors = vec![Rect {
            x: 0.0,
            y: 0.0,
            width: 1440.0,
            height: 900.0,
        }];
        assert!(!is_geometry_visible_for_rects(
            MIN_INNER_WIDTH - 1.0,
            MIN_INNER_HEIGHT,
            100.0,
            100.0,
            &monitors,
        ));
    }
}
