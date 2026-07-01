use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, State};

use crate::space::state::{is_no_space_session_error, SpaceState};

use super::git::{
    ahead_behind_counts, commit_all, fetch_remote, git_is_installed, has_head_commit,
    has_remote_named, inspect_repo, merge_remote, overlapping_change_risk, push_remote,
    remote_branch_exists, stage_for_sync, upsert_managed_gitignore, working_tree_change_count,
    working_tree_dirty, RepoInspection,
};
use super::store::{delete_store, load_store, save_store};
use super::types::{
    GitSyncConfig, GitSyncConfigPatch, GitSyncPhase, GitSyncRepoMode, GitSyncRunMode,
    GitSyncRunRequest, GitSyncStatus, DEFAULT_GIT_SYNC_BRANCH,
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

#[derive(Clone, Default)]
pub struct GitSyncState {
    runtime: Arc<Mutex<HashMap<String, RuntimeStatus>>>,
}

struct SyncResetGuard {
    runtime: Arc<Mutex<HashMap<String, RuntimeStatus>>>,
    key: String,
}

impl SyncResetGuard {
    fn new(runtime: Arc<Mutex<HashMap<String, RuntimeStatus>>>, key: String) -> Self {
        Self { runtime, key }
    }
}

impl Drop for SyncResetGuard {
    fn drop(&mut self) {
        if let Ok(mut runtimes) = self.runtime.lock() {
            if let Some(runtime) = runtimes.get_mut(&self.key) {
                if runtime.is_syncing {
                    *runtime = RuntimeStatus::default();
                }
            }
        }
    }
}

fn runtime_key(space_root: &Path) -> String {
    space_root.to_string_lossy().to_string()
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn emit_status(app: &AppHandle, window_label: &str, status: &GitSyncStatus) {
    let _ = app.emit_to(window_label, "git_sync:status", status.clone());
}

fn set_runtime(
    app: &AppHandle,
    git_state: &GitSyncState,
    space_root: &Path,
    window_label: &str,
    phase: GitSyncPhase,
    is_syncing: bool,
    message: Option<String>,
) -> Result<(), String> {
    {
        let key = runtime_key(space_root);
        let mut runtimes = git_state
            .runtime
            .lock()
            .map_err(|_| "git sync state poisoned".to_string())?;
        let runtime = runtimes.entry(key).or_default();
        runtime.phase = phase;
        runtime.is_syncing = is_syncing;
        runtime.message = message;
    }
    let status = read_status_for_root(git_state, Some(space_root))?;
    emit_status(app, window_label, &status);
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

fn inspect_repo_health(
    space_root: &Path,
    inspection: &RepoInspection,
    config: Option<&GitSyncConfig>,
) -> Result<RepoHealth, String> {
    let mut health = RepoHealth::default();

    let RepoInspection::AtRoot {
        branch,
        primary_remote,
    } = inspection
    else {
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
            health.preflight_issue = Some(
                "Git is in a detached HEAD state. Switch back to a branch before syncing."
                    .to_string(),
            );
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
    let mut status = GitSyncStatus {
        git_installed,
        phase: runtime.phase,
        is_syncing: runtime.is_syncing,
        message: runtime.message,
        ..GitSyncStatus::default()
    };

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
        status.auto_sync_prompted = config.auto_sync_prompted;
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

fn auto_adopt_if_needed(
    space_root: &Path,
    inspection: &RepoInspection,
    existing: Option<GitSyncConfig>,
) -> Result<Option<GitSyncConfig>, String> {
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

fn read_status_for_root(
    git_state: &GitSyncState,
    space_root: Option<&Path>,
) -> Result<GitSyncStatus, String> {
    let Some(space_root) = space_root else {
        return Ok(GitSyncStatus::default());
    };
    let git_installed = git_is_installed();
    let inspection = if git_installed {
        inspect_repo(space_root)?
    } else {
        RepoInspection::None
    };
    let mut status_load_error = None;
    let config = if git_installed {
        let existing = match load_store(space_root) {
            Ok(config) => config,
            Err(error) => {
                status_load_error = Some(error);
                None
            }
        };
        auto_adopt_if_needed(space_root, &inspection, existing)?
    } else {
        None
    };
    let runtime = git_state
        .runtime
        .lock()
        .map_err(|_| "git sync state poisoned".to_string())?
        .get(&runtime_key(space_root))
        .cloned()
        .unwrap_or_default();
    let health = if git_installed {
        inspect_repo_health(space_root, &inspection, config.as_ref())?
    } else {
        RepoHealth::default()
    };
    let mut status = config_to_status(config, inspection, git_installed, runtime, health);
    if status.last_error.is_none() {
        status.last_error = status_load_error;
    }
    Ok(status)
}

pub fn read_status_internal(
    git_state: &GitSyncState,
    space_state: &SpaceState,
    window_label: &str,
) -> Result<GitSyncStatus, String> {
    let space_root = match space_state.root_for_window_label(window_label) {
        Ok(root) => root,
        Err(error) if is_no_space_session_error(&error) => return Ok(GitSyncStatus::default()),
        Err(error) => return Err(error),
    };
    read_status_for_root(git_state, Some(&space_root))
}

fn load_config(space_root: &Path) -> Result<GitSyncConfig, String> {
    load_store(space_root)?.ok_or_else(|| "Git Sync is not configured for this space.".to_string())
}

pub fn update_git_sync_config(
    app: AppHandle,
    git_state: &GitSyncState,
    space_state: &SpaceState,
    window_label: &str,
    patch: GitSyncConfigPatch,
) -> Result<GitSyncConfig, String> {
    let space_root = space_state.root_for_window_label(window_label)?;
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
    if let Some(auto_sync_prompted) = patch.auto_sync_prompted {
        config.auto_sync_prompted = auto_sync_prompted;
    }
    if patch.enabled.is_some() || patch.paused.is_some() {
        config.auto_sync_prompted = true;
    }
    save_store(&space_root, &config)?;
    let status = read_status_internal(git_state, space_state, window_label)?;
    emit_status(&app, window_label, &status);
    Ok(config)
}

pub fn disconnect_git_sync(
    app: AppHandle,
    git_state: &GitSyncState,
    space_state: &SpaceState,
    window_label: &str,
) -> Result<GitSyncStatus, String> {
    let space_root = space_state.root_for_window_label(window_label)?;
    delete_store(&space_root)?;
    {
        let mut runtimes = git_state
            .runtime
            .lock()
            .map_err(|_| "git sync state poisoned".to_string())?;
        runtimes.insert(runtime_key(&space_root), RuntimeStatus::default());
    }
    let status = read_status_internal(git_state, space_state, window_label)?;
    emit_status(&app, window_label, &status);
    Ok(status)
}

pub fn run_git_sync(
    app: AppHandle,
    git_state: &GitSyncState,
    space_state: &SpaceState,
    window_label: &str,
    request: GitSyncRunRequest,
) -> Result<GitSyncStatus, String> {
    let space_root = space_state.root_for_window_label(window_label)?;
    if !git_is_installed() {
        return Err("Git is not installed on this system.".to_string());
    }
    let config = load_config(&space_root)?;
    if request.mode == GitSyncRunMode::Auto && (!config.enabled || config.paused) {
        return read_status_internal(git_state, space_state, window_label);
    }

    {
        let mut runtimes = git_state
            .runtime
            .lock()
            .map_err(|_| "git sync state poisoned".to_string())?;
        let runtime = runtimes.entry(runtime_key(&space_root)).or_default();
        if runtime.is_syncing {
            return read_status_for_root(git_state, Some(&space_root));
        }
        runtime.is_syncing = true;
        runtime.phase = GitSyncPhase::Fetching;
        runtime.message = Some("Fetching remote changes".to_string());
    }
    let initial = read_status_for_root(git_state, Some(&space_root))?;
    emit_status(&app, window_label, &initial);

    let git_state = git_state.clone();
    let window_label = window_label.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) =
            run_git_sync_background(app, git_state, space_root, window_label, request)
        {
            tracing::error!("git sync background task failed: {error}");
        }
    });

    Ok(initial)
}

fn run_git_sync_background(
    app: AppHandle,
    git_state: GitSyncState,
    space_root: PathBuf,
    window_label: String,
    request: GitSyncRunRequest,
) -> Result<(), String> {
    let _sync_guard = SyncResetGuard::new(Arc::clone(&git_state.runtime), runtime_key(&space_root));
    let mut config = load_config(&space_root)?;
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
            &git_state,
            &space_root,
            &window_label,
            GitSyncPhase::Fetching,
            true,
            Some("Fetching remote changes".to_string()),
        )?;
        fetch_remote(&space_root, remote_name, &branch)?;

        set_runtime(
            &app,
            &git_state,
            &space_root,
            &window_label,
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
                &git_state,
                &space_root,
                &window_label,
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
            &git_state,
            &space_root,
            &window_label,
            GitSyncPhase::Pushing,
            true,
            Some("Pushing to remote".to_string()),
        )?;
        let set_upstream = !remote_branch_exists(&space_root, remote_name, &branch)?;
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
                &git_state,
                &space_root,
                &window_label,
                GitSyncPhase::Success,
                false,
                Some("Sync complete".to_string()),
            );
            let status = read_status_for_root(&git_state, Some(&space_root))?;
            emit_status(&app, &window_label, &status);
            Ok(())
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
                &git_state,
                &space_root,
                &window_label,
                GitSyncPhase::Error,
                false,
                Some(error.clone()),
            );
            Err(error)
        }
    }
}

pub fn read_config(
    space_state: &SpaceState,
    window_label: &str,
) -> Result<Option<GitSyncConfig>, String> {
    let space_root = match space_state.root_for_window_label(window_label) {
        Ok(root) => root,
        Err(error) if is_no_space_session_error(&error) => return Ok(None),
        Err(error) => return Err(error),
    };
    load_store(&space_root)
}

pub fn read_status(
    git_state: State<'_, GitSyncState>,
    space_state: State<'_, SpaceState>,
    window_label: &str,
) -> Result<GitSyncStatus, String> {
    read_status_internal(&git_state, &space_state, window_label)
}
