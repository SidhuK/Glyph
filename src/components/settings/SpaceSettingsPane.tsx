import { Folder01Icon, FolderTreeIcon, Home01Icon, NoteIcon } from "@hugeicons/core-free-icons";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSpace, useUILayoutContext } from "../../contexts";
import {
	ATTACHMENT_LOCATION_OPTIONS,
	ATTACHMENT_MODE_UI,
	DEFAULT_ATTACHMENT_FOLDER,
	modeRequiresAttachmentFolder,
	modesUseDifferentFolderSemantics,
} from "../../lib/attachmentStorage";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	DEFAULT_PERIOD_NOTES_ENABLED,
	OPTIONAL_PERIOD_KINDS,
	type OptionalPeriodKind,
	periodNotesEnabledFromSettings,
} from "../../lib/periodNotes";
import {
	type AttachmentStorageMode,
	DEFAULT_QUICK_NOTES_FOLDER,
	loadSettings,
	writeSpaceSetting,
} from "../../lib/settings";
import { DURABLE_SETTINGS, SPACE_SETTINGS } from "../../lib/settings/definitions";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { normalizeRelPath, validateRelFolderPath } from "../../utils/path";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";
import { SelectIcon } from "../ui/shadcn/select";
import { SettingsFolderPicker } from "./SettingsFolderPicker";
import { SettingsRow, SettingsSection, SettingsToggle } from "./SettingsScaffold";
import { SettingsSelect } from "./SettingsSelect";
import { TemplateSettingsSections } from "./TemplatesSettingsPane";
import { requireSpacePath, selectFolderRelativeToSpace } from "./spaceFolderSelection";

const ATTACHMENT_SUBFOLDER_ERROR_ID = "attachmentSubfolderError";

const ATTACHMENT_LOCATION_ICONS = {
	"space-root": Home01Icon,
	"specific-folder": Folder01Icon,
	"note-folder": NoteIcon,
	"note-subfolder": FolderTreeIcon,
} as const satisfies Record<AttachmentStorageMode, unknown>;

const PERIOD_NOTE_TOGGLE_SETTINGS = {
	week: SPACE_SETTINGS.dailyNotesWeeklyNotes,
	month: SPACE_SETTINGS.dailyNotesMonthlyNotes,
	quarter: SPACE_SETTINGS.dailyNotesQuarterlyNotes,
} as const;

const PERIOD_NOTE_SEARCH_IDS = {
	week: "space-weekly-notes",
	month: "space-monthly-notes",
	quarter: "space-quarterly-notes",
} as const;

