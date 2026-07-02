import { useCallback, useEffect, useState } from "react";
import {
	ATTACHMENT_LOCATION_OPTIONS,
	ATTACHMENT_MODE_UI,
	DEFAULT_ATTACHMENT_FOLDER,
	modeRequiresAttachmentFolder,
	modesUseDifferentFolderSemantics,
} from "../../lib/attachmentStorage";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	type AttachmentStorageMode,
	DEFAULT_QUICK_NOTES_FOLDER,
	isAttachmentStorageMode,
	loadSettings,
	setDailyNotesFolder,
	setEditorAttachmentFolder,
	setEditorAttachmentStorageMode,
	setQuickNotesFolder,
} from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { normalizeRelPath, validateRelFolderPath } from "../../utils/path";
import { Trash2 } from "../Icons";
import { FolderOpen } from "../Icons/NavigationIcons";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";
import { SettingsSelect } from "./SettingsSelect";
import { TemplateSettingsSections } from "./TemplatesSettingsPane";

const ATTACHMENT_SUBFOLDER_ERROR_ID = "attachmentSubfolderError";

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
				cause instanceof Error ? cause.message : "Failed to select folder",
			);
		}
	}, []);

	const handleClearFolder = useCallback(async () => {
		setDailyNotesError(null);
		try {
			const spacePath = requireSpacePath(currentSpacePath);
			await setDailyNotesFolder(null, { spacePath });
			setDailyNotesFolderState(null);
		} catch (cause) {
			setDailyNotesError(
				cause instanceof Error ? cause.message : "Failed to clear folder",
			);
		}
	}, [currentSpacePath]);

	const handleAttachmentModeChange = useCallback(
		async (nextMode: AttachmentStorageMode) => {
			setAttachmentError(null);
			try {
				const spacePath = requireSpacePath(currentSpacePath);
				await setEditorAttachmentStorageMode(nextMode, { spacePath });
				setAttachmentStorageModeState(nextMode);

				const shouldResetFolder =
					modesUseDifferentFolderSemantics(attachmentStorageMode, nextMode) ||
					(modeRequiresAttachmentFolder(nextMode) && !attachmentFolder);
				if (shouldResetFolder) {
					await setEditorAttachmentFolder(DEFAULT_ATTACHMENT_FOLDER, {
						spacePath,
					});
					setAttachmentFolderState(DEFAULT_ATTACHMENT_FOLDER);
				}
			} catch (cause) {
				setAttachmentError(
					cause instanceof Error ? cause.message : "Failed to update setting",
				);
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
			await setEditorAttachmentFolder(normalized, { spacePath });
			setAttachmentFolderState(normalized);
		} catch (cause) {
			setAttachmentError(
				cause instanceof Error ? cause.message : "Failed to update subfolder",
			);
		}
	}, [attachmentFolder, currentSpacePath]);

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
				cause instanceof Error ? cause.message : "Failed to select folder",
			);
		}
	}, []);

	const handleResetAttachmentFolder = useCallback(async () => {
		setAttachmentError(null);
		try {
			const spacePath = requireSpacePath(currentSpacePath);
			await setEditorAttachmentFolder(DEFAULT_ATTACHMENT_FOLDER, { spacePath });
			setAttachmentFolderState(DEFAULT_ATTACHMENT_FOLDER);
		} catch (cause) {
			setAttachmentError(
				cause instanceof Error ? cause.message : "Failed to reset folder",
			);
		}
	}, [currentSpacePath]);

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
					: "Failed to select quick notes folder",
			);
		}
	}, []);

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
					: "Failed to reset quick notes folder",
			);
		}
	}, [currentSpacePath]);

	const attachmentFolderEditor =
		ATTACHMENT_MODE_UI[attachmentStorageMode].folderEditor;

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsGrid">
				<SettingsSection
					title="Daily Notes"
					description="Choose where new daily notes should be created within the current space."
				>
					<SettingsRow
						label="Folder"
						description="Glyph stores daily notes relative to the active space."
						stacked
						interactive={false}
					>
						<div className="dailyNotesFolderField">
							<div className="dailyNotesFolderRow">
								<div className="dailyNotesFolderPath">
									{dailyNotesFolder ?? "Not configured"}
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
										Browse
									</Button>
									{dailyNotesFolder ? (
										<Button
											type="button"
											variant="outline"
											size="icon-sm"
											className="rounded-md border-border bg-background justify-center shadow-none"
											onClick={handleClearFolder}
											aria-label="Clear daily notes folder"
											title="Clear daily notes folder"
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

				<SettingsSection title="Quick Notes">
					<SettingsRow
						label="Folder"
						description="New quick notes are added to today's note in this folder."
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
										Browse
									</Button>
									<Button
										type="button"
										variant="outline"
										size="icon-sm"
										className="rounded-md border-border bg-background justify-center shadow-none"
										onClick={() => void handleResetQuickNotesFolder()}
										aria-label="Reset quick notes folder"
										title="Reset quick notes folder"
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
					title="Attachments"
					description="Choose where note attachments are stored within the current space."
				>
					<SettingsRow
						label="Location"
						description="Where to save images and files you paste into notes."
						stacked
						interactive={false}
					>
						<div className="dailyNotesFolderField">
							<SettingsSelect
								aria-label="Attachment location"
								value={attachmentStorageMode}
								onChange={(event) => {
									const nextMode = event.target.value;
									if (!isAttachmentStorageMode(nextMode)) return;
									void handleAttachmentModeChange(nextMode);
								}}
							>
								{ATTACHMENT_LOCATION_OPTIONS.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</SettingsSelect>
							<div className="settingsHelp">
								{ATTACHMENT_MODE_UI[attachmentStorageMode].help}
							</div>
							{attachmentFolderEditor === "browse" ? (
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
											Browse
										</Button>
										<Button
											type="button"
											variant="outline"
											size="icon-sm"
											className="rounded-md border-border bg-background justify-center shadow-none"
											onClick={() => {
												void handleResetAttachmentFolder();
											}}
											aria-label="Reset attachments folder"
											title="Reset attachments folder"
										>
											<Trash2 size="var(--icon-md)" />
										</Button>
									</div>
								</div>
							) : null}
							{attachmentFolderEditor === "text" ? (
								<div
									className="dailyNotesFolderRow"
									data-invalid={attachmentError ? true : undefined}
								>
									<Input
										aria-label="Attachment subfolder name"
										aria-invalid={attachmentError ? true : undefined}
										aria-describedby={
											attachmentError
												? ATTACHMENT_SUBFOLDER_ERROR_ID
												: undefined
										}
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
											variant="outline"
											size="icon-sm"
											className="rounded-md border-border bg-background justify-center shadow-none"
											onClick={() => {
												void handleResetAttachmentFolder();
											}}
											aria-label="Reset attachment subfolder"
											title="Reset attachment subfolder"
										>
											<Trash2 size="var(--icon-md)" />
										</Button>
									</div>
								</div>
							) : null}
							{attachmentError ? (
								<div
									id={
										attachmentFolderEditor === "text"
											? ATTACHMENT_SUBFOLDER_ERROR_ID
											: undefined
									}
									className="settingsError dailyNotesError"
									role="alert"
								>
									{attachmentError}
								</div>
							) : null}
						</div>
					</SettingsRow>
				</SettingsSection>

				<TemplateSettingsSections />

				<SettingsSection
					title="Search Index"
					description="Rebuild the index if search results are incomplete, stale, or missing."
				>
					<SettingsRow
						label="Status"
						description="Use this when search results look outdated after large note or file changes."
						stacked
						interactive={false}
					>
						<div className="dailyNotesFolderRow">
							<div className="dailyNotesFolderPath">
								{reindexStatus ||
									(!currentSpacePath
										? "No space selected."
										: "Index is ready.")}
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
									{isIndexing ? "Rebuilding..." : "Rebuild"}
								</Button>
							</div>
						</div>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
