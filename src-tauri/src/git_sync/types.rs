use serde::{Deserialize, Serialize};

pub const GIT_SYNC_STORE_VERSION: u32 = 1;
pub const DEFAULT_GIT_SYNC_INTERVAL_MINUTES: u32 = 10;
pub const DEFAULT_GIT_SYNC_BRANCH: &str = "main";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GitSyncRepoMode {
    ManagedNewRepo,
    AdoptedExistingRepo,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GitSyncConflictPolicy {
    LocalWins,
    RemoteWins,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GitSyncPhase {
    Idle,
    Detecting,
    SettingUp,
    Fetching,
    Committing,
    Pulling,
    Pushing,
    Success,
    Error,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GitSyncRunMode {
    Manual,
    Auto,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AttachmentStorageMode {
    SpaceRoot,
    SpecificFolder,
    NoteFolder,
    NoteSubfolder,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GitSyncInclusionSettings {
    pub include_templates: bool,
    pub include_attachments: bool,
    pub include_non_markdown_files: bool,
}

impl Default for GitSyncInclusionSettings {
    fn default() -> Self {
        Self {
            include_templates: true,
            include_attachments: false,
            include_non_markdown_files: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GitSyncConfig {
    pub enabled: bool,
    pub remote_url: String,
    pub branch: String,
    pub repo_mode: GitSyncRepoMode,
    pub conflict_policy: GitSyncConflictPolicy,
    pub interval_minutes: u32,
    pub inclusions: GitSyncInclusionSettings,
    pub last_success_at_ms: Option<i64>,
    pub last_attempted_at_ms: Option<i64>,
    pub last_error: Option<String>,
    pub consecutive_auto_sync_failures: u32,
    pub paused: bool,
    #[serde(default)]
    pub auto_sync_prompted: bool,
}

impl GitSyncConfig {
    pub fn with_remote(remote_url: String, branch: String, repo_mode: GitSyncRepoMode) -> Self {
        Self {
            enabled: repo_mode == GitSyncRepoMode::ManagedNewRepo,
            remote_url,
            branch,
            repo_mode,
            conflict_policy: GitSyncConflictPolicy::LocalWins,
            interval_minutes: DEFAULT_GIT_SYNC_INTERVAL_MINUTES,
            inclusions: GitSyncInclusionSettings::default(),
            last_success_at_ms: None,
            last_attempted_at_ms: None,
            last_error: None,
            consecutive_auto_sync_failures: 0,
            paused: false,
            auto_sync_prompted: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GitSyncStore {
    pub version: u32,
    #[serde(flatten)]
    pub config: GitSyncConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct GitSyncContext {
    pub templates_folder: Option<String>,
    pub attachment_storage_mode: Option<AttachmentStorageMode>,
    pub attachment_folder: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GitSyncRunRequest {
    pub mode: GitSyncRunMode,
    #[serde(default)]
    pub context: GitSyncContext,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct GitSyncConfigPatch {
    pub enabled: Option<bool>,
    pub conflict_policy: Option<GitSyncConflictPolicy>,
    pub interval_minutes: Option<u32>,
    pub inclusions: Option<GitSyncInclusionSettings>,
    pub paused: Option<bool>,
    pub auto_sync_prompted: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GitSyncStatus {
    pub git_installed: bool,
    pub configured: bool,
    pub repo_detected: bool,
    pub repo_root_matches_space: bool,
    pub unsupported_parent_repo: bool,
    pub repo_mode: Option<GitSyncRepoMode>,
    pub remote_url: Option<String>,
    pub branch: Option<String>,
    pub enabled: bool,
    pub paused: bool,
    pub auto_sync_prompted: bool,
    pub phase: GitSyncPhase,
    pub is_syncing: bool,
    pub interval_minutes: u32,
    pub conflict_policy: GitSyncConflictPolicy,
    pub inclusions: GitSyncInclusionSettings,
    pub last_success_at_ms: Option<i64>,
    pub last_attempted_at_ms: Option<i64>,
    pub last_error: Option<String>,
    pub consecutive_auto_sync_failures: u32,
    pub detected_remote_url: Option<String>,
    pub detected_branch: Option<String>,
    pub local_change_count: u32,
    pub ahead_count: u32,
    pub behind_count: u32,
    pub preflight_issue: Option<String>,
    pub conflict_risk: Option<String>,
    pub message: Option<String>,
}

impl Default for GitSyncStatus {
    fn default() -> Self {
        Self {
            git_installed: false,
            configured: false,
            repo_detected: false,
            repo_root_matches_space: false,
            unsupported_parent_repo: false,
            repo_mode: None,
            remote_url: None,
            branch: None,
            enabled: false,
            paused: false,
            auto_sync_prompted: false,
            phase: GitSyncPhase::Idle,
            is_syncing: false,
            interval_minutes: DEFAULT_GIT_SYNC_INTERVAL_MINUTES,
            conflict_policy: GitSyncConflictPolicy::LocalWins,
            inclusions: GitSyncInclusionSettings::default(),
            last_success_at_ms: None,
            last_attempted_at_ms: None,
            last_error: None,
            consecutive_auto_sync_failures: 0,
            detected_remote_url: None,
            detected_branch: None,
            local_change_count: 0,
            ahead_count: 0,
            behind_count: 0,
            preflight_issue: None,
            conflict_risk: None,
            message: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GitHistoryCommit {
    pub hash: String,
    pub short_hash: String,
    pub rel_path: String,
    pub author_name: String,
    pub author_email: String,
    pub timestamp_ms: i64,
    pub subject: String,
    pub added_count: u32,
    pub modified_count: u32,
    pub deleted_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GitCommitDiff {
    pub commit: GitHistoryCommit,
    pub diff: String,
}
