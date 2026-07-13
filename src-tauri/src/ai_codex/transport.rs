use serde_json::Value;
use std::time::Duration;
use tauri::{AppHandle, Manager};

use super::state::{CodexNotification, CodexState};

pub async fn rpc_call(
    app: AppHandle,
    method: &str,
    params: Value,
    timeout: Duration,
) -> Result<Value, String> {
    let method = method.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<CodexState>();
        state.call(&method, params, timeout)
    })
    .await
    .map_err(|error| format!("codex RPC task failed: {error}"))?
}

pub async fn latest_seq(app: AppHandle) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<CodexState>();
        state.latest_notification_seq()
    })
    .await
    .map_err(|error| format!("codex notification task failed: {error}"))?
}

pub async fn wait_notification_after(
    app: AppHandle,
    after_seq: u64,
    timeout: Duration,
) -> Result<Option<CodexNotification>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<CodexState>();
        state.wait_notification_after(after_seq, timeout)
    })
    .await
    .map_err(|error| format!("codex notification task failed: {error}"))?
}
