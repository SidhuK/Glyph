use std::io::Read;
use std::path::{Component, Path};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use super::types::{AttachmentStorageMode, GitSyncContext, GitSyncInclusionSettings};
use crate::io_atomic;

const GLYPH_GITIGNORE_START: &str = "# >>> Glyph Git Sync >>>";
const GLYPH_GITIGNORE_END: &str = "# <<< Glyph Git Sync <<<";
const GIT_COMMAND_TIMEOUT: Duration = Duration::from_secs(30);

/// Maximum number of commits returned by `file_history`. Shared so callers that
/// re-derive history (e.g. diff lookups) stay consistent with this ceiling.
pub const MAX_FILE_HISTORY_LIMIT: u32 = 100;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RepoInspection {
    None,
    AtRoot {
        branch: Option<String>,
        primary_remote: Option<String>,
    },
    Nested {
        repo_root: String,
    },
}

fn run_command(mut command: Command) -> Result<(bool, String, String), String> {
    let mut child = command
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never")
        .env_remove("GIT_ASKPASS")
        .env_remove("SSH_ASKPASS")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;

    // Drain stdout/stderr concurrently so git never blocks writing to a full
    // pipe buffer (~64KB) while we poll for exit, which would otherwise deadlock
    // and trip the timeout on large diffs/histories.
    let mut stdout_pipe = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture git stdout".to_string())?;
    let mut stderr_pipe = child
        .stderr
        .take()
        .ok_or_else(|| "failed to capture git stderr".to_string())?;
    let stdout_handle = thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = stdout_pipe.read_to_end(&mut buffer);
        buffer
    });
    let stderr_handle = thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = stderr_pipe.read_to_end(&mut buffer);
        buffer
    });

    let deadline = Instant::now() + GIT_COMMAND_TIMEOUT;
    let status = loop {
        match child.try_wait().map_err(|error| error.to_string())? {
            Some(status) => break status,
            None if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_handle.join();
                let _ = stderr_handle.join();
                return Err("git command timed out".to_string());
            }
            None => thread::sleep(Duration::from_millis(50)),
        }
    };

    let stdout = stdout_handle
        .join()
        .map_err(|_| "git stdout reader panicked".to_string())?;
    let stderr = stderr_handle
        .join()
        .map_err(|_| "git stderr reader panicked".to_string())?;
    Ok((
        status.success(),
        String::from_utf8_lossy(&stdout).trim().to_string(),
        String::from_utf8_lossy(&stderr).trim().to_string(),
    ))
}

pub fn git_is_installed() -> bool {
    match run_command({
        let mut command = Command::new("git");
        command.arg("--version");
        command
    }) {
        Ok((success, _, _)) => success,
        Err(_) => false,
    }
}

fn run_git(space_root: &Path, args: &[&str]) -> Result<String, String> {
    let (success, stdout, stderr) = run_command({
        let mut command = Command::new("git");
        command.current_dir(space_root).args(args);
        command
    })?;
    if success {
        Ok(stdout)
    } else if stderr.is_empty() {
        Err(format!("git {} failed", args.join(" ")))
    } else {
        Err(stderr)
    }
}

fn run_git_owned(space_root: &Path, args: Vec<String>) -> Result<String, String> {
    let (success, stdout, stderr) = run_command({
        let mut command = Command::new("git");
        command.current_dir(space_root).args(args.iter());
        command
    })?;
    if success {
        Ok(stdout)
    } else if stderr.is_empty() {
        Err("git command failed".to_string())
    } else {
        Err(stderr)
    }
}

fn run_git_maybe(space_root: &Path, args: &[&str]) -> Result<Option<String>, String> {
    let (success, stdout, _) = run_command({
        let mut command = Command::new("git");
        command.current_dir(space_root).args(args);
        command
    })?;
    if success {
        Ok(Some(stdout))
    } else {
        Ok(None)
    }
}

fn canonical_string(path: &Path) -> Result<String, String> {
    path.canonicalize()
        .map_err(|error| error.to_string())
        .map(|path| path.to_string_lossy().replace('\\', "/"))
}

