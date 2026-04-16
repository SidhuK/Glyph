import type { GitSyncStatus } from "./tauri";

export type GitSyncTone =
	| "idle"
	| "healthy"
	| "syncing"
	| "paused"
	| "warning"
	| "error";

export interface GitSyncPresentation {
	tone: GitSyncTone;
	triggerLabel: string;
	headline: string;
	supportingCopy: string;
	statusBadge: string;
	phaseLabel: string;
	issueText: string | null;
	branchLabel: string | null;
	remoteLabel: string | null;
	remoteHost: string | null;
	canSyncNow: boolean;
	showResume: boolean;
}

function remoteHost(remote: string | null | undefined): string | null {
	if (!remote) return null;

	try {
		if (remote.startsWith("git@")) {
			const host = remote.slice(remote.indexOf("@") + 1, remote.indexOf(":"));
			return host || remote;
		}
		return new URL(remote).host;
	} catch {
		return remote;
	}
}

function gitSyncPhaseLabel(status: GitSyncStatus | null): string {
	switch (status?.phase) {
		case "detecting":
			return "Checking";
		case "setting_up":
			return "Preparing";
		case "fetching":
			return "Fetching";
		case "committing":
			return "Snapshotting";
		case "pulling":
			return "Merging";
		case "pushing":
			return "Pushing";
		case "success":
			return "Complete";
		case "error":
			return "Stopped";
		default:
			return "Idle";
	}
}

export function getGitSyncRepoStateLabel(status: GitSyncStatus | null): string {
	if (!status?.git_installed) return "Git not installed";
	if (status.unsupported_parent_repo) return "Nested repo unsupported";
	if (status.configured) return "Git repo detected";
	if (status.repo_detected) return "Git repo detected";
	return "No repo at space root";
}

export function getGitSyncConnectionHelp(
	status: GitSyncStatus | null,
	configured: boolean,
): string {
	if (!status?.git_installed) {
		return "Install Git to use Git Sync in repo-backed spaces.";
	}
	if (status.unsupported_parent_repo) {
		return "This space is inside a larger Git repository. Glyph only supports repos rooted exactly at the opened space.";
	}
	if (configured) {
		return "Glyph automatically uses the Git repository found at this space root.";
	}
	if (status.repo_detected) {
		return "Glyph found a repository here, but it still needs an origin remote before sync can start.";
	}
	return "Git Sync becomes available automatically when the opened space already contains a .git repository at its root.";
}

export function shouldShowGitSync(status: GitSyncStatus | null): boolean {
	if (!status) return false;
	return (
		!status.git_installed ||
		status.repo_detected ||
		status.configured ||
		status.unsupported_parent_repo
	);
}

export function getGitSyncPresentation(
	status: GitSyncStatus | null,
): GitSyncPresentation {
	const issueText =
		status?.conflict_risk ??
		status?.preflight_issue ??
		status?.last_error ??
		null;
	const branchLabel = status?.branch ?? status?.detected_branch ?? null;
	const remoteLabel = status?.remote_url ?? status?.detected_remote_url ?? null;
	const phaseLabel = gitSyncPhaseLabel(status);
	const host = remoteHost(remoteLabel);
	const base: GitSyncPresentation = {
		tone: "idle",
		triggerLabel: "Git",
		headline: "Git Sync unavailable",
		supportingCopy: "Open a repo-backed space to sync this workspace.",
		statusBadge: "Idle",
		phaseLabel,
		issueText,
		branchLabel,
		remoteLabel,
		remoteHost: host,
		canSyncNow: false,
		showResume: false,
	};

	if (!status?.git_installed) {
		return {
			...base,
			tone: "warning",
			triggerLabel: "Missing",
			headline: "Install Git to enable sync",
			supportingCopy:
				"Glyph uses your system Git install and existing credentials.",
			statusBadge: "Missing",
		};
	}

	if (status?.unsupported_parent_repo) {
		return {
			...base,
			tone: "warning",
			triggerLabel: "Unsupported",
			headline: "This space sits inside another repo",
			supportingCopy:
				"Glyph only supports repositories rooted exactly at the opened space.",
			statusBadge: "Unsupported",
		};
	}

	if (status?.is_syncing) {
		return {
			...base,
			tone: "syncing",
			triggerLabel: "Syncing",
			headline: status.message ?? "Syncing this space",
			supportingCopy:
				"Glyph is running Git in the background. You can keep working while it finishes.",
			statusBadge: "Syncing",
			canSyncNow: false,
		};
	}

	if (status?.paused) {
		return {
			...base,
			tone: "paused",
			triggerLabel: "Paused",
			headline: "Auto sync is paused",
			supportingCopy:
				"Manual sync still works, and you can resume automatic runs when you’re ready.",
			statusBadge: "Paused",
			canSyncNow: !status.conflict_risk && !status.preflight_issue,
			showResume: true,
		};
	}

	if (issueText) {
		return {
			...base,
			tone: "error",
			triggerLabel: "Attention",
			headline: "Git Sync needs attention",
			supportingCopy:
				"Glyph found something that needs to be resolved before the next safe sync.",
			statusBadge: "Attention",
			canSyncNow: false,
		};
	}

	if (status?.configured) {
		return {
			...base,
			tone: status.enabled ? "healthy" : "idle",
			triggerLabel: status.enabled ? "Ready" : "Manual",
			headline: status.enabled ? "Git Sync is ready" : "Manual sync only",
			supportingCopy: status.enabled
				? "This space is connected and ready to back up changes."
				: "Automatic sync is off. Trigger a sync whenever you want to save a snapshot.",
			statusBadge: status.enabled ? "Ready" : "Manual",
			canSyncNow: true,
		};
	}

	if (status?.repo_detected) {
		return {
			...base,
			tone: "warning",
			triggerLabel: "Repo found",
			headline: "Repository detected, but not ready to sync",
			supportingCopy:
				"Add an origin remote to this repo and Glyph will start tracking it automatically.",
			statusBadge: "Repo found",
		};
	}

	return base;
}
