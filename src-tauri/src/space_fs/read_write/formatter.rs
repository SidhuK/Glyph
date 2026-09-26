use serde::Deserialize;
use std::{
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tauri_plugin_store::StoreExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Semaphore;

const TIMEOUT: Duration = Duration::from_secs(10);
const MAX_OUTPUT: u64 = 16 * 1024 * 1024;
// Bound subprocesses across simultaneous saves in every window.
static FORMATTER_SLOTS: Semaphore = Semaphore::const_new(4);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    version: u8,
    enabled: bool,
    executable: String,
    arguments: Vec<String>,
    config_file: String,
}

pub struct Formatter {
    settings: Settings,
    directory: PathBuf,
    config: PathBuf,
    file: PathBuf,
}

// Read the shared native store on every save, so settings changes need no
// additional runtime cache or synchronization command.
pub fn resolve(
    app: &tauri::AppHandle,
    root: &Path,
    rel: &Path,
) -> Result<Option<Formatter>, String> {
    if !crate::utils::is_markdown_path(rel) {
        return Ok(None);
    }
    let store = app
        .store("settings.json")
        .map_err(|_| "formatter:settingsUnavailable".to_string())?;
    let Some(value) = store.get("editor.markdownFormatter") else {
        return Ok(None);
    };
    let Ok(settings) = serde_json::from_value::<Settings>(value) else {
        return Ok(None);
    };
    if settings.version != 1 || !settings.enabled {
        return Ok(None);
    }
    if !Path::new(&settings.executable).is_absolute()
        || settings.executable.contains('\0')
        || settings.arguments.iter().any(|arg| arg.contains('\0'))
        || settings.config_file.is_empty()
        || settings.config_file.contains(['/', '\\', '\0'])
        || matches!(settings.config_file.as_str(), "." | "..")
    {
        return Err("formatter:invalidSettings".into());
    }
    let root = root
        .canonicalize()
        .map_err(|_| "formatter:configUnreadable".to_string())?;
    let file = crate::paths::join_under(&root, rel)?;
    if file.exists()
        && !file
            .canonicalize()
            .map_err(|_| "formatter:configUnreadable".to_string())?
            .starts_with(&root)
    {
        return Err("formatter:outsideSpace".into());
    }
    let mut directory = file.parent().ok_or("formatter:outsideSpace")?.to_path_buf();
    // Search only within this Space. Do not follow configuration symlinks outside it.
    loop {
        if directory.exists() {
            let canonical = directory
                .canonicalize()
                .map_err(|_| "formatter:configUnreadable".to_string())?;
            if !canonical.starts_with(&root) {
                return Err("formatter:outsideSpace".into());
            }
            let config = crate::paths::join_under(&directory, Path::new(&settings.config_file))?;
            match std::fs::metadata(&config) {
                Ok(metadata) if metadata.is_file() => {
                    let config = config
                        .canonicalize()
                        .map_err(|_| "formatter:configUnreadable".to_string())?;
                    if !config.starts_with(&root) {
                        return Err("formatter:outsideSpace".into());
                    }
                    return Ok(Some(Formatter {
                        settings,
                        directory,
                        config,
                        file,
                    }));
                }
                Ok(_) => return Err("formatter:invalidConfig".into()),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => return Err("formatter:configUnreadable".into()),
            }
        }
        if directory == root || !directory.pop() {
            return Ok(None);
        }
    }
}

impl Formatter {
    pub async fn format(self, text: &str) -> Result<String, String> {
        let _permit = FORMATTER_SLOTS
            .acquire()
            .await
            .map_err(|_| "formatter:unavailable".to_string())?;
        let args: Vec<String> = self
            .settings
            .arguments
            .iter()
            .map(|arg| {
                arg.replace("{config}", &self.config.to_string_lossy())
                    .replace("{filepath}", &self.file.to_string_lossy())
            })
            .collect();
        let mut child = tokio::process::Command::new(&self.settings.executable)
            .args(args)
            .current_dir(self.directory)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            // Never retain or log formatter diagnostics, which may contain note text.
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|_| "formatter:startFailed".to_string())?;
        let mut stdin = child.stdin.take().ok_or("formatter:ioFailed")?;
        let stdout = child.stdout.take().ok_or("formatter:ioFailed")?;
        let run = async {
            let write = async {
                stdin
                    .write_all(text.as_bytes())
                    .await
                    .map_err(|_| "formatter:ioFailed".to_string())?;
                stdin
                    .shutdown()
                    .await
                    .map_err(|_| "formatter:ioFailed".to_string())?;
                drop(stdin);
                Ok::<_, String>(())
            };
            let read = async {
                let mut bytes = Vec::new();
                stdout
                    .take(MAX_OUTPUT + 1)
                    .read_to_end(&mut bytes)
                    .await
                    .map_err(|_| "formatter:ioFailed".to_string())?;
                if bytes.len() as u64 > MAX_OUTPUT {
                    return Err("formatter:outputTooLarge".into());
                }
                Ok::<_, String>(bytes)
            };
            let (_, bytes) = tokio::try_join!(write, read)?;
            let status = child
                .wait()
                .await
                .map_err(|_| "formatter:ioFailed".to_string())?;
            if !status.success() {
                return Err("formatter:processFailed".into());
            }
            let formatted =
                String::from_utf8(bytes).map_err(|_| "formatter:invalidOutput".to_string())?;
            if !text.trim().is_empty() && formatted.trim().is_empty() {
                return Err("formatter:emptyOutput".into());
            }
            Ok(formatted)
        };
        let result = match tokio::time::timeout(TIMEOUT, run).await {
            Ok(result) => result,
            Err(_) => Err("formatter:timedOut".into()),
        };
        if result.is_err() && child.kill().await.is_err() {
            // Do not log process diagnostics or note content.
            tracing::warn!("failed to terminate Markdown formatter");
        }
        result
    }
}
