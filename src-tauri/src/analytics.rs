use std::{
    collections::BTreeSet,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Deserialize;
use serde_json::{Map, Value};
use tauri::{AppHandle, State};
use tracing::warn;

const DEFAULT_POSTHOG_HOST: &str = "https://us.i.posthog.com";
const MAX_DISTINCT_ID_LEN: usize = 64;
const MAX_PROPS_LEN: usize = 32;
const MAX_STRING_VALUE_LEN: usize = 80;

#[derive(Clone)]
pub struct AnalyticsState {
    api_key: Option<String>,
    host: String,
    client: reqwest::Client,
}

impl AnalyticsState {
    pub fn from_env() -> Self {
        let api_key = std::env::var("POSTHOG_API_KEY")
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty());

        let host = std::env::var("POSTHOG_HOST")
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| DEFAULT_POSTHOG_HOST.to_string());

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(3))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            api_key,
            host,
            client,
        }
    }

    async fn track(
        &self,
        event: &str,
        distinct_id: &str,
        properties: Map<String, Value>,
    ) -> Result<(), String> {
        let Some(api_key) = self.api_key.as_ref() else {
            return Ok(());
        };

        let mut props = properties;
        props.insert(
            "distinct_id".to_string(),
            Value::String(distinct_id.to_string()),
        );

        let body = serde_json::json!({
            "api_key": api_key,
            "event": event,
            "properties": props,
        });

        let host = self.host.trim_end_matches('/');
        let url = format!("{host}/capture/");
        self.client
            .post(url)
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnalyticsEventName {
    AppStarted,
    SpaceOpened,
    IndexRebuildStarted,
    SearchExecuted,
    NoteCreated,
    AiChatStarted,
    SettingsChanged,
}

impl AnalyticsEventName {
    fn as_str(self) -> &'static str {
        match self {
            Self::AppStarted => "app_started",
            Self::SpaceOpened => "space_opened",
            Self::IndexRebuildStarted => "index_rebuild_started",
            Self::SearchExecuted => "search_executed",
            Self::NoteCreated => "note_created",
            Self::AiChatStarted => "ai_chat_started",
            Self::SettingsChanged => "settings_changed",
        }
    }

    fn allowed_properties(self) -> BTreeSet<&'static str> {
        match self {
            Self::AppStarted => BTreeSet::from(["has_previous_space"]),
            Self::SpaceOpened => BTreeSet::from(["source", "space_schema_version"]),
            Self::IndexRebuildStarted => BTreeSet::new(),
            Self::SearchExecuted => BTreeSet::from(["query_length_bucket", "result_count_bucket"]),
            Self::NoteCreated => BTreeSet::from(["entrypoint"]),
            Self::AiChatStarted => BTreeSet::from(["provider", "mode", "has_context"]),
            Self::SettingsChanged => BTreeSet::from(["setting_key", "new_value"]),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct AnalyticsTrackRequest {
    pub event: AnalyticsEventName,
    pub distinct_id: String,
    #[serde(default)]
    pub properties: Map<String, Value>,
}

pub fn load_env_files() {
    let _ = dotenvy::from_filename(".env");
    let _ = dotenvy::from_filename("src-tauri/.env");
}

fn validate_distinct_id(distinct_id: &str) -> bool {
    let trimmed = distinct_id.trim();
    !trimmed.is_empty() && trimmed.len() <= MAX_DISTINCT_ID_LEN
}

fn sanitize_properties(
    event: AnalyticsEventName,
    mut properties: Map<String, Value>,
    app: &AppHandle,
) -> Option<Map<String, Value>> {
    if properties.len() > MAX_PROPS_LEN {
        return None;
    }

    let allowed = event.allowed_properties();
    if properties.keys().any(|k| !allowed.contains(k.as_str())) {
        return None;
    }

    for value in properties.values_mut() {
        if let Value::String(s) = value {
            if s.len() > MAX_STRING_VALUE_LEN {
                s.truncate(MAX_STRING_VALUE_LEN);
            }
        }
    }

    let package = app.package_info();
    properties.insert(
        "app_version".to_string(),
        Value::String(package.version.to_string()),
    );
    properties.insert(
        "platform".to_string(),
        Value::String(std::env::consts::OS.to_string()),
    );
    properties.insert(
        "app_channel".to_string(),
        Value::String(if cfg!(debug_assertions) {
            "dev".to_string()
        } else {
            "release".to_string()
        }),
    );
    properties.insert("schema_version".to_string(), Value::Number(1.into()));
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default();
    properties.insert("ts_ms".to_string(), Value::Number(now_ms.into()));

    Some(properties)
}

#[tauri::command]
pub async fn analytics_track(
    app: AppHandle,
    state: State<'_, AnalyticsState>,
    request: AnalyticsTrackRequest,
) -> Result<(), String> {
    if !validate_distinct_id(&request.distinct_id) {
        return Ok(());
    }

    let Some(properties) = sanitize_properties(request.event, request.properties, &app) else {
        return Ok(());
    };

    let analytics = state.inner().clone();
    let event_name = request.event.as_str().to_string();
    let distinct_id = request.distinct_id.trim().to_string();

    // Fire-and-forget to avoid adding latency to user actions.
    tauri::async_runtime::spawn(async move {
        if let Err(err) = analytics.track(&event_name, &distinct_id, properties).await {
            warn!(event = event_name, "posthog track failed: {err}");
        }
    });

    Ok(())
}
