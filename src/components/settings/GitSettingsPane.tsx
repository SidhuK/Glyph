import {
	CheckmarkCircle02Icon,
	GitBranchIcon,
	InformationCircleIcon,
	Link01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import { getGitSyncPresentation } from "../../lib/gitSyncUi";
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
import { SettingsSelect } from "./SettingsSelect";

const DEFAULT_INCLUSIONS: GitSyncInclusionSettings = {
	include_templates: true,
	include_attachments: false,
	include_non_markdown_files: false,
};

const GIT_SYNC_INTERVAL_VALUES = ["5", "10", "30", "60"] as const;
const CONFLICT_POLICY_VALUES = [
	"local_wins",
	"remote_wins",
] as const satisfies readonly GitSyncConflictPolicy[];

export function GitSettingsPane() {
	const { t } = useTranslation("settings");
	const [status, setStatus] = useState<GitSyncStatus | null>(null);
	const [config, setConfig] = useState<GitSyncConfig | null>(null);
	const [attachmentStorageMode, setAttachmentStorageMode] =
		useState<AttachmentStorageMode>("note-folder");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
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
	const repoStateLabel = useMemo(() => {
		if (!status?.git_installed) return t("git.repoState.gitNotInstalled");
		if (status.unsupported_parent_repo)
			return t("git.repoState.nestedUnsupported");
		if (status.configured || status.repo_detected)
			return t("git.repoState.repoDetected");
		return t("git.repoState.noRepoAtRoot");
	}, [status, t]);
	const connectionHelp = useMemo(() => {
		if (!status?.git_installed) return t("git.connectionHelp.installGit");
		if (status.unsupported_parent_repo)
			return t("git.connectionHelp.nestedRepo");
		if (config) return t("git.connectionHelp.configured");
		if (status.repo_detected) return t("git.connectionHelp.needsRemote");
		return t("git.connectionHelp.default");
	}, [config, status, t]);
	const presentation = useMemo(() => getGitSyncPresentation(status), [status]);
	const syncHeadline = useMemo(() => {
		if (presentation.tone === "syncing" && status?.message)
			return status.message;
		const headlineKeyByText: Record<string, string> = {
			"Git Sync unavailable": "git.presentation.unavailable",
			"Install Git to enable sync": "git.presentation.installGitHeadline",
			"This space sits inside another repo":
				"git.presentation.unsupportedHeadline",
			"Auto sync is paused": "git.presentation.pausedHeadline",
			"Git Sync needs attention": "git.presentation.attentionHeadline",
			"Git Sync is ready": "git.presentation.readyHeadline",
			"Manual sync only": "git.presentation.manualHeadline",
			"Repository detected, but not ready to sync":
				"git.presentation.repoFoundHeadline",
		};
		const key = headlineKeyByText[presentation.headline];
		return key ? t(key) : presentation.headline;
	}, [presentation.headline, presentation.tone, status?.message, t]);
	const attachmentFilteringHelp =
		attachmentStorageMode === "specific-folder"
			? t("git.content.includeAttachmentsSpecific")
			: t("git.content.includeAttachmentsOther");

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}
			<div className="settingsGrid">
				<SettingsSection
					title={t("git.connection.title")}
					description={t("git.connection.description")}
				>
					<SettingsRow
						label={t("git.connection.availability")}
						description={t("git.connection.availabilityDescription")}
						stacked
						interactive={false}
					>
						<SettingsValueCard
							icon={
								<HugeiconsIcon
									icon={CheckmarkCircle02Icon}
									size="var(--icon-md)"
									strokeWidth={0.9}
								/>
							}
							value={
								status?.git_installed
									? t("git.connection.installed")
									: t("git.connection.missing")
							}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("git.connection.repoState")}
						description={t("git.connection.repoStateDescription")}
						stacked
						interactive={false}
					>
						<SettingsValueCard
							icon={
								<HugeiconsIcon
									icon={InformationCircleIcon}
									size="var(--icon-md)"
									strokeWidth={0.9}
								/>
							}
							value={repoStateLabel}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("git.connection.howItWorks")}
						description={connectionHelp}
						stacked
						interactive={false}
					>
						<SettingsValueCard
							icon={
								<HugeiconsIcon
									icon={Link01Icon}
									size="var(--icon-md)"
									strokeWidth={0.9}
								/>
							}
							value={config?.remote_url ?? t("git.connection.openGitFolder")}
							mono={Boolean(config?.remote_url)}
						/>
					</SettingsRow>
					{config ? (
						<SettingsRow
							label={t("git.connection.branch")}
							description={t("git.connection.branchDescription")}
							stacked
							interactive={false}
						>
							<SettingsValueCard
								icon={
									<HugeiconsIcon
										icon={GitBranchIcon}
										size="var(--icon-md)"
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
					title={t("git.sync.title")}
					description={t("git.sync.description")}
					className={!gitEnabledForSpace ? "settingsSectionMuted" : undefined}
				>
					<SettingsRow
						label={t("git.sync.automatic")}
						description={t("git.sync.automaticDescription")}
					>
						<SettingsToggle
							ariaLabel={t("git.sync.automatic")}
							checked={config?.enabled ?? false}
							disabled={!gitEnabledForSpace || busy}
							onCheckedChange={(checked) => {
								void updatePatch({ enabled: checked });
							}}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("git.sync.interval")}
						description={t("git.sync.intervalDescription")}
					>
						<SettingsSelect
							aria-label={t("git.sync.intervalAriaLabel")}
							value={String(config?.interval_minutes ?? 10)}
							disabled={!gitEnabledForSpace || busy}
							onChange={(event) => {
								void updatePatch({
									interval_minutes: Number(event.currentTarget.value),
								});
							}}
						>
							{GIT_SYNC_INTERVAL_VALUES.map((value) => (
								<option key={value} value={value}>
									{t(`git.sync.intervals.${value}`)}
								</option>
							))}
						</SettingsSelect>
					</SettingsRow>
					<SettingsRow
						label={t("git.sync.actions")}
						description={t("git.sync.actionsDescription")}
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
								{t("git.sync.syncNow")}
							</Button>
							<div className="settingsHelp gitSettingsInlineStatus">
								{syncHeadline}
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
									{t("git.sync.resumeAutoSync")}
								</Button>
							) : null}
						</div>
						{presentation.issueText ? (
							<div className="settingsError">{presentation.issueText}</div>
						) : null}
					</SettingsRow>
				</SettingsSection>

				<SettingsSection
					title={t("git.conflicts.title")}
					description={t("git.conflicts.description")}
					className={!gitEnabledForSpace ? "settingsSectionMuted" : undefined}
				>
					<SettingsRow
						label={t("git.conflicts.policy")}
						description={t("git.conflicts.policyDescription")}
					>
						<SettingsSelect
							aria-label={t("git.conflicts.policyAriaLabel")}
							value={config?.conflict_policy ?? "local_wins"}
							disabled={!gitEnabledForSpace || busy}
							onChange={(event) => {
								void updatePatch({
									conflict_policy: event.currentTarget
										.value as GitSyncConflictPolicy,
								});
							}}
						>
							{CONFLICT_POLICY_VALUES.map((value) => (
								<option key={value} value={value}>
									{t(
										`git.conflicts.${value === "local_wins" ? "localWins" : "remoteWins"}`,
									)}
								</option>
							))}
						</SettingsSelect>
					</SettingsRow>
				</SettingsSection>

				<SettingsSection
					title={t("git.content.title")}
					description={t("git.content.description")}
					className={!gitEnabledForSpace ? "settingsSectionMuted" : undefined}
				>
					<SettingsRow
						label={t("git.content.includeTemplates")}
						description={t("git.content.includeTemplatesDescription")}
					>
						<SettingsToggle
							ariaLabel={t("git.content.includeTemplates")}
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
						label={t("git.content.includeAttachments")}
						description={attachmentFilteringHelp}
					>
						<SettingsToggle
							ariaLabel={t("git.content.includeAttachments")}
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
						label={t("git.content.includeNonMarkdown")}
						description={t("git.content.includeNonMarkdownDescription")}
					>
						<SettingsToggle
							ariaLabel={t("git.content.includeNonMarkdown")}
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
