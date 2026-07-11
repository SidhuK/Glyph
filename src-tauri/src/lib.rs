mod ai_amp;
mod ai_claude_code;
mod ai_codex;
mod ai_opencode;
mod ai_pi;
mod ai_rig;
mod app_exit;
mod databases;
mod external_markdown;
mod file_tree_appearance;
mod git_sync;
mod glyph_paths;
mod index;
mod io_atomic;
mod license;
#[cfg(target_os = "macos")]
mod macos_webkit_defaults;
mod menu_manifest;
mod net;
mod notes;
mod paths;
mod pinned_files;
mod print;
mod release_channels;
mod space;
mod space_fs;
mod system_fonts;
mod tag_appearance;
pub(crate) mod utils;
mod window_geometry;

use serde::Serialize;
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};
use tauri::menu::{
    Menu, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu, SubmenuBuilder, HELP_SUBMENU_ID,
    WINDOW_SUBMENU_ID,
};
use tauri::{Emitter, Manager, RunEvent, State, Theme, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tracing::{error, warn};

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, clear_vibrancy, NSVisualEffectMaterial};

use tauri::{TitleBarStyle, WebviewUrl, WebviewWindowBuilder};

static RECENT_SPACES_MENU_REVISION: AtomicU64 = AtomicU64::new(0);
static QUICK_NOTE_WINDOW_LOCK: Mutex<()> = Mutex::new(());
static MAIN_WINDOW_LOCK: Mutex<()> = Mutex::new(());
const QUICK_NOTE_WINDOW_LABEL: &str = "quick-note";
const SPACE_MENU_ID: &str = "space.menu";
const RECENT_SPACES_MENU_ID: &str = "space.recent.menu";

fn init_tracing() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,tauri=info,glyph_lib=info"));

    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .try_init();
}

fn space_is_open(state: &space::SpaceState) -> bool {
    !state.session_roots().is_empty()
}

fn set_menu_item_enabled<R: tauri::Runtime>(
    item: &MenuItemKind<R>,
    id: &str,
    enabled: bool,
) -> tauri::Result<bool> {
    if item.id().as_ref() == id {
        if let Some(menu_item) = item.as_menuitem() {
            menu_item.set_enabled(enabled)?;
            return Ok(true);
        }
        return Ok(false);
    }

    if let Some(submenu) = item.as_submenu() {
        for child in submenu.items()? {
            if set_menu_item_enabled(&child, id, enabled)? {
                return Ok(true);
            }
        }
    }

    Ok(false)
}

pub(crate) fn set_space_close_menu_enabled<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    enabled: bool,
) -> Result<(), String> {
    let Some(menu) = app.menu() else {
        return Ok(());
    };

    for item in menu.items().map_err(|error| error.to_string())? {
        if set_menu_item_enabled(&item, "space.close", enabled)
            .map_err(|error| error.to_string())?
        {
            break;
        }
    }

    Ok(())
}

#[derive(Serialize)]
struct AppInfo {
    name: String,
    version: String,
    identifier: String,
}

#[derive(Clone, Serialize)]
struct AppCommandPayload {
    command_id: String,
}

#[derive(Default)]
struct MenuState {
    recent_spaces: Mutex<Vec<String>>,
    show_markdown_menu: Mutex<bool>,
    menu_shortcuts: Mutex<HashMap<String, Option<String>>>,
    menu_labels: Mutex<HashMap<String, String>>,
}

#[derive(Default)]
struct QuickNoteShortcutState {
    current_accelerator: Mutex<Option<String>>,
}

fn default_menu_label(id: &str) -> String {
    match id {
        "app.about" => "About Glyph".to_string(),
        "app.settings" => "Settings…".to_string(),
        "menu.file" => "File".to_string(),
        "menu.edit" => "Edit".to_string(),
        "menu.markdown" => "Markdown".to_string(),
        "editor.text_color.menu" => "Text Color".to_string(),
        "editor.text_highlight.menu" => "Text Highlight".to_string(),
        "menu.ai" => "AI".to_string(),
        "menu.space" => "Space".to_string(),
        "space.recent.menu" => "Recent Spaces".to_string(),
        "space.recent.empty" => "No Recent Spaces".to_string(),
        "menu.window" => "Window".to_string(),
        "menu.help" => "Help".to_string(),
        _ => menu_manifest::command_for_menu_id(id)
            .map(|command| command.label)
            .unwrap_or_else(|| id.to_string()),
    }
}

fn menu_label(menu_labels: &HashMap<String, String>, id: &str) -> String {
    menu_labels
        .get(id)
        .cloned()
        .unwrap_or_else(|| default_menu_label(id))
}

fn menu_item_with_shortcut<R: tauri::Runtime, M: Manager<R>>(
    app: &M,
    menu_labels: &HashMap<String, String>,
    menu_shortcuts: &HashMap<String, Option<String>>,
    id: &str,
    enabled: bool,
    default_accelerator: Option<&str>,
) -> tauri::Result<MenuItem<R>> {
    let manifest_command = menu_manifest::command_for_menu_id(id);
    let manifest_accelerator = manifest_command
        .as_ref()
        .and_then(|command| command.default_binding.as_ref())
        .map(menu_manifest::accelerator_for_shortcut);
    let accelerator = match menu_shortcuts.get(id) {
        Some(override_val) => override_val.clone(),
        None => manifest_accelerator.or_else(|| default_accelerator.map(str::to_string)),
    };
    let label = menu_label(menu_labels, id);
    MenuItem::with_id(app, id, label, enabled, accelerator.as_deref())
}

#[derive(Clone, Serialize)]
struct OpenRecentSpacePayload {
    path: String,
}

fn format_recent_space_label(path: &str) -> String {
    let normalized = path.replace('\\', "/").trim_end_matches('/').to_string();
    let name = normalized
        .rsplit('/')
        .next()
        .filter(|segment| !segment.is_empty())
        .unwrap_or(path);
    if name == path {
        name.to_string()
    } else {
        format!("{name} — {path}")
    }
}

