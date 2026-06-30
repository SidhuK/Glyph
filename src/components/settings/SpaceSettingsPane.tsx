import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	type AttachmentStorageMode,
	DEFAULT_QUICK_NOTES_FOLDER,
	loadSettings,
	setDailyNotesFolder,
	setEditorAttachmentFolder,
	setEditorAttachmentStorageMode,
	setQuickNotesFolder,
} from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { Trash2 } from "../Icons";
import { FolderOpen } from "../Icons/NavigationIcons";
import { Button } from "../ui/shadcn/button";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";
import { SettingsSelect } from "./SettingsSelect";
import { TemplateSettingsSections } from "./TemplatesSettingsPane";

const DEFAULT_ATTACHMENT_FOLDER = "assets";
const ATTACHMENT_LOCATION_VALUES = [
	"space-root",
	"specific-folder",
	"note-folder",
] as const satisfies readonly AttachmentStorageMode[];

interface SpaceFolderSelection {
	relativePath: string;
	spacePath: string;
}

async function selectFolderRelativeToSpace(): Promise<SpaceFolderSelection | null> {
	const { open } = await import("@tauri-apps/plugin-dialog");
	const selected = await open({
		directory: true,
		multiple: false,
	});
	if (!selected || typeof selected !== "string") {
		return null;
	}

	const currentSpace = await invoke("space_get_current");
	if (!currentSpace) {
		throw new Error("No space is currently open.");
	}

	const normSelected = selected.replace(/\\/g, "/");
	const normSpace = currentSpace.replace(/\\/g, "/");
	const spacePrefix = normSpace.endsWith("/") ? normSpace : `${normSpace}/`;
	const selectedLower = normSelected.toLowerCase();
	const spaceLower = normSpace.toLowerCase();

	if (
		selectedLower !== spaceLower &&
		!selectedLower.startsWith(spacePrefix.toLowerCase())
	) {
		throw new Error("Selected folder must be inside the current space.");
	}

	return {
		relativePath: normSelected.slice(normSpace.length).replace(/^\/+/, ""),
		spacePath: currentSpace,
	};
}

function requireSpacePath(spacePath: string | null): string {
	if (!spacePath) {
		throw new Error("No space is currently open.");
	}
	return spacePath;
}

