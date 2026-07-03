mod store;
mod types;

use tauri::{
    Manager, Monitor, PhysicalPosition, PhysicalSize, Position, Size, WebviewWindow, WindowEvent,
};
use tracing::warn;

use store::{load_record, save_record, store_path};
use types::{WindowGeometryRecord, WINDOW_GEOMETRY_STORE_VERSION};

pub const MAIN_WINDOW_LABEL: &str = "main";

/// Must match `tauri.conf.json` `minWidth` / `minHeight` for the main window.
pub const MIN_INNER_WIDTH: u32 = 680;
/// Must match `tauri.conf.json` `minWidth` / `minHeight` for the main window.
pub const MIN_INNER_HEIGHT: u32 = 460;

const MIN_VISIBLE_WIDTH: i32 = 200;
const MIN_VISIBLE_HEIGHT: i32 = 80;

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
    let Some(monitor) = window
        .current_monitor()
        .map_err(|error| error.to_string())?
    else {
        return Ok(());
    };
    let monitor_size = monitor.size();
    let monitor_pos = monitor.position();
    let width = ((monitor_size.width as f64) * 0.8).round() as u32;
    let height = ((monitor_size.height as f64) * 0.8).round() as u32;
    window
        .set_size(Size::Physical(PhysicalSize::new(width, height)))
        .map_err(|error| error.to_string())?;
    let x = monitor_pos.x + ((monitor_size.width as i32 - width as i32) / 2);
    let y = monitor_pos.y + ((monitor_size.height as i32 - height as i32) / 2);
    window
        .set_position(Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|error| error.to_string())
}

fn apply_geometry(window: &WebviewWindow, record: &WindowGeometryRecord) -> Result<(), String> {
    window
        .set_size(Size::Physical(PhysicalSize::new(record.width, record.height)))
        .map_err(|error| error.to_string())?;
    window
        .set_position(Position::Physical(PhysicalPosition::new(record.x, record.y)))
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

fn save_main_window_geometry(window: &WebviewWindow) {
    let app = window.app_handle();
    let path = match store_path(app) {
        Ok(path) => path,
        Err(error) => {
            warn!("Failed to resolve main window geometry store path: {error}");
            return;
        }
    };
    let record = match capture_geometry(window) {
        Ok(record) => record,
        Err(error) => {
            warn!("Failed to capture main window geometry: {error}");
            return;
        }
    };
    if let Err(error) = save_record(&path, &record) {
        warn!("Failed to save main window geometry: {error}");
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

pub fn restore_main_window(window: &WebviewWindow) {
    let use_default = match try_restore_saved_geometry(window) {
        Ok(true) => false,
        Ok(false) => true,
        Err(error) => {
            warn!("Failed to restore main window geometry, using default: {error}");
            true
        }
    };

    if use_default {
        if let Err(error) = apply_default_centered_geometry(window) {
            warn!("Failed to apply default main window geometry: {error}");
        }
    }
}

pub fn install_main_window_persistence(window: &WebviewWindow) {
    restore_main_window(window);

    let window_for_events = window.clone();
    window_for_events
        .clone()
        .on_window_event(move |event| {
            if matches!(event, WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed) {
                save_main_window_geometry(&window_for_events);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::{
        intersection, is_geometry_visible_for_rects, Rect, MIN_INNER_HEIGHT,
        MIN_INNER_WIDTH,
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
        assert!(is_geometry_visible_for_rects(
            900, 700, -100, 50, &monitors
        ));
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
