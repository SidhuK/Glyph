use std::path::Path;

use tauri::AppHandle;
use tokio_util::sync::CancellationToken;

use crate::ai::types::{AiMessage, AiProfile, AiStoredToolEvent};

use super::runtime;

pub async fn run_request(
    cancel: &CancellationToken,
    app: &AppHandle,
    job_id: &str,
    profile: &AiProfile,
    api_key: Option<&str>,
    system: &str,
    messages: &[AiMessage],
    vault_root: Option<&Path>,
) -> Result<(String, bool, Vec<AiStoredToolEvent>), String> {
    runtime::run_with_rig(
        cancel, app, job_id, profile, api_key, system, messages, vault_root,
    )
    .await
}
