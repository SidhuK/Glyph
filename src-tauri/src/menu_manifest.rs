use std::collections::HashMap;

use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct AppCommandManifest {
    pub commands: HashMap<String, ManifestCommand>,
}

#[derive(Debug, Deserialize)]
pub struct ManifestCommand {
    pub id: String,
    pub label: String,
    #[serde(rename = "menuId")]
    pub menu_id: Option<String>,
    #[serde(rename = "defaultBinding")]
    pub default_binding: Option<ManifestShortcut>,
}

#[derive(Debug, Deserialize)]
pub struct ManifestShortcut {
    pub meta: Option<bool>,
    pub ctrl: Option<bool>,
    pub alt: Option<bool>,
    pub shift: Option<bool>,
    pub key: String,
}

pub fn manifest() -> AppCommandManifest {
    serde_json::from_str(include_str!("../../src/shared/appCommandManifest.json"))
        .expect("app command manifest must be valid")
}

pub fn command_for_menu_id(menu_id: &str) -> Option<ManifestCommand> {
    manifest()
        .commands
        .into_values()
        .find(|command| command.menu_id.as_deref() == Some(menu_id))
}

pub fn accelerator_for_shortcut(shortcut: &ManifestShortcut) -> String {
    let mut parts = Vec::new();
    if shortcut.meta.unwrap_or(false) {
        parts.push("CmdOrCtrl");
    }
    if shortcut.ctrl.unwrap_or(false) {
        parts.push("Ctrl");
    }
    if shortcut.alt.unwrap_or(false) {
        parts.push("Alt");
    }
    if shortcut.shift.unwrap_or(false) {
        parts.push("Shift");
    }
    parts.push(shortcut.key.as_str());
    parts.join("+")
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::{accelerator_for_shortcut, manifest};

    #[test]
    fn menu_ids_are_unique() {
        let manifest = manifest();
        let menu_ids = manifest
            .commands
            .values()
            .filter_map(|command| command.menu_id.as_deref())
            .collect::<Vec<_>>();
        let unique = menu_ids.iter().copied().collect::<HashSet<_>>();
        assert_eq!(unique.len(), menu_ids.len());
    }

    #[test]
    fn shortcut_accelerators_use_tauri_format() {
        let manifest = manifest();
        let command = manifest
            .commands
            .get("create-from-template")
            .expect("command should exist");
        let shortcut = command
            .default_binding
            .as_ref()
            .expect("shortcut should exist");

        assert_eq!(accelerator_for_shortcut(shortcut), "CmdOrCtrl+Shift+m");
    }
}
