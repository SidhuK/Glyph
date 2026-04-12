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
