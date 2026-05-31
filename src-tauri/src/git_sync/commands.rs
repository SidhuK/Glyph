use tauri::{AppHandle, State, WebviewWindow};

use crate::space::state::SpaceState;

use super::service;
use super::types::{GitSyncConfig, GitSyncConfigPatch, GitSyncRunRequest, GitSyncStatus};
use super::GitSyncState;

#[tauri::command]
pub fn git_sync_status_read(
    window: WebviewWindow,
    git_state: State<'_, GitSyncState>,
    space_state: State<'_, SpaceState>,
) -> Result<GitSyncStatus, String> {
    service::read_status(git_state, space_state, window.label())
}

#[tauri::command]
pub fn git_sync_config_read(
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
) -> Result<Option<GitSyncConfig>, String> {
    service::read_config(&space_state, window.label())
}

#[tauri::command]
pub fn git_sync_config_update(
    app: AppHandle,
    window: WebviewWindow,
    git_state: State<'_, GitSyncState>,
    space_state: State<'_, SpaceState>,
    patch: GitSyncConfigPatch,
) -> Result<GitSyncConfig, String> {
    service::update_git_sync_config(app, &git_state, &space_state, window.label(), patch)
}

#[tauri::command]
pub async fn git_sync_run(
    app: AppHandle,
    window: WebviewWindow,
    git_state: State<'_, GitSyncState>,
    space_state: State<'_, SpaceState>,
    request: GitSyncRunRequest,
) -> Result<GitSyncStatus, String> {
    service::run_git_sync(app, &git_state, &space_state, window.label(), request)
}

#[tauri::command]
pub fn git_sync_disconnect(
    app: AppHandle,
    window: WebviewWindow,
    git_state: State<'_, GitSyncState>,
    space_state: State<'_, SpaceState>,
) -> Result<GitSyncStatus, String> {
    service::disconnect_git_sync(app, &git_state, &space_state, window.label())
}
