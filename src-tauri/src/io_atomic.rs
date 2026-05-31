use std::{
    fs::File,
    io::{self, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

fn is_unsupported_sync_error(error: &io::Error) -> bool {
    match error.raw_os_error() {
        // macOS ENOTSUP/EOPNOTSUPP
        Some(45) | Some(102) => true,
        // Linux ENOTSUP/EOPNOTSUPP
        Some(95) => true,
        _ => matches!(error.kind(), io::ErrorKind::Unsupported),
    }
}

fn is_recoverable_hard_link_error(error: &io::Error) -> bool {
    match error.raw_os_error() {
        // Unix EXDEV, Windows ERROR_NOT_SAME_DEVICE.
        Some(18) | Some(17) => true,
        // macOS ENOTSUP/EOPNOTSUPP, Linux ENOTSUP/EOPNOTSUPP.
        Some(45) | Some(102) | Some(95) => true,
        // Windows ERROR_INVALID_FUNCTION/ERROR_NOT_SUPPORTED.
        Some(1) | Some(50) => true,
        _ => matches!(
            error.kind(),
            io::ErrorKind::Unsupported | io::ErrorKind::CrossesDevices
        ),
    }
}

fn sync_all_best_effort(file: &File) -> io::Result<()> {
    match file.sync_all() {
        Ok(()) => Ok(()),
        Err(error) if is_unsupported_sync_error(&error) => Ok(()),
        Err(error) => Err(error),
    }
}

fn fsync_dir(path: &Path) -> io::Result<()> {
    let dir = File::open(path)?;
    sync_all_best_effort(&dir)
}

fn unique_tmp_path(dest: &Path) -> io::Result<PathBuf> {
    let parent = dest
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no parent"))?;

    let file_name = dest
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no filename"))?;

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    let pid = std::process::id();
    let tmp_name = format!(".{}.tmp.{}.{}", file_name.to_string_lossy(), pid, now_ms);
    Ok(parent.join(tmp_name))
}

pub fn write_atomic(dest: &Path, bytes: &[u8]) -> io::Result<()> {
    let parent = dest
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no parent"))?;
    std::fs::create_dir_all(parent)?;

    let tmp = unique_tmp_path(dest)?;

    {
        let mut f = File::create(&tmp)?;
        f.write_all(bytes)?;
        sync_all_best_effort(&f)?;
    }

    std::fs::rename(&tmp, dest)?;
    fsync_dir(parent)?;

    Ok(())
}

pub fn write_atomic_create_new(dest: &Path, bytes: &[u8]) -> io::Result<bool> {
    let parent = dest
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no parent"))?;
    std::fs::create_dir_all(parent)?;

    let tmp = unique_tmp_path(dest)?;

    {
        let mut f = File::create(&tmp)?;
        f.write_all(bytes)?;
        sync_all_best_effort(&f)?;
    }

    match std::fs::hard_link(&tmp, dest) {
        Ok(()) => {
            std::fs::remove_file(&tmp)?;
            fsync_dir(parent)?;
            Ok(true)
        }
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
            let _ = std::fs::remove_file(&tmp);
            Ok(false)
        }
        Err(error) if is_recoverable_hard_link_error(&error) => {
            match std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(dest)
            {
                Ok(mut f) => {
                    if let Err(write_error) =
                        f.write_all(bytes).and_then(|()| sync_all_best_effort(&f))
                    {
                        let _ = std::fs::remove_file(&tmp);
                        let _ = std::fs::remove_file(dest);
                        return Err(write_error);
                    }
                }
                Err(create_error) if create_error.kind() == io::ErrorKind::AlreadyExists => {
                    let _ = std::fs::remove_file(&tmp);
                    return Ok(false);
                }
                Err(create_error) => {
                    let _ = std::fs::remove_file(&tmp);
                    return Err(create_error);
                }
            }
            std::fs::remove_file(&tmp)?;
            fsync_dir(parent)?;
            Ok(true)
        }
        Err(error) => {
            let _ = std::fs::remove_file(&tmp);
            Err(error)
        }
    }
}

pub fn copy_atomic(src: &Path, dest: &Path) -> io::Result<()> {
    let parent = dest
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no parent"))?;
    std::fs::create_dir_all(parent)?;

    let tmp = unique_tmp_path(dest)?;

    {
        let mut source = File::open(src)?;
        let mut target = File::create(&tmp)?;
        io::copy(&mut source, &mut target)?;
        sync_all_best_effort(&target)?;
    }

    std::fs::rename(&tmp, dest)?;
    fsync_dir(parent)?;

    Ok(())
}