pub fn inspect_repo(space_root: &Path) -> Result<RepoInspection, String> {
    let top_level = run_git_maybe(space_root, &["rev-parse", "--show-toplevel"])?;
    let Some(top_level) = top_level else {
        return Ok(RepoInspection::None);
    };

    let normalized_space = canonical_string(space_root)?;
    let normalized_repo = canonical_string(Path::new(&top_level))?;
    if normalized_repo != normalized_space {
        return Ok(RepoInspection::Nested {
            repo_root: normalized_repo,
        });
    }

    let branch = current_branch(space_root)?;
    let primary_remote = primary_remote_url(space_root)?;
    Ok(RepoInspection::AtRoot {
        branch,
        primary_remote,
    })
}

pub fn current_branch(space_root: &Path) -> Result<Option<String>, String> {
    let branch = run_git_maybe(space_root, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    Ok(branch.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() || trimmed == "HEAD" {
            None
        } else {
            Some(trimmed.to_string())
        }
    }))
}

fn primary_remote_name(space_root: &Path) -> Result<Option<String>, String> {
    let remotes = run_git_maybe(space_root, &["remote"])?;
    Ok(remotes.and_then(|raw| {
        raw.lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .map(ToOwned::to_owned)
    }))
}

pub fn primary_remote_url(space_root: &Path) -> Result<Option<String>, String> {
    let Some(remote_name) = primary_remote_name(space_root)? else {
        return Ok(None);
    };
    let url = run_git_maybe(space_root, &["remote", "get-url", &remote_name])?;
    Ok(url.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    }))
}

pub fn has_remote_named(space_root: &Path, remote_name: &str) -> Result<bool, String> {
    Ok(run_git_maybe(space_root, &["remote", "get-url", remote_name])?.is_some())
}

pub fn has_head_commit(space_root: &Path) -> Result<bool, String> {
    Ok(run_git_maybe(space_root, &["rev-parse", "--verify", "HEAD"])?.is_some())
}

pub fn working_tree_dirty(space_root: &Path) -> Result<bool, String> {
    let status = run_git(space_root, &["status", "--porcelain"])?;
    Ok(!status.trim().is_empty())
}

pub fn working_tree_change_count(space_root: &Path) -> Result<u32, String> {
    let status = run_git(space_root, &["status", "--porcelain"])?;
    Ok(status
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count() as u32)
}

pub fn fetch_remote(space_root: &Path, remote_name: &str, branch: &str) -> Result<(), String> {
    run_git(space_root, &["fetch", remote_name, branch])?;
    Ok(())
}

pub fn remote_branch_exists(
    space_root: &Path,
    remote_name: &str,
    branch: &str,
) -> Result<bool, String> {
    let ref_name = format!("refs/remotes/{remote_name}/{branch}");
    Ok(run_git_maybe(space_root, &["rev-parse", "--verify", &ref_name])?.is_some())
}

pub fn ahead_behind_counts(
    space_root: &Path,
    remote_name: &str,
    branch: &str,
) -> Result<(u32, u32), String> {
    let ref_name = format!("{remote_name}/{branch}");
    if !remote_branch_exists(space_root, remote_name, branch)? {
        return Ok((0, 0));
    }
    let raw = run_git(
        space_root,
        &[
            "rev-list",
            "--left-right",
            "--count",
            &format!("HEAD...{ref_name}"),
        ],
    )?;
    let mut parts = raw.split_whitespace();
    let ahead = parts
        .next()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(0);
    let behind = parts
        .next()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(0);
    Ok((ahead, behind))
}

pub fn overlapping_change_risk(
    space_root: &Path,
    remote_name: &str,
    branch: &str,
) -> Result<Option<String>, String> {
    let ref_name = format!("{remote_name}/{branch}");
    if !remote_branch_exists(space_root, remote_name, branch)? {
        return Ok(None);
    }
    let base = run_git(space_root, &["merge-base", "HEAD", &ref_name])?;
    let base = base.trim();
    if base.is_empty() {
        return Ok(None);
    }

    let local = run_git(space_root, &["diff", "--name-only", base, "HEAD"])?;
    let remote = run_git(space_root, &["diff", "--name-only", base, &ref_name])?;

    let local_files = local
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<std::collections::BTreeSet<_>>();
    let remote_files = remote
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<std::collections::BTreeSet<_>>();

    let overlaps = local_files
        .intersection(&remote_files)
        .take(3)
        .copied()
        .collect::<Vec<_>>();

    if overlaps.is_empty() {
        return Ok(None);
    }

    let summary = if overlaps.len() == 1 {
        format!("Both local and remote changed {}", overlaps[0])
    } else {
        format!("Both local and remote changed {}", overlaps.join(", "))
    };
    Ok(Some(summary))
}

