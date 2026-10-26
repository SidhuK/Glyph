import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	CheckmarkCircle02Icon,
	CloudIcon,
	GitBranchIcon,
	InformationCircleIcon,
	LaptopIcon,
	Link01Icon,
} from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGitSyncContext } from "../../contexts/GitSyncContext";
import { ATTACHMENT_LOCATION_OPTIONS } from "../../lib/attachmentStorage";
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
import { SelectIcon } from "../ui/shadcn/select";
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

const GIT_SYNC_INTERVAL_MINUTES: readonly number[] = [5, 10, 30, 60];

const CONFLICT_POLICY_ICONS = {
	local_wins: LaptopIcon,
	remote_wins: CloudIcon,
} as const satisfies Record<GitSyncConflictPolicy, unknown>;

const CONFLICT_POLICIES = [
	"local_wins",
	"remote_wins",
] as const satisfies readonly GitSyncConflictPolicy[];

export function GitSettingsPane() {
	const gitSync = useGitSyncContext();
	const { t } = useTranslation();
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
			prompt_for_commit_message?: boolean;
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
			const nextStatus = await gitSync.syncNow();
			if (nextStatus) setStatus(nextStatus);
		} catch (cause) {
			setError(extractErrorMessage(cause));
		} finally {
			setBusy(false);
		}
	}, [gitSync]);

	const inclusions = config?.inclusions ?? DEFAULT_INCLUSIONS;
	const intervalMinutes = config?.interval_minutes ?? 10;
	// The backend accepts any interval from 1 to 1440, so keep a custom one listed and labelled.
	const intervalChoices = GIT_SYNC_INTERVAL_MINUTES.includes(intervalMinutes)
		? GIT_SYNC_INTERVAL_MINUTES
		: [...GIT_SYNC_INTERVAL_MINUTES, intervalMinutes].sort((a, b) => a - b);
	const gitEnabledForSpace =
		Boolean(config) && !status?.unsupported_parent_repo && status?.repo_detected;
	const repoStateLabel = useMemo(() => getGitSyncRepoStateLabel(status), [status]);
	const connectionHelp = useMemo(
		() => getGitSyncConnectionHelp(status, Boolean(config)),
		[config, status],
	);
	const presentation = useMemo(() => getGitSyncPresentation(status), [status]);
	const specificFolderModeLabel =
		ATTACHMENT_LOCATION_OPTIONS.find((option) => option.value === "specific-folder")?.label ??
		"One folder for all attachments";
	const attachmentFilteringHelp =
		attachmentStorageMode === "specific-folder"
			? "Sync files from the configured attachments folder."
			: `Attachment-only filtering works only when attachments use ${specificFolderModeLabel}. In other modes, attachment files follow the Include non-markdown files option.`;

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
							icon={<HugeiconsIcon icon={CheckmarkCircle02Icon} size="var(--icon-md)" />}
							value={status?.git_installed ? "Installed" : "Missing"}
						/>
					</SettingsRow>
					<SettingsRow
						label="Repository state"
						description="Glyph only supports repositories rooted exactly at the current space."
						stacked
						interactive={false}
					>
						<SettingsValueCard
							icon={<HugeiconsIcon icon={InformationCircleIcon} size="var(--icon-md)" />}
							value={repoStateLabel}
						/>
					</SettingsRow>
					<SettingsRow label="Remote" description={connectionHelp} stacked interactive={false}>
						<SettingsValueCard
							icon={<HugeiconsIcon icon={Link01Icon} size="var(--icon-md)" />}
							value={config?.remote_url ?? "Open a folder that already has Git initialized."}
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
								icon={<HugeiconsIcon icon={GitBranchIcon} size="var(--icon-md)" />}
								value={config.branch}
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
						label={t("gitSync.manualCommitMessages")}
						description={t("gitSync.manualCommitMessagesDescription")}
					>
						<SettingsToggle
							ariaLabel={t("gitSync.manualCommitMessages")}
							checked={config?.prompt_for_commit_message ?? false}
							disabled={!gitEnabledForSpace || busy}
							onCheckedChange={(checked) => {
								void updatePatch({ prompt_for_commit_message: checked });
							}}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("gitSync.interval.label")}
						description={t("gitSync.interval.description")}
					>
						<SettingsSelect
							aria-label={t("gitSync.interval.ariaLabel")}
							value={intervalMinutes}
							disabled={!gitEnabledForSpace || busy}
							options={intervalChoices.map((minutes) => ({
								value: minutes,
								label: t("gitSync.interval.minutes", { count: minutes }),
							}))}
							onValueChange={(minutes) => {
								void updatePatch({ interval_minutes: minutes });
							}}
						/>
					</SettingsRow>
					<SettingsRow label="Actions" description={presentation.headline} interactive={false}>
						<div className="settingsActions">
							{presentation.showResume ? (
								<Button
									type="button"
									variant="ghost"
									onClick={() => {
										void updatePatch({ paused: false, enabled: true });
									}}
									disabled={busy}
								>
									Resume auto sync
								</Button>
							) : null}
							<Button
								type="button"
								variant="outline"
								onClick={() => void handleSyncNow()}
								disabled={!gitEnabledForSpace || busy || !presentation.canSyncNow}
							>
								{t("gitSync.sync")}
							</Button>
						</div>
					</SettingsRow>
					{presentation.issueText ? (
						<div className="settingsError">{presentation.issueText}</div>
					) : null}
				</SettingsSection>

				<SettingsSection
					title={t("gitSync.conflict.sectionTitle")}
					description={t("gitSync.conflict.sectionDescription")}
					className={!gitEnabledForSpace ? "settingsSectionMuted" : undefined}
				>
					<SettingsRow
						label={t("gitSync.conflict.label")}
						description={t("gitSync.conflict.description")}
					>
						<SettingsSelect
							aria-label={t("gitSync.conflict.ariaLabel")}
							value={config?.conflict_policy ?? "local_wins"}
							disabled={!gitEnabledForSpace || busy}
							options={CONFLICT_POLICIES.map((policy) => ({
								value: policy,
								label: t(`gitSync.conflict.options.${policy}`),
								icon: <SelectIcon icon={CONFLICT_POLICY_ICONS[policy]} />,
							}))}
							onValueChange={(policy) => {
								void updatePatch({ conflict_policy: policy });
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
					<SettingsRow label="Include attachments" description={attachmentFilteringHelp}>
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