export function SpaceSettingsPane() {
	const { t } = useTranslation("settings");
	const [currentSpacePath, setCurrentSpacePath] = useState<string | null>(null);
	const [dailyNotesFolder, setDailyNotesFolderState] = useState<string | null>(
		null,
	);
	const [dailyNotesError, setDailyNotesError] = useState<string | null>(null);
	const [attachmentStorageMode, setAttachmentStorageModeState] =
		useState<AttachmentStorageMode>("note-folder");
	const [attachmentFolder, setAttachmentFolderState] = useState(
		DEFAULT_ATTACHMENT_FOLDER,
	);
	const [attachmentError, setAttachmentError] = useState<string | null>(null);
	const [quickNotesFolder, setQuickNotesFolderState] = useState(
		DEFAULT_QUICK_NOTES_FOLDER,
	);
	const [quickNotesError, setQuickNotesError] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [reindexStatus, setReindexStatus] = useState("");
	const [isIndexing, setIsIndexing] = useState(false);

	const onRebuildIndex = useCallback(async () => {
		if (!currentSpacePath) {
			setReindexStatus(t("space.searchIndex.openSpaceFirst"));
			return;
		}
		setReindexStatus("");
		try {
			setIsIndexing(true);
			await invoke("index_rebuild");
			setReindexStatus(t("space.searchIndex.rebuildComplete"));
		} catch (e) {
			setReindexStatus(extractErrorMessage(e));
		} finally {
			setIsIndexing(false);
		}
	}, [currentSpacePath, t]);

	const refresh = useCallback(async () => {
		setError("");
		try {
			const currentSpace = await invoke("space_get_current");
			const settingsScope = { spacePath: currentSpace };
			const settings = await loadSettings(settingsScope);
			setCurrentSpacePath(currentSpace);
			setDailyNotesFolderState(settings.dailyNotes.folder);
			setQuickNotesFolderState(settings.quickNotes.folder);
			setAttachmentStorageModeState(settings.editor.attachmentStorageMode);
			setAttachmentFolderState(
				settings.editor.attachmentFolder ?? DEFAULT_ATTACHMENT_FOLDER,
			);
		} catch (e) {
			setError(extractErrorMessage(e));
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const handleBrowseFolder = useCallback(async () => {
		setDailyNotesError(null);
		try {
			const selection = await selectFolderRelativeToSpace();
			if (selection === null) return;
			await setDailyNotesFolder(selection.relativePath || null, {
				spacePath: selection.spacePath,
			});
			setCurrentSpacePath(selection.spacePath);
			setDailyNotesFolderState(selection.relativePath || null);
		} catch (cause) {
			setDailyNotesError(
				cause instanceof Error ? cause.message : t("space.errors.selectFolder"),
			);
		}
	}, [t]);

	const handleClearFolder = useCallback(async () => {
		setDailyNotesError(null);
		try {
			const spacePath = requireSpacePath(currentSpacePath);
			await setDailyNotesFolder(null, { spacePath });
			setDailyNotesFolderState(null);
		} catch (cause) {
			setDailyNotesError(
				cause instanceof Error ? cause.message : t("space.errors.clearFolder"),
			);
		}
	}, [currentSpacePath, t]);

	const handleAttachmentModeChange = useCallback(
		async (nextMode: AttachmentStorageMode) => {
			setAttachmentError(null);
			try {
				const spacePath = requireSpacePath(currentSpacePath);
				await setEditorAttachmentStorageMode(nextMode, { spacePath });
				setAttachmentStorageModeState(nextMode);
				if (nextMode === "specific-folder" && !attachmentFolder) {
					await setEditorAttachmentFolder(DEFAULT_ATTACHMENT_FOLDER, {
						spacePath,
					});
					setAttachmentFolderState(DEFAULT_ATTACHMENT_FOLDER);
				}
			} catch (cause) {
				setAttachmentError(
					cause instanceof Error
						? cause.message
						: t("space.errors.updateSetting"),
				);
			}
		},
		[attachmentFolder, currentSpacePath, t],
	);

	const handleBrowseAttachmentFolder = useCallback(async () => {
		setAttachmentError(null);
		try {
			const selection = await selectFolderRelativeToSpace();
			if (selection === null) return;
			await setEditorAttachmentFolder(selection.relativePath, {
				spacePath: selection.spacePath,
			});
			setCurrentSpacePath(selection.spacePath);
			setAttachmentFolderState(
				selection.relativePath || DEFAULT_ATTACHMENT_FOLDER,
			);
		} catch (cause) {
			setAttachmentError(
				cause instanceof Error ? cause.message : t("space.errors.selectFolder"),
			);
		}
	}, [t]);

	const handleResetAttachmentFolder = useCallback(async () => {
		setAttachmentError(null);
		try {
			const spacePath = requireSpacePath(currentSpacePath);
			await setEditorAttachmentFolder(DEFAULT_ATTACHMENT_FOLDER, { spacePath });
			setAttachmentFolderState(DEFAULT_ATTACHMENT_FOLDER);
		} catch (cause) {
			setAttachmentError(
				cause instanceof Error ? cause.message : t("space.errors.resetFolder"),
			);
		}
	}, [currentSpacePath, t]);

	const handleBrowseQuickNotesFolder = useCallback(async () => {
		setQuickNotesError(null);
		try {
			const selection = await selectFolderRelativeToSpace();
			if (selection === null) return;
			await setQuickNotesFolder(
				selection.relativePath || DEFAULT_QUICK_NOTES_FOLDER,
				{ spacePath: selection.spacePath },
			);
			setCurrentSpacePath(selection.spacePath);
			setQuickNotesFolderState(
				selection.relativePath || DEFAULT_QUICK_NOTES_FOLDER,
			);
		} catch (cause) {
			setQuickNotesError(
				cause instanceof Error
					? cause.message
					: t("space.errors.selectQuickNotesFolder"),
			);
		}
	}, [t]);

	const handleResetQuickNotesFolder = useCallback(async () => {
		setQuickNotesError(null);
		try {
			const spacePath = requireSpacePath(currentSpacePath);
			await setQuickNotesFolder(DEFAULT_QUICK_NOTES_FOLDER, { spacePath });
			setQuickNotesFolderState(DEFAULT_QUICK_NOTES_FOLDER);
		} catch (cause) {
			setQuickNotesError(
				cause instanceof Error
					? cause.message
					: t("space.errors.resetQuickNotesFolder"),
			);
		}
	}, [currentSpacePath, t]);

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsGrid">
				<SettingsSection
					title={t("space.dailyNotes.title")}
					description={t("space.dailyNotes.description")}
				>
					<SettingsRow
						label={t("common.folder")}
						description={t("space.dailyNotes.folderDescription")}
						stacked
						interactive={false}
					>
						<div className="dailyNotesFolderField">
							<div className="dailyNotesFolderRow">
								<div className="dailyNotesFolderPath">
									{dailyNotesFolder ?? t("common.notConfigured")}
								</div>
								<div className="settingsActions dailyNotesActions">
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="min-w-24 rounded-md border-border bg-background justify-center shadow-none"
										onClick={handleBrowseFolder}
									>
										<FolderOpen size="var(--icon-md)" />
										{t("common.browse")}
									</Button>
									{dailyNotesFolder ? (
										<Button
											type="button"
											variant="outline"
											size="icon-sm"
											className="rounded-md border-border bg-background justify-center shadow-none"
											onClick={handleClearFolder}
											aria-label={t("space.dailyNotes.clearFolder")}
											title={t("space.dailyNotes.clearFolder")}
										>
											<Trash2 size="var(--icon-md)" />
										</Button>
									) : null}
								</div>
							</div>
							{dailyNotesError ? (
								<div className="settingsError dailyNotesError">
									{dailyNotesError}
								</div>
							) : null}
						</div>
					</SettingsRow>
				</SettingsSection>

				<SettingsSection title={t("space.quickNotes.title")}>
					<SettingsRow
						label={t("common.folder")}
						description={t("space.quickNotes.folderDescription")}
						stacked
						interactive={false}
					>
						<div className="dailyNotesFolderField">
							<div className="dailyNotesFolderRow">
								<div className="dailyNotesFolderPath">{quickNotesFolder}</div>
								<div className="settingsActions dailyNotesActions">
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="min-w-24 rounded-md border-border bg-background justify-center shadow-none"
										onClick={() => void handleBrowseQuickNotesFolder()}
									>
										<FolderOpen size="var(--icon-md)" />
										{t("common.browse")}
									</Button>
									<Button
										type="button"
										variant="outline"
										size="icon-sm"
										className="rounded-md border-border bg-background justify-center shadow-none"
										onClick={() => void handleResetQuickNotesFolder()}
										aria-label={t("space.quickNotes.resetFolder")}
										title={t("space.quickNotes.resetFolder")}
									>
										<Trash2 size="var(--icon-md)" />
									</Button>
								</div>
							</div>
							{quickNotesError ? (
								<div className="settingsError dailyNotesError">
									{quickNotesError}
								</div>
							) : null}
						</div>
					</SettingsRow>
				</SettingsSection>

				<SettingsSection
					title={t("space.attachments.title")}
					description={t("space.attachments.description")}
				>
					<SettingsRow
						label={t("space.attachments.location")}
						description={t("space.attachments.locationDescription")}
						stacked
						interactive={false}
					>
						<div className="dailyNotesFolderField">
							<SettingsSelect
								aria-label={t("space.attachments.locationAriaLabel")}
								value={attachmentStorageMode}
								onChange={(event) => {
									void handleAttachmentModeChange(
										event.target.value as AttachmentStorageMode,
									);
								}}
							>
								{ATTACHMENT_LOCATION_VALUES.map((value) => (
									<option key={value} value={value}>
										{t(
											`space.attachments.modes.${value === "space-root" ? "spaceRoot" : value === "specific-folder" ? "specificFolder" : "noteFolder"}`,
										)}
									</option>
								))}
							</SettingsSelect>
							<div className="settingsHelp">
								{attachmentStorageMode === "space-root"
									? t("space.attachments.helpSpaceRoot")
									: attachmentStorageMode === "note-folder"
										? t("space.attachments.helpNoteFolder")
										: t("space.attachments.helpSpecificFolder")}
							</div>
							{attachmentStorageMode === "specific-folder" ? (
								<div className="dailyNotesFolderRow">
									<div className="dailyNotesFolderPath">
										{attachmentFolder || DEFAULT_ATTACHMENT_FOLDER}
									</div>
									<div className="settingsActions dailyNotesActions">
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="min-w-24 rounded-md border-border bg-background justify-center shadow-none"
											onClick={handleBrowseAttachmentFolder}
										>
											<FolderOpen size="var(--icon-md)" />
											{t("common.browse")}
										</Button>
										<Button
											type="button"
											variant="outline"
											size="icon-sm"
											className="rounded-md border-border bg-background justify-center shadow-none"
											onClick={handleResetAttachmentFolder}
											aria-label={t("space.attachments.resetFolder")}
											title={t("space.attachments.resetFolder")}
										>
											<Trash2 size="var(--icon-md)" />
										</Button>
									</div>
								</div>
							) : null}
							{attachmentError ? (
								<div className="settingsError dailyNotesError">
									{attachmentError}
								</div>
							) : null}
						</div>
					</SettingsRow>
				</SettingsSection>

				<TemplateSettingsSections />

				<SettingsSection
					title={t("space.searchIndex.title")}
					description={t("space.searchIndex.description")}
				>
					<SettingsRow
						label={t("common.status")}
						description={t("space.searchIndex.statusDescription")}
						stacked
						interactive={false}
					>
						<div className="dailyNotesFolderRow">
							<div className="dailyNotesFolderPath">
								{reindexStatus ||
									(!currentSpacePath
										? t("space.searchIndex.noSpace")
										: t("space.searchIndex.ready"))}
							</div>
							<div className="settingsActions dailyNotesActions">
								<Button
									type="button"
									size="sm"
									className="min-w-24 rounded-md border-border bg-background justify-center shadow-none"
									onClick={() => {
										void onRebuildIndex();
									}}
									disabled={!currentSpacePath || isIndexing}
								>
									{isIndexing
										? t("space.searchIndex.rebuilding")
										: t("space.searchIndex.rebuild")}
								</Button>
							</div>
						</div>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
