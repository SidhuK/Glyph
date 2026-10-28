use tauri::{AppHandle, Manager, State, WebviewWindow};

use crate::space::state::SpaceState;

use super::service;
use super::types::{
    GitCommitDiff, GitHistoryCommit, GitSyncCommitMessagePromptRequest, GitSyncConfig,
    GitSyncConfigPatch, GitSyncRunRequest, GitSyncStatus,
};
use super::GitSyncState;

#[tauri::command]
pub async fn git_sync_status_read(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<GitSyncStatus, String> {
    let label = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        service::read_status(app.state::<GitSyncState>(), app.state::<SpaceState>(), &label)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn git_sync_config_read(
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
) -> Result<Option<GitSyncConfig>, String> {
    service::read_config(&space_state, window.label())
}

#[tauri::command]
pub async fn git_sync_config_update(
    app: AppHandle,
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
    patch: GitSyncConfigPatch,
) -> Result<GitSyncConfig, String> {
    let space_root = space_state.root_for_window(&window)?;
    let label = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let git_state = app.state::<GitSyncState>();
        service::update_git_sync_config(app.clone(), &git_state, space_root, &label, patch)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn git_sync_run(
    app: AppHandle,
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
    request: GitSyncRunRequest,
) -> Result<GitSyncStatus, String> {
    let space_root = space_state.root_for_window(&window)?;
    let label = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let git_state = app.state::<GitSyncState>();
        service::run_git_sync(app.clone(), &git_state, space_root, &label, request)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn git_sync_commit_message_prompt(
    app: AppHandle,
    request: GitSyncCommitMessagePromptRequest,
) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);
        app.run_on_main_thread(move || {
            let result = super::native::prompt_commit_message(request);
            let _ = sender.send(result);
        })
        .map_err(|error| format!("failed to open commit message prompt: {error}"))?;

        return tauri::async_runtime::spawn_blocking(move || {
            receiver
                .recv()
                .map_err(|error| format!("commit message prompt failed: {error}"))?
        })
        .await
        .map_err(|error| format!("commit message prompt failed: {error}"))?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, request);
        Err("commit message prompts are only available on macOS".to_string())
    }
}

#[tauri::command]
pub async fn git_history_list(
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
    path: String,
    limit: Option<u32>,
) -> Result<Vec<GitHistoryCommit>, String> {
    let space_root = space_state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let rel_path = validate_space_rel_path(&space_root, &path)?;
        ensure_repo_at_space_root(&space_root)?;
        let raw = super::git::file_history(&space_root, &rel_path, limit.unwrap_or(30))?;
        Ok(parse_history_commits(&raw))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn git_history_diff(
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
    path: String,
    commit: GitHistoryCommit,
) -> Result<GitCommitDiff, String> {
    let space_root = space_state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let rel_path = validate_space_rel_path(&space_root, &path)?;
        ensure_repo_at_space_root(&space_root)?;
        validate_commit_hash(&commit.hash)?;
        let diff_path = if commit.rel_path.is_empty() {
            rel_path
        } else {
            validate_space_rel_path(&space_root, &commit.rel_path)?
        };
        let diff = super::git::commit_file_diff(&space_root, &commit.hash, &diff_path)?;
        Ok(GitCommitDiff { commit, diff })
    })
    .await
    .map_err(|error| error.to_string())?
}

fn ensure_repo_at_space_root(space_root: &std::path::Path) -> Result<(), String> {
    match super::git::inspect_repo(space_root)? {
        super::git::RepoInspection::AtRoot { .. } => Ok(()),
        super::git::RepoInspection::Nested { .. } => Err(
            "git history is only available when the repository is rooted at the opened space"
                .to_string(),
        ),
        super::git::RepoInspection::None => {
            Err("git history is only available in a Git repository".to_string())
        }
    }
}

fn validate_space_rel_path(space_root: &std::path::Path, path: &str) -> Result<String, String> {
    crate::paths::join_under(space_root, std::path::Path::new(path))?;
    let rel_path = path.replace('\\', "/");
    if rel_path.to_lowercase().ends_with(".md") {
        Ok(rel_path)
    } else {
        Err("git history is only available for markdown notes".to_string())
    }
}

fn validate_commit_hash(commit: &str) -> Result<(), String> {
    let valid_len = (7..=64).contains(&commit.len());
    let valid_chars = commit.chars().all(|ch| ch.is_ascii_hexdigit());
    if valid_len && valid_chars {
        Ok(())
    } else {
        Err("invalid commit hash".to_string())
    }
}

fn parse_history_commits(raw: &str) -> Vec<GitHistoryCommit> {
    let mut commits = Vec::new();
    // `git log -z` NUL-terminates headers and numstat paths and never quotes paths.
    let mut fields = raw.split('\0').map(|field| field.trim_start_matches('\n'));

    while let Some(field) = fields.next() {
        if let Some(commit_line) = field.strip_prefix('\u{1e}') {
            commits.extend(parse_history_commit_line(commit_line));
            continue;
        }

        let Some(commit) = commits.last_mut() else {
            continue;
        };
        let Some((added, deleted, rel_path)) = parse_numstat_field(field) else {
            continue;
        };
        // A rename leaves the path empty and follows with the old and new paths.
        let rel_path = if rel_path.is_empty() {
            fields.next();
            fields.next().unwrap_or_default()
        } else {
            rel_path
        };
        if commit.rel_path.is_empty() {
            commit.rel_path = rel_path.to_string();
        }
        let modified = added.min(deleted);
        commit.modified_count = commit.modified_count.saturating_add(modified);
        commit.added_count = commit
            .added_count
            .saturating_add(added.saturating_sub(modified));
        commit.deleted_count = commit
            .deleted_count
            .saturating_add(deleted.saturating_sub(modified));
    }

    commits
}

fn parse_history_commit_line(line: &str) -> Option<GitHistoryCommit> {
    let mut parts = line.splitn(6, '\u{1f}');
    let hash = parts.next()?.to_string();
    let short_hash = parts.next()?.to_string();
    let author_name = parts.next()?.to_string();
    let author_email = parts.next()?.to_string();
    let timestamp_ms = parts
        .next()
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0)
        * 1000;
    let subject = parts.next().unwrap_or_default().to_string();
    Some(GitHistoryCommit {
        hash,
        short_hash,
        rel_path: String::new(),
        author_name,
        author_email,
        timestamp_ms,
        subject,
        added_count: 0,
        modified_count: 0,
        deleted_count: 0,
    })
}

fn parse_numstat_field(field: &str) -> Option<(u32, u32, &str)> {
    let mut parts = field.splitn(3, '\t');
    let added = parts.next()?.parse::<u32>().ok()?;
    let deleted = parts.next()?.parse::<u32>().ok()?;
    let rel_path = parts.next()?;
    Some((added, deleted, rel_path))
}
