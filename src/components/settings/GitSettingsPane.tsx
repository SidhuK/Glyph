import {
	CheckmarkCircle02Icon,
	ConstructionIcon,
	GitBranchIcon,
	InformationCircleIcon,
	Link01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import { formatTimestamp } from "../../lib/formatTimestamp";
import { loadSettings } from "../../lib/settings";
import type {
	GitSyncConfig,
	GitSyncConflictPolicy,
	GitSyncInclusionSettings,
	GitSyncStatus,
} from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { Button } from "../ui/shadcn/button";
import {
	SettingsRow,
	SettingsSection,
	SettingsSegmented,
	SettingsToggle,
	SettingsValueCard,
} from "./SettingsScaffold";

const DEFAULT_INCLUSIONS: GitSyncInclusionSettings = {
	include_templates: true,
	include_attachments: false,
	include_non_markdown_files: false,
};

export function GitSettingsPane() {
	const [status, setStatus] = useState<GitSyncStatus | null>(null);
	const [config, setConfig] = useState<GitSyncConfig | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const nextStatus = await invoke("git_sync_status_read");
			const nextConfig = await invoke("git_sync_config_read");
			setStatus(nextStatus);
			setConfig(nextConfig);
		} catch (cause) {
			setError(extractErrorMessage(cause));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	useTauriEvent("git_sync:status", (payload) => {
		setStatus(payload);
	});

	const updatePatch = useCallback(
		async (patch: {
			enabled?: boolean;
			conflict_policy?: GitSyncConflictPolicy;
			interval_minutes?: number;
			inclusions?: GitSyncInclusionSettings;
			paused?: boolean;
		}) => {
			setBusy(true);
			setError("");
			try {
				const nextConfig = await invoke("git_sync_config_update", { patch });
				setConfig(nextConfig);
				const nextStatus = await invoke("git_sync_status_read");
				setStatus(nextStatus);
			} catch (cause) {
				setError(extractErrorMessage(cause));
			} finally {
				setBusy(false);
			}
		},
		[],
	);

	const handleSyncNow = useCallback(async () => {
		setBusy(true);
		setError("");
		try {
			const settings = await loadSettings();
			const nextStatus = await invoke("git_sync_run", {
				request: {
					mode: "manual",
					context: {
						templates_folder: settings.templates.folder,
						pasted_media_folder: settings.editor.pastedMediaFolder,
					},
				},
			});
			setStatus(nextStatus);
		} catch (cause) {
			setError(extractErrorMessage(cause));
		} finally {
			setBusy(false);
		}
	}, []);

	const inclusions = config?.inclusions ?? DEFAULT_INCLUSIONS;
	const gitEnabledForSpace =
		Boolean(config) &&
		!status?.unsupported_parent_repo &&
		status?.repo_detected;
	const repoStateLabel = useMemo(() => {
		if (!status?.git_installed) return "Git not installed";
		if (status.unsupported_parent_repo) return "Nested repo unsupported";
		if (status.configured) return "Git repo detected";
		if (status.repo_detected) return "Git repo detected";
		return "No repo at space root";
	}, [status]);
	const connectionHelp = useMemo(() => {
		if (!status?.git_installed) {
			return "Install Git to use Git Sync in repo-backed spaces.";
		}
		if (status?.unsupported_parent_repo) {
			return "This space is inside a larger Git repository. Glyph only supports repos rooted exactly at the opened space.";
		}
		if (config) {
			return "Glyph automatically uses the Git repository found at this space root.";
		}
		return "Git Sync becomes available automatically when the opened space already contains a .git repository at its root.";
	}, [config, status]);

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}
			<div className="settingsGrid">
				<section className="settingsCard gitBetaNotice">
					<div className="gitBetaNoticeIcon" aria-hidden="true">
						<HugeiconsIcon
							icon={ConstructionIcon}
							size={16}
							strokeWidth={0.9}
						/>
					</div>
					<div className="gitBetaNoticeBody">
						<div className="gitBetaNoticeTitleRow">
							<div className="gitBetaNoticeTitle">Git Sync is in beta</div>
							<span className="earlyAccessBadge gitBetaBadge">In Beta</span>
						</div>
						<div className="gitBetaNoticeText">
							Things might break, especially around sync edge cases and unusual
							repository states. Use it carefully and keep backups you trust.
						</div>
					</div>
				</section>
				<SettingsSection
					title="Connection"
					description="Glyph uses Git automatically when the opened space is already a repository."
				>
					<SettingsRow
						label="Git availability"
						description="Glyph uses the system git binary and your existing Git credentials."
						stacked
						interactive={false}
					>
						<SettingsValueCard
							icon={
								<HugeiconsIcon
									icon={CheckmarkCircle02Icon}
									size={14}
									strokeWidth={0.9}
								/>
							}
							value={
								loading
									? "Loading..."
									: status?.git_installed
										? "Installed"
										: "Missing"
							}
						/>
					</SettingsRow>
					<SettingsRow
						label="Repository state"
						description="Glyph only supports repositories rooted exactly at the current space."
						stacked
						interactive={false}
					>
						<SettingsValueCard
							icon={
								<HugeiconsIcon
									icon={InformationCircleIcon}
									size={14}
									strokeWidth={0.9}
								/>
							}
							value={repoStateLabel}
						/>
					</SettingsRow>
					<SettingsRow
						label="How it works"
						description={connectionHelp}
						stacked
						interactive={false}
					>
						<SettingsValueCard
							icon={
								<HugeiconsIcon icon={Link01Icon} size={14} strokeWidth={0.9} />
							}
							value={
								config?.remote_url ??
								"Open a folder that already has Git initialized."
							}
							mono={Boolean(config?.remote_url)}
						/>
					</SettingsRow>
					{config ? (
						<SettingsRow
							label="Branch"
							description="Glyph syncs a single branch per space."
							stacked
							interactive={false}
						>
							<SettingsValueCard
								icon={
									<HugeiconsIcon
										icon={GitBranchIcon}
										size={14}
										strokeWidth={0.9}
									/>
								}
								value={config.branch}
								mono
							/>
						</SettingsRow>
					) : null}
				</SettingsSection>

				<SettingsSection
					title="Sync"
					description="Control automatic syncs and trigger a manual sync at any time."
					className={!gitEnabledForSpace ? "settingsSectionMuted" : undefined}
				>
					<SettingsRow
						label="Automatic sync"
						description="Runs on space open and then on the selected interval."
					>
						<SettingsToggle
							ariaLabel="Automatic sync"
							checked={config?.enabled ?? false}
							disabled={!gitEnabledForSpace || busy}
							onCheckedChange={(checked) => {
								void updatePatch({ enabled: checked });
							}}
						/>
					</SettingsRow>
					<SettingsRow
						label="Interval"
						description="How often Glyph should run scheduled syncs."
						stacked
					>
						<SettingsSegmented
							value={String(config?.interval_minutes ?? 10)}
							ariaLabel="Git sync interval"
							className="appearanceThemeModeSegmented gitSettingsIntervalSegmented"
							disabled={!gitEnabledForSpace || busy}
							options={[
								{ label: "5 min", value: "5" },
								{ label: "10 min", value: "10" },
								{ label: "30 min", value: "30" },
								{ label: "60 min", value: "60" },
							]}
							onChange={(value) => {
								void updatePatch({ interval_minutes: Number(value) });
							}}
						/>
					</SettingsRow>
					<SettingsRow
						label="Manual sync"
						description="Use this any time you want to force a sync immediately."
					>
						<Button
							type="button"
							size="sm"
							onClick={() => void handleSyncNow()}
							disabled={
								!gitEnabledForSpace || busy || Boolean(status?.is_syncing)
							}
						>
							Sync Now
						</Button>
					</SettingsRow>
					<SettingsRow
						label="Status"
						description="Recent runtime state for this space."
						stacked
						interactive={false}
					>
						<SettingsValueCard
							icon={
								<HugeiconsIcon
									icon={InformationCircleIcon}
									size={14}
									strokeWidth={0.9}
								/>
							}
							value={
								status?.message ??
								(status?.last_error
									? status.last_error
									: status?.configured
										? "Ready"
										: "Unavailable")
							}
						/>
						<div className="gitSettingMetaList">
							<div className="gitSettingMetaRow">
								<span className="gitSettingMetaKey">Last success</span>
								<span className="gitSettingMetaValue">
									{formatTimestamp(status?.last_success_at_ms ?? null)}
								</span>
							</div>
							<div className="gitSettingMetaRow">
								<span className="gitSettingMetaKey">Last attempt</span>
								<span className="gitSettingMetaValue">
									{formatTimestamp(status?.last_attempted_at_ms ?? null)}
								</span>
							</div>
						</div>
						<div className="gitSettingMetaList">
							<div className="gitSettingMetaRow">
								<span className="gitSettingMetaKey">Local changes</span>
								<span className="gitSettingMetaValue">
									{status?.local_change_count ?? 0}
								</span>
							</div>
							<div className="gitSettingMetaRow">
								<span className="gitSettingMetaKey">Ahead of remote</span>
								<span className="gitSettingMetaValue">
									{status?.ahead_count ?? 0}
								</span>
							</div>
							<div className="gitSettingMetaRow">
								<span className="gitSettingMetaKey">Behind remote</span>
								<span className="gitSettingMetaValue">
									{status?.behind_count ?? 0}
								</span>
							</div>
						</div>
						{status?.preflight_issue ? (
							<div className="settingsError">{status.preflight_issue}</div>
						) : null}
						{status?.conflict_risk ? (
							<div className="settingsError">
								Potential conflict risk detected: {status.conflict_risk}
							</div>
						) : null}
						{status?.paused ? (
							<div className="settingsError">
								Auto sync is paused after repeated failures. Manual sync remains
								available.
							</div>
						) : null}
					</SettingsRow>
				</SettingsSection>

				<SettingsSection
					title="Conflict Resolution"
					description="Choose which side Glyph should favor when local and remote edits conflict."
					className={!gitEnabledForSpace ? "settingsSectionMuted" : undefined}
				>
					<SettingsRow
						label="Policy"
						description="Glyph resolves conflicts automatically."
						stacked
					>
						<SettingsSegmented
							value={config?.conflict_policy ?? "local_wins"}
							ariaLabel="Conflict policy"
							disabled={!gitEnabledForSpace || busy}
							options={[
								{ label: "Local wins", value: "local_wins" },
								{ label: "Remote wins", value: "remote_wins" },
							]}
							onChange={(value) => {
								void updatePatch({
									conflict_policy: value as GitSyncConflictPolicy,
								});
							}}
						/>
					</SettingsRow>
				</SettingsSection>

				<SettingsSection
					title="Content"
					description="Choose which space content Glyph should include in sync commits."
					className={!gitEnabledForSpace ? "settingsSectionMuted" : undefined}
				>
					<SettingsRow
						label="Include templates"
						description="Sync the current templates folder and its contents."
					>
						<SettingsToggle
							ariaLabel="Include templates"
							checked={inclusions.include_templates}
							disabled={!gitEnabledForSpace || busy}
							onCheckedChange={(checked) => {
								void updatePatch({
									inclusions: { ...inclusions, include_templates: checked },
								});
							}}
						/>
					</SettingsRow>
					<SettingsRow
						label="Include attachments"
						description="Sync files from the pasted media folder used for note assets."
					>
						<SettingsToggle
							ariaLabel="Include attachments"
							checked={inclusions.include_attachments}
							disabled={!gitEnabledForSpace || busy}
							onCheckedChange={(checked) => {
								void updatePatch({
									inclusions: { ...inclusions, include_attachments: checked },
								});
							}}
						/>
					</SettingsRow>
					<SettingsRow
						label="Include non-markdown files"
						description="When off, Glyph limits sync to markdown plus explicitly included folders."
					>
						<SettingsToggle
							ariaLabel="Include non-markdown files"
							checked={inclusions.include_non_markdown_files}
							disabled={!gitEnabledForSpace || busy}
							onCheckedChange={(checked) => {
								void updatePatch({
									inclusions: {
										...inclusions,
										include_non_markdown_files: checked,
									},
								});
							}}
						/>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
