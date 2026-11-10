//! Workflow ranks for status and priority sorting. These mirror the frontend's
//! `STATUS_OPTIONS` aliases and `STATUS_PICKER_ORDER` (src/lib/statusProperties.ts) and
//! `PRIORITY_OPTIONS` / `priorityRank` (src/lib/priorityProperties.ts); keep them in step.

/// Status ids in workflow order, each with the aliases that map to it.
const STATUS_RANKS: &[&[&str]] = &[
    &["backlog", "icebox", "later", "someday"],
    &[
        "todo",
        "to do",
        "not started",
        "open",
        "new",
        "unstarted",
    ],
    &["in progress", "progress", "doing", "wip", "active"],
    &["in review", "review", "reviewing"],
    &["blocked", "stuck"],
    &[
        "waiting",
        "pending",
        "submitted",
        "sent",
        "requested",
        "paused",
        "pause",
        "on hold",
        "hold",
        "deferred",
        "awaiting",
        "awaiting approval",
        "waiting for approval",
        "waiting for customer",
        "waiting for support",
    ],
    &[
        "done",
        "finished",
        "complete",
        "completed",
        "resolved",
        "closed",
        "success",
        "successful",
        "approved",
        "published",
        "won",
    ],
    &[
        "canceled",
        "cancelled",
        "rejected",
        "failed",
        "failure",
        "error",
        "expired",
        "wont do",
        "won't do",
        "wont fix",
        "won't fix",
        "duplicate",
        "could not reproduce",
        "lost",
    ],
    &["archived", "archive"],
];

/// Priority ids from least to most urgent, each with its aliases.
const PRIORITY_RANKS: &[&[&str]] = &[
    &["no", "none", "false"],
    &["low"],
    &["medium", "med"],
    &["high"],
];

/// Lowercases, turns `_`/`-` runs into spaces and collapses whitespace, like the frontend.
fn normalize_option_text(value: &str) -> String {
    value
        .to_lowercase()
        .replace(['_', '-'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn rank_in(ranks: &[&[&str]], value: &str) -> Option<usize> {
    let normalized = normalize_option_text(value);
    if normalized.is_empty() {
        return None;
    }
    ranks
        .iter()
        .position(|aliases| aliases.contains(&normalized.as_str()))
}

/// Workflow rank of a status value; `None` for blank or custom values.
pub(super) fn status_rank(value: &str) -> Option<usize> {
    rank_in(STATUS_RANKS, value)
}

/// Urgency rank of a priority value (no = 0 … high = 3); `None` for blank or custom values.
pub(super) fn priority_rank(value: &str) -> Option<usize> {
    rank_in(PRIORITY_RANKS, value)
}

#[cfg(test)]
mod tests {
    use super::{priority_rank, status_rank};

    #[test]
    fn status_aliases_share_a_rank() {
        assert_eq!(status_rank("Done"), status_rank("completed"));
        assert_eq!(status_rank("in_progress"), status_rank("In-Progress"));
        assert_eq!(status_rank("active"), status_rank("in progress"));
        assert!(status_rank("todo") < status_rank("in review"));
        assert!(status_rank("done") < status_rank("archived"));
        assert_eq!(status_rank("idea"), None);
        assert_eq!(status_rank("  "), None);
    }

    #[test]
    fn priority_ranks_follow_urgency() {
        assert_eq!(priority_rank("No"), Some(0));
        assert_eq!(priority_rank("none"), Some(0));
        assert_eq!(priority_rank("Med"), Some(2));
        assert_eq!(priority_rank("High"), Some(3));
        assert_eq!(priority_rank("urgent"), None);
    }
}
