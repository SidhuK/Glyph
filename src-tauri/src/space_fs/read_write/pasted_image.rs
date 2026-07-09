use std::path::{Path, PathBuf};

use crate::io_atomic;
use crate::paths;

use super::super::filename::split_stem_extension;
use super::super::helpers::deny_hidden_rel_path;

const MAX_SUFFIX_ATTEMPTS: u32 = 999;

pub fn extension_for_mime(mime: &str) -> Option<&'static str> {
    match mime.trim().to_ascii_lowercase().as_str() {
        "image/png" => Some("png"),
        "image/jpeg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/svg+xml" => Some("svg"),
        "image/bmp" => Some("bmp"),
        "image/avif" => Some("avif"),
        "image/tiff" => Some("tiff"),
        _ => None,
    }
}

fn extension_matches_mime(mime: &str, ext: &str) -> bool {
    match mime.trim().to_ascii_lowercase().as_str() {
        "image/jpeg" => ext.eq_ignore_ascii_case("jpg") || ext.eq_ignore_ascii_case("jpeg"),
        "image/tiff" => ext.eq_ignore_ascii_case("tif") || ext.eq_ignore_ascii_case("tiff"),
        _ => extension_for_mime(mime).is_some_and(|expected| ext.eq_ignore_ascii_case(expected)),
    }
}

fn basename_from_original_filename(
    original_filename: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(raw) = original_filename else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed == "." || trimmed == ".." {
        return Err("pasted image filename must not contain path components".to_string());
    }
    if trimmed.starts_with('.') {
        return Err("pasted image filename cannot be hidden".to_string());
    }
    Ok(Some(trimmed.to_string()))
}

fn is_safe_filename_char(ch: char) -> bool {
    !ch.is_control()
        && !matches!(
            ch,
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '#' | '[' | ']' | '(' | ')'
        )
}

fn sanitize_filename_stem(stem: &str) -> Option<String> {
    let mut out = String::new();
    let mut last_was_dash = false;
    for ch in stem.trim().chars() {
        if is_safe_filename_char(ch) {
            out.push(ch);
            last_was_dash = false;
        } else if !last_was_dash {
            out.push('-');
            last_was_dash = true;
        }
    }
    let sanitized = out
        .trim_matches(|ch: char| ch.is_whitespace() || ch == '-' || ch == '.')
        .to_string();
    if sanitized.is_empty() || sanitized.starts_with('.') {
        None
    } else {
        Some(sanitized)
    }
}

pub fn filename_for_mime(
    original_filename: Option<&str>,
    mime: &str,
    ext: &str,
) -> Result<String, String> {
    let Some(basename) = basename_from_original_filename(original_filename)? else {
        return Ok(format!("image.{ext}"));
    };
    let (raw_stem, ext_with_dot) = split_stem_extension(&basename);
    let stem = sanitize_filename_stem(raw_stem).unwrap_or_else(|| "image".to_string());
    let chosen_ext = ext_with_dot
        .strip_prefix('.')
        .filter(|value| !value.is_empty())
        .filter(|value| extension_matches_mime(mime, value))
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_else(|| ext.to_string());
    Ok(format!("{stem}.{chosen_ext}"))
}

pub fn suffixed_file_name(file_name: &str, index: u32) -> String {
    let (stem, ext) = split_stem_extension(file_name);
    format!("{stem}-{index}{ext}")
}

fn asset_rel_for_file_name(target_rel: &Path, file_name: &str) -> PathBuf {
    if target_rel.as_os_str().is_empty() {
        PathBuf::from(file_name)
    } else {
        target_rel.join(file_name)
    }
}

