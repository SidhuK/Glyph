import { useCallback, useEffect, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	type AttachmentStorageMode,
	getDailyNotesFolder,
	getWebClippingsFolder,
	loadSettings,
	setDailyNotesFolder,
	setEditorAttachmentFolder,
	setEditorAttachmentStorageMode,
	setWebClippingsFolder,
} from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { Trash2 } from "../Icons";
import { FolderOpen } from "../Icons/NavigationIcons";
import { Button } from "../ui/shadcn/button";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";
import { TemplateSettingsSections } from "./TemplatesSettingsPane";

const DEFAULT_ATTACHMENT_FOLDER = "assets";
const ATTACHMENT_LOCATION_OPTIONS: Array<{
	label: string;
	value: AttachmentStorageMode;
}> = [
	{ label: "Main space folder", value: "space-root" },
	{ label: "Specific folder", value: "specific-folder" },
	{ label: "Same folder as note", value: "note-folder" },
];

async function selectFolderRelativeToSpace(): Promise<string | null> {
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

	return normSelected.slice(normSpace.length).replace(/^\/+/, "");
}

export function SpaceSettingsPane() {
	const [currentSpacePath, setCurrentSpacePath] = useState<string | null>(null);
	const [dailyNotesFolder, setDailyNotesFolderState] = useState<string | null>(
		null,
	);
	const [dailyNotesLoading, setDailyNotesLoading] = useState(true);
	const [dailyNotesError, setDailyNotesError] = useState<string | null>(null);
	const [attachmentStorageMode, setAttachmentStorageModeState] =
		useState<AttachmentStorageMode>("note-folder");
	const [attachmentFolder, setAttachmentFolderState] = useState(
		DEFAULT_ATTACHMENT_FOLDER,
	);
	const [attachmentsLoading, setAttachmentsLoading] = useState(true);
	const [attachmentError, setAttachmentError] = useState<string | null>(null);
	const [webClippingsFolder, setWebClippingsFolderState] = useState<
		string | null
	>(null);
	const [webClippingsLoading, setWebClippingsLoading] = useState(true);
	const [webClippingsError, setWebClippingsError] = useState<string | null>(
		null,
	);
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
		setDailyNotesLoading(true);
		setAttachmentsLoading(true);
		setWebClippingsLoading(true);
		try {
			const [dailyFolder, webClipFolder, settings] = await Promise.all([
				getDailyNotesFolder(),
				getWebClippingsFolder(),
				loadSettings(),
			]);
			setCurrentSpacePath(settings.currentSpacePath);
			setDailyNotesFolderState(dailyFolder);
			setWebClippingsFolderState(webClipFolder);
			setAttachmentStorageModeState(settings.editor.attachmentStorageMode);
			setAttachmentFolderState(
				settings.editor.attachmentFolder ?? DEFAULT_ATTACHMENT_FOLDER,
			);
		} catch (e) {
			setError(extractErrorMessage(e));
		} finally {
			setDailyNotesLoading(false);
			setAttachmentsLoading(false);
			setWebClippingsLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const handleBrowseFolder = useCallback(async () => {
		setDailyNotesError(null);
		try {
			const relativePath = await selectFolderRelativeToSpace();
			if (relativePath === null) return;
			await setDailyNotesFolder(relativePath || null);
			setDailyNotesFolderState(relativePath || null);
		} catch (cause) {
			setDailyNotesError(
				cause instanceof Error ? cause.message : "Failed to select folder",
			);
		}
	}, []);

	const handleClearFolder = useCallback(async () => {
		setDailyNotesError(null);
		try {
			await setDailyNotesFolder(null);
			setDailyNotesFolderState(null);
		} catch (cause) {
			setDailyNotesError(
				cause instanceof Error ? cause.message : "Failed to clear folder",
			);
		}
	}, []);

	const handleAttachmentModeChange = useCallback(
		async (nextMode: AttachmentStorageMode) => {
			setAttachmentError(null);
			try {
				await setEditorAttachmentStorageMode(nextMode);
				setAttachmentStorageModeState(nextMode);
				if (nextMode === "specific-folder" && !attachmentFolder) {
					await setEditorAttachmentFolder(DEFAULT_ATTACHMENT_FOLDER);
					setAttachmentFolderState(DEFAULT_ATTACHMENT_FOLDER);
				}
			} catch (cause) {
				setAttachmentError(
					cause instanceof Error ? cause.message : "Failed to update setting",
				);
			}
		},
		[attachmentFolder],
	);

	const handleBrowseAttachmentFolder = useCallback(async () => {
		setAttachmentError(null);
		try {
			const relativePath = await selectFolderRelativeToSpace();
			if (relativePath === null) return;
			await setEditorAttachmentFolder(relativePath);
			setAttachmentFolderState(relativePath || DEFAULT_ATTACHMENT_FOLDER);
		} catch (cause) {
			setAttachmentError(
				cause instanceof Error ? cause.message : "Failed to select folder",
			);
		}
	}, []);

	const handleResetAttachmentFolder = useCallback(async () => {
		setAttachmentError(null);
		try {
			await setEditorAttachmentFolder(DEFAULT_ATTACHMENT_FOLDER);
			setAttachmentFolderState(DEFAULT_ATTACHMENT_FOLDER);
		} catch (cause) {
			setAttachmentError(
				cause instanceof Error ? cause.message : "Failed to reset folder",
			);
		}
	}, []);

	const handleBrowseWebClippingsFolder = useCallback(async () => {
		setWebClippingsError(null);
		try {
			const relativePath = await selectFolderRelativeToSpace();
			if (relativePath === null) return;
			await setWebClippingsFolder(relativePath || null);
			setWebClippingsFolderState(relativePath || null);
		} catch (cause) {
			setWebClippingsError(
				cause instanceof Error ? cause.message : "Failed to select folder",
			);
		}
	}, []);

	const handleClearWebClippingsFolder = useCallback(async () => {
		setWebClippingsError(null);
		try {
			await setWebClippingsFolder(null);
			setWebClippingsFolderState(null);
		} catch (cause) {
			setWebClippingsError(
				cause instanceof Error ? cause.message : "Failed to clear folder",
			);
		}
	}, []);

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
									{dailyNotesLoading
										? "Loading..."
										: (dailyNotesFolder ?? "Not configured")}
								</div>
								<div className="settingsActions dailyNotesActions">
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="min-w-24 rounded-md border-border bg-background justify-center shadow-none"
										onClick={handleBrowseFolder}
										disabled={dailyNotesLoading}
									>
										<FolderOpen size={14} />
										Browse
									</Button>
									{dailyNotesFolder ? (
										<Button
											type="button"
											variant="outline"
											size="icon-sm"
											className="rounded-md border-border bg-background justify-center shadow-none"
											onClick={handleClearFolder}
											disabled={dailyNotesLoading}
											aria-label="Clear daily notes folder"
											title="Clear daily notes folder"
										>
											<Trash2 size={14} />
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
							<select
								aria-label="Attachment location"
								className="h-9 rounded-md border border-border bg-background px-3 text-sm shadow-none outline-none"
								value={attachmentStorageMode}
								onChange={(event) => {
									void handleAttachmentModeChange(
										event.target.value as AttachmentStorageMode,
									);
								}}
								disabled={attachmentsLoading}
							>
								{ATTACHMENT_LOCATION_OPTIONS.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
							<div className="settingsHelp">
								{attachmentStorageMode === "space-root"
									? "Saved at the top level of your space."
									: attachmentStorageMode === "note-folder"
										? "Saved next to the note they are attached to."
										: "All attachments go in one folder."}
							</div>
							{attachmentStorageMode === "specific-folder" ? (
								<div className="dailyNotesFolderRow">
									<div className="dailyNotesFolderPath">
										{attachmentsLoading
											? "Loading..."
											: attachmentFolder || DEFAULT_ATTACHMENT_FOLDER}
									</div>
									<div className="settingsActions dailyNotesActions">
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="min-w-24 rounded-md border-border bg-background justify-center shadow-none"
											onClick={handleBrowseAttachmentFolder}
											disabled={attachmentsLoading}
										>
											<FolderOpen size={14} />
											Browse
										</Button>
										<Button
											type="button"
											variant="outline"
											size="icon-sm"
											className="rounded-md border-border bg-background justify-center shadow-none"
											onClick={handleResetAttachmentFolder}
											disabled={attachmentsLoading}
											aria-label="Reset attachments folder"
											title="Reset attachments folder"
										>
											<Trash2 size={14} />
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

				<SettingsSection
					title="Web Clippings"
					description="Choose where saved web pages are stored within the current space."
				>
					<SettingsRow
						label="Folder"
						description="Where saved web pages are stored as Markdown."
						stacked
						interactive={false}
					>
						<div className="dailyNotesFolderField">
							<div className="dailyNotesFolderRow">
								<div className="dailyNotesFolderPath">
									{webClippingsLoading
										? "Loading..."
										: (webClippingsFolder ?? "Space root")}
								</div>
								<div className="settingsActions dailyNotesActions">
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="min-w-24 rounded-md border-border bg-background justify-center shadow-none"
										onClick={handleBrowseWebClippingsFolder}
										disabled={webClippingsLoading}
									>
										<FolderOpen size={14} />
										Browse
									</Button>
									{webClippingsFolder ? (
										<Button
											type="button"
											variant="outline"
											size="icon-sm"
											className="rounded-md border-border bg-background justify-center shadow-none"
											onClick={handleClearWebClippingsFolder}
											disabled={webClippingsLoading}
											aria-label="Clear web clippings folder"
											title="Clear web clippings folder"
										>
											<Trash2 size={14} />
										</Button>
									) : null}
								</div>
							</div>
							{webClippingsError ? (
								<div className="settingsError dailyNotesError">
									{webClippingsError}
								</div>
							) : null}
						</div>
					</SettingsRow>
				</SettingsSection>

				<TemplateSettingsSections />

				<SettingsSection
					title="Search Index"
					description="Rebuild the index if search results are incomplete, stale, or missing."
					aside={
						<Button
							type="button"
							size="xs"
							onClick={() => {
								void onRebuildIndex();
							}}
							disabled={!currentSpacePath || isIndexing}
						>
							{isIndexing ? "Rebuilding..." : "Rebuild"}
						</Button>
					}
				>
					<SettingsRow
						label="Status"
						description="Use this when search results look outdated after large note or file changes."
						stacked
						interactive={false}
					>
						<div className="settingsCompactStatus">
							{reindexStatus ||
								(!currentSpacePath ? "No space selected." : "Index is ready.")}
						</div>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
