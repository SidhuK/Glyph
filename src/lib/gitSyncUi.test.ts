import { describe, expect, it } from "vitest";
import {
	getGitSyncPresentation,
	getGitSyncRepoStateLabel,
	shouldShowGitSync,
} from "./gitSyncUi";
import type { GitSyncStatus } from "./tauri";

function makeStatus(overrides: Partial<GitSyncStatus> = {}): GitSyncStatus {
	return {
		git_installed: true,
		configured: true,
		repo_detected: true,
		repo_root_matches_space: true,
		unsupported_parent_repo: false,
		repo_mode: "adopted_existing_repo",
		remote_url: "https://github.com/SidhuK/Glyph",
		branch: "main",
		enabled: true,
		paused: false,
		phase: "idle",
		is_syncing: false,
		interval_minutes: 10,
		conflict_policy: "local_wins",
		inclusions: {
			include_templates: true,
			include_attachments: false,
			include_non_markdown_files: false,
		},
		last_success_at_ms: null,
		last_attempted_at_ms: null,
		last_error: null,
		consecutive_auto_sync_failures: 0,
		detected_remote_url: "https://github.com/SidhuK/Glyph",
		detected_branch: "main",
		local_change_count: 3,
		ahead_count: 1,
		behind_count: 0,
		preflight_issue: null,
		conflict_risk: null,
		message: null,
		...overrides,
	};
}

describe("gitSyncUi", () => {
	it("maps syncing state to a non-blocking message", () => {
		const presentation = getGitSyncPresentation(
			makeStatus({
				is_syncing: true,
				phase: "pushing",
				message: "Pushing to remote",
			}),
		);

		expect(presentation.tone).toBe("syncing");
		expect(presentation.triggerLabel).toBe("Syncing");
		expect(presentation.supportingCopy).toContain("keep working");
	});

	it("disables manual sync when a preflight issue exists", () => {
		const presentation = getGitSyncPresentation(
			makeStatus({
				preflight_issue: "Detached HEAD",
			}),
		);

		expect(presentation.tone).toBe("error");
		expect(presentation.canSyncNow).toBe(false);
		expect(presentation.issueText).toBe("Detached HEAD");
	});

	it("shows paused repos as resumable", () => {
		const presentation = getGitSyncPresentation(
			makeStatus({
				paused: true,
				enabled: true,
			}),
		);

		expect(presentation.tone).toBe("paused");
		expect(presentation.showResume).toBe(true);
	});

	it("shows git footer when git is missing", () => {
		expect(
			shouldShowGitSync(
				makeStatus({
					git_installed: false,
					configured: false,
					repo_detected: false,
				}),
			),
		).toBe(true);
		expect(
			getGitSyncRepoStateLabel(
				makeStatus({
					git_installed: false,
					configured: false,
					repo_detected: false,
				}),
			),
		).toBe("Git not installed");
	});
});
