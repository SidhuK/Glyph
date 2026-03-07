#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::collections::BTreeSet;

#[cfg(target_os = "macos")]
use core_text::{
    font::new_from_name, font_collection::get_family_names, font_descriptor::SymbolicTraitAccessors,
};

#[cfg(target_os = "macos")]
pub fn list_system_font_families() -> Result<Vec<String>, String> {
    let mut families = BTreeSet::new();

    let names = get_family_names();
    for name in names.iter() {
        let owned = name.to_string();
        let trimmed = owned.trim();
        if trimmed.is_empty() {
            continue;
        }
        families.insert(trimmed.to_string());
    }

    Ok(families.into_iter().collect())
}

#[cfg(target_os = "macos")]
pub fn list_monospace_font_families() -> Result<Vec<String>, String> {
    let mut families = BTreeSet::new();

    let names = get_family_names();
    for name in names.iter() {
        let owned = name.to_string();
        let trimmed = owned.trim();
        if trimmed.is_empty() {
            continue;
        }

        if let Ok(font) = new_from_name(trimmed, 12.0) {
            if font.symbolic_traits().is_monospace() {
                families.insert(trimmed.to_string());
            }
        }
    }

    Ok(families.into_iter().collect())
}

#[cfg(target_os = "windows")]
pub fn list_system_font_families() -> Result<Vec<String>, String> {
    read_windows_font_families(false)
}

#[cfg(target_os = "windows")]
pub fn list_monospace_font_families() -> Result<Vec<String>, String> {
    read_windows_font_families(true)
}

/// Enumerate installed font families on Windows by reading the registry.
///
/// The registry key `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts`
/// stores entries like `"Consolas (TrueType)" = "consola.ttf"`.  We extract the
/// family portion from the value name.
///
/// When `monospace_only` is true we apply a simple heuristic: we keep only
/// families whose name contains well-known monospace keywords.  This is not as
/// precise as DirectWrite enumeration but avoids a heavy native dependency.
#[cfg(target_os = "windows")]
fn read_windows_font_families(monospace_only: bool) -> Result<Vec<String>, String> {
    use std::os::windows::ffi::OsStringExt;

    // --- winreg helpers (raw FFI so we don't need an extra crate) -----------
    // SAFETY: These extern functions are Windows Registry API calls from advapi32.dll.
    // We ensure: (1) all wide-string pointers reference null-terminated buffers that
    // outlive the call, (2) RegCloseKey is always called to release the opened key
    // handle, and (3) buffer lengths are correctly sized before each call.

    #[link(name = "advapi32")]
    extern "system" {
        fn RegOpenKeyExW(
            hkey: isize,
            sub_key: *const u16,
            options: u32,
            sam_desired: u32,
            result: *mut isize,
        ) -> i32;
        fn RegCloseKey(hkey: isize) -> i32;
        fn RegEnumValueW(
            hkey: isize,
            index: u32,
            value_name: *mut u16,
            value_name_len: *mut u32,
            reserved: *mut u32,
            value_type: *mut u32,
            data: *mut u8,
            data_len: *mut u32,
        ) -> i32;
    }

    const HKEY_CLASSES_ROOT: isize = -2_147_483_648; // 0x80000000
    const HKEY_CURRENT_USER: isize = HKEY_CLASSES_ROOT + 1; // 0x80000001
    const HKEY_LOCAL_MACHINE: isize = HKEY_CLASSES_ROOT + 2; // 0x80000002
    const KEY_READ: u32 = 0x20019;
    const ERROR_SUCCESS: i32 = 0;
    const ERROR_NO_MORE_ITEMS: i32 = 259;

    let sub_key: Vec<u16> = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts\0"
        .encode_utf16()
        .collect();

    let mono_keywords: &[&str] = &[
        "mono", "consola", "courier", "fixed", "terminal", "code", "hack", "fira",
        "menlo", "inconsolata", "source code", "jetbrains", "iosevka", "cascadia",
        "ubuntu mono", "droid sans mono", "dejavu sans mono", "noto sans mono",
        "liberation mono", "lucida console", "lucida sans typewriter", "roboto mono",
        "anonymous pro", "bitstream vera sans mono", "pt mono",
    ];

    let normalize_family = |name: &str| {
        let base = if let Some(pos) = name.rfind(" (") {
            name[..pos].trim()
        } else {
            name.trim()
        };

        let suffixes = [
            "bold italic",
            "extra light",
            "extralight",
            "extra bold",
            "extrabold",
            "semi bold",
            "semibold",
            "demi bold",
            "demibold",
            "condensed",
            "regular",
            "oblique",
            "italic",
            "medium",
            "light",
            "heavy",
            "black",
            "book",
            "bold",
            "thin",
        ];

        let mut family = base.trim().to_string();
        loop {
            let trimmed = family.trim_end();
            let trimmed_lower = trimmed.to_ascii_lowercase();
            let mut changed = false;

            for suffix in suffixes {
                if trimmed_lower.ends_with(suffix) {
                    let next_len = trimmed.len().saturating_sub(suffix.len());
                    family.truncate(next_len);
                    family = family.trim_end().to_string();
                    changed = true;
                    break;
                }
            }

            if !changed {
                break;
            }
        }

        family.trim().to_string()
    };

    let mut opened_any = false;
    let mut families = BTreeSet::new();

    for registry_root in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let mut hkey: isize = 0;
        let ret = unsafe { RegOpenKeyExW(registry_root, sub_key.as_ptr(), 0, KEY_READ, &mut hkey) };
        if ret != ERROR_SUCCESS {
            continue;
        }

        opened_any = true;
        let mut idx: u32 = 0;
        loop {
            let mut name_buf = [0u16; 512];
            let mut name_len: u32 = name_buf.len() as u32;
            let ret = unsafe {
                RegEnumValueW(
                    hkey,
                    idx,
                    name_buf.as_mut_ptr(),
                    &mut name_len,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                )
            };
            if ret == ERROR_NO_MORE_ITEMS {
                break;
            }
            if ret != ERROR_SUCCESS {
                idx += 1;
                continue;
            }

            let os_name = std::ffi::OsString::from_wide(&name_buf[..name_len as usize]);
            let name = os_name.to_string_lossy();
            let family = normalize_family(&name);

            if family.is_empty() {
                idx += 1;
                continue;
            }

            if monospace_only {
                let lower = family.to_ascii_lowercase();
                if !mono_keywords.iter().any(|keyword| lower.contains(keyword)) {
                    idx += 1;
                    continue;
                }
            }

            families.insert(family);
            idx += 1;
        }

        unsafe { RegCloseKey(hkey) };
    }

    if !opened_any {
        return Ok(Vec::new());
    }

    Ok(families.into_iter().collect())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn list_system_font_families() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn list_monospace_font_families() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}
