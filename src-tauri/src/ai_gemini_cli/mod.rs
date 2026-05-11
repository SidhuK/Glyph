use std::{env, path::Path, time::Duration};

use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::{io::AsyncReadExt, process::Command};
use tokio_util::sync::CancellationToken;

use crate::ai_rig::{
    events::AiStatusEvent,
    helpers::{find_cli_binary, http_client},
    providers::build_transcript,
    types::{AiAssistantMode, AiChunkEvent, AiMessage, AiModel, AiProfile, AiStoredToolEvent},
};

const RUN_TIMEOUT: Duration = Duration::from_secs(600);

fn find_gemini_binary() -> Result<std::path::PathBuf, String> {
    find_cli_binary("Gemini CLI", "GEMINI_CLI_PATH", "gemini")
}

fn prompt_text(system: &str, messages: &[AiMessage]) -> String {
    let transcript = build_transcript(system, messages);
    if transcript.trim().is_empty() {
        messages
            .iter()
            .rev()
            .find(|message| message.role == "user")
            .map(|message| message.content.clone())
            .unwrap_or_default()
    } else {
        transcript
    }
}

fn approval_mode(mode: &AiAssistantMode) -> &'static str {
    match mode {
        AiAssistantMode::Chat => "plan",
        AiAssistantMode::Create => "auto_edit",
    }
}

async fn read_pipe<R>(mut reader: R) -> String
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut text = String::new();
    let _ = reader.read_to_string(&mut text).await;
    text
}

fn auth_error_message(message: &str) -> Option<String> {
    let lower = message.to_lowercase();
    (lower.contains("auth")
        || lower.contains("login")
        || lower.contains("api key")
        || lower.contains("unauthorized")
        || lower.contains("permission denied"))
    .then(|| "Gemini CLI is not authenticated. Run Gemini CLI auth in your terminal or configure its official authentication environment, then retry in Glyph.".to_string())
}

fn string_at_path(value: &Value, path: &[&str]) -> Option<String> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    current
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToString::to_string)
}

fn extract_response_text(value: &Value) -> Option<String> {
    if let Some(text) = value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        return Some(text.to_string());
    }
    [
        &["response"][..],
        &["text"][..],
        &["result"][..],
        &["content"][..],
        &["message", "content"][..],
        &["output", "text"][..],
    ]
    .into_iter()
    .find_map(|path| string_at_path(value, path))
}

fn emit_response(app: &AppHandle, job_id: &str, text: &str) {
    if text.is_empty() {
        return;
    }
    let _ = app.emit(
        "ai:chunk",
        AiChunkEvent {
            job_id: job_id.to_string(),
            delta: text.to_string(),
        },
    );
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiModelListResponse {
    models: Option<Vec<GeminiModelListItem>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiModelListItem {
    name: String,
    display_name: Option<String>,
    description: Option<String>,
    input_token_limit: Option<u32>,
    output_token_limit: Option<u32>,
    supported_generation_methods: Option<Vec<String>>,
}

fn env_api_key() -> Option<String> {
    ["GEMINI_API_KEY", "GOOGLE_API_KEY"]
        .into_iter()
        .find_map(|name| {
            env::var(name)
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        })
}

fn cli_default_model() -> AiModel {
    AiModel {
        id: "default".to_string(),
        name: "Gemini CLI default".to_string(),
        context_length: None,
        description: Some("Use the model configured in Gemini CLI.".to_string()),
        input_modalities: None,
        output_modalities: None,
        tokenizer: None,
        prompt_pricing: None,
        completion_pricing: None,
        supported_parameters: Some(vec!["tools".to_string()]),
        max_completion_tokens: None,
        reasoning_effort: None,
        default_reasoning_effort: None,
    }
}

fn google_model_to_ai_model(model: GeminiModelListItem) -> Option<AiModel> {
    if let Some(methods) = &model.supported_generation_methods {
        let can_generate = methods
            .iter()
            .any(|method| matches!(method.as_str(), "generateContent" | "streamGenerateContent"));
        if !can_generate {
            return None;
        }
    }
    let id = model
        .name
        .strip_prefix("models/")
        .unwrap_or(&model.name)
        .to_string();
    if id.trim().is_empty() {
        return None;
    }
    Some(AiModel {
        name: model.display_name.unwrap_or_else(|| id.clone()),
        id,
        context_length: model.input_token_limit,
        description: model.description,
        input_modalities: None,
        output_modalities: None,
        tokenizer: None,
        prompt_pricing: None,
        completion_pricing: None,
        supported_parameters: Some(vec!["tools".to_string()]),
        max_completion_tokens: model.output_token_limit,
        reasoning_effort: None,
        default_reasoning_effort: None,
    })
}

pub async fn list_models(_profile: &AiProfile) -> Result<Vec<AiModel>, String> {
    let _ = find_gemini_binary()?;
    let Some(api_key) = env_api_key() else {
        return Ok(vec![cli_default_model()]);
    };

    let client = http_client()?;
    let mut url = reqwest::Url::parse("https://generativelanguage.googleapis.com/v1beta/models")
        .map_err(|e| e.to_string())?;
    url.query_pairs_mut().append_pair("key", &api_key);

    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Gemini model list failed ({status}): {text}"));
    }

    let parsed: GeminiModelListResponse = resp.json().await.map_err(|e| e.to_string())?;
    let mut models: Vec<AiModel> = parsed
        .models
        .unwrap_or_default()
        .into_iter()
        .filter_map(google_model_to_ai_model)
        .collect();
    models.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.id.cmp(&b.id)));
    if !models.iter().any(|model| model.id == "default") {
        models.insert(0, cli_default_model());
    }
    Ok(models)
}