fn file_bytes_match(path: &Path, bytes: &[u8]) -> Result<bool, String> {
    let metadata = match std::fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => metadata,
        Ok(_) => return Ok(false),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error.to_string()),
    };
    if metadata.len() != bytes.len() as u64 {
        return Ok(false);
    }
    match std::fs::read(path) {
        Ok(existing) => Ok(existing == bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}

pub fn write_or_reuse_asset(
    root: &Path,
    target_rel: &Path,
    file_name: &str,
    bytes: &[u8],
) -> Result<PathBuf, String> {
    let mut suffix_index = 1_u32;
    loop {
        if suffix_index > MAX_SUFFIX_ATTEMPTS {
            return Err(format!(
                "could not allocate a unique pasted image name for {file_name}"
            ));
        }
        let candidate_name = if suffix_index == 1 {
            file_name.to_string()
        } else {
            suffixed_file_name(file_name, suffix_index)
        };
        let asset_rel = asset_rel_for_file_name(target_rel, &candidate_name);
        deny_hidden_rel_path(&asset_rel)?;
        let asset_abs = paths::join_under(root, &asset_rel)?;
        match io_atomic::write_atomic_create_new(&asset_abs, bytes).map_err(|e| e.to_string())? {
            true => return Ok(asset_rel),
            false if file_bytes_match(&asset_abs, bytes)? => return Ok(asset_rel),
            false => {
                suffix_index += 1;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{filename_for_mime, suffixed_file_name, write_or_reuse_asset, MAX_SUFFIX_ATTEMPTS};
    use std::path::{Path, PathBuf};

    struct TempSpace {
        root: PathBuf,
    }

    impl TempSpace {
        fn new() -> Self {
            let root = std::env::temp_dir()
                .join(format!("glyph-pasted-image-test-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&root).expect("temp space should be created");
            Self { root }
        }

        fn path(&self) -> &Path {
            &self.root
        }
    }

    impl Drop for TempSpace {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn filename_for_mime_uses_sanitized_original_filename() {
        assert_eq!(
            filename_for_mime(Some("screen:shot?.png"), "image/png", "png").unwrap(),
            "screen-shot.png"
        );
    }

    #[test]
    fn filename_for_mime_rejects_path_bearing_original_filenames() {
        assert!(filename_for_mime(Some("../picture new.png"), "image/png", "png").is_err());
        assert!(filename_for_mime(Some("folder/picture.png"), "image/png", "png").is_err());
        assert!(filename_for_mime(Some("folder\\picture.png"), "image/png", "png").is_err());
        assert!(filename_for_mime(Some("."), "image/png", "png").is_err());
        assert!(filename_for_mime(Some(".."), "image/png", "png").is_err());
    }

    #[test]
    fn filename_for_mime_rejects_hidden_original_filenames() {
        assert!(filename_for_mime(Some(".secret.png"), "image/png", "png").is_err());
    }

    #[test]
    fn filename_for_mime_enforces_detected_mime_extension() {
        assert_eq!(
            filename_for_mime(Some("photo.gif"), "image/png", "png").unwrap(),
            "photo.png"
        );
        assert_eq!(
            filename_for_mime(Some("photo.jpeg"), "image/jpeg", "jpg").unwrap(),
            "photo.jpeg"
        );
    }

    #[test]
    fn filename_for_mime_falls_back_for_unnamed_images() {
        assert_eq!(
            filename_for_mime(None, "image/webp", "webp").unwrap(),
            "image.webp"
        );
        assert_eq!(
            filename_for_mime(Some(""), "image/png", "png").unwrap(),
            "image.png"
        );
    }

    #[test]
    fn suffix_uses_dash_number_before_extension() {
        assert_eq!(
            suffixed_file_name("picture-new.png", 2),
            "picture-new-2.png"
        );
    }

    #[test]
    fn write_or_reuse_asset_creates_new_file() {
        let temp_space = TempSpace::new();
        let bytes = vec![1_u8, 2, 3];
        let asset_rel =
            write_or_reuse_asset(temp_space.path(), Path::new("assets"), "photo.png", &bytes)
                .expect("new asset should be written");

        assert_eq!(asset_rel, Path::new("assets/photo.png"));
        assert_eq!(
            std::fs::read(temp_space.path().join(&asset_rel)).expect("asset should exist"),
            bytes
        );
    }

    #[test]
    fn write_or_reuse_asset_reuses_identical_bytes() {
        let temp_space = TempSpace::new();
        let bytes = vec![4_u8, 5, 6];
        let first =
            write_or_reuse_asset(temp_space.path(), Path::new("assets"), "photo.png", &bytes)
                .expect("first write should succeed");
        let second =
            write_or_reuse_asset(temp_space.path(), Path::new("assets"), "photo.png", &bytes)
                .expect("second write should reuse existing asset");

        assert_eq!(first, second);
        let entries: Vec<_> = std::fs::read_dir(temp_space.path().join("assets"))
            .expect("assets dir should exist")
            .map(|entry| entry.expect("dir entry should be readable").file_name())
            .collect();
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn write_or_reuse_asset_suffixes_when_bytes_differ() {
        let temp_space = TempSpace::new();
        let target = Path::new("assets");
        write_or_reuse_asset(temp_space.path(), target, "photo.png", &[1_u8])
            .expect("first write should succeed");
        let asset_rel = write_or_reuse_asset(temp_space.path(), target, "photo.png", &[2_u8])
            .expect("conflicting write should suffix");

        assert_eq!(asset_rel, Path::new("assets/photo-2.png"));
        assert_eq!(
            std::fs::read(temp_space.path().join(&asset_rel)).expect("suffixed asset should exist"),
            vec![2_u8]
        );
    }

    #[test]
    fn write_or_reuse_asset_errors_after_suffix_limit() {
        let temp_space = TempSpace::new();
        let target_abs = temp_space.path().join("assets");
        std::fs::create_dir_all(&target_abs).expect("assets dir should be created");
        std::fs::write(target_abs.join("photo.png"), [1_u8]).expect("seed file should exist");
        for index in 2..=MAX_SUFFIX_ATTEMPTS {
            std::fs::write(target_abs.join(format!("photo-{index}.png")), [index as u8])
                .expect("seed file should exist");
        }

        let error = write_or_reuse_asset(
            temp_space.path(),
            Path::new("assets"),
            "photo.png",
            &[254_u8, 255_u8],
        )
        .expect_err("suffix allocation should be exhausted");
        assert!(error.contains("could not allocate a unique pasted image name"));
    }
}
