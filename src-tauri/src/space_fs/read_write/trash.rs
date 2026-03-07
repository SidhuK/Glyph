use std::path::{Path, PathBuf};

/// Unix errno for EXDEV (cross-device link).
#[allow(dead_code)]
#[cfg(unix)]
const CROSS_DEVICE_RENAME_ERRNO: i32 = 18;

/// Windows error code for ERROR_NOT_SAME_DEVICE.
#[allow(dead_code)]
#[cfg(windows)]
const CROSS_DEVICE_RENAME_ERRNO: i32 = 17;

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn home_dir() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "could not resolve HOME directory for Trash".to_string())
}

#[cfg(target_os = "macos")]
fn resolve_trash_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".Trash"))
}

#[cfg(target_os = "linux")]
fn resolve_trash_dir() -> Result<PathBuf, String> {
    let base_dir = match std::env::var_os("XDG_DATA_HOME") {
        Some(path) => PathBuf::from(path),
        None => home_dir()?.join(".local/share"),
    };
    Ok(base_dir.join("Trash/files"))
}

#[cfg(target_os = "linux")]
fn resolve_trash_info_dir() -> Result<PathBuf, String> {
    let trash_root = resolve_trash_dir()?
        .parent()
        .ok_or_else(|| "could not resolve Trash info directory".to_string())?
        .to_path_buf();
    Ok(trash_root.join("info"))
}

#[allow(dead_code)]
fn unique_trash_dest(trash_dir: &Path, src: &Path) -> Result<PathBuf, String> {
    let file_name = src
        .file_name()
        .ok_or_else(|| "invalid path: missing file name".to_string())?;
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("item")
        .to_string();
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default();

    let base = trash_dir.join(file_name);
    if !base.exists() {
        return Ok(base);
    }

    for i in 2..10_000 {
        let candidate = trash_dir.join(format!("{stem} {i}{ext}"));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("unable to find an available Trash destination name".to_string())
}

#[allow(dead_code)]
fn cleanup_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    if path.is_dir() {
        std::fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(path).map_err(|e| e.to_string())
    }
}

#[cfg(not(target_os = "windows"))]
fn unique_temp_trash_dest(dest: &Path) -> Result<PathBuf, String> {
    let parent = dest
        .parent()
        .ok_or_else(|| "invalid Trash destination: missing parent directory".to_string())?;
    let file_name = dest
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "invalid Trash destination: missing file name".to_string())?;

    for index in 0..10_000 {
        let candidate_name = if index == 0 {
            format!(".{file_name}.glyph-trash-tmp")
        } else {
            format!(".{file_name}.glyph-trash-tmp-{index}")
        };
        let candidate = parent.join(candidate_name);
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("unable to find an available temporary Trash destination name".to_string())
}

#[cfg(target_os = "linux")]
fn absolute_original_path(src: &Path) -> PathBuf {
    if let Ok(path) = std::fs::canonicalize(src) {
        return path;
    }

    if src.is_absolute() {
        return src.to_path_buf();
    }

    std::env::current_dir()
        .map(|cwd| cwd.join(src))
        .unwrap_or_else(|_| src.to_path_buf())
}

#[cfg(target_os = "linux")]
fn encode_trash_info_path(path: &Path) -> String {
    use std::fmt::Write as _;

    let raw = path.to_string_lossy();
    let mut encoded = String::with_capacity(raw.len());

    for byte in raw.as_bytes() {
        let character = *byte as char;
        if character.is_ascii_alphanumeric()
            || matches!(character, '/' | '-' | '_' | '.' | '~')
        {
            encoded.push(character);
        } else {
            let _ = write!(&mut encoded, "%{byte:02X}");
        }
    }

    encoded
}

#[cfg(target_os = "linux")]
fn trash_info_deletion_date() -> String {
    let now = time::OffsetDateTime::now_utc();
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}",
        now.year(),
        u8::from(now.month()),
        now.day(),
        now.hour(),
        now.minute(),
        now.second(),
    )
}

#[cfg(target_os = "linux")]
fn write_trash_info_file(info_dir: &Path, trashed_path: &Path, original_path: &Path) -> Result<(), String> {
    let file_name = trashed_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "invalid Trash destination: missing file name".to_string())?;
    let info_path = info_dir.join(format!("{file_name}.trashinfo"));
    let contents = format!(
        "[Trash Info]\nPath={}\nDeletionDate={}\n",
        encode_trash_info_path(original_path),
        trash_info_deletion_date(),
    );
    std::fs::write(info_path, contents).map_err(|e| e.to_string())
}

