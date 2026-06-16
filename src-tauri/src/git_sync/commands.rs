use tauri::{AppHandle, State, WebviewWindow};

use crate::space::state::SpaceState;

use super::service;
use super::types::{
    GitCommitDiff, GitHistoryCommit, GitSyncConfig, GitSyncConfigPatch, GitSyncRunRequest,
    GitSyncStatus,
};
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

#[tauri::command]
pub fn git_history_list(
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
    path: String,
    limit: Option<u32>,
) -> Result<Vec<GitHistoryCommit>, String> {
    let space_root = space_state.root_for_window(&window)?;
    let rel_path = validate_space_rel_path(&space_root, &path)?;
    ensure_repo_at_space_root(&space_root)?;
    let raw = super::git::file_history(&space_root, &rel_path, limit.unwrap_or(30))?;
    Ok(parse_history_commits(&raw))
}

#[tauri::command]
pub fn git_history_diff(
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
    path: String,
    commit: String,
) -> Result<GitCommitDiff, String> {
    let space_root = space_state.root_for_window(&window)?;
    let rel_path = validate_space_rel_path(&space_root, &path)?;
    ensure_repo_at_space_root(&space_root)?;
    validate_commit_hash(&commit)?;
    let commit = parse_history_commits(&super::git::file_history(&space_root, &rel_path, 100)?)
        .into_iter()
        .find(|item| item.hash == commit || item.short_hash == commit)
        .ok_or_else(|| "commit was not found for this file".to_string())?;
    let diff_path = if commit.rel_path.is_empty() {
        rel_path.as_str()
    } else {
        commit.rel_path.as_str()
    };
    let diff = super::git::commit_file_diff(&space_root, &commit.hash, diff_path)?;
    Ok(GitCommitDiff { commit, diff })
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
    let mut current: Option<GitHistoryCommit> = None;

    for line in raw.lines() {
        if let Some(commit_line) = line.strip_prefix('\u{1e}') {
            if let Some(commit) = current.take() {
                commits.push(commit);
            }
            current = parse_history_commit_line(commit_line);
            continue;
        }

        let Some(commit) = current.as_mut() else {
            continue;
        };
        let Some((added, deleted, rel_path)) = parse_numstat_line(line) else {
            continue;
        };
        if commit.rel_path.is_empty() {
            commit.rel_path = normalize_numstat_path(&rel_path);
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

    if let Some(commit) = current {
        commits.push(commit);
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

fn parse_numstat_line(line: &str) -> Option<(u32, u32, String)> {
    let mut parts = line.split('\t');
    let added = parts.next()?.parse::<u32>().ok()?;
    let deleted = parts.next()?.parse::<u32>().ok()?;
    let rel_path = parts.next()?.to_string();
    Some((added, deleted, rel_path))
}

fn normalize_numstat_path(path: &str) -> String {
    let Some((prefix, renamed_to)) = path.rsplit_once(" => ") else {
        return path.to_string();
    };
    let Some((base, _)) = prefix.rsplit_once('{') else {
        return renamed_to.to_string();
    };
    let Some((name, suffix)) = renamed_to.split_once('}') else {
        return renamed_to.to_string();
    };
    format!("{base}{name}{suffix}")
}