#[allow(clippy::too_many_arguments)]
pub async fn run_with_gemini_cli(
    cancel: &CancellationToken,
    app: &AppHandle,
    job_id: &str,
    profile: &AiProfile,
    system: &str,
    messages: &[AiMessage],
    mode: &AiAssistantMode,
    space_root: Option<&Path>,
) -> Result<(String, bool, Vec<AiStoredToolEvent>), String> {
    let root = space_root.ok_or_else(|| "No space is open".to_string())?;
    let prompt = prompt_text(system, messages);
    let binary = find_gemini_binary()?;

    let _ = app.emit(
        "ai:status",
        AiStatusEvent {
            job_id: job_id.to_string(),
            status: "thinking".to_string(),
            detail: Some("Starting Gemini CLI".to_string()),
        },
    );

    let mut command = Command::new(binary);
    command
        .arg("--prompt")
        .arg(prompt)
        .arg("--output-format")
        .arg("json")
        .arg("--approval-mode")
        .arg(approval_mode(mode))
        .arg("--skip-trust");
    if !profile.model.trim().is_empty() && profile.model.trim() != "default" {
        command.arg("--model").arg(profile.model.trim());
    }
    command
        .current_dir(root)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|e| format!("failed to start Gemini CLI: {e}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture Gemini CLI stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "failed to capture Gemini CLI stderr".to_string())?;
    let stdout_task = tokio::spawn(read_pipe(stdout));
    let stderr_task = tokio::spawn(read_pipe(stderr));
    let deadline = tokio::time::sleep(RUN_TIMEOUT);
    tokio::pin!(deadline);

    let status = loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                return Ok((String::new(), true, Vec::new()));
            }
            _ = &mut deadline => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                return Err("Gemini CLI request timed out".to_string());
            }
            _ = tokio::time::sleep(Duration::from_millis(100)) => {
                if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                    break status;
                }
            }
        }
    };

    let stdout = stdout_task.await.unwrap_or_default();
    let stderr = stderr_task.await.unwrap_or_default();
    if !status.success() {
        let detail = if stderr.trim().is_empty() {
            format!("Gemini CLI exited with {status}")
        } else {
            format!("Gemini CLI exited with {status}: {}", stderr.trim())
        };
        return Err(auth_error_message(&detail).unwrap_or(detail));
    }

    let full = match serde_json::from_str::<Value>(&stdout) {
        Ok(value) => extract_response_text(&value).unwrap_or_else(|| stdout.trim().to_string()),
        Err(_) => stdout.trim().to_string(),
    };
    emit_response(app, job_id, &full);
    Ok((full, false, Vec::new()))
}
