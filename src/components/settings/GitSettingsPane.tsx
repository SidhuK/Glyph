import {
	CheckmarkCircle02Icon,
	GitBranchIcon,
	InformationCircleIcon,
	Link01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	getGitSyncConnectionHelp,
	getGitSyncPresentation,
	getGitSyncRepoStateLabel,
} from "../../lib/gitSyncUi";
import { type AttachmentStorageMode, loadSettings } from "../../lib/settings";
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
	SettingsToggle,
	SettingsValueCard,
} from "./SettingsScaffold";

const DEFAULT_INCLUSIONS: GitSyncInclusionSettings = {
	include_templates: true,
	include_attachments: false,
	include_non_markdown_files: false,
};

const GIT_SYNC_INTERVAL_OPTIONS = [
	{ label: "5 min", value: "5" },
	{ label: "10 min", value: "10" },
	{ label: "30 min", value: "30" },
	{ label: "60 min", value: "60" },
] as const;

const CONFLICT_POLICY_OPTIONS = [
	{ label: "Local wins", value: "local_wins" },
	{ label: "Remote wins", value: "remote_wins" },
] as const satisfies readonly {
	label: string;
	value: GitSyncConflictPolicy;
}[];

export function GitSettingsPane() {
	const [status, setStatus] = useState<GitSyncStatus | null>(null);
	const [config, setConfig] = useState<GitSyncConfig | null>(null);
	const [attachmentStorageMode, setAttachmentStorageMode] =
		useState<AttachmentStorageMode>("note-folder");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const [nextStatus, nextConfig, settings] = await Promise.all([
				invoke("git_sync_status_read"),
				invoke("git_sync_config_read"),
				loadSettings(),
			]);
			setStatus(nextStatus);
			setConfig(nextConfig);
			setAttachmentStorageMode(settings.editor.attachmentStorageMode);
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
	useTauriEvent("settings:updated", (payload) => {
		if (payload.editor?.attachmentStorageMode) {
			setAttachmentStorageMode(payload.editor.attachmentStorageMode);
		}
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
						attachment_storage_mode: settings.editor.attachmentStorageMode,
						attachment_folder:
							settings.editor.attachmentStorageMode === "specific-folder"
								? settings.editor.attachmentFolder
								: null,
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
	const repoStateLabel = useMemo(
		() => getGitSyncRepoStateLabel(status),
		[status],
	);
	const connectionHelp = useMemo(
		() => getGitSyncConnectionHelp(status, Boolean(config)),
		[config, status],
	);
	const presentation = useMemo(() => getGitSyncPresentation(status), [status]);
	const attachmentFilteringHelp =
		attachmentStorageMode === "specific-folder"
			? "Sync files from the configured attachments folder."
			: "Attachment-only filtering works only when attachments use Specific folder. In other modes, attachment files follow the broader non-markdown files setting.";

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}
			<div className="settingsGrid">
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
					>
						<select
							aria-label="Git sync interval"
							value={String(config?.interval_minutes ?? 10)}
							disabled={!gitEnabledForSpace || busy}
							onChange={(event) => {
								void updatePatch({
									interval_minutes: Number(event.currentTarget.value),
								});
							}}
						>
							{GIT_SYNC_INTERVAL_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</SettingsRow>
					<SettingsRow
						label="Actions"
						description="Run a sync from settings and review the latest sync state here."
						stacked
					>
						<div className="gitSettingsActionRow">
							<Button
								type="button"
								size="sm"
								variant="default"
								onClick={() => void handleSyncNow()}
								disabled={
									!gitEnabledForSpace || busy || !presentation.canSyncNow
								}
							>
								Sync Now
							</Button>
							<div className="settingsHelp gitSettingsInlineStatus">
								{presentation.headline}
							</div>
							{presentation.showResume ? (
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => {
										void updatePatch({ paused: false, enabled: true });
									}}
									disabled={busy}
								>
									Resume Auto Sync
								</Button>
							) : null}
						</div>
						{presentation.issueText ? (
							<div className="settingsError">{presentation.issueText}</div>
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
					>
						<select
							aria-label="Conflict policy"
							value={config?.conflict_policy ?? "local_wins"}
							disabled={!gitEnabledForSpace || busy}
							onChange={(event) => {
								void updatePatch({
									conflict_policy: event.currentTarget
										.value as GitSyncConflictPolicy,
								});
							}}
						>
							{CONFLICT_POLICY_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
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
						description={attachmentFilteringHelp}
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
