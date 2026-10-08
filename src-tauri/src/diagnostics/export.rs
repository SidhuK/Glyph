use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime};

use super::{copy_logs_into, logging_enabled, redact};
use crate::io_atomic;

const BUNDLE_FOLDER_NAME: &str = "Glyph Diagnostics";
const MAX_CRASH_REPORTS: usize = 10;
const MAX_CRASH_REPORT_AGE: Duration = Duration::from_secs(30 * 24 * 60 * 60);

pub(super) struct BundleInfo {
    pub app_version: String,
    pub release_channel: String,
}

pub(super) fn default_file_name() -> String {
    format!(
        "Glyph Diagnostics {}.zip",
        chrono::Local::now().format("%Y-%m-%d %H.%M.%S")
    )
}

/// Builds the bundle in a private temp folder, then copies the finished zip
/// to the user's chosen destination.
pub(super) fn write_bundle(info: &BundleInfo, destination: &Path) -> Result<(), String> {
    let staging_root =
        std::env::temp_dir().join(format!("glyph-diagnostics-{}", uuid::Uuid::new_v4()));
    let result = write_bundle_in(&staging_root, info, destination);
    let _ = fs::remove_dir_all(&staging_root);
    result
}

fn write_bundle_in(
    staging_root: &Path,
    info: &BundleInfo,
    destination: &Path,
) -> Result<(), String> {
    let bundle_dir = staging_root.join(BUNDLE_FOLDER_NAME);
    fs::create_dir_all(&bundle_dir).map_err(|error| error.to_string())?;

    copy_logs_into(&bundle_dir)?;

    let crash_reports = recent_crash_reports();
    if !crash_reports.is_empty() {
        let crash_dir = bundle_dir.join("Crash Reports");
        fs::create_dir_all(&crash_dir).map_err(|error| error.to_string())?;
        for path in &crash_reports {
            let (Some(name), Ok(text)) = (path.file_name(), fs::read_to_string(path)) else {
                continue;
            };
            fs::write(crash_dir.join(name), redact(&text)).map_err(|error| error.to_string())?;
        }
    }

    fs::write(
        bundle_dir.join("summary.txt"),
        summary(info, crash_reports.len()),
    )
    .map_err(|error| error.to_string())?;

    let zip_path = staging_root.join("bundle.zip");
    let status = Command::new("/usr/bin/ditto")
        .args(["-c", "-k", "--sequesterRsrc", "--keepParent"])
        .arg(&bundle_dir)
        .arg(&zip_path)
        .status()
        .map_err(|error| error.to_string())?;
    if !status.success() {
        return Err("Could not compress the diagnostic logs.".to_string());
    }
    io_atomic::copy_atomic(&zip_path, destination).map_err(|error| error.to_string())?;
    Ok(())
}

/// macOS writes native crash reports here; they cover crashes in WebKit and
/// AppKit that never reach Glyph's own log.
fn recent_crash_reports() -> Vec<PathBuf> {
    let Some(home) = std::env::var_os("HOME") else {
        return Vec::new();
    };
    let dir = Path::new(&home).join("Library/Logs/DiagnosticReports");
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let now = SystemTime::now();
    let mut reports: Vec<(SystemTime, PathBuf)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            let is_glyph_report = (name.starts_with("glyph-")
                || name.starts_with("glyph.")
                || name.starts_with("glyph_"))
                && (name.ends_with(".ips") || name.ends_with(".crash"));
            if !is_glyph_report {
                return None;
            }
            let modified = entry.metadata().ok()?.modified().ok()?;
            let age = now.duration_since(modified).unwrap_or_default();
            (age <= MAX_CRASH_REPORT_AGE).then(|| (modified, entry.path()))
        })
        .collect();
    reports.sort_by_key(|report| std::cmp::Reverse(report.0));
    reports
        .into_iter()
        .take(MAX_CRASH_REPORTS)
        .map(|(_, path)| path)
        .collect()
}

fn sw_vers(flag: &str) -> String {
    Command::new("/usr/bin/sw_vers")
        .arg(flag)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

fn summary(info: &BundleInfo, crash_report_count: usize) -> String {
    let logging = if logging_enabled() { "on" } else { "off" };
    [
        format!("Glyph version: {}", info.app_version),
        format!("Release channel: {}", info.release_channel),
        format!(
            "macOS: {} ({})",
            sw_vers("-productVersion"),
            sw_vers("-buildVersion")
        ),
        format!("Architecture: {}", std::env::consts::ARCH),
        format!("Diagnostic logging: {logging}"),
        format!("Crash reports included: {crash_report_count}"),
        format!("Exported: {}", chrono::Local::now().to_rfc3339()),
        String::new(),
    ]
    .join("\n")
}
