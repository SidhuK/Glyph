use serde::{Deserialize, Serialize};
use tauri::{Manager, ResourceId, Runtime, Webview};
use tauri_plugin_updater::UpdaterExt;
use url::Url;

const STABLE_UPDATE_ENDPOINT: &str =
    "https://raw.githubusercontent.com/SidhuK/Glyph/update-manifests/stable/latest.json";
const ALPHA_UPDATE_ENDPOINT: &str =
    "https://raw.githubusercontent.com/SidhuK/Glyph/update-manifests/alpha/latest.json";

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReleaseChannel {
    Stable,
    Alpha,
}

impl ReleaseChannel {
    fn endpoint(&self) -> &'static str {
        match self {
            Self::Stable => STABLE_UPDATE_ENDPOINT,
            Self::Alpha => ALPHA_UPDATE_ENDPOINT,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseChannelUpdate {
    rid: ResourceId,
    current_version: String,
    version: String,
    date: Option<String>,
    body: Option<String>,
    raw_json: serde_json::Value,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn updater_check_release_channel<R: Runtime>(
    webview: Webview<R>,
    channel: ReleaseChannel,
) -> Result<Option<ReleaseChannelUpdate>, String> {
    let endpoint = Url::parse(channel.endpoint()).map_err(|error| error.to_string())?;
    let updater = webview
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|error| error.to_string())?
        .build()
        .map_err(|error| error.to_string())?;

    let Some(update) = updater.check().await.map_err(|error| error.to_string())? else {
        return Ok(None);
    };

    let date = update.date.as_ref().and_then(|date| {
        date.format(&time::format_description::well_known::Rfc3339)
            .ok()
    });
    let payload = ReleaseChannelUpdate {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        date,
        body: update.body.clone(),
        raw_json: update.raw_json.clone(),
        rid: webview.resources_table().add(update),
    };

    Ok(Some(payload))
}