/// Move a path to the system Recycle Bin on Windows using the Shell API.
#[cfg(target_os = "windows")]
pub(super) fn move_path_to_trash(src: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;

    /// Win32 SHFILEOPSTRUCTW – describes a shell file operation.
    /// See: https://learn.microsoft.com/en-us/windows/win32/api/shellapi/ns-shellapi-shfileopstructw
    #[allow(non_snake_case)]
    #[repr(C)]
    struct SHFILEOPSTRUCTW {
        hwnd: isize,                         // parent window handle (0 = no UI)
        wFunc: u32,                          // operation: FO_DELETE = 0x0003
        pFrom: *const u16,                   // double-null-terminated source path(s)
        pTo: *const u16,                     // destination (unused for delete)
        fFlags: u16,                         // operation flags (see FOF_* constants below)
        fAnyOperationsAborted: i32,          // out: non-zero if user aborted
        hNameMappings: *mut std::ffi::c_void, // out: name mapping object (unused)
        lpszProgressTitle: *const u16,       // progress dialog title (unused)
    }

    #[link(name = "shell32")]
    extern "system" {
        fn SHFileOperationW(lpFileOp: *mut SHFILEOPSTRUCTW) -> i32;
    }

    const FO_DELETE: u32 = 0x0003;
    const FOF_ALLOWUNDO: u16 = 0x0040;
    const FOF_NOCONFIRMATION: u16 = 0x0010;
    const FOF_NOERRORUI: u16 = 0x0400;
    const FOF_SILENT: u16 = 0x0004;

    // SHFileOperationW requires a double-null-terminated wide string.
    let wide: Vec<u16> = src
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .chain(std::iter::once(0))
        .collect();

    let mut op = SHFILEOPSTRUCTW {
        hwnd: 0,
        wFunc: FO_DELETE,
        pFrom: wide.as_ptr(),
        pTo: std::ptr::null(),
        fFlags: FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT,
        fAnyOperationsAborted: 0,
        hNameMappings: std::ptr::null_mut(),
        lpszProgressTitle: std::ptr::null(),
    };

    let result = unsafe { SHFileOperationW(&mut op) };
    if result == 0 && op.fAnyOperationsAborted == 0 {
        Ok(())
    } else {
        Err(format!(
            "failed to move to Recycle Bin (error code {result}, operations aborted: {})",
            op.fAnyOperationsAborted
        ))
    }
}

/// Move a path to the Trash on macOS / Linux.
#[cfg(not(target_os = "windows"))]
pub(super) fn move_path_to_trash(src: &Path) -> Result<(), String> {
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = src;
        return Err("Move to Trash is not supported on this platform".to_string());
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let trash_dir = resolve_trash_dir()?;
        std::fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;
        #[cfg(target_os = "linux")]
        let info_dir = {
            let dir = resolve_trash_info_dir()?;
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            dir
        };

        #[cfg(target_os = "linux")]
        let original_path = absolute_original_path(src);

        let dest = unique_trash_dest(&trash_dir, src)?;
        let move_result = match std::fs::rename(src, &dest) {
            Ok(()) => Ok(()),
            Err(error) if error.raw_os_error() == Some(CROSS_DEVICE_RENAME_ERRNO) => {
                let temp_dest = unique_temp_trash_dest(&dest)?;
                if let Err(copy_error) = copy_path_recursive(src, &temp_dest) {
                    let _ = cleanup_path(&temp_dest);
                    return Err(format!(
                        "failed to copy item into Trash: {copy_error}; cleanup attempted"
                    ));
                }

                let remove_original = if src.is_dir() {
                    std::fs::remove_dir_all(src)
                } else {
                    std::fs::remove_file(src)
                };

                if let Err(remove_error) = remove_original {
                    let cleanup_error = cleanup_path(&temp_dest).err();
                    return Err(match cleanup_error {
                        Some(cleanup_error) => format!(
                            "failed to remove original after copying to Trash: {remove_error}; cleanup attempted but also failed: {cleanup_error}"
                        ),
                        None => format!(
                            "failed to remove original after copying to Trash: {remove_error}; cleanup attempted"
                        ),
                    });
                }

                if let Err(rename_error) = std::fs::rename(&temp_dest, &dest) {
                    let cleanup_error = cleanup_path(&temp_dest).err();
                    return Err(match cleanup_error {
                        Some(cleanup_error) => format!(
                            "failed to finalize Trash move after copying: {rename_error}; cleanup attempted but also failed: {cleanup_error}"
                        ),
                        None => format!(
                            "failed to finalize Trash move after copying: {rename_error}; cleanup attempted"
                        ),
                    });
                }

                Ok(())
            }
            Err(error) => Err(error.to_string()),
        };

        move_result?;

        #[cfg(target_os = "linux")]
        {
            if let Err(write_error) = write_trash_info_file(&info_dir, &dest, &original_path) {
                let cleanup_error = cleanup_path(&dest).err();
                return Err(match cleanup_error {
                    Some(cleanup_error) => format!(
                        "failed to write Trash metadata: {write_error}; cleanup attempted but also failed: {cleanup_error}"
                    ),
                    None => format!(
                        "failed to write Trash metadata: {write_error}; cleanup attempted"
                    ),
                });
            }
        }

        Ok(())
    }
}

#[allow(dead_code)]
fn copy_path_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    if src.is_dir() {
        std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
        for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let entry_src = entry.path();
            let entry_dest = dest.join(entry.file_name());
            copy_path_recursive(&entry_src, &entry_dest)?;
        }
        return Ok(());
    }

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(src, dest).map_err(|e| e.to_string())?;
    Ok(())
}
