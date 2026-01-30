use crate::{io_atomic, net, paths, vault::VaultState};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::{
	collections::HashMap,
	path::{Path, PathBuf},
	sync::Mutex,
	time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio_util::sync::CancellationToken;
use url::Url;

const KEYCHAIN_SERVICE: &str = "Tether AI";

#[derive(Default)]
pub struct AiState {
	cancels: Mutex<HashMap<String, CancellationToken>>,
}

impl AiState {
	fn register(&self, job_id: &str) -> CancellationToken {
		let token = CancellationToken::new();
		let mut map = self.cancels.lock().unwrap_or_else(|p| p.into_inner());
		map.insert(job_id.to_string(), token.clone());
		token
	}

	fn cancel(&self, job_id: &str) {
		let map = self.cancels.lock().unwrap_or_else(|p| p.into_inner());
		if let Some(token) = map.get(job_id) {
			token.cancel();
		}
	}

	fn finish(&self, job_id: &str) {
		let mut map = self.cancels.lock().unwrap_or_else(|p| p.into_inner());
		map.remove(job_id);
	}
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub enum AiProviderKind {
	Openai,
	OpenaiCompat,
	Openrouter,
	Anthropic,
	Gemini,
	Ollama,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AiHeader {
	pub key: String,
	pub value: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AiProfile {
	pub id: String,
	pub name: String,
	pub provider: AiProviderKind,
	pub model: String,
	pub base_url: Option<String>,
	#[serde(default)]
	pub headers: Vec<AiHeader>,
	#[serde(default)]
	pub allow_private_hosts: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AiMessage {
	pub role: String,
	pub content: String,
}

#[derive(Deserialize, Clone)]
pub struct AiChatRequest {
	pub profile_id: String,
	pub messages: Vec<AiMessage>,
	pub context: Option<String>,
	#[serde(default)]
	pub context_manifest: Option<serde_json::Value>,
	#[serde(default)]
	pub audit: bool,
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

	// Legacy secrets storage (pre-keychain). If present, we migrate it on read.
	#[serde(default, rename = "secrets")]
	legacy_secrets: HashMap<String, String>,
}

fn now_ms() -> u64 {
	use std::time::{SystemTime, UNIX_EPOCH};
	SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.unwrap_or_default()
		.as_millis() as u64
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
	let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
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

fn keychain_entry(profile_id: &str) -> Result<keyring::Entry, String> {
	keyring::Entry::new(KEYCHAIN_SERVICE, profile_id).map_err(|e| e.to_string())
}

fn keychain_set(profile_id: &str, secret: &str) -> Result<(), String> {
	let entry = keychain_entry(profile_id)?;
	entry.set_password(secret).map_err(|e| e.to_string())
}

fn keychain_get(profile_id: &str) -> Result<Option<String>, String> {
	let entry = keychain_entry(profile_id)?;
	match entry.get_password() {
		Ok(v) => Ok(Some(v)),
		Err(keyring::Error::NoEntry) => Ok(None),
		Err(e) => Err(e.to_string()),
	}
}

fn keychain_clear(profile_id: &str) -> Result<(), String> {
	let entry = keychain_entry(profile_id)?;
	match entry.delete_password() {
		Ok(()) => Ok(()),
		Err(keyring::Error::NoEntry) => Ok(()),
		Err(e) => Err(e.to_string()),
	}
}

fn ensure_default_profiles(store: &mut AiStore) {
	if !store.profiles.is_empty() {
		return;
	}
	let mut add = |name: &str,
	               provider: AiProviderKind,
	               model: &str,
	               base_url: Option<&str>,
	               allow_private_hosts: bool| {
		store.profiles.push(AiProfile {
			id: uuid::Uuid::new_v4().to_string(),
			name: name.to_string(),
			provider,
			model: model.to_string(),
			base_url: base_url.map(str::to_string),
			headers: Vec::new(),
			allow_private_hosts,
		});
	};

	add("OpenAI", AiProviderKind::Openai, "gpt-4o-mini", None, false);
	add(
		"OpenAI-compatible",
		AiProviderKind::OpenaiCompat,
		"gpt-4o-mini",
		None,
		false,
	);
	add(
		"OpenRouter",
		AiProviderKind::Openrouter,
		"openai/gpt-4o-mini",
		None,
		false,
	);
	add("Anthropic", AiProviderKind::Anthropic, "claude-3-5-sonnet-latest", None, false);
	add("Gemini", AiProviderKind::Gemini, "gemini-1.5-flash", None, false);
	add("Ollama", AiProviderKind::Ollama, "llama3.1", None, true);
}

fn migrate_legacy_secrets(store: &mut AiStore) {
	if store.legacy_secrets.is_empty() {
		return;
	}
	let mut remaining = HashMap::<String, String>::new();
	for (profile_id, secret) in store.legacy_secrets.clone() {
		if keychain_set(&profile_id, &secret).is_err() {
			remaining.insert(profile_id, secret);
		}
	}
	store.legacy_secrets = remaining;
}

fn default_base_url(provider: &AiProviderKind) -> &'static str {
	match provider {
		AiProviderKind::Openai => "https://api.openai.com/v1",
		AiProviderKind::OpenaiCompat => "http://localhost:11434/v1",
		AiProviderKind::Openrouter => "https://openrouter.ai/api/v1",
		AiProviderKind::Anthropic => "https://api.anthropic.com",
		AiProviderKind::Gemini => "https://generativelanguage.googleapis.com",
		AiProviderKind::Ollama => "http://localhost:11434/v1",
	}
}

fn parse_base_url(profile: &AiProfile) -> Result<Url, String> {
	let raw = profile
		.base_url
		.as_deref()
		.unwrap_or_else(|| default_base_url(&profile.provider));
	let url = Url::parse(raw).map_err(|_| "invalid base_url".to_string())?;
	match url.scheme() {
		"https" => {}
		"http" if profile.allow_private_hosts => {}
		"http" => return Err("http base_url blocked (enable allow_private_hosts)".to_string()),
		_ => return Err("invalid base_url scheme".to_string()),
	}
	net::validate_url_host(&url, profile.allow_private_hosts)?;
	Ok(url)
}

fn apply_extra_headers(
	mut req: reqwest::RequestBuilder,
	profile: &AiProfile,
) -> reqwest::RequestBuilder {
	for h in &profile.headers {
		let key = h.key.trim();
		if key.is_empty() {
			continue;
		}
		req = req.header(key, h.value.clone());
	}
	req
}

fn split_system_and_messages(mut messages: Vec<AiMessage>, context: Option<String>) -> (String, Vec<AiMessage>) {
	let mut sys = String::new();
	if let Some(ctx) = context {
		if !ctx.trim().is_empty() {
			sys.push_str("Context (user-approved):\n");
			sys.push_str(ctx.trim());
			sys.push('\n');
		}
	}

	let mut rest = Vec::<AiMessage>::new();
	for m in messages.drain(..) {
		if m.role == "system" {
			if !m.content.trim().is_empty() {
				sys.push_str(m.content.trim());
				sys.push('\n');
			}
			continue;
		}
		rest.push(m);
	}
	(sys.trim().to_string(), rest)
}

async fn http_client() -> Result<reqwest::Client, String> {
	reqwest::Client::builder()
		.timeout(Duration::from_secs(90))
		.user_agent("Tether/0.1 (ai)")
		.build()
		.map_err(|e| e.to_string())
}

async fn stream_openai_like(
	client: &reqwest::Client,
	cancel: &CancellationToken,
	app: &AppHandle,
	job_id: &str,
	profile: &AiProfile,
	api_key: Option<&str>,
	body: serde_json::Value,
	url: Url,
) -> Result<(String, bool), String> {
	let mut req = client.post(url).json(&body);
	if let Some(key) = api_key {
		if !key.trim().is_empty() {
			req = req.bearer_auth(key);
		}
	}
	req = apply_extra_headers(req, profile);

	let resp = req.send().await.map_err(|e| e.to_string())?;
	if !resp.status().is_success() {
		let status = resp.status();
		let msg = resp.text().await.unwrap_or_default();
		return Err(format!("http {status}: {msg}"));
	}

	let mut cancelled = false;
	let mut full = String::new();
	let mut buf = String::new();
	let mut stream = resp.bytes_stream();

	loop {
		tokio::select! {
			_ = cancel.cancelled() => {
				cancelled = true;
				break;
			}
			item = stream.next() => {
				let Some(item) = item else { break; };
				let chunk = item.map_err(|e| e.to_string())?;
				buf.push_str(&String::from_utf8_lossy(&chunk));
				while let Some(idx) = buf.find("\n\n") {
					let raw = buf[..idx].to_string();
					buf = buf[idx + 2..].to_string();
					let mut data = String::new();
					for line in raw.lines() {
						let line = line.trim();
						if let Some(rest) = line.strip_prefix("data:") {
							let part = rest.trim_start();
							data.push_str(part);
						}
					}
					let data = data.trim();
					if data.is_empty() {
						continue;
					}
					if data == "[DONE]" {
						return Ok((full, cancelled));
					}
					let v: serde_json::Value = match serde_json::from_str(data) {
						Ok(v) => v,
						Err(_) => continue,
					};
					let delta = v
						.pointer("/choices/0/delta/content")
						.and_then(|v| v.as_str())
						.or_else(|| v.pointer("/choices/0/message/content").and_then(|v| v.as_str()))
						.unwrap_or("");
					if delta.is_empty() {
						continue;
					}
					full.push_str(delta);
					let _ = app.emit(
						"ai:chunk",
						AiChunkEvent {
							job_id: job_id.to_string(),
							delta: delta.to_string(),
						},
					);
				}
			}
		}
	}

	Ok((full, cancelled))
}

async fn stream_anthropic(
	client: &reqwest::Client,
	cancel: &CancellationToken,
	app: &AppHandle,
	job_id: &str,
	profile: &AiProfile,
	api_key: &str,
	system: &str,
	messages: &[AiMessage],
	url: Url,
) -> Result<(String, bool), String> {
	if api_key.trim().is_empty() {
		return Err("API key not set for this profile".to_string());
	}

	let converted: Vec<serde_json::Value> = messages
		.iter()
		.filter_map(|m| match m.role.as_str() {
			"user" | "assistant" => Some(serde_json::json!({
				"role": m.role,
				"content": m.content
			})),
			_ => None,
		})
		.collect();

	let body = serde_json::json!({
		"model": profile.model,
		"max_tokens": 1024,
		"temperature": 0.2,
		"system": if system.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(system.to_string()) },
		"messages": converted,
		"stream": true
	});

	let mut req = client
		.post(url)
		.header("x-api-key", api_key)
		.header("anthropic-version", "2023-06-01")
		.json(&body);
	req = apply_extra_headers(req, profile);

	let resp = req.send().await.map_err(|e| e.to_string())?;
	if !resp.status().is_success() {
		let status = resp.status();
		let msg = resp.text().await.unwrap_or_default();
		return Err(format!("http {status}: {msg}"));
	}

	let mut cancelled = false;
	let mut full = String::new();
	let mut buf = String::new();
	let mut stream = resp.bytes_stream();

	loop {
		tokio::select! {
			_ = cancel.cancelled() => {
				cancelled = true;
				break;
			}
			item = stream.next() => {
				let Some(item) = item else { break; };
				let chunk = item.map_err(|e| e.to_string())?;
				buf.push_str(&String::from_utf8_lossy(&chunk));
				while let Some(idx) = buf.find("\n\n") {
					let raw = buf[..idx].to_string();
					buf = buf[idx + 2..].to_string();

					let mut data = String::new();
					for line in raw.lines() {
						let line = line.trim();
						if let Some(rest) = line.strip_prefix("data:") {
							data.push_str(rest.trim_start());
						}
					}
					let data = data.trim();
					if data.is_empty() {
						continue;
					}
					let v: serde_json::Value = match serde_json::from_str(data) {
						Ok(v) => v,
						Err(_) => continue,
					};
					let ty = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
					if ty == "message_stop" {
						return Ok((full, cancelled));
					}
					let delta = v
						.pointer("/delta/text")
						.and_then(|t| t.as_str())
						.unwrap_or("");
					if delta.is_empty() {
						continue;
					}
					full.push_str(delta);
					let _ = app.emit(
						"ai:chunk",
						AiChunkEvent {
							job_id: job_id.to_string(),
							delta: delta.to_string(),
						},
					);
				}
			}
		}
	}

	Ok((full, cancelled))
}

async fn stream_gemini(
	client: &reqwest::Client,
	cancel: &CancellationToken,
	app: &AppHandle,
	job_id: &str,
	profile: &AiProfile,
	api_key: &str,
	system: &str,
	messages: &[AiMessage],
	base: Url,
) -> Result<(String, bool), String> {
	if api_key.trim().is_empty() {
		return Err("API key not set for this profile".to_string());
	}

	let mut prompt = String::new();
	if !system.trim().is_empty() {
		prompt.push_str(system.trim());
		prompt.push_str("\n\n");
	}
	for m in messages {
		let role = m.role.trim();
		if role != "user" && role != "assistant" {
			continue;
		}
		prompt.push_str(role);
		prompt.push_str(": ");
		prompt.push_str(m.content.trim());
		prompt.push('\n');
	}

	let url = base
		.join(&format!("v1beta/models/{}:streamGenerateContent", profile.model))
		.map_err(|e| e.to_string())?;
	let url = Url::parse(&format!("{url}?alt=sse&key={}", api_key.trim()))
		.map_err(|_| "invalid gemini request url".to_string())?;
	net::validate_url_host(&url, false)?;

	let body = serde_json::json!({
		"contents": [{
			"parts": [{"text": prompt}]
		}]
	});

	let mut req = client.post(url).json(&body);
	req = apply_extra_headers(req, profile);

	let resp = req.send().await.map_err(|e| e.to_string())?;
	if !resp.status().is_success() {
		let status = resp.status();
		let msg = resp.text().await.unwrap_or_default();
		return Err(format!("http {status}: {msg}"));
	}

	let mut cancelled = false;
	let mut full = String::new();
	let mut buf = String::new();
	let mut stream = resp.bytes_stream();

	loop {
		tokio::select! {
			_ = cancel.cancelled() => {
				cancelled = true;
				break;
			}
			item = stream.next() => {
				let Some(item) = item else { break; };
				let chunk = item.map_err(|e| e.to_string())?;
				buf.push_str(&String::from_utf8_lossy(&chunk));
				while let Some(idx) = buf.find("\n\n") {
					let raw = buf[..idx].to_string();
					buf = buf[idx + 2..].to_string();
					let mut data = String::new();
					for line in raw.lines() {
						let line = line.trim();
						if let Some(rest) = line.strip_prefix("data:") {
							data.push_str(rest.trim_start());
						}
					}
					let data = data.trim();
					if data.is_empty() || data == "[DONE]" {
						continue;
					}
					let v: serde_json::Value = match serde_json::from_str(data) {
						Ok(v) => v,
						Err(_) => continue,
					};
					let text = v
						.pointer("/candidates/0/content/parts/0/text")
						.and_then(|t| t.as_str())
						.unwrap_or("");
					if text.is_empty() {
						continue;
					}
					let delta = if text.starts_with(&full) {
						text[full.len()..].to_string()
					} else {
						text.to_string()
					};
					if delta.is_empty() {
						continue;
					}
					full.push_str(&delta);
					let _ = app.emit(
						"ai:chunk",
						AiChunkEvent {
							job_id: job_id.to_string(),
							delta,
						},
					);
				}
			}
		}
	}

	Ok((full, cancelled))
}

fn audit_log_path(vault_root: &Path, job_id: &str) -> Result<PathBuf, String> {
	let dir = paths::join_under(vault_root, Path::new("cache/ai"))?;
	Ok(dir.join(format!("{job_id}.json")))
}

fn truncate(s: &str, max: usize) -> String {
	if s.len() <= max {
		return s.to_string();
	}
	format!("{}…(truncated)", &s[..max])
}

fn write_audit_log(
	vault_root: &Path,
	job_id: &str,
	profile: &AiProfile,
	request: &AiChatRequest,
	response: &str,
	cancelled: bool,
) {
	let path = match audit_log_path(vault_root, job_id) {
		Ok(p) => p,
		Err(_) => return,
	};

	let response_truncated = truncate(response, 80_000);
	let context_truncated = request.context.as_deref().map(|s| truncate(s, 30_000));
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
		"request": {
			"profile_id": request.profile_id,
			"messages": request.messages,
			"context_manifest": request.context_manifest,
			"context": context_truncated,
		},
		"response": response_truncated,
		"cancelled": cancelled,
		"outcome": null
	});
	let bytes = serde_json::to_vec_pretty(&payload).unwrap_or_default();
	let _ = io_atomic::write_atomic(&path, &bytes);
}

#[tauri::command]
pub async fn ai_profiles_list(app: AppHandle) -> Result<Vec<AiProfile>, String> {
	let path = store_path(&app)?;
	let mut store = read_store(&path);
	ensure_default_profiles(&mut store);
	migrate_legacy_secrets(&mut store);
	let _ = write_store(&path, &store);
	Ok(store.profiles)
}

#[tauri::command]
pub async fn ai_active_profile_get(app: AppHandle) -> Result<Option<String>, String> {
	let path = store_path(&app)?;
	let mut store = read_store(&path);
	ensure_default_profiles(&mut store);
	migrate_legacy_secrets(&mut store);
	let _ = write_store(&path, &store);
	Ok(store.active_profile_id.or_else(|| store.profiles.first().map(|p| p.id.clone())))
}

#[tauri::command]
pub async fn ai_active_profile_set(app: AppHandle, id: Option<String>) -> Result<(), String> {
	let path = store_path(&app)?;
	let mut store = read_store(&path);
	ensure_default_profiles(&mut store);
	store.active_profile_id = id;
	write_store(&path, &store)
}

#[tauri::command]
pub async fn ai_profile_upsert(app: AppHandle, profile: AiProfile) -> Result<AiProfile, String> {
	let path = store_path(&app)?;
	let mut store = read_store(&path);
	ensure_default_profiles(&mut store);

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

	// Validate base url if present.
	let _ = parse_base_url(&next)?;

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
	let _ = keychain_clear(&id);
	if store.active_profile_id.as_deref() == Some(&id) {
		store.active_profile_id = store.profiles.first().map(|p| p.id.clone());
	}
	write_store(&path, &store)
}

#[tauri::command]
pub async fn ai_secret_set(profile_id: String, api_key: String) -> Result<(), String> {
	if api_key.trim().is_empty() {
		return Err("empty secret".to_string());
	}
	keychain_set(&profile_id, api_key.trim())
}

#[tauri::command]
pub async fn ai_secret_clear(profile_id: String) -> Result<(), String> {
	keychain_clear(&profile_id)
}

#[tauri::command]
pub async fn ai_secret_status(profile_id: String) -> Result<bool, String> {
	Ok(keychain_get(&profile_id)?.is_some())
}

#[tauri::command]
pub async fn ai_audit_mark(
	vault_state: State<'_, VaultState>,
	job_id: String,
	outcome: String,
) -> Result<(), String> {
	let root = vault_state.current_root()?;
	let path = audit_log_path(&root, &job_id)?;
	let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
	let mut v: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
	if let Some(obj) = v.as_object_mut() {
		obj.insert("outcome".to_string(), serde_json::Value::String(outcome));
	}
	let out = serde_json::to_vec_pretty(&v).map_err(|e| e.to_string())?;
	io_atomic::write_atomic(&path, &out).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_chat_start(
	ai_state: State<'_, AiState>,
	vault_state: State<'_, VaultState>,
	app: AppHandle,
	mut request: AiChatRequest,
) -> Result<AiChatStartResult, String> {
	let job_id = uuid::Uuid::new_v4().to_string();
	let cancel = ai_state.register(&job_id);

	if !request.audit {
		request.audit = true;
	}

	let store_path = store_path(&app)?;
	let mut store = read_store(&store_path);
	ensure_default_profiles(&mut store);
	migrate_legacy_secrets(&mut store);
	let _ = write_store(&store_path, &store);

	let profile = store
		.profiles
		.iter()
		.find(|p| p.id == request.profile_id)
		.cloned()
		.ok_or_else(|| "unknown profile".to_string())?;

	let vault_root = vault_state.current_root().ok();
	let app_for_task = app.clone();
	let job_id_for_task = job_id.clone();

	tauri::async_runtime::spawn(async move {
		let ai_state_for_task = app_for_task.state::<AiState>();
		let client = match http_client().await {
			Ok(c) => c,
			Err(e) => {
				let _ = app_for_task.emit(
					"ai:error",
					AiErrorEvent {
						job_id: job_id_for_task.clone(),
						message: e,
					},
				);
				ai_state_for_task.finish(&job_id_for_task);
				return;
			}
		};

		let api_key = keychain_get(&profile.id).ok().flatten();
		let (system, messages) =
			split_system_and_messages(request.messages.clone(), request.context.clone());

		let result: Result<(String, bool), String> = (|| async {
			match profile.provider {
				AiProviderKind::Openai
				| AiProviderKind::OpenaiCompat
				| AiProviderKind::Openrouter
				| AiProviderKind::Ollama => {
					if matches!(profile.provider, AiProviderKind::Openai)
						&& api_key.as_deref().unwrap_or("").trim().is_empty()
					{
						return Err("API key not set for this profile".to_string());
					}
					if matches!(profile.provider, AiProviderKind::Openrouter)
						&& api_key.as_deref().unwrap_or("").trim().is_empty()
					{
						return Err("API key not set for this profile".to_string());
					}

					let base = parse_base_url(&profile)?;
					let url = base
						.join("chat/completions")
						.map_err(|e| e.to_string())?;

					let mut openai_messages = messages.clone();
					if !system.is_empty() {
						openai_messages.insert(
							0,
							AiMessage {
								role: "system".to_string(),
								content: system.clone(),
							},
						);
					}

					let body = serde_json::json!({
						"model": profile.model,
						"messages": openai_messages.into_iter().map(|m| serde_json::json!({"role": m.role, "content": m.content})).collect::<Vec<_>>(),
						"temperature": 0.2,
						"stream": true
					});

					stream_openai_like(
						&client,
						&cancel,
						&app_for_task,
						&job_id_for_task,
						&profile,
						api_key.as_deref(),
						body,
						url,
					)
					.await
				}
				AiProviderKind::Anthropic => {
					let base = parse_base_url(&profile)?;
					let url = base.join("v1/messages").map_err(|e| e.to_string())?;
					let key = api_key.unwrap_or_default();
					stream_anthropic(
						&client,
						&cancel,
						&app_for_task,
						&job_id_for_task,
						&profile,
						&key,
						&system,
						&messages,
						url,
					)
					.await
				}
				AiProviderKind::Gemini => {
					let base = parse_base_url(&profile)?;
					let key = api_key.unwrap_or_default();
					stream_gemini(
						&client,
						&cancel,
						&app_for_task,
						&job_id_for_task,
						&profile,
						&key,
						&system,
						&messages,
						base,
					)
					.await
				}
			}
		})()
		.await;

		match result {
			Ok((full, cancelled)) => {
				let _ = app_for_task.emit(
					"ai:done",
					AiDoneEvent {
						job_id: job_id_for_task.clone(),
						cancelled,
					},
				);
				if let Some(root) = vault_root {
					write_audit_log(&root, &job_id_for_task, &profile, &request, &full, cancelled);
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
