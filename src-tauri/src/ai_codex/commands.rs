use serde_json::json;
use std::time::Duration;
use tauri::AppHandle;

use super::transport::{latest_seq, rpc_call, wait_notification_after};
use super::types::{
    CodexAccountInfo, CodexLoginCompleteResult, CodexLoginStartResult, CodexRateLimitBucket,
    CodexRateLimitWindow, CodexRateLimits,
};

#[tauri::command]
pub async fn codex_account_read(app: AppHandle) -> Result<CodexAccountInfo, String> {
    let value = rpc_call(
        app,
        "account/read",
        json!({ "refreshToken": false }),
        Duration::from_secs(20),
    )
    .await?;
    let auth_mode = value
        .get("authMode")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let account = value.get("account");
    let status = if account.is_some() {
        "connected".to_string()
    } else {
        "disconnected".to_string()
    };

    let email = account
        .and_then(|a| a.get("email"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let display_name = account
        .and_then(|a| a.get("name").or_else(|| a.get("displayName")))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Ok(CodexAccountInfo {
        status,
        email,
        display_name,
        auth_mode,
    })
}

#[tauri::command]
pub async fn codex_login_start(app: AppHandle) -> Result<CodexLoginStartResult, String> {
    let value = rpc_call(
        app,
        "account/login/start",
        json!({ "type": "chatgpt" }),
        Duration::from_secs(30),
    )
    .await?;

    let auth_url = value
        .get("authUrl")
        .or_else(|| value.get("url"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing auth url in login start response".to_string())?
        .to_string();
    let flow_id = value
        .get("loginId")
        .or_else(|| value.get("flowId"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing login id in login start response".to_string())?
        .to_string();

    Ok(CodexLoginStartResult { auth_url, flow_id })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn codex_login_complete(
    app: AppHandle,
    flow_id: String,
) -> Result<CodexLoginCompleteResult, String> {
    let mut seq = latest_seq(app.clone()).await?;
    let deadline = std::time::Instant::now() + Duration::from_secs(180);

    while std::time::Instant::now() < deadline {
        let timeout = Duration::from_millis(800);
        let notification = wait_notification_after(app.clone(), seq, timeout).await?;
        let Some(notification) = notification else {
            continue;
        };
        seq = notification.seq;

        if notification.method == "codex/process/exited" {
            return Err("codex app-server exited while waiting for login".to_string());
        }

        if notification.method == "account/login/completed" {
            let login_id = notification
                .params
                .get("loginId")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            if login_id == flow_id {
                let success = notification
                    .params
                    .get("success")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                return Ok(CodexLoginCompleteResult { connected: success });
            }
        }
    }

    Ok(CodexLoginCompleteResult { connected: false })
}

#[tauri::command]
pub async fn codex_logout(app: AppHandle) -> Result<(), String> {
    let _ = rpc_call(app, "account/logout", json!({}), Duration::from_secs(20)).await?;
    Ok(())
}

#[tauri::command]
pub async fn codex_rate_limits_read(app: AppHandle) -> Result<CodexRateLimits, String> {
    let value = rpc_call(
        app,
        "account/rateLimits/read",
        json!({}),
        Duration::from_secs(20),
    )
    .await?;
    let parse_window = |v: &serde_json::Value| -> Option<CodexRateLimitWindow> {
        let used_percent = v
            .get("usedPercent")
            .or_else(|| v.get("used_percent"))
            .and_then(|x| x.as_f64())
            .unwrap_or(0.0);
        let window_duration_mins = v
            .get("windowDurationMins")
            .or_else(|| v.get("window_minutes"))
            .and_then(|x| x.as_u64());
        let resets_at = v
            .get("resetsAt")
            .or_else(|| v.get("reset_at"))
            .and_then(|x| x.as_u64());
        Some(CodexRateLimitWindow {
            used_percent,
            window_duration_mins,
            resets_at,
        })
    };

    let parse_bucket =
        |v: &serde_json::Value, limit_id: Option<String>| -> Option<CodexRateLimitBucket> {
            let primary = v.get("primary").and_then(parse_window);
            let secondary = v.get("secondary").and_then(parse_window);
            if primary.is_none() && secondary.is_none() {
                return None;
            }
            let limit_name = v
                .get("limitName")
                .or_else(|| v.get("name"))
                .and_then(|x| x.as_str())
                .map(|s| s.to_string());
            Some(CodexRateLimitBucket {
                limit_id,
                limit_name,
                primary,
                secondary,
            })
        };

    let mut buckets: Vec<CodexRateLimitBucket> = Vec::new();
    if let Some(default_bucket) = value.get("rateLimits").and_then(|v| parse_bucket(v, None)) {
        buckets.push(default_bucket);
    }
    if let Some(by_id) = value.get("rateLimitsByLimitId").and_then(|v| v.as_object()) {
        for (id, bucket_value) in by_id {
            if let Some(bucket) = parse_bucket(bucket_value, Some(id.clone())) {
                buckets.push(bucket);
            }
        }
    }

    Ok(CodexRateLimits { buckets })
}