fn next_recent_spaces_menu_revision() -> u64 {
    RECENT_SPACES_MENU_REVISION.fetch_add(1, Ordering::Relaxed) + 1
}

fn recent_space_item_id(revision: u64, index: usize) -> String {
    format!("space.recent.{revision}.{index}")
}

fn recent_space_none_item_id(revision: u64) -> String {
    format!("space.recent.{revision}.none")
}

fn parse_recent_space_index(id: &str) -> Option<usize> {
    let suffix = id.strip_prefix("space.recent.")?;
    if let Ok(index) = suffix.parse::<usize>() {
        return Some(index);
    }
    suffix
        .rsplit_once('.')
        .and_then(|(_, index)| index.parse::<usize>().ok())
}

#[cfg(test)]
mod tests {
    use super::parse_recent_space_index;

    #[test]
    fn parse_recent_space_index_supports_legacy_ids() {
        assert_eq!(parse_recent_space_index("space.recent.3"), Some(3));
    }

    #[test]
    fn parse_recent_space_index_supports_revisioned_ids() {
        assert_eq!(parse_recent_space_index("space.recent.42.3"), Some(3));
    }

    #[test]
    fn parse_recent_space_index_ignores_non_space_items() {
        assert_eq!(parse_recent_space_index("space.recent.42.none"), None);
        assert_eq!(parse_recent_space_index("space.recent.menu"), None);
        assert_eq!(parse_recent_space_index("space.open"), None);
    }
}

fn build_recent_spaces_submenu<R: tauri::Runtime, M: Manager<R>>(
    app: &M,
    recent_spaces: &[String],
    menu_labels: &HashMap<String, String>,
) -> tauri::Result<Submenu<R>> {
    let revision = next_recent_spaces_menu_revision();
    let mut builder = SubmenuBuilder::with_id(
        app,
        RECENT_SPACES_MENU_ID,
        menu_label(menu_labels, "space.recent.menu"),
    );
    if recent_spaces.is_empty() {
        let none = MenuItem::with_id(
            app,
            recent_space_none_item_id(revision),
            menu_label(menu_labels, "space.recent.empty"),
            false,
            None::<&str>,
        )?;
        builder = builder.item(&none);
        return builder.build();
    }

    for (index, path) in recent_spaces.iter().enumerate() {
        builder = builder.text(
            recent_space_item_id(revision, index),
            format_recent_space_label(path),
        );
    }
    builder.build()
}

fn find_submenu_by_id<R: tauri::Runtime>(item: &MenuItemKind<R>, id: &str) -> Option<Submenu<R>> {
    if item.id().as_ref() == id {
        return item.as_submenu().cloned();
    }

    let submenu = item.as_submenu()?;
    for child in submenu.items().ok()? {
        if let Some(found) = find_submenu_by_id(&child, id) {
            return Some(found);
        }
    }
    None
}

fn try_update_recent_spaces_submenu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    recent_spaces: &[String],
    menu_labels: &HashMap<String, String>,
) -> Result<bool, String> {
    let Some(menu) = app.menu() else {
        return Ok(false);
    };

    let mut target: Option<Submenu<R>> = None;
    for item in menu.items().map_err(|error| error.to_string())? {
        if let Some(found) = find_submenu_by_id(&item, RECENT_SPACES_MENU_ID) {
            target = Some(found);
            break;
        }
    }

    let Some(submenu) = target else {
        return Ok(false);
    };
    let revision = next_recent_spaces_menu_revision();

    submenu
        .set_text(menu_label(menu_labels, "space.recent.menu"))
        .map_err(|error| error.to_string())?;

    while submenu
        .remove_at(0)
        .map_err(|error| error.to_string())?
        .is_some()
    {}

    if recent_spaces.is_empty() {
        let none = MenuItem::with_id(
            app,
            recent_space_none_item_id(revision),
            menu_label(menu_labels, "space.recent.empty"),
            false,
            None::<&str>,
        )
        .map_err(|error| error.to_string())?;
        submenu.append(&none).map_err(|error| error.to_string())?;
        return Ok(true);
    }

    for (index, path) in recent_spaces.iter().enumerate() {
        let item = MenuItem::with_id(
            app,
            recent_space_item_id(revision, index),
            format_recent_space_label(path),
            true,
            None::<&str>,
        )
        .map_err(|error| error.to_string())?;
        submenu.append(&item).map_err(|error| error.to_string())?;
    }

    Ok(true)
}