pub fn merge_remote(
    space_root: &Path,
    remote_name: &str,
    branch: &str,
    favor_local: bool,
) -> Result<(), String> {
    let ref_name = format!("refs/remotes/{remote_name}/{branch}");
    let strategy = if favor_local { "ours" } else { "theirs" };
    run_git(
        space_root,
        &["merge", "--no-edit", "-X", strategy, &ref_name],
    )?;
    Ok(())
}

pub fn push_remote(
    space_root: &Path,
    remote_name: &str,
    branch: &str,
    set_upstream: bool,
) -> Result<(), String> {
    if set_upstream {
        run_git(space_root, &["push", "-u", remote_name, branch])?;
    } else {
        run_git(space_root, &["push", remote_name, branch])?;
    }
    Ok(())
}

pub fn commit_all(space_root: &Path, message: &str) -> Result<(), String> {
    run_git(space_root, &["commit", "-m", message])?;
    Ok(())
}

fn normalize_path_for_gitignore(path: &str) -> Option<String> {
    let normalized = Path::new(path)
        .components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/");
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn push_unignore_patterns(lines: &mut Vec<String>, raw_path: &str) {
    let Some(path) = normalize_path_for_gitignore(raw_path) else {
        return;
    };
    let mut current = String::new();
    for segment in path.split('/') {
        if !current.is_empty() {
            current.push('/');
        }
        current.push_str(segment);
        lines.push(format!("!{current}/"));
    }
    lines.push(format!("!{path}/**"));
}

fn push_ignore_pattern(lines: &mut Vec<String>, raw_path: &str) {
    if let Some(path) = normalize_path_for_gitignore(raw_path) {
        lines.push(format!("{path}/"));
    }
}

pub fn render_managed_gitignore(
    inclusions: &GitSyncInclusionSettings,
    context: &GitSyncContext,
) -> String {
    let mut lines = vec![GLYPH_GITIGNORE_START.to_string(), ".glyph/".to_string()];

    if !inclusions.include_non_markdown_files {
        lines.extend([
            "*".to_string(),
            "!*/".to_string(),
            "!*.md".to_string(),
            "!.gitignore".to_string(),
        ]);
    }

    match (
        inclusions.include_templates,
        context.templates_folder.as_deref(),
    ) {
        (true, Some(path)) if !inclusions.include_non_markdown_files => {
            push_unignore_patterns(&mut lines, path);
        }
        (false, Some(path)) => {
            push_ignore_pattern(&mut lines, path);
        }
        _ => {}
    }

    if matches!(
        context.attachment_storage_mode,
        Some(AttachmentStorageMode::SpecificFolder)
    ) {
        match (
            inclusions.include_attachments,
            context.attachment_folder.as_deref(),
        ) {
            (true, Some(path)) if !inclusions.include_non_markdown_files => {
                push_unignore_patterns(&mut lines, path);
            }
            (false, Some(path)) => {
                push_ignore_pattern(&mut lines, path);
            }
            _ => {}
        }
    }

    lines.push(GLYPH_GITIGNORE_END.to_string());
    lines.join("\n")
}

pub fn upsert_managed_gitignore(
    space_root: &Path,
    inclusions: &GitSyncInclusionSettings,
    context: &GitSyncContext,
) -> Result<(), String> {
    let path = space_root.join(".gitignore");
    let block = render_managed_gitignore(inclusions, context);
    let existing = match std::fs::read_to_string(&path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error.to_string()),
    };
    let next = if let (Some(start), Some(end)) = (
        existing.find(GLYPH_GITIGNORE_START),
        existing.find(GLYPH_GITIGNORE_END),
    ) {
        let before = existing[..start].trim_end();
        let after = existing[end + GLYPH_GITIGNORE_END.len()..].trim_start();
        match (before.is_empty(), after.is_empty()) {
            (true, true) => format!("{block}\n"),
            (true, false) => format!("{block}\n\n{after}\n"),
            (false, true) => format!("{before}\n\n{block}\n"),
            (false, false) => format!("{before}\n\n{block}\n\n{after}\n"),
        }
    } else if existing.trim().is_empty() {
        format!("{block}\n")
    } else {
        format!("{}\n\n{block}\n", existing.trim_end())
    };
    io_atomic::write_atomic(&path, next.as_bytes()).map_err(|error| error.to_string())
}