export function SpaceSettingsPane() {
	const { t } = useTranslation("settings.general");
	const [currentSpacePath, setCurrentSpacePath] = useState<string | null>(null);
	const [dailyNotesFolder, setDailyNotesFolderState] = useState<string | null>(null);
	const [dailyNotesError, setDailyNotesError] = useState<string | null>(null);
	const [defaultNewNoteFolder, setDefaultNewNoteFolder] = useState<string | null>(null);
	const [defaultNewNoteError, setDefaultNewNoteError] = useState<string | null>(null);
	const [periodNotesError, setPeriodNotesError] = useState<string | null>(null);
	const [periodNotesEnabled, setPeriodNotesEnabled] = useState(DEFAULT_PERIOD_NOTES_ENABLED);
	const [attachmentStorageMode, setAttachmentStorageModeState] =
		useState<AttachmentStorageMode>("note-folder");
	const [attachmentFolder, setAttachmentFolderState] = useState(DEFAULT_ATTACHMENT_FOLDER);
	const [attachmentError, setAttachmentError] = useState<string | null>(null);
	const [quickNotesFolder, setQuickNotesFolderState] = useState(DEFAULT_QUICK_NOTES_FOLDER);
	const [quickNotesError, setQuickNotesError] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [reindexStatus, setReindexStatus] = useState("");
	const [isIndexing, setIsIndexing] = useState(false);
	const [enablePeopleMentionsAsTags, setEnablePeopleMentionsAsTags] = useState(false);
	const [isSavingPeopleMentions, setIsSavingPeopleMentions] = useState(false);
	const { spacePath, startIndexRebuild } = useSpace();
	const { archiveEnabled, settingsSpacePath } = useUILayoutContext();
	const archiveSetting = useMutation({
		mutationFn: (enabled: boolean) =>
			writeSpaceSetting(SPACE_SETTINGS.archiveEnabled, enabled, {
				spacePath: requireSpacePath(spacePath),
			}),
	});

	const onRebuildIndex = useCallback(async () => {
		if (!currentSpacePath) {
			setReindexStatus("Open a space first to rebuild the index.");
			return;
		}
		setReindexStatus("");
		try {
			setIsIndexing(true);
			await invoke("index_rebuild");
			setReindexStatus("Index rebuild completed.");
		} catch (e) {
			setReindexStatus(extractErrorMessage(e));
		} finally {
			setIsIndexing(false);
		}
	}, [currentSpacePath]);

	const refresh = useCallback(
		async (isCurrent: () => boolean) => {
			setError("");
			try {
				const currentSpace = spacePath ?? (await invoke("space_get_current"));
				const settingsScope = { spacePath: currentSpace };
				const settings = await loadSettings(settingsScope);
				if (!isCurrent()) return;
				setCurrentSpacePath(currentSpace);
				setDailyNotesFolderState(settings.dailyNotes.folder);
				setDefaultNewNoteFolder(settings.noteCreation?.defaultFolder ?? null);
				setPeriodNotesEnabled(periodNotesEnabledFromSettings(settings.dailyNotes));
				setQuickNotesFolderState(settings.quickNotes.folder);
				setAttachmentStorageModeState(settings.editor.attachmentStorageMode);
				setAttachmentFolderState(settings.editor.attachmentFolder ?? DEFAULT_ATTACHMENT_FOLDER);
				setEnablePeopleMentionsAsTags(settings.editor.enablePeopleMentionsAsTags);
			} catch (e) {
				if (!isCurrent()) return;
				setError(extractErrorMessage(e));
			}
		},
		[spacePath],
	);

	useEffect(() => {
		let cancelled = false;
		void refresh(() => !cancelled);
		return () => {
			cancelled = true;
		};
	}, [refresh]);

	useTauriEvent("settings:updated", (payload) => {
		if (payload.spacePath && payload.spacePath !== spacePath) return;
		if (payload.noteCreation && "defaultFolder" in payload.noteCreation) {
			setDefaultNewNoteFolder(payload.noteCreation.defaultFolder ?? null);
		}
		if (typeof payload.editor?.enablePeopleMentionsAsTags === "boolean") {
			setEnablePeopleMentionsAsTags(payload.editor.enablePeopleMentionsAsTags);
		}
	});

	const handlePeopleMentionsChange = useCallback(
		(checked: boolean) => {
			const previous = enablePeopleMentionsAsTags;
			setError("");
			setIsSavingPeopleMentions(true);
			void (async () => {
				await invoke("index_set_people_mentions_as_tags_enabled", {
					enabled: checked,
				});
				if (currentSpacePath) await startIndexRebuild();
				await DURABLE_SETTINGS.editorEnablePeopleMentionsAsTags.write(checked);
				setEnablePeopleMentionsAsTags(checked);
			})()
				.catch((cause) => {
					setEnablePeopleMentionsAsTags(previous);
					void invoke("index_set_people_mentions_as_tags_enabled", {
						enabled: previous,
					}).catch(() => undefined);
					setError(extractErrorMessage(cause));
				})
				.finally(() => setIsSavingPeopleMentions(false));
		},
		[currentSpacePath, enablePeopleMentionsAsTags, startIndexRebuild],
	);

	const handleBrowseFolder = useCallback(async () => {
		setDailyNotesError(null);
		try {
			const selection = await selectFolderRelativeToSpace();
			if (selection === null) return;
			await writeSpaceSetting(SPACE_SETTINGS.dailyNotesFolder, selection.relativePath || null, {
				spacePath: selection.spacePath,
			});
			setCurrentSpacePath(selection.spacePath);
			setDailyNotesFolderState(selection.relativePath || null);
		} catch (cause) {
			setDailyNotesError(cause instanceof Error ? cause.message : "Failed to select folder");
		}
	}, []);

	const handleClearFolder = useCallback(async () => {
		setDailyNotesError(null);
		try {
			const spacePath = requireSpacePath(currentSpacePath);
			await writeSpaceSetting(SPACE_SETTINGS.dailyNotesFolder, null, {
				spacePath,
			});
			setDailyNotesFolderState(null);
		} catch (cause) {
			setDailyNotesError(cause instanceof Error ? cause.message : "Failed to clear folder");
		}
	}, [currentSpacePath]);

	const handleBrowseDefaultNewNoteFolder = useCallback(async () => {
		setDefaultNewNoteError(null);
		try {
			const selection = await selectFolderRelativeToSpace();
			if (selection === null) return;
			await writeSpaceSetting(
				SPACE_SETTINGS.noteCreationDefaultFolder,
				selection.relativePath || null,
				{ spacePath: selection.spacePath },
			);
			setCurrentSpacePath(selection.spacePath);
			setDefaultNewNoteFolder(selection.relativePath || null);
		} catch (cause) {
			setDefaultNewNoteError(extractErrorMessage(cause));
		}
	}, []);

	const handleClearDefaultNewNoteFolder = useCallback(async () => {
		setDefaultNewNoteError(null);
		try {
			const activeSpacePath = requireSpacePath(spacePath);
			await writeSpaceSetting(SPACE_SETTINGS.noteCreationDefaultFolder, null, {
				spacePath: activeSpacePath,
			});
			setDefaultNewNoteFolder(null);
		} catch (cause) {
			setDefaultNewNoteError(extractErrorMessage(cause));
		}
	}, [spacePath]);

	const handlePeriodNoteToggle = useCallback(
		async (kind: OptionalPeriodKind, checked: boolean) => {
			setPeriodNotesError(null);
			try {
				const spacePath = requireSpacePath(currentSpacePath);
				await writeSpaceSetting(PERIOD_NOTE_TOGGLE_SETTINGS[kind], checked, {
					spacePath,
				});
				setPeriodNotesEnabled((current) => ({ ...current, [kind]: checked }));
			} catch (cause) {
				setPeriodNotesError(cause instanceof Error ? cause.message : t("periodNotes.updateFailed"));
			}
		},
		[currentSpacePath, t],
	);

	const handleAttachmentModeChange = useCallback(
		async (nextMode: AttachmentStorageMode) => {
			setAttachmentError(null);
			try {
				const spacePath = requireSpacePath(currentSpacePath);
				await writeSpaceSetting(SPACE_SETTINGS.attachmentStorageMode, nextMode, { spacePath });
				setAttachmentStorageModeState(nextMode);

				const shouldResetFolder =
					modesUseDifferentFolderSemantics(attachmentStorageMode, nextMode) ||
					(modeRequiresAttachmentFolder(nextMode) && !attachmentFolder);
				if (shouldResetFolder) {
					await writeSpaceSetting(SPACE_SETTINGS.attachmentFolder, DEFAULT_ATTACHMENT_FOLDER, {
						spacePath,
					});
					setAttachmentFolderState(DEFAULT_ATTACHMENT_FOLDER);
				}
			} catch (cause) {
				setAttachmentError(cause instanceof Error ? cause.message : "Failed to update setting");
			}
		},
		[attachmentFolder, attachmentStorageMode, currentSpacePath],
	);

	const handleAttachmentSubfolderBlur = useCallback(async () => {
		setAttachmentError(null);
		const validationError = validateRelFolderPath(attachmentFolder);
		if (validationError) {
			setAttachmentError(validationError);
			return;
		}
		const normalized = normalizeRelPath(attachmentFolder);
		try {
			const spacePath = requireSpacePath(currentSpacePath);
			await writeSpaceSetting(SPACE_SETTINGS.attachmentFolder, normalized, {
				spacePath,
			});
			setAttachmentFolderState(normalized);
		} catch (cause) {
			setAttachmentError(cause instanceof Error ? cause.message : "Failed to update subfolder");
		}
	}, [attachmentFolder, currentSpacePath]);

	const handleBrowseAttachmentFolder = useCallback(async () => {
		setAttachmentError(null);
		try {
			const selection = await selectFolderRelativeToSpace();
			if (selection === null) return;
			await writeSpaceSetting(SPACE_SETTINGS.attachmentFolder, selection.relativePath, {
				spacePath: selection.spacePath,
			});
			setCurrentSpacePath(selection.spacePath);
			setAttachmentFolderState(selection.relativePath || DEFAULT_ATTACHMENT_FOLDER);
		} catch (cause) {
			setAttachmentError(cause instanceof Error ? cause.message : "Failed to select folder");
		}
	}, []);

	const handleResetAttachmentFolder = useCallback(async () => {
		setAttachmentError(null);
		try {
			const spacePath = requireSpacePath(currentSpacePath);
			await writeSpaceSetting(SPACE_SETTINGS.attachmentFolder, DEFAULT_ATTACHMENT_FOLDER, {
				spacePath,
			});
			setAttachmentFolderState(DEFAULT_ATTACHMENT_FOLDER);
		} catch (cause) {
			setAttachmentError(cause instanceof Error ? cause.message : "Failed to reset folder");
		}
	}, [currentSpacePath]);

	const handleBrowseQuickNotesFolder = useCallback(async () => {
		setQuickNotesError(null);
		try {
			const selection = await selectFolderRelativeToSpace();
			if (selection === null) return;
			await writeSpaceSetting(
				SPACE_SETTINGS.quickNotesFolder,
				selection.relativePath || DEFAULT_QUICK_NOTES_FOLDER,
				{ spacePath: selection.spacePath },
			);
			setCurrentSpacePath(selection.spacePath);
			setQuickNotesFolderState(selection.relativePath || DEFAULT_QUICK_NOTES_FOLDER);
		} catch (cause) {
			setQuickNotesError(
				cause instanceof Error ? cause.message : "Failed to select quick notes folder",
			);
		}
	}, []);

	const handleResetQuickNotesFolder = useCallback(async () => {
		setQuickNotesError(null);
		try {
			const spacePath = requireSpacePath(currentSpacePath);
			await writeSpaceSetting(SPACE_SETTINGS.quickNotesFolder, DEFAULT_QUICK_NOTES_FOLDER, {
				spacePath,
			});
			setQuickNotesFolderState(DEFAULT_QUICK_NOTES_FOLDER);
		} catch (cause) {
			setQuickNotesError(
				cause instanceof Error ? cause.message : "Failed to reset quick notes folder",
			);
		}
	}, [currentSpacePath]);

	const attachmentFolderEditor = ATTACHMENT_MODE_UI[attachmentStorageMode].folderEditor;

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsGrid">
				<SettingsSection title={t("newNotes.sectionTitle")}>
					<SettingsRow
						searchId="space-default-new-note-folder"
						label={t("newNotes.defaultFolder.label")}
						description={t("newNotes.defaultFolder.description")}
						stacked
						interactive={false}
					>
						<SettingsFolderPicker
							path={defaultNewNoteFolder ?? t("newNotes.root")}
							empty={!defaultNewNoteFolder}
							browseLabel={t("newNotes.browse")}
							clearLabel={t("newNotes.clear")}
							onBrowse={() => void handleBrowseDefaultNewNoteFolder()}
							onClear={
								defaultNewNoteFolder ? () => void handleClearDefaultNewNoteFolder() : undefined
							}
							error={defaultNewNoteError}
						/>
					</SettingsRow>
				</SettingsSection>

				<SettingsSection title="Daily notes">
					<SettingsRow
						searchId="space-daily-notes-folder"
						label="Folder"
						description="Glyph stores dated notes relative to the active space."
						stacked
						interactive={false}
					>
						<SettingsFolderPicker
							path={dailyNotesFolder ?? "Not configured"}
							empty={!dailyNotesFolder}
							browseLabel="Browse"
							clearLabel="Clear daily notes folder"
							onBrowse={() => void handleBrowseFolder()}
							onClear={dailyNotesFolder ? () => void handleClearFolder() : undefined}
							error={dailyNotesError}
						/>
					</SettingsRow>
					{OPTIONAL_PERIOD_KINDS.map((kind) => (
						<SettingsRow
							key={kind}
							searchId={PERIOD_NOTE_SEARCH_IDS[kind]}
							label={t(`periodNotes.${kind}.label`)}
							description={t(`periodNotes.${kind}.description`)}
						>
							<SettingsToggle
								checked={periodNotesEnabled[kind]}
								ariaLabel={t(`periodNotes.${kind}.ariaLabel`)}
								onCheckedChange={(checked) => void handlePeriodNoteToggle(kind, checked)}
							/>
						</SettingsRow>
					))}
					{periodNotesError ? (
						<div className="settingsError dailyNotesError" role="alert">
							{periodNotesError}
						</div>
					) : null}
				</SettingsSection>

				<SettingsSection title={t("archive.sectionTitle")}>
					<SettingsRow searchId="space-archive-enabled" label={t("archive.enable")}>
						<SettingsToggle
							ariaLabel={t("archive.enable")}
							checked={settingsSpacePath === spacePath && archiveEnabled}
							disabled={!spacePath || settingsSpacePath !== spacePath || archiveSetting.isPending}
							onCheckedChange={(checked) => archiveSetting.mutate(checked)}
						/>
					</SettingsRow>
					{archiveSetting.error ? (
						<p className="settingsError" role="alert">
							{extractErrorMessage(archiveSetting.error)}
						</p>
					) : null}
				</SettingsSection>

				<TemplateSettingsSections />

				<SettingsSection title="Attachments">
					<SettingsRow
						label="Location"
						description={
							<>
								Where to save images and files you paste into notes.
								<br />
								{ATTACHMENT_MODE_UI[attachmentStorageMode].help}
							</>
						}
						stacked
						interactive={false}
					>
						<div className="dailyNotesFolderField">
							<SettingsSelect
								aria-label="Attachment location"
								value={attachmentStorageMode}
								options={ATTACHMENT_LOCATION_OPTIONS.map((option) => ({
									...option,
									icon: <SelectIcon icon={ATTACHMENT_LOCATION_ICONS[option.value]} />,
								}))}
								onValueChange={(nextMode) => void handleAttachmentModeChange(nextMode)}
							/>
							{attachmentFolderEditor === "browse" ? (
								<SettingsFolderPicker
									path={attachmentFolder || DEFAULT_ATTACHMENT_FOLDER}
									browseLabel="Browse"
									clearLabel="Reset attachments folder"
									clearText={t("folderPicker.reset")}
									onBrowse={() => void handleBrowseAttachmentFolder()}
									onClear={() => void handleResetAttachmentFolder()}
								/>
							) : null}
							{attachmentFolderEditor === "text" ? (
								<div
									className="dailyNotesFolderRow"
									data-invalid={attachmentError ? true : undefined}
								>
									<Input
										aria-label="Attachment subfolder name"
										aria-invalid={attachmentError ? true : undefined}
										aria-describedby={attachmentError ? ATTACHMENT_SUBFOLDER_ERROR_ID : undefined}
										value={attachmentFolder}
										placeholder={DEFAULT_ATTACHMENT_FOLDER}
										onChange={(event) => {
											setAttachmentError(null);
											setAttachmentFolderState(event.target.value);
										}}
										onBlur={() => {
											void handleAttachmentSubfolderBlur();
										}}
									/>
									<div className="settingsActions dailyNotesActions">
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => {
												void handleResetAttachmentFolder();
											}}
											aria-label="Reset attachment subfolder"
											title="Reset attachment subfolder"
										>
											{t("folderPicker.reset")}
										</Button>
									</div>
								</div>
							) : null}
							{attachmentError ? (
								<div
									id={attachmentFolderEditor === "text" ? ATTACHMENT_SUBFOLDER_ERROR_ID : undefined}
									className="settingsError dailyNotesError"
									role="alert"
								>
									{attachmentError}
								</div>
							) : null}
						</div>
					</SettingsRow>
				</SettingsSection>

				<SettingsSection title="Quick notes">
					<SettingsRow
						searchId="space-quick-notes-folder"
						label="Folder"
						description="New quick notes are added to today's note in this folder."
						stacked
						interactive={false}
					>
						<SettingsFolderPicker
							path={quickNotesFolder}
							browseLabel="Browse"
							clearLabel="Reset quick notes folder"
							clearText={t("folderPicker.reset")}
							onBrowse={() => void handleBrowseQuickNotesFolder()}
							onClear={() => void handleResetQuickNotesFolder()}
							error={quickNotesError}
						/>
					</SettingsRow>
				</SettingsSection>

				<SettingsSection title="Search index">
					<SettingsRow
						searchId="space-search-index-status"
						label="Status"
						description="Use this when search results look outdated after large note or file changes."
						stacked
						interactive={false}
					>
						<div className="dailyNotesFolderRow">
							<div className="dailyNotesFolderPath">
								{reindexStatus || (!currentSpacePath ? "No space selected." : "Index is ready.")}
							</div>
							<div className="settingsActions dailyNotesActions">
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => {
										void onRebuildIndex();
									}}
									disabled={!currentSpacePath || isIndexing}
								>
									{isIndexing ? "Rebuilding…" : "Rebuild"}
								</Button>
							</div>
						</div>
					</SettingsRow>
					<SettingsRow
						searchId="space-search-index-people-tags"
						label="People mentions as tags"
						description="When enabled, standalone @mentions are indexed and shown as people in the sidebar and search."
					>
						<SettingsToggle
							checked={enablePeopleMentionsAsTags}
							disabled={isSavingPeopleMentions}
							ariaLabel="People mentions as tags"
							onCheckedChange={handlePeopleMentionsChange}
						/>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