fn build_main_menu<R: tauri::Runtime, M: Manager<R>>(
    app: &M,
    show_markdown_menu: bool,
    space_open: bool,
    recent_spaces: &[String],
    menu_shortcuts: &HashMap<String, Option<String>>,
    menu_labels: &HashMap<String, String>,
) -> tauri::Result<Menu<R>> {
    #[cfg(target_os = "macos")]
    let app_about = MenuItem::with_id(
        app,
        "app.about",
        menu_label(menu_labels, "app.about"),
        true,
        None::<&str>,
    )?;
    #[cfg(target_os = "macos")]
    let app_settings = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "app.settings",
        true,
        Some("CmdOrCtrl+,"),
    )?;

    #[cfg(target_os = "macos")]
    let app_menu = Submenu::with_items(
        app,
        app.package_info().name.clone(),
        true,
        &[
            &app_about,
            &app_settings,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let open_space = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "space.open",
        true,
        Some("CmdOrCtrl+O"),
    )?;
    let create_space = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "space.create",
        true,
        Some("CmdOrCtrl+Shift+N"),
    )?;
    let close_space = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "space.close",
        space_open,
        None,
    )?;
    let reveal_space = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "space.reveal",
        true,
        None,
    )?;
    let open_space_settings = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "space.settings",
        true,
        None,
    )?;
    let sync_now = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "space.git_sync_now",
        true,
        None,
    )?;
    let open_git_settings = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "space.git_settings",
        true,
        None,
    )?;
    let new_note = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "file.new_note",
        true,
        Some("CmdOrCtrl+N"),
    )?;
    let create_from_template = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "file.create_from_template",
        true,
        Some("CmdOrCtrl+Shift+M"),
    )?;
    let open_daily_note = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "file.open_daily_note",
        true,
        Some("CmdOrCtrl+Shift+D"),
    )?;
    let save_note = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "file.save_note",
        true,
        Some("CmdOrCtrl+S"),
    )?;
    let print_note = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "file.print_note",
        show_markdown_menu,
        None,
    )?;
    let close_tab = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "file.close_tab",
        true,
        Some("CmdOrCtrl+W"),
    )?;
    let toggle_ai = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "ai.toggle",
        true,
        Some("CmdOrCtrl+Shift+A"),
    )?;
    let editor_bold =
        menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.bold", true, None)?;
    let editor_italic =
        menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.italic", true, None)?;
    let editor_underline = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.underline",
        true,
        None,
    )?;
    let editor_strikethrough = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.strikethrough",
        true,
        None,
    )?;
    let editor_link_set = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.link_set",
        true,
        None,
    )?;
    let editor_link_clear = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.link_clear",
        true,
        None,
    )?;
    let editor_heading_1 = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.heading_1",
        true,
        None,
    )?;
    let editor_heading_2 = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.heading_2",
        true,
        None,
    )?;
    let editor_heading_3 = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.heading_3",
        true,
        None,
    )?;
    let editor_collapse_all_headings = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.collapse_all_headings",
        true,
        None,
    )?;
    let editor_expand_all_headings = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.expand_all_headings",
        true,
        None,
    )?;
    let editor_bullet_list = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.bullet_list",
        true,
        None,
    )?;
    let editor_numbered_list = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.numbered_list",
        true,
        None,
    )?;
    let editor_todo_list = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.todo_list",
        true,
        None,
    )?;
    let editor_quote =
        menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.quote", true, None)?;
    let editor_code_block = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.code_block",
        true,
        None,
    )?;
    let editor_mermaid_chart = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.mermaid_chart",
        true,
        None,
    )?;
    let editor_table =
        menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.table", true, None)?;
    let editor_divider =
        menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.divider", true, None)?;
    let editor_details_block = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.details_block",
        true,
        None,
    )?;
    let editor_callout_info = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.callout_info",
        true,
        None,
    )?;
    let editor_callout_warning = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.callout_warning",
        true,
        None,
    )?;
    let editor_callout_error = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.callout_error",
        true,
        None,
    )?;
    let editor_callout_success = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.callout_success",
        true,
        None,
    )?;
    let editor_callout_tip = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.callout_tip",
        true,
        None,
    )?;
    let editor_color_gray =
        menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.color_gray", true, None)?;
    let editor_color_brown = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.color_brown",
        true,
        None,
    )?;
    let editor_color_orange = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.color_orange",
        true,
        None,
    )?;
    let editor_color_yellow = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.color_yellow",
        true,
        None,
    )?;
    let editor_color_green = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.color_green",
        true,
        None,
    )?;
    let editor_color_blue =
        menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.color_blue", true, None)?;
    let editor_color_purple = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.color_purple",
        true,
        None,
    )?;
    let editor_color_red =
        menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.color_red", true, None)?;
    let editor_color_clear = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.color_clear",
        true,
        None,
    )?;
    let editor_highlight_yellow = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.highlight_yellow",
        true,
        None,
    )?;
    let editor_highlight_blue = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.highlight_blue",
        true,
        None,
    )?;
    let editor_highlight_green = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.highlight_green",
        true,
        None,
    )?;
    let editor_highlight_red = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.highlight_red",
        true,
        None,
    )?;
    let editor_highlight_clear = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "editor.highlight_clear",
        true,
        None,
    )?;
    let attach_current_note = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "ai.attach_current_note",
        true,
        Some("CmdOrCtrl+Alt+A"),
    )?;
    let attach_all_open_notes = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "ai.attach_all_open_notes",
        true,
        Some("CmdOrCtrl+Alt+Shift+A"),
    )?;
    let open_ai_settings = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "ai.settings",
        true,
        None,
    )?;
    let recent_spaces_menu = build_recent_spaces_submenu(app, recent_spaces, menu_labels)?;

    let file_menu = Submenu::with_items(
        app,
        menu_label(menu_labels, "menu.file"),
        true,
        &[
            &new_note,
            &create_from_template,
            &open_daily_note,
            &PredefinedMenuItem::separator(app)?,
            &save_note,
            &print_note,
            &PredefinedMenuItem::separator(app)?,
            &close_tab,
        ],
    )?;

    let ai_menu = Submenu::with_items(
        app,
        menu_label(menu_labels, "menu.ai"),
        true,
        &[
            &toggle_ai,
            &PredefinedMenuItem::separator(app)?,
            &attach_current_note,
            &attach_all_open_notes,
            &PredefinedMenuItem::separator(app)?,
            &open_ai_settings,
        ],
    )?;
    let markdown_text_color_menu = Submenu::with_items(
        app,
        menu_label(menu_labels, "editor.text_color.menu"),
        true,
        &[
            &editor_color_gray,
            &editor_color_brown,
            &editor_color_orange,
            &editor_color_yellow,
            &editor_color_green,
            &editor_color_blue,
            &editor_color_purple,
            &editor_color_red,
            &PredefinedMenuItem::separator(app)?,
            &editor_color_clear,
        ],
    )?;
    let markdown_text_highlight_menu = Submenu::with_items(
        app,
        menu_label(menu_labels, "editor.text_highlight.menu"),
        true,
        &[
            &editor_highlight_yellow,
            &editor_highlight_blue,
            &editor_highlight_green,
            &editor_highlight_red,
            &PredefinedMenuItem::separator(app)?,
            &editor_highlight_clear,
        ],
    )?;
    let markdown_menu = Submenu::with_items(
        app,
        menu_label(menu_labels, "menu.markdown"),
        true,
        &[
            &editor_bold,
            &editor_italic,
            &editor_underline,
            &editor_strikethrough,
            &PredefinedMenuItem::separator(app)?,
            &editor_link_set,
            &editor_link_clear,
            &PredefinedMenuItem::separator(app)?,
            &editor_heading_1,
            &editor_heading_2,
            &editor_heading_3,
            &editor_collapse_all_headings,
            &editor_expand_all_headings,
            &PredefinedMenuItem::separator(app)?,
            &editor_bullet_list,
            &editor_numbered_list,
            &editor_todo_list,
            &PredefinedMenuItem::separator(app)?,
            &editor_quote,
            &editor_code_block,
            &editor_mermaid_chart,
            &editor_table,
            &editor_divider,
            &editor_details_block,
            &PredefinedMenuItem::separator(app)?,
            &editor_callout_info,
            &editor_callout_warning,
            &editor_callout_error,
            &editor_callout_success,
            &editor_callout_tip,
            &PredefinedMenuItem::separator(app)?,
            &markdown_text_color_menu,
            &markdown_text_highlight_menu,
        ],
    )?;

    let space_menu = Submenu::with_id_and_items(
        app,
        SPACE_MENU_ID,
        menu_label(menu_labels, "menu.space"),
        true,
        &[
            &create_space,
            &open_space,
            &recent_spaces_menu,
            &PredefinedMenuItem::separator(app)?,
            &close_space,
            &reveal_space,
            &PredefinedMenuItem::separator(app)?,
            &open_space_settings,
            &sync_now,
            &open_git_settings,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        menu_label(menu_labels, "menu.edit"),
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let window_menu = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        menu_label(menu_labels, "menu.window"),
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let help_getting_started = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "help.getting_started",
        space_open,
        None,
    )?;
    let help_welcome_note = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "help.welcome_note",
        space_open,
        None,
    )?;
    let help_shortcuts = menu_item_with_shortcut(app, menu_labels, menu_shortcuts, "help.shortcuts",
        true,
        None,
    )?;
    const HELP_LINK_GROUPS: &[&[&str]] = &[
        &[
            "help.website",
            "help.changelog",
            "help.privacy",
            "help.terms",
        ],
        &["help.discord", "help.github", "help.x"],
    ];
    let help_menu = {
        let builder = SubmenuBuilder::with_id(
            app,
            HELP_SUBMENU_ID,
            menu_label(menu_labels, "menu.help"),
        );
        #[cfg(not(target_os = "macos"))]
        let builder = builder
            .item(&PredefinedMenuItem::about(app, None, None)?)
            .separator();
        let builder = builder
            .item(&help_getting_started)
            .item(&help_welcome_note)
            .separator()
            .item(&help_shortcuts)
            .separator();
        let mut builder = builder;
        for (group_index, group) in HELP_LINK_GROUPS.iter().enumerate() {
            if group_index > 0 {
                builder = builder.separator();
            }
            for id in *group {
                let item =
                    menu_item_with_shortcut(app, menu_labels, menu_shortcuts, id, true, None)?;
                builder = builder.item(&item);
            }
        }
        builder.build()?
    };

    if show_markdown_menu {
        Menu::with_items(
            app,
            &[
                #[cfg(target_os = "macos")]
                &app_menu,
                &file_menu,
                &edit_menu,
                &markdown_menu,
                &ai_menu,
                &space_menu,
                &window_menu,
                &help_menu,
            ],
        )
    } else {
        Menu::with_items(
            app,
            &[
                #[cfg(target_os = "macos")]
                &app_menu,
                &file_menu,
                &edit_menu,
                &ai_menu,
                &space_menu,
                &window_menu,
                &help_menu,
            ],
        )
    }
}

