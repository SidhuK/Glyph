use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, State};

use crate::space::state::SpaceState;

use super::git::{
    ahead_behind_counts, commit_all, fetch_remote, git_is_installed, has_head_commit,
    has_remote_named, inspect_repo, merge_remote, overlapping_change_risk, primary_remote_url,
    push_remote, remote_branch_exists, stage_for_sync, upsert_managed_gitignore,
    working_tree_change_count, working_tree_dirty, RepoInspection,
};
use super::store::{delete_store, load_store, save_store};
use super::types::{
    DEFAULT_GIT_SYNC_BRANCH, GitSyncConfig, GitSyncConfigPatch, GitSyncPhase, GitSyncRepoMode,
    GitSyncRunMode, GitSyncRunRequest, GitSyncStatus,
};

#[derive(Debug, Clone)]
struct RuntimeStatus {
    phase: GitSyncPhase,
    is_syncing: bool,
    message: Option<String>,
}

impl Default for RuntimeStatus {
    fn default() -> Self {
        Self {
            phase: GitSyncPhase::Idle,
            is_syncing: false,
            message: None,
        }
    }
}

#[derive(Default)]
pub struct GitSyncState {
    runtime: Arc<Mutex<RuntimeStatus>>,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn emit_status(app: &AppHandle, status: &GitSyncStatus) {
    let _ = app.emit("git_sync:status", status.clone());
}

fn set_runtime(
    app: &AppHandle,
    git_state: &GitSyncState,
    space_state: &SpaceState,
    phase: GitSyncPhase,
    is_syncing: bool,
    message: Option<String>,
) -> Result<(), String> {
    {
        let mut runtime = git_state
            .runtime
            .lock()
            .map_err(|_| "git sync state poisoned".to_string())?;
        runtime.phase = phase;
        runtime.is_syncing = is_syncing;
        runtime.message = message;
    }
    let status = read_status_internal(app, git_state, space_state)?;
    emit_status(app, &status);
    Ok(())
}

fn normalize_interval(interval: u32) -> u32 {
    interval.clamp(1, 24 * 60)
}

#[derive(Debug, Clone, Default)]
struct RepoHealth {
    local_change_count: u32,
    ahead_count: u32,
    behind_count: u32,
    preflight_issue: Option<String>,
    conflict_risk: Option<String>,
}

fn inspect_repo_health(space_root: &PathBuf, inspection: &RepoInspection, config: Option<&GitSyncConfig>) -> Result<RepoHealth, String> {
    let mut health = RepoHealth::default();

    let RepoInspection::AtRoot { branch, primary_remote } = inspection else {
        return Ok(health);
    };

    health.local_change_count = working_tree_change_count(space_root)?;

    let Some(config) = config else {
        if primary_remote.is_none() {
            health.preflight_issue = Some("This repo has no remote configured yet.".to_string());
        }
        return Ok(health);
    };

    if !has_head_commit(space_root)? {
        health.preflight_issue = Some("This repo has no commits yet.".to_string());
        return Ok(health);
    }

    match branch.as_deref() {
        None => {
            health.preflight_issue = Some("Git is in a detached HEAD state. Switch back to a branch before syncing.".to_string());
            return Ok(health);
        }
        Some(current) if current != config.branch => {
            health.preflight_issue = Some(format!(
                "Glyph expects branch {}, but the repo is currently on {}.",
                config.branch, current
            ));
            return Ok(health);
        }
        _ => {}
    }

    if !has_remote_named(space_root, "origin")? {
        health.preflight_issue = Some("This repo has no origin remote configured.".to_string());
        return Ok(health);
    }

    let (ahead, behind) = ahead_behind_counts(space_root, "origin", &config.branch)?;
    health.ahead_count = ahead;
    health.behind_count = behind;
    health.conflict_risk = overlapping_change_risk(space_root, "origin", &config.branch)?;

    Ok(health)
}

fn config_to_status(
    config: Option<GitSyncConfig>,
    inspection: RepoInspection,
    git_installed: bool,
    runtime: RuntimeStatus,
    health: RepoHealth,
) -> GitSyncStatus {
    let mut status = GitSyncStatus::default();
    status.git_installed = git_installed;
    status.phase = runtime.phase;
    status.is_syncing = runtime.is_syncing;
    status.message = runtime.message;

    match inspection {
        RepoInspection::None => {
            status.repo_detected = false;
        }
        RepoInspection::AtRoot {
            branch,
            primary_remote,
        } => {
            status.repo_detected = true;
            status.repo_root_matches_space = true;
            status.detected_branch = branch;
            status.detected_remote_url = primary_remote;
        }
        RepoInspection::Nested { .. } => {
            status.repo_detected = true;
            status.unsupported_parent_repo = true;
        }
    }

    if let Some(config) = config {
        status.configured = true;
        status.repo_mode = Some(config.repo_mode);
        status.remote_url = Some(config.remote_url);
        status.branch = Some(config.branch);
        status.enabled = config.enabled;
        status.paused = config.paused;
        status.interval_minutes = config.interval_minutes;
        status.conflict_policy = config.conflict_policy;
        status.inclusions = config.inclusions;
        status.last_success_at_ms = config.last_success_at_ms;
        status.last_attempted_at_ms = config.last_attempted_at_ms;
        status.last_error = config.last_error;
        status.consecutive_auto_sync_failures = config.consecutive_auto_sync_failures;
    }

    status.local_change_count = health.local_change_count;
    status.ahead_count = health.ahead_count;
    status.behind_count = health.behind_count;
    status.preflight_issue = health.preflight_issue;
    status.conflict_risk = health.conflict_risk;

    status
}

fn auto_adopt_if_needed(space_root: &PathBuf, inspection: &RepoInspection) -> Result<Option<GitSyncConfig>, String> {
    let existing = load_store(space_root)?;
    if existing.is_some() {
        return Ok(existing);
    }

    match inspection {
        RepoInspection::AtRoot {
            branch,
            primary_remote,
        } => {
            let Some(remote_url) = primary_remote.clone() else {
                return Ok(None);
            };
            let config = GitSyncConfig::with_remote(
                remote_url,
                branch
                    .clone()
                    .unwrap_or_else(|| DEFAULT_GIT_SYNC_BRANCH.to_string()),
                GitSyncRepoMode::AdoptedExistingRepo,
            );
            save_store(space_root, &config)?;
            Ok(Some(config))
        }
        _ => Ok(None),
    }
}

pub fn read_status_internal(
    app: &AppHandle,
    git_state: &GitSyncState,
    space_state: &SpaceState,
) -> Result<GitSyncStatus, String> {
    let space_root = match space_state.current_root() {
        Ok(root) => root,
        Err(_) => return Ok(GitSyncStatus::default()),
    };
    let git_installed = git_is_installed();
    let inspection = if git_installed {
        inspect_repo(&space_root)?
    } else {
        RepoInspection::None
    };
    let config = if git_installed {
        auto_adopt_if_needed(&space_root, &inspection)?
            .or(load_store(&space_root)?)
    } else {
        None
    };
    let runtime = git_state
        .runtime
        .lock()
        .map_err(|_| "git sync state poisoned".to_string())?
        .clone();
    let health = if git_installed {
        inspect_repo_health(&space_root, &inspection, config.as_ref())?
    } else {
        RepoHealth::default()
    };
    let status = config_to_status(config, inspection, git_installed, runtime, health);
    let _ = app;
    Ok(status)
}

fn load_config(space_root: &PathBuf) -> Result<GitSyncConfig, String> {
    load_store(space_root)?.ok_or_else(|| "Git Sync is not configured for this space.".to_string())
}

pub fn update_git_sync_config(
    app: AppHandle,
    git_state: &GitSyncState,
    space_state: &SpaceState,
    patch: GitSyncConfigPatch,
) -> Result<GitSyncConfig, String> {
    let space_root = space_state.current_root()?;
    let mut config = load_config(&space_root)?;
    if let Some(enabled) = patch.enabled {
        config.enabled = enabled;
    }
    if let Some(policy) = patch.conflict_policy {
        config.conflict_policy = policy;
    }
    if let Some(interval) = patch.interval_minutes {
        config.interval_minutes = normalize_interval(interval);
    }
    if let Some(inclusions) = patch.inclusions {
        config.inclusions = inclusions;
    }
    if let Some(paused) = patch.paused {
        config.paused = paused;
    }
    save_store(&space_root, &config)?;
    let status = read_status_internal(&app, git_state, space_state)?;
    emit_status(&app, &status);
    Ok(config)
}

pub fn disconnect_git_sync(
    app: AppHandle,
    git_state: &GitSyncState,
    space_state: &SpaceState,
) -> Result<GitSyncStatus, String> {
    let space_root = space_state.current_root()?;
    delete_store(&space_root)?;
    {
        let mut runtime = git_state
            .runtime
            .lock()
            .map_err(|_| "git sync state poisoned".to_string())?;
        *runtime = RuntimeStatus::default();
    }
    let status = read_status_internal(&app, git_state, space_state)?;
    emit_status(&app, &status);
    Ok(status)
}

pub fn run_git_sync(
    app: AppHandle,
    git_state: &GitSyncState,
    space_state: &SpaceState,
    request: GitSyncRunRequest,
) -> Result<GitSyncStatus, String> {
    let space_root = space_state.current_root()?;
    if !git_is_installed() {
        return Err("Git is not installed on this system.".to_string());
    }
    let mut config = load_config(&space_root)?;
    if request.mode == GitSyncRunMode::Auto && (!config.enabled || config.paused) {
        return Ok(read_status_internal(&app, git_state, space_state)?);
    }

    {
        let mut runtime = git_state
            .runtime
            .lock()
            .map_err(|_| "git sync state poisoned".to_string())?;
        if runtime.is_syncing {
            return Err("A Git Sync is already in progress.".to_string());
        }
        runtime.is_syncing = true;
        runtime.phase = GitSyncPhase::Fetching;
        runtime.message = Some("Fetching remote changes".to_string());
    }
    let initial = read_status_internal(&app, git_state, space_state)?;
    emit_status(&app, &initial);

    let is_auto = request.mode == GitSyncRunMode::Auto;
    let run_result = (|| -> Result<(), String> {
        let inspection = inspect_repo(&space_root)?;
        match &inspection {
            RepoInspection::Nested { .. } => {
                return Err("The active space is inside a larger Git repository. Glyph only supports repos rooted at the space path.".to_string());
            }
            RepoInspection::AtRoot { .. } => {}
            RepoInspection::None => {
                return Err("No Git repository exists at the active space root.".to_string());
            }
        }

        let health = inspect_repo_health(&space_root, &inspection, Some(&config))?;
        if let Some(issue) = health.preflight_issue {
            return Err(issue);
        }
        if let Some(conflict_risk) = health.conflict_risk {
            return Err(format!(
                "{conflict_risk}. Sync was paused to avoid overwriting changes. Resolve or sync manually in Git first."
            ));
        }

        config.last_attempted_at_ms = Some(now_ms());
        config.last_error = None;
        save_store(&space_root, &config)?;

        upsert_managed_gitignore(&space_root, &config.inclusions, &request.context)?;

        let remote_name = "origin";
        let branch = config.branch.clone();

        set_runtime(
            &app,
            git_state,
            space_state,
            GitSyncPhase::Fetching,
            true,
            Some("Fetching remote changes".to_string()),
        )?;
        fetch_remote(&space_root, remote_name, &branch)?;

        set_runtime(
            &app,
            git_state,
            space_state,
            GitSyncPhase::Committing,
            true,
            Some("Preparing local snapshot".to_string()),
        )?;
        stage_for_sync(&space_root)?;
        if working_tree_dirty(&space_root)? {
            commit_all(&space_root, "Glyph sync")?;
        }

        if remote_branch_exists(&space_root, remote_name, &branch)? {
            set_runtime(
                &app,
                git_state,
                space_state,
                GitSyncPhase::Pulling,
                true,
                Some("Merging remote changes".to_string()),
            )?;
            merge_remote(
                &space_root,
                remote_name,
                &branch,
                matches!(
                    config.conflict_policy,
                    super::types::GitSyncConflictPolicy::LocalWins
                ),
            )?;
        }

        set_runtime(
            &app,
            git_state,
            space_state,
            GitSyncPhase::Pushing,
            true,
            Some("Pushing to remote".to_string()),
        )?;
        let set_upstream = primary_remote_url(&space_root)?.is_none() || !has_head_commit(&space_root)?;
        push_remote(&space_root, remote_name, &branch, set_upstream)?;
        Ok(())
    })();

    match run_result {
        Ok(()) => {
            config.last_success_at_ms = Some(now_ms());
            config.last_error = None;
            config.consecutive_auto_sync_failures = 0;
            config.paused = false;
            save_store(&space_root, &config)?;
            let _ = set_runtime(
                &app,
                git_state,
                space_state,
                GitSyncPhase::Success,
                false,
                Some("Sync complete".to_string()),
            );
            let status = read_status_internal(&app, git_state, space_state)?;
            emit_status(&app, &status);
            Ok(status)
        }
        Err(error) => {
            config.last_error = Some(error.clone());
            if is_auto {
                config.consecutive_auto_sync_failures =
                    config.consecutive_auto_sync_failures.saturating_add(1);
                if config.consecutive_auto_sync_failures >= 3 {
                    config.paused = true;
                }
            }
            save_store(&space_root, &config)?;
            let _ = set_runtime(
                &app,
                git_state,
                space_state,
                GitSyncPhase::Error,
                false,
                Some(error.clone()),
            );
            Err(error)
        }
    }
}

pub fn read_config(space_state: &SpaceState) -> Result<Option<GitSyncConfig>, String> {
    let space_root = match space_state.current_root() {
        Ok(root) => root,
        Err(_) => return Ok(None),
    };
    load_store(&space_root)
}

pub fn read_status(
    app: AppHandle,
    git_state: State<'_, GitSyncState>,
    space_state: State<'_, SpaceState>,
) -> Result<GitSyncStatus, String> {
    read_status_internal(&app, &git_state, &space_state)
}
