//! Opt-in diagnostic logging. Nothing is written to disk unless the user turns
//! on diagnostic logging, and nothing ever leaves the machine: users export a
//! zip themselves and decide where to send it.

pub mod commands;
mod export;

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use tauri::Manager;
use tauri_plugin_store::StoreExt;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

const LOG_FILE_NAME: &str = "glyph.log";
const ROTATED_LOG_FILE_NAME: &str = "glyph.1.log";
/// One active file plus one rotated file keeps total disk use near 10 MB,
/// even when logging is left on indefinitely.
const MAX_LOG_FILE_BYTES: u64 = 5 * 1024 * 1024;

static ENABLED: AtomicBool = AtomicBool::new(false);
static LOG_DIR: OnceLock<PathBuf> = OnceLock::new();
static HOME_DIR: OnceLock<Option<String>> = OnceLock::new();
static LOG_FILE: Mutex<Option<OpenLogFile>> = Mutex::new(None);
/// Serializes the preference read with the state change, so a stale "on"
/// read can never land after a newer "off".
static SYNC_LOCK: Mutex<()> = Mutex::new(());

struct OpenLogFile {
    file: File,
    len: u64,
}

struct DiagnosticLogWriter;

impl Write for DiagnosticLogWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        if ENABLED.load(Ordering::Acquire) {
            append_to_log(buf);
        }
        // Diagnostics must never make the logging call site fail.
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

pub fn init_tracing() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,tauri=info,glyph_lib=info"));

    let _ = tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer().with_target(false))
        .with(
            tracing_subscriber::fmt::layer()
                .with_target(false)
                .with_ansi(false)
                .with_writer(|| DiagnosticLogWriter),
        )
        .try_init();

    install_panic_hook();
}

fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let thread = std::thread::current();
        let thread_name = thread.name().unwrap_or("unnamed");
        let location = info
            .location()
            .map(|location| format!("{}:{}", location.file(), location.line()))
            .unwrap_or_else(|| "unknown location".to_string());
        let payload = info.payload();
        let message = payload
            .downcast_ref::<&str>()
            .map(|message| (*message).to_string())
            .or_else(|| payload.downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "non-string panic payload".to_string());
        tracing::error!("panic on thread '{thread_name}' at {location}: {message}");
        previous(info);
    }));
}

/// Resolves the log directory and applies the saved preference so backend
/// logs are captured before any webview loads.
pub fn init(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|error| error.to_string())?;
    let _ = LOG_DIR.set(dir);
    sync_logging(app)?;
    Ok(())
}

/// Logging is only active while both Advanced settings and diagnostic logging
/// are on, so hiding the Developer tab also stops collection.
fn saved_logging_enabled(app: &tauri::AppHandle) -> Result<bool, String> {
    let store = app
        .store("settings.json")
        .map_err(|error| error.to_string())?;
    let is_on = |key: &str| store.get(key).and_then(|value| value.as_bool()) == Some(true);
    Ok(is_on("ui.developerMode") && is_on("ui.diagnosticLogging"))
}

pub(crate) fn sync_logging(app: &tauri::AppHandle) -> Result<bool, String> {
    let _sync = SYNC_LOCK
        .lock()
        .map_err(|_| "Diagnostic log is unavailable.".to_string())?;
    let enabled = saved_logging_enabled(app)?;
    let was_enabled = ENABLED.load(Ordering::Acquire);
    if enabled && !was_enabled {
        let file = open_log_file(log_dir()?).map_err(|error| error.to_string())?;
        if let Ok(mut guard) = LOG_FILE.lock() {
            *guard = Some(file);
        }
        ENABLED.store(true, Ordering::Release);
        tracing::info!(
            "Diagnostic logging started (Glyph {}, {})",
            app.package_info().version,
            std::env::consts::ARCH
        );
    } else if !enabled && was_enabled {
        tracing::info!("Diagnostic logging stopped");
        ENABLED.store(false, Ordering::Release);
        if let Ok(mut guard) = LOG_FILE.lock() {
            *guard = None;
        }
    }
    Ok(enabled)
}

pub(crate) fn logging_enabled() -> bool {
    ENABLED.load(Ordering::Acquire)
}

fn log_dir() -> Result<&'static Path, String> {
    LOG_DIR
        .get()
        .map(PathBuf::as_path)
        .ok_or_else(|| "Diagnostic log folder is not available.".to_string())
}

fn home_dir() -> Option<&'static str> {
    HOME_DIR
        .get_or_init(|| std::env::var("HOME").ok().filter(|home| home.len() > 1))
        .as_deref()
}

/// Replaces the home folder with `~` so exported logs don't carry the
/// user's account name in every path.
pub(crate) fn redact(text: &str) -> String {
    match home_dir() {
        Some(home) => text.replace(home, "~"),
        None => text.to_string(),
    }
}

fn open_log_file(dir: &Path) -> io::Result<OpenLogFile> {
    fs::create_dir_all(dir)?;
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join(LOG_FILE_NAME))?;
    let len = file.metadata()?.len();
    Ok(OpenLogFile { file, len })
}

fn append_to_log(buf: &[u8]) {
    let Ok(dir) = log_dir() else {
        return;
    };
    let line = redact(&String::from_utf8_lossy(buf));
    let Ok(mut guard) = LOG_FILE.lock() else {
        return;
    };
    let line_len = line.len() as u64;
    if guard
        .as_ref()
        .is_some_and(|open| open.len + line_len > MAX_LOG_FILE_BYTES)
    {
        *guard = None;
        let _ = fs::rename(dir.join(LOG_FILE_NAME), dir.join(ROTATED_LOG_FILE_NAME));
    }
    if guard.is_none() {
        *guard = open_log_file(dir).ok();
    }
    if let Some(open) = guard.as_mut() {
        if open.file.write_all(line.as_bytes()).is_ok() {
            open.len += line_len;
        }
    }
}

/// Oldest first, so the exported files read in chronological order.
fn log_file_paths(dir: &Path) -> [PathBuf; 2] {
    [dir.join(ROTATED_LOG_FILE_NAME), dir.join(LOG_FILE_NAME)]
}

/// Copies both logs while holding the writer's lock, so rotation or clearing
/// can't change the files halfway through an export.
fn copy_logs_into(dest_dir: &Path) -> Result<(), String> {
    let dir = log_dir()?;
    let _guard = LOG_FILE
        .lock()
        .map_err(|_| "Diagnostic log is unavailable.".to_string())?;
    for path in log_file_paths(dir) {
        let Some(name) = path.file_name() else {
            continue;
        };
        match fs::copy(&path, dest_dir.join(name)) {
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}

fn clear_logs() -> Result<(), String> {
    let dir = log_dir()?;
    let mut guard = LOG_FILE
        .lock()
        .map_err(|_| "Diagnostic log is unavailable.".to_string())?;
    *guard = None;
    for path in log_file_paths(dir) {
        match fs::remove_file(&path) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}