#[tauri::command]
fn app_info(app: tauri::AppHandle) -> AppInfo {
    let package = app.package_info();
    let config = app.config();
    AppInfo {
        name: package.name.clone(),
        version: package.version.to_string(),
        identifier: config.identifier.clone(),
    }
}

#[tauri::command]
fn system_fonts_list() -> Result<Vec<String>, String> {
    system_fonts::list_system_font_families()
}

#[tauri::command]
fn system_monospace_fonts_list() -> Result<Vec<String>, String> {
    system_fonts::list_monospace_font_families()
}

fn quick_note_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    let _guard = QUICK_NOTE_WINDOW_LOCK
        .lock()
        .map_err(|_| "failed to lock quick note window state".to_string())?;

    if let Some(window) = app.get_webview_window(QUICK_NOTE_WINDOW_LABEL) {
        return Ok(window);
    }

    let window = WebviewWindowBuilder::new(
        app,
        QUICK_NOTE_WINDOW_LABEL,
        WebviewUrl::App(format!("index.html?window={QUICK_NOTE_WINDOW_LABEL}").into()),
    )
    .title("Quick Note")
    .inner_size(680.0, 440.0)
    .resizable(true)
    .decorations(true)
    .title_bar_style(TitleBarStyle::Overlay)
    .hidden_title(true)
    .transparent(true)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .shadow(true)
    .visible(false)
    .center()
    .build()
    .map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    apply_main_window_vibrancy(&window, None)?;

    Ok(window)
}

fn is_space_host_window_label(label: &str) -> bool {
    label == "main" || space::commands::is_space_window(label)
}

fn is_auxiliary_persisted_window(label: &str) -> bool {
    label == "settings" || label == QUICK_NOTE_WINDOW_LABEL || label == "quick-task"
}

fn destroy_auxiliary_persisted_windows(app: &tauri::AppHandle) {
    for (label, window) in app.webview_windows() {
        if is_auxiliary_persisted_window(&label) {
            let _ = window.destroy();
        }
    }
}

fn prepare_host_window_close(window: &tauri::Window) {
    if !is_space_host_window_label(window.label()) {
        return;
    }
    let app = window.app_handle();
    let host_count = app
        .webview_windows()
        .into_iter()
        .filter(|(label, _)| is_space_host_window_label(label))
        .count();
    if host_count <= 1 {
        destroy_auxiliary_persisted_windows(&app);
    }
}