pub fn stage_for_sync(space_root: &Path) -> Result<(), String> {
    run_git(space_root, &["add", "-A", "."])?;
    Ok(())
}

pub fn file_history(space_root: &Path, rel_path: &str, limit: u32) -> Result<String, String> {
    run_git_owned(
        space_root,
        vec![
            "log".to_string(),
            "--follow".to_string(),
            "--date-order".to_string(),
            format!("-n{}", limit.clamp(1, MAX_FILE_HISTORY_LIMIT)),
            "--format=%x1e%H%x1f%h%x1f%an%x1f%ae%x1f%at%x1f%s".to_string(),
            "--numstat".to_string(),
            "--".to_string(),
            rel_path.to_string(),
        ],
    )
}

pub fn commit_file_diff(space_root: &Path, commit: &str, rel_path: &str) -> Result<String, String> {
    run_git_owned(
        space_root,
        vec![
            "show".to_string(),
            "--format=".to_string(),
            "--no-ext-diff".to_string(),
            "--find-renames".to_string(),
            "--patch".to_string(),
            "--no-color".to_string(),
            "--unified=3".to_string(),
            commit.to_string(),
            "--".to_string(),
            rel_path.to_string(),
        ],
    )
}

#[cfg(test)]
mod tests {
    use crate::git_sync::types::{AttachmentStorageMode, GitSyncInclusionSettings};

    use super::{inspect_repo, render_managed_gitignore, RepoInspection};

    #[test]
    fn gitignore_for_markdown_only_excludes_other_files() {
        let block = render_managed_gitignore(
            &GitSyncInclusionSettings::default(),
            &crate::git_sync::types::GitSyncContext {
                templates_folder: Some("templates".to_string()),
                attachment_storage_mode: Some(AttachmentStorageMode::SpecificFolder),
                attachment_folder: Some("assets/images".to_string()),
            },
        );
        assert!(block.contains(".glyph/"));
        assert!(block.contains("!*.md"));
        assert!(block.contains("assets/images/"));
    }

    #[test]
    fn gitignore_unignores_included_folders_when_markdown_only() {
        let block = render_managed_gitignore(
            &GitSyncInclusionSettings {
                include_templates: true,
                include_attachments: true,
                include_non_markdown_files: false,
            },
            &crate::git_sync::types::GitSyncContext {
                templates_folder: Some("config/templates".to_string()),
                attachment_storage_mode: Some(AttachmentStorageMode::SpecificFolder),
                attachment_folder: Some("assets/images".to_string()),
            },
        );
        assert!(block.contains("!config/"));
        assert!(block.contains("!config/templates/**"));
        assert!(block.contains("!assets/images/**"));
    }

    #[test]
    fn gitignore_skips_attachment_specific_rules_outside_specific_folder_mode() {
        let block = render_managed_gitignore(
            &GitSyncInclusionSettings {
                include_templates: true,
                include_attachments: true,
                include_non_markdown_files: false,
            },
            &crate::git_sync::types::GitSyncContext {
                templates_folder: Some("config/templates".to_string()),
                attachment_storage_mode: Some(AttachmentStorageMode::NoteFolder),
                attachment_folder: Some("assets/images".to_string()),
            },
        );
        assert!(block.contains("!config/templates/**"));
        assert!(!block.contains("!assets/images/**"));
        assert!(!block.contains("assets/images/"));
    }

    #[test]
    fn inspect_repo_rejects_parent_repo() {
        if !super::git_is_installed() {
            return;
        }
        let root =
            std::env::temp_dir().join(format!("glyph-git-sync-inspect-{}", uuid::Uuid::new_v4()));
        let child = root.join("child");
        std::fs::create_dir_all(&child).expect("create child");
        super::run_git(&root, &["init"]).expect("init repo");
        super::run_git(&root, &["checkout", "-B", "main"]).expect("set branch");

        let result = inspect_repo(&child).expect("inspect repo");
        assert!(matches!(result, RepoInspection::Nested { .. }));
    }
}
