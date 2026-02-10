use std::{
    fs::File,
    io::{self, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

fn fsync_dir(path: &Path) -> io::Result<()> {
    let dir = File::open(path)?;
    dir.sync_all()
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
        f.sync_all()?;
    }

    std::fs::rename(&tmp, dest)?;
    fsync_dir(parent)?;

    Ok(())
}