fn focused_space_host_window(app: &tauri::AppHandle) -> Option<(String, tauri::WebviewWindow)> {
    app.webview_windows().into_iter().find(|(label, window)| {
        is_space_host_window_label(label) && window.is_focused().unwrap_or(false)
    })
}

fn target_space_host_window(app: &tauri::AppHandle) -> Option<(String, tauri::WebviewWindow)> {
    focused_space_host_window(app).or_else(|| {
        let space_state = app.try_state::<space::SpaceState>()?;
        let current_root = space_state.current_root().ok()?;
        app.webview_windows().into_iter().find(|(label, _window)| {
            is_space_host_window_label(label)
                && space_state
                    .root_for_window_label(label)
                    .map(|root| root == current_root)
                    .unwrap_or(false)
        })
    })
}

fn sync_fallback_space_to_focused_window(app: &tauri::AppHandle) {
    let Some(space_state) = app.try_state::<space::SpaceState>() else {
        return;
    };
    let focused_root = focused_space_host_window(app)
        .and_then(|(_label, window)| space_state.root_for_window(&window).ok());
    let Some(root) = focused_root else {
        return;
    };
    let _ = space_state.set_current_root(root);
}

fn show_quick_note_window_for_app(app: &tauri::AppHandle) -> Result<(), String> {
    sync_fallback_space_to_focused_window(app);
    let window = quick_note_window(app)?;
    let _ = window.center();
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

fn main_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    let _guard = MAIN_WINDOW_LOCK
        .lock()
        .map_err(|_| "failed to lock main window state".to_string())?;

    if let Some(window) = app.get_webview_window(window_geometry::MAIN_WINDOW_LABEL) {
        return Ok(window);
    }

    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == window_geometry::MAIN_WINDOW_LABEL)
        .ok_or_else(|| "main window configuration not found".to_string())?;
    let window = WebviewWindowBuilder::from_config(app, config)
        .map_err(|error| error.to_string())?
        .build()
        .map_err(|error| error.to_string())?;

    window_geometry::install_host_window_persistence(&window);

    #[cfg(target_os = "macos")]
    if let Err(error) = apply_main_window_vibrancy(&window, None) {
        warn!("Failed to apply vibrancy to main window: {error}");
    }

    Ok(window)
}

fn show_main_window_for_app(app: &tauri::AppHandle) -> Result<(), String> {
    let window = main_window(app)?;
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
fn show_quick_note_window(app: tauri::AppHandle) -> Result<(), String> {
    show_quick_note_window_for_app(&app)
}

#[tauri::command]
fn hide_quick_note_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(QUICK_NOTE_WINDOW_LABEL) {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    show_main_window_for_app(&app)
}

fn open_external_markdown_from_finder(app: &tauri::AppHandle, path: std::path::PathBuf) {
    let state = app.state::<external_markdown::ExternalMarkdownState>();
    if let Err(error) = external_markdown::open_external_markdown_window(app, &state, path, None)
    {
        warn!("Failed to open external markdown file: {error}");
    }
}

fn has_external_markdown_windows(app: &tauri::AppHandle) -> bool {
    app.webview_windows()
        .keys()
        .any(|label| external_markdown::is_external_markdown_window(label))
}

fn handle_opened_urls(app: &tauri::AppHandle, urls: Vec<url::Url>) -> bool {
    for url in urls {
        if url.scheme() != "file" {
            continue;
        }
        match url.to_file_path() {
            Ok(path) => open_external_markdown_from_finder(app, path),
            Err(()) => warn!("Failed to convert opened URL to file path: {url}"),
        }
    }
    has_external_markdown_windows(app)
}

fn should_exit_after_external_markdown_close(app: &tauri::AppHandle) -> bool {
    !app.webview_windows().keys().any(|label| {
        external_markdown::is_external_markdown_window(label) || is_space_host_window_label(label)
    })
}

#[tauri::command(rename_all = "snake_case")]
fn set_quick_note_global_shortcut(
    app: tauri::AppHandle,
    state: State<'_, QuickNoteShortcutState>,
    accelerator: Option<String>,
) -> Result<(), String> {
    let next = accelerator
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let mut current = state
        .current_accelerator
        .lock()
        .map_err(|_| "failed to lock quick note shortcut state".to_string())?;

    if current.as_ref() == next.as_ref() {
        return Ok(());
    }

    if let Some(next_accelerator) = next {
        app.global_shortcut()
            .on_shortcut(next_accelerator.as_str(), |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    if let Err(error) = show_quick_note_window_for_app(app) {
                        warn!("Failed to show quick note window: {error}");
                    }
                }
            })
            .map_err(|error| error.to_string())?;

        if let Some(previous) = current.take() {
            if let Err(error) = app.global_shortcut().unregister(previous.as_str()) {
                warn!("Failed to unregister previous quick note shortcut: {error}");
            }
        }
        *current = Some(next_accelerator);
        return Ok(());
    }

    if let Some(previous) = current.take() {
        if let Err(error) = app.global_shortcut().unregister(previous.as_str()) {
            warn!("Failed to unregister previous quick note shortcut: {error}");
        }
    }

    Ok(())
}

#[tauri::command]
fn set_markdown_menu_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    let menu_state = app
        .try_state::<MenuState>()
        .ok_or_else(|| "menu state unavailable".to_string())?;
    let recent_spaces = menu_state
        .recent_spaces
        .lock()
        .map_err(|_| "failed to lock recent spaces state".to_string())?
        .clone();
    *menu_state
        .show_markdown_menu
        .lock()
        .map_err(|_| "failed to lock markdown menu state".to_string())? = visible;
    let menu_shortcuts = menu_state
        .menu_shortcuts
        .lock()
        .map_err(|_| "failed to lock menu shortcuts state".to_string())?
        .clone();
    let menu_labels = menu_state
        .menu_labels
        .lock()
        .map_err(|_| "failed to lock menu labels state".to_string())?
        .clone();
    let space_open = app
        .try_state::<space::SpaceState>()
        .map(|state| space_is_open(&state))
        .unwrap_or(false);
    let menu = build_main_menu(
        &app,
        visible,
        space_open,
        &recent_spaces,
        &menu_shortcuts,
        &menu_labels,
    )
    .map_err(|error| error.to_string())?;
    app.set_menu(menu).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
