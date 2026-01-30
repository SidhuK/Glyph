use crate::{io_atomic, paths, vault::VaultState};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    io::Read,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State};
use url::Url;

#[derive(Default)]
pub struct AiState {
    cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl AiState {
    fn register(&self, job_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        let mut map = self.cancels.lock().unwrap_or_else(|p| p.into_inner());
        map.insert(job_id.to_string(), flag.clone());
        flag
    }

    fn cancel(&self, job_id: &str) {
        let map = self.cancels.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(flag) = map.get(job_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }

    fn finish(&self, job_id: &str) {
        let mut map = self.cancels.lock().unwrap_or_else(|p| p.into_inner());
        map.remove(job_id);
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum AiProviderKind {
    Openai,
    OpenaiCompat,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AiProfile {
    pub id: String,
    pub name: String,
    pub provider: AiProviderKind,
    pub model: String,
    pub base_url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Deserialize)]
pub struct AiChatRequest {
    pub profile_id: String,
    pub messages: Vec<AiMessage>,
    pub context: Option<String>,
}

#[derive(Serialize)]
pub struct AiChatStartResult {
    pub job_id: String,
}

#[derive(Serialize, Clone)]
pub struct AiChunkEvent {
    pub job_id: String,
    pub delta: String,
}

#[derive(Serialize, Clone)]
pub struct AiDoneEvent {
    pub job_id: String,
    pub cancelled: bool,
}

#[derive(Serialize, Clone)]
pub struct AiErrorEvent {
    pub job_id: String,
    pub message: String,
}

#[derive(Default, Serialize, Deserialize)]
struct AiStore {
    #[serde(default)]
    profiles: Vec<AiProfile>,
    #[serde(default)]
    active_profile_id: Option<String>,
    #[serde(default)]
    secrets: HashMap<String, String>,
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    Ok(dir.join("ai.json"))
}

fn read_store(path: &Path) -> AiStore {
    let bytes = std::fs::read(path).unwrap_or_default();
    serde_json::from_slice(&bytes).unwrap_or_default()
}

fn write_store(path: &Path, store: &AiStore) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(store).map_err(|e| e.to_string())?;
    io_atomic::write_atomic(path, &bytes).map_err(|e| e.to_string())
}

fn default_openai_base_url(provider: &AiProviderKind) -> &'static str {
    match provider {
        AiProviderKind::Openai => "https://api.openai.com/v1",
        AiProviderKind::OpenaiCompat => "http://localhost:11434/v1",
    }
}

fn build_openai_chat_body(profile: &AiProfile, mut messages: Vec<AiMessage>, context: Option<String>) -> serde_json::Value {
    if let Some(ctx) = context {
        if !ctx.trim().is_empty() {
            messages.insert(
                0,
                AiMessage {
                    role: "system".to_string(),
                    content: format!("Context (user-approved):\n{ctx}"),
                },
            );
        }
    }

    serde_json::json!({
        "model": profile.model,
        "messages": messages.into_iter().map(|m| serde_json::json!({"role": m.role, "content": m.content})).collect::<Vec<_>>(),
        "temperature": 0.2
    })
}

fn call_openai_chat(profile: &AiProfile, api_key: &str, messages: Vec<AiMessage>, context: Option<String>) -> Result<String, String> {
    if matches!(profile.provider, AiProviderKind::Openai) && api_key.trim().is_empty() {
        return Err("API key not set for this profile".to_string());
    }

    let base = profile
        .base_url
        .as_deref()
        .unwrap_or_else(|| default_openai_base_url(&profile.provider));
    let base = Url::parse(base).map_err(|_| "invalid base_url".to_string())?;
    let url = base
        .join("chat/completions")
        .map_err(|e| e.to_string())?;

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let body = build_openai_chat_body(profile, messages, context);

    let mut req = client
        .post(url)
        .header("User-Agent", "Tether/0.1 (ai)")
        .json(&body);
    if !api_key.is_empty() {
        req = req.bearer_auth(api_key);
    }

    let resp = req.send().map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let msg = resp.text().unwrap_or_default();
        return Err(format!("http {status}: {msg}"));
    }

    let mut reader = resp.take(1024 * 1024);
    let mut buf = Vec::<u8>::new();
    reader.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    let v: serde_json::Value = serde_json::from_slice(&buf).map_err(|e| e.to_string())?;
    let content = v
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c0| c0.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();
    if content.trim().is_empty() {
        return Err("empty response".to_string());
    }
    Ok(content)
}

fn audit_log_path(vault_root: &Path, job_id: &str) -> Result<PathBuf, String> {
    let dir = paths::join_under(vault_root, Path::new("cache/ai"))?;
    Ok(dir.join(format!("{job_id}.json")))
}

fn write_audit_log(
    vault_root: &Path,
    job_id: &str,
    profile: &AiProfile,
    messages: &[AiMessage],
    context: &Option<String>,
    response: &str,
    cancelled: bool,
) {
    fn truncate(s: &str, max: usize) -> String {
        if s.len() <= max {
            return s.to_string();
        }
        format!("{}…(truncated)", &s[..max])
    }

    let path = match audit_log_path(vault_root, job_id) {
        Ok(p) => p,
        Err(_) => return,
    };
    let context_truncated = context.as_deref().map(|s| truncate(s, 20_000));
    let response_truncated = truncate(response, 50_000);
    let payload = serde_json::json!({
        "job_id": job_id,
        "created_at_ms": now_ms(),
        "profile": {
            "id": profile.id,
            "name": profile.name,
            "provider": profile.provider,
            "model": profile.model,
            "base_url": profile.base_url,
        },
        "messages": messages,
        "context": context_truncated,
        "response": response_truncated,
        "cancelled": cancelled
    });
    let bytes = serde_json::to_vec_pretty(&payload).unwrap_or_default();
    let _ = io_atomic::write_atomic(&path, &bytes);
}

#[tauri::command]
pub async fn ai_profiles_list(app: AppHandle) -> Result<Vec<AiProfile>, String> {
    let path = store_path(&app)?;
    let store = read_store(&path);
    Ok(store.profiles)
}

#[tauri::command]
pub async fn ai_active_profile_get(app: AppHandle) -> Result<Option<String>, String> {
    let path = store_path(&app)?;
    let store = read_store(&path);
    Ok(store.active_profile_id)
}

#[tauri::command]
pub async fn ai_active_profile_set(app: AppHandle, id: Option<String>) -> Result<(), String> {
    let path = store_path(&app)?;
    let mut store = read_store(&path);
    store.active_profile_id = id;
    write_store(&path, &store)
}

#[tauri::command]
pub async fn ai_profile_upsert(app: AppHandle, profile: AiProfile) -> Result<AiProfile, String> {
    let path = store_path(&app)?;
    let mut store = read_store(&path);
    let mut next = profile;
    if next.id.trim().is_empty() {
        next.id = uuid::Uuid::new_v4().to_string();
    }
    if next.name.trim().is_empty() {
        next.name = "AI Profile".to_string();
    }
    if next.model.trim().is_empty() {
        next.model = "gpt-4o-mini".to_string();
    }

    let mut replaced = false;
    for p in &mut store.profiles {
        if p.id == next.id {
            *p = next.clone();
            replaced = true;
            break;
        }
    }
    if !replaced {
        store.profiles.push(next.clone());
    }
    if store.active_profile_id.is_none() {
        store.active_profile_id = Some(next.id.clone());
    }
    write_store(&path, &store)?;
    Ok(next)
}

#[tauri::command]
pub async fn ai_profile_delete(app: AppHandle, id: String) -> Result<(), String> {
    let path = store_path(&app)?;
    let mut store = read_store(&path);
    store.profiles.retain(|p| p.id != id);
    store.secrets.remove(&id);
    if store.active_profile_id.as_deref() == Some(&id) {
        store.active_profile_id = store.profiles.first().map(|p| p.id.clone());
    }
    write_store(&path, &store)
}

#[tauri::command]
pub async fn ai_secret_set(app: AppHandle, profile_id: String, api_key: String) -> Result<(), String> {
    let path = store_path(&app)?;
    let mut store = read_store(&path);
    store.secrets.insert(profile_id, api_key);
    write_store(&path, &store)
}

#[tauri::command]
pub async fn ai_secret_clear(app: AppHandle, profile_id: String) -> Result<(), String> {
    let path = store_path(&app)?;
    let mut store = read_store(&path);
    store.secrets.remove(&profile_id);
    write_store(&path, &store)
}

#[tauri::command]
pub async fn ai_chat_start(
    ai_state: State<'_, AiState>,
    vault_state: State<'_, VaultState>,
    app: AppHandle,
    request: AiChatRequest,
) -> Result<AiChatStartResult, String> {
    let job_id = uuid::Uuid::new_v4().to_string();
    let cancel = ai_state.register(&job_id);

    let store_path = store_path(&app)?;
    let store = read_store(&store_path);
    let profile = store
        .profiles
        .iter()
        .find(|p| p.id == request.profile_id)
        .cloned()
        .ok_or_else(|| "unknown profile".to_string())?;
    let api_key = store.secrets.get(&profile.id).cloned().unwrap_or_default();

    let app_for_task = app.clone();
    let vault_root = vault_state.current_root().ok();
    let request_messages = request.messages.clone();
    let request_context = request.context.clone();
    let profile_for_task = profile.clone();
    let job_id_for_task = job_id.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let ai_state_for_task = app_for_task.state::<AiState>();
        let result = call_openai_chat(&profile_for_task, &api_key, request_messages.clone(), request_context.clone());
        match result {
            Ok(full) => {
                let mut cancelled = false;
                let mut idx = 0usize;
                while idx < full.len() {
                    if cancel.load(Ordering::Relaxed) {
                        cancelled = true;
                        break;
                    }
                    let end = (idx + 48).min(full.len());
                    let delta = full[idx..end].to_string();
                    let _ = app_for_task.emit(
                        "ai:chunk",
                        AiChunkEvent {
                            job_id: job_id_for_task.clone(),
                            delta,
                        },
                    );
                    idx = end;
                    std::thread::sleep(Duration::from_millis(18));
                }
                let _ = app_for_task.emit(
                    "ai:done",
                    AiDoneEvent {
                        job_id: job_id_for_task.clone(),
                        cancelled,
                    },
                );
                if let Some(root) = vault_root {
                    write_audit_log(
                        &root,
                        &job_id_for_task,
                        &profile_for_task,
                        &request_messages,
                        &request_context,
                        &full,
                        cancelled,
                    );
                }
                ai_state_for_task.finish(&job_id_for_task);
            }
            Err(message) => {
                let _ = app_for_task.emit(
                    "ai:error",
                    AiErrorEvent {
                        job_id: job_id_for_task.clone(),
                        message,
                    },
                );
                ai_state_for_task.finish(&job_id_for_task);
            }
        }
    });

    Ok(AiChatStartResult { job_id })
}

#[tauri::command]
pub async fn ai_chat_cancel(ai_state: State<'_, AiState>, job_id: String) -> Result<(), String> {
    ai_state.cancel(&job_id);
    Ok(())
}
