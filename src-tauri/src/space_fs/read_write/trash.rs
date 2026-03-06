use std::path::{Path, PathBuf};

/// Unix errno for EXDEV (cross-device link).
#[cfg(unix)]
const CROSS_DEVICE_RENAME_ERRNO: i32 = 18;

/// Windows error code for ERROR_NOT_SAME_DEVICE.
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
    Ok(home_dir()?.join(".local/share/Trash/files"))
}

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

/// Move a path to the system Recycle Bin on Windows using the Shell API.
#[cfg(target_os = "windows")]
pub(super) fn move_path_to_trash(src: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;

    #[allow(non_snake_case)]
    #[repr(C)]
    struct SHFILEOPSTRUCTW {
        hwnd: isize,
        wFunc: u32,
        pFrom: *const u16,
        pTo: *const u16,
        fFlags: u16,
        fAnyOperationsAborted: i32,
        hNameMappings: *mut std::ffi::c_void,
        lpszProgressTitle: *const u16,
    }

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
    if result == 0 {
        Ok(())
    } else {
        Err(format!(
            "failed to move to Recycle Bin (error code {result})"
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
        let dest = unique_trash_dest(&trash_dir, src)?;
        match std::fs::rename(src, &dest) {
            Ok(()) => Ok(()),
            Err(error) if error.raw_os_error() == Some(CROSS_DEVICE_RENAME_ERRNO) => {
                copy_path_recursive(src, &dest)?;
                if src.is_dir() {
                    std::fs::remove_dir_all(src).map_err(|e| e.to_string())
                } else {
                    std::fs::remove_file(src).map_err(|e| e.to_string())
                }
            }
            Err(error) => Err(error.to_string()),
        }
    }
}

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