fn set_recent_spaces_menu(
    app: tauri::AppHandle,
    menu_state: State<'_, MenuState>,
    recent_spaces: Vec<String>,
) -> Result<(), String> {
    let current_space_path = app.try_state::<space::SpaceState>().and_then(|state| {
        state.current.lock().ok().and_then(|guard| {
            guard
                .as_ref()
                .map(|path| path.to_string_lossy().to_string())
        })
    });
    let filtered: Vec<String> = recent_spaces
        .into_iter()
        .map(|path| path.trim().to_string())
        .filter(|path| !path.is_empty())
        .filter(|path| current_space_path.as_deref() != Some(path.as_str()))
        .take(20)
        .collect();

    *menu_state
        .recent_spaces
        .lock()
        .map_err(|_| "failed to lock recent spaces state".to_string())? = filtered.clone();

    let menu_labels = menu_state
        .menu_labels
        .lock()
        .map_err(|_| "failed to lock menu labels state".to_string())?
        .clone();

    match try_update_recent_spaces_submenu(&app, &filtered, &menu_labels) {
        Ok(true) => return Ok(()),
        Ok(false) => {}
        Err(error) => {
            warn!("Failed in-place recent spaces menu update, rebuilding menu instead: {error}");
        }
    }

    let show_markdown_menu = *menu_state
        .show_markdown_menu
        .lock()
        .map_err(|_| "failed to lock markdown menu state".to_string())?;
    let menu_shortcuts = menu_state
        .menu_shortcuts
        .lock()
        .map_err(|_| "failed to lock menu shortcuts state".to_string())?
        .clone();
    let space_open = app
        .try_state::<space::SpaceState>()
        .map(|state| space_is_open(&state))
        .unwrap_or(false);
    let menu = build_main_menu(
        &app,
        show_markdown_menu,
        space_open,
        &filtered,
        &menu_shortcuts,
        &menu_labels,
    )
    .map_err(|error| error.to_string())?;
    app.set_menu(menu).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
fn set_menu_shortcuts(
    app: tauri::AppHandle,
    menu_state: State<'_, MenuState>,
    accelerators: HashMap<String, Option<String>>,
) -> Result<(), String> {
    let recent_spaces = menu_state
        .recent_spaces
        .lock()
        .map_err(|_| "failed to lock recent spaces state".to_string())?
        .clone();
    let show_markdown_menu = *menu_state
        .show_markdown_menu
        .lock()
        .map_err(|_| "failed to lock markdown menu state".to_string())?;
    let menu_labels = menu_state
        .menu_labels
        .lock()
        .map_err(|_| "failed to lock menu labels state".to_string())?
        .clone();
    let space_open = app
        .try_state::<space::SpaceState>()
        .map(|state| space_is_open(&state))
        .unwrap_or(false);
    let menu = build_main_menu(
        &app,
        show_markdown_menu,
        space_open,
        &recent_spaces,
        &accelerators,
        &menu_labels,
    )
    .map_err(|error| {
        error!("failed to build menu with shortcut accelerators: {error}");
        error.to_string()
    })?;
    app.set_menu(menu).map_err(|error| {
        error!("failed to install menu with shortcut accelerators: {error}");
        error.to_string()
    })?;
    *menu_state
        .menu_shortcuts
        .lock()
        .map_err(|_| "failed to lock menu shortcuts state".to_string())? = accelerators;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
fn set_menu_labels(
    app: tauri::AppHandle,
    menu_state: State<'_, MenuState>,
    labels: HashMap<String, String>,
) -> Result<(), String> {
    let recent_spaces = menu_state
        .recent_spaces
        .lock()
        .map_err(|_| "failed to lock recent spaces state".to_string())?
        .clone();
    let show_markdown_menu = *menu_state
        .show_markdown_menu
        .lock()
        .map_err(|_| "failed to lock markdown menu state".to_string())?;
    let menu_shortcuts = menu_state
        .menu_shortcuts
        .lock()
        .map_err(|_| "failed to lock menu shortcuts state".to_string())?
        .clone();
    let space_open = app
        .try_state::<space::SpaceState>()
        .map(|state| space_is_open(&state))
        .unwrap_or(false);
    let menu = build_main_menu(
        &app,
        show_markdown_menu,
        space_open,
        &recent_spaces,
        &menu_shortcuts,
        &labels,
    )
    .map_err(|error| {
        error!("failed to build menu with labels: {error}");
        error.to_string()
    })?;
    app.set_menu(menu).map_err(|error| {
        error!("failed to install menu with labels: {error}");
        error.to_string()
    })?;
    *menu_state
        .menu_labels
        .lock()
        .map_err(|_| "failed to lock menu labels state".to_string())? = labels;
    Ok(())
}

#[cfg(target_os = "macos")]
pub(crate) fn apply_main_window_vibrancy(
    window: &tauri::WebviewWindow,
    theme: Option<&str>,
) -> Result<(), String> {
    let material = match theme {
        Some("dark") => NSVisualEffectMaterial::HudWindow,
        _ => NSVisualEffectMaterial::Sidebar,
    };
    clear_main_window_vibrancy(window)?;
    apply_vibrancy(window, material, None, Some(6.0)).map_err(|error| error.to_string())
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn apply_main_window_vibrancy(
    _window: &tauri::WebviewWindow,
    _theme: Option<&str>,
) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn clear_main_window_vibrancy(window: &tauri::WebviewWindow) -> Result<(), String> {
    clear_vibrancy(window)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(not(target_os = "macos"))]
fn clear_main_window_vibrancy(_window: &tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
fn set_window_vibrancy_theme(window: tauri::WebviewWindow, theme: String) -> Result<(), String> {
    let normalized = theme.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "dark" => {
            window
                .set_theme(Some(Theme::Dark))
                .map_err(|error| error.to_string())?;
            apply_main_window_vibrancy(&window, Some("dark"))
        }
        "light" => {
            window
                .set_theme(Some(Theme::Light))
                .map_err(|error| error.to_string())?;
            apply_main_window_vibrancy(&window, Some("light"))
        }
        "system-dark" => {
            window.set_theme(None).map_err(|error| error.to_string())?;
            apply_main_window_vibrancy(&window, Some("dark"))
        }
        "system-light" => {
            window.set_theme(None).map_err(|error| error.to_string())?;
            apply_main_window_vibrancy(&window, Some("light"))
        }
        "none" | "" => {
            window.set_theme(None).map_err(|error| error.to_string())?;
            clear_main_window_vibrancy(&window)
        }
        _ => Err(format!("unknown vibrancy theme: {normalized}")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_tracing();

    #[cfg(target_os = "macos")]
    macos_webkit_defaults::configure_continuous_spell_checking();

    tauri::Builder::default()
        .menu(|app| build_main_menu(app, false, false, &[], &HashMap::new(), &HashMap::new()))
        .on_menu_event(|app, event| match event.id().as_ref() {
            id if id.starts_with("space.recent.") => {
                let Some(index) = parse_recent_space_index(id) else {
                    return;
                };
                let Some(menu_state) = app.try_state::<MenuState>() else {
                    return;
                };
                let Ok(recent_spaces) = menu_state.recent_spaces.lock() else {
                    return;
                };
                let Some(path) = recent_spaces.get(index).cloned() else {
                    return;
                };
                let Some(space_state) = app.try_state::<space::SpaceState>() else {
                    return;
                };
                let current_path = app
                    .webview_windows()
                    .into_iter()
                    .find(|(label, window)| {
                        is_space_host_window_label(label) && window.is_focused().unwrap_or(false)
                    })
                    .and_then(|(label, _window)| {
                        space_state
                            .root_for_window_label(&label)
                            .ok()
                            .map(|path| path.to_string_lossy().to_string())
                    });
                if current_path.as_deref() == Some(path.as_str()) {
                    return;
                }
                if let Some((label, _window)) = target_space_host_window(app) {
                    let _ = app.emit_to(
                        label,
                        "menu:open_recent_space",
                        OpenRecentSpacePayload { path },
                    );
                }
            }
            "file.print_note" => {
                if let Some((label, _window)) = target_space_host_window(app) {
                    let _ = app.emit_to(
                        label,
                        "menu:app_command",
                        AppCommandPayload {
                            command_id: "print-note".to_string(),
                        },
                    );
                }
            }
            id => {
                let Some(command) = menu_manifest::command_for_menu_id(id) else {
                    return;
                };
                if let Some((label, _window)) = target_space_host_window(app) {
                    let _ = app.emit_to(
                        label,
                        "menu:app_command",
                        AppCommandPayload {
                            command_id: command.id,
                        },
                    );
                }
            }
        })
        .setup(|app| {
            if let Err(error) = index::paths::init_index_root(app.handle()) {
                error!("Failed to initialize app-support index root: {error}");
                return Err(std::io::Error::other(error).into());
            }
            ai_rig::commands::refresh_provider_support_on_startup(app.handle().clone());

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "settings" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }

            if window.label() == QUICK_NOTE_WINDOW_LABEL {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }

            if external_markdown::is_external_markdown_window(window.label()) {
                match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = window.emit("external-markdown:close_requested", ());
                    }
                    WindowEvent::Destroyed => {
                        let state = window.state::<external_markdown::ExternalMarkdownState>();
                        if let Err(error) = external_markdown::forget_external_markdown_window(
                            &state,
                            window.label(),
                        ) {
                            warn!("Failed to forget external markdown window: {error}");
                        }
                        if should_exit_after_external_markdown_close(window.app_handle()) {
                            destroy_auxiliary_persisted_windows(window.app_handle());
                            window.app_handle().exit(0);
                        }
                    }
                    _ => {}
                }
            }

            if space::commands::is_space_window(window.label()) {
                if let WindowEvent::Destroyed = event {
                    let state = window.state::<space::SpaceState>();
                    match state.remove_window_session(window.label()) {
                        Ok(()) => {
                            space::commands::update_close_space_menu(window.app_handle(), &state)
                        }
                        Err(error) => warn!("Failed to forget space window session: {error}"),
                    }
                }
            }

            if is_space_host_window_label(window.label()) {
                if let WindowEvent::CloseRequested { .. } = event {
                    prepare_host_window_close(window);
                }
            }
        })
        .manage(ai_rig::AiState::default())
        .manage(ai_codex::state::CodexState::default())
        .manage(git_sync::GitSyncState::default())
        .manage(space::SpaceState::default())
        .manage(app_exit::AppExitState::default())
        .manage(external_markdown::ExternalMarkdownState::default())
        .manage(MenuState::default())
        .manage(QuickNoteShortcutState::default())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            app_info,
            release_channels::updater_check_release_channel,
            system_fonts_list,
            system_monospace_fonts_list,
            show_quick_note_window,
            hide_quick_note_window,
            show_main_window,
            set_quick_note_global_shortcut,
            set_markdown_menu_visible,
            set_recent_spaces_menu,
            set_menu_shortcuts,
            set_menu_labels,
            set_window_vibrancy_theme,
            external_markdown::open_external_markdown_path,
            external_markdown::external_markdown_window_path,
            external_markdown::external_markdown_window_rel_path,
            external_markdown::external_markdown_read,
            external_markdown::external_markdown_write,
            external_markdown::external_markdown_finish_close,
            print::print_write_html,
            license::commands::license_bootstrap_status,
            license::commands::license_activate,
            license::commands::license_clear_local,
            ai_rig::commands::ai_profiles_list,
            ai_rig::commands::ai_active_profile_get,
            ai_rig::commands::ai_active_profile_set,
            ai_rig::commands::ai_profile_upsert,
            ai_rig::commands::ai_profile_delete,
            ai_rig::commands::ai_secret_set,
            ai_rig::commands::ai_secret_clear,
            ai_rig::commands::ai_secret_status,
            ai_rig::commands::ai_secret_list,
            ai_rig::commands::ai_provider_support,
            ai_rig::commands::ai_chat_start,
            ai_rig::commands::ai_chat_cancel,
            ai_rig::commands::ai_chat_history_list,
            ai_rig::commands::ai_chat_history_get,
            ai_codex::commands::codex_account_read,
            ai_codex::commands::codex_login_start,
            ai_codex::commands::codex_login_complete,
            ai_codex::commands::codex_logout,
            ai_codex::commands::codex_rate_limits_read,
            ai_rig::context::ai_context_index,
            ai_rig::context::ai_context_build,
            ai_rig::context::ai_context_resolve_paths,
            ai_rig::models::ai_models_list,
            databases::commands::databases_list,
            databases::commands::databases_get,
            databases::commands::databases_create,
            databases::commands::databases_update,
            databases::commands::databases_delete,
            databases::commands::databases_query_rows,
            databases::commands::databases_update_cell,
            databases::commands::databases_create_row,
            databases::commands::databases_preview_context,
            databases::commands::databases_status_colors_get,
            databases::commands::databases_status_color_set,
            file_tree_appearance::commands::file_tree_appearance_list,
            file_tree_appearance::commands::file_tree_appearance_set,
            file_tree_appearance::commands::file_tree_appearance_rename_path,
            file_tree_appearance::commands::file_tree_appearance_delete_path,
            tag_appearance::commands::tag_appearance_list,
            tag_appearance::commands::tag_appearance_set,
            pinned_files::commands::pinned_files_list,
            pinned_files::commands::pinned_files_toggle,
            pinned_files::commands::pinned_files_rename_path,
            pinned_files::commands::pinned_files_delete_path,
            index::commands::index_rebuild,
            index::commands::index_sync,
            index::commands::search,
            index::commands::search_advanced,
            index::commands::search_parse_and_run,
            index::commands::index_set_people_mentions_as_tags_enabled,
            index::commands::all_docs_list,
            index::commands::all_docs_count,
            index::calendar::index_calendar_activity,
            index::calendar::index_calendar_notes_for_date,
            index::commands::tags_list,
            index::commands::people_list,
            index::commands::task_summary,
            index::commands::task_summaries_for_paths,
            index::commands::backlinks,
            index::commands::note_relationships,
            index::commands::note_local_connections,
            index::commands::space_connections,
            space_fs::list::space_list_dir,
            space_fs::list::space_list_markdown_files,
            space_fs::list::space_list_non_markdown_files,
            space_fs::link_ops::space_resolve_wikilink,
            space_fs::link_ops::space_resolve_image_wikilink,
            space_fs::link_ops::space_resolve_markdown_link,
            space_fs::link_ops::space_suggest_links,
            space_fs::summary::space_dir_children_summary,
            space_fs::read_write::text::space_read_text,
            space_fs::read_write::text::space_read_texts_batch,
            space_fs::read_write::preview::space_read_text_preview,
            space_fs::read_write::preview::space_read_binary_preview,
            space_fs::read_write::binary::space_save_pasted_image,
            space_fs::read_write::text::space_write_text,
            space_fs::read_write::text::space_open_or_create_text,
            space_fs::read_write::paths::space_create_dir,
            space_fs::read_write::paths::space_duplicate_path,
            space_fs::read_write::paths::space_rename_path,
            space_fs::read_write::paths::space_delete_path,
            space_fs::read_write::paths::space_resolve_abs_path,
            space_fs::read_write::paths::space_reveal_path,
            space_fs::read_write::paths::space_relativize_path,
            notes::properties::note_frontmatter_parse_properties,
            notes::properties::note_frontmatter_render_properties,
            git_sync::commands::git_sync_status_read,
            git_sync::commands::git_sync_config_read,
            git_sync::commands::git_sync_config_update,
            git_sync::commands::git_sync_run,
            git_sync::commands::git_sync_disconnect,
            git_sync::commands::git_history_list,
            git_sync::commands::git_history_diff,
            space::commands::space_create,
            space::commands::space_open,
            space::commands::space_open_window,
            space::commands::space_get_current,
            space::commands::space_get_current_info,
            space::commands::space_show_onboarding_note,
            space::commands::space_close,
            app_exit::app_confirm_exit,
            app_exit::app_register_exit_listener,
            app_exit::app_report_exit_listener_failure
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run({
            let mut initial_launch_pending = true;
            let mut initial_launch_received_file_open = false;
            move |app_handle, event| match event {
                RunEvent::ExitRequested { api, .. } => {
                    if !app_exit::handle_exit_requested(app_handle, &api) {
                        window_geometry::flush_host_window_geometry(app_handle);
                    }
                }
                RunEvent::Exit => {
                    window_geometry::flush_host_window_geometry(app_handle);
                }
                RunEvent::Opened { urls } => {
                    let received_file_open = handle_opened_urls(app_handle, urls);
                    if initial_launch_pending {
                        initial_launch_received_file_open |= received_file_open;
                    }
                }
                RunEvent::MainEventsCleared if initial_launch_pending => {
                    initial_launch_pending = false;
                    if !initial_launch_received_file_open {
                        if let Err(error) = show_main_window_for_app(app_handle) {
                            warn!("Failed to show main window: {error}");
                        }
                    }
                }
                #[cfg(target_os = "macos")]
                RunEvent::Reopen { .. } if !initial_launch_pending => {
                    if let Err(error) = show_main_window_for_app(app_handle) {
                        warn!("Failed to show main window: {error}");
                    }
                }
                _ => {}
            }
        });
}
