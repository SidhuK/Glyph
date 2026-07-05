import {
	AiBrain04Icon,
	Archive04Icon,
	ArrowLeft,
	ArrowRight,
	Calendar03Icon,
	CalendarAdd01Icon,
	ChartRelationshipIcon,
	ColorsIcon,
	CursorInWindowIcon,
	Folder01Icon,
	FolderOpenIcon,
	FolderRemoveIcon,
	InformationCircleIcon,
	LibraryIcon,
	Link01Icon,
	MoveIcon,
	NoteIcon,
	PencilEdit02Icon,
	PinIcon,
	PinOffIcon,
	SearchIcon,
	Settings01Icon,
	SidebarLeftIcon,
	SquareLock02Icon,
	TableIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { type Dispatch, type SetStateAction, useMemo } from "react";
import type { UseFileTreeResult } from "../../hooks/useFileTree";
import {
	dispatchOpenLocalConnections,
	dispatchToggleNoteInfoSidebar,
} from "../../lib/appEvents";
import { getCommandDefinition } from "../../lib/commands/commandManifest";
import type { EditorViewMode } from "../../lib/editorMode";
import { getLicenseStatus } from "../../lib/license";
import { copyAbsolutePath, copyRelativePath } from "../../lib/pathClipboard";
import type { EffectiveShortcutBindings } from "../../lib/settings";
import {
	SHORTCUT_CATEGORY_LABELS,
	type ShortcutActionId,
	isShortcutActionId,
} from "../../lib/shortcuts/registry";
import { toast } from "../../lib/toast";
import { isMarkdownPath, parentDir } from "../../utils/path";
import type { SettingsTab } from "../settings/settingsConfig";
import type { Command } from "./CommandPalette";
import { buildEditorCommands } from "./editorCommands";
import { buildMovePickerCommands } from "./movePickerCommands";
import { buildSettingsSearchCommands } from "./settingsSearchCommands";

interface GitSyncCommandActions {
	syncNow: () => Promise<unknown>;
	openGitSettings: () => void;
}

interface UseAppCommandsDeps {
	activeDirPath: string | null;
	activeFilePath: string | null;
	activeMarkdownTabPath: string | null;
	aiEnabled: boolean;
	attachAllOpenNotesToAi: () => Promise<void>;
	attachCurrentNoteToAi: () => Promise<void>;
	activateNextTab: () => void;
	activatePreviousTab: () => void;
	canGoBack: boolean;
	canGoForward: boolean;
	closeActiveTab: () => void;
	closeAllTabs: () => void;
	closeSpace: () => void;
	createDatabaseAndOpen: () => void;
	createNoteInSelectedFolder: () => Promise<string | null>;
	fileTree: UseFileTreeResult;
	getBinding: (actionId: ShortcutActionId) => EffectiveShortcutBindings[string];
	gitSync: GitSyncCommandActions;
	goBack: () => void;
	goForward: () => void;
	handleCopyOpenNoteAsMarkdown: () => Promise<void>;
	handleCreateFromTemplateFromMenu: () => void;
	handleDuplicateActiveMarkdown: () => Promise<void>;
	handleGitSyncFailure: (cause: unknown) => void;
	handleOpenAiSettings: () => void;
	handleOpenSpaceSettings: () => void;
	handleRevealSpaceFromMenu: () => void;
	movePickerSourcePath: string | null;
	moveTargetDirs: string[];
	onCreateSpace: () => void;
	onOpenSpace: () => void;
	openAllDocsTab: () => void;
	openBlankTab: () => void;
	openDatabasesTab: (databaseId?: string | null) => void;
	openGettingStarted: () => void;
	openCalendar: () => void;
	openConnectionsView: () => void;
	openPalette: (tab: "commands" | "search", query?: string) => void;
	openQuickNoteWindow: () => void;
	openSearchPalette: () => void;
	openSettings: (tab?: SettingsTab) => void;
	openWorkspaceFile: (path: string) => Promise<void>;
	showWelcomeNote: () => Promise<void>;
	openMarkdownTabsLength: number;
	pinnedFiles: string[];
	requestOpenDailyNote: () => void;
	saveCurrentEditor: () => Promise<unknown>;
	setCurrentEditorMode: (mode: EditorViewMode) => boolean;
	setAiPanelOpen: Dispatch<SetStateAction<boolean>>;
	setMovePickerSourcePath: (path: string | null) => void;
	setSidebarCollapsed: (collapsed: boolean) => void;
	showCollapsibleHeadings: boolean;
	sidebarCollapsed: boolean;
	spacePath: string | null;
	tabsLength: number;
	togglePinnedFile: (path: string) => Promise<void>;
	refreshMoveTargetDirs: (sourcePath: string) => Promise<void>;
}

function buildAiCommands({
	activeMarkdownTabPath,
	aiEnabled,
	attachAllOpenNotesToAi,
	attachCurrentNoteToAi,
	openMarkdownTabsLength,
	setAiPanelOpen,
	spacePath,
}: Pick<
	UseAppCommandsDeps,
	| "activeMarkdownTabPath"
	| "aiEnabled"
	| "attachAllOpenNotesToAi"
	| "attachCurrentNoteToAi"
	| "openMarkdownTabsLength"
	| "setAiPanelOpen"
	| "spacePath"
>): Command[] {
	if (!aiEnabled) return [];
	return [
		{
			id: "toggle-ai",
			label: "Toggle AI",
			icon: (
				<HugeiconsIcon
					icon={AiBrain04Icon}
					size="var(--icon-lg)"
					strokeWidth={0.9}
				/>
			),
			category: "AI",
			shortcut: { meta: true, shift: true, key: "a" },
			enabled: Boolean(spacePath),
			action: () => setAiPanelOpen((v) => !v),
		},
		{
			id: "ai-attach-current-note",
			label: "AI: Attach current note",
			icon: (
				<HugeiconsIcon
					icon={Link01Icon}
					size="var(--icon-lg)"
					strokeWidth={0.9}
				/>
			),
			category: "AI",
			shortcut: { meta: true, alt: true, key: "a" },
			enabled: Boolean(activeMarkdownTabPath),
			action: () => void attachCurrentNoteToAi(),
		},
		{
			id: "ai-attach-all-open-notes",
			label: "AI: Attach all open notes",
			icon: (
				<HugeiconsIcon
					icon={Link01Icon}
					size="var(--icon-lg)"
					strokeWidth={0.9}
				/>
			),
			category: "AI",
			shortcut: { meta: true, alt: true, shift: true, key: "a" },
			enabled: openMarkdownTabsLength > 0,
			action: () => void attachAllOpenNotesToAi(),
		},
	];
}

function resolveCommandShortcuts(
	commands: Command[],
	getBinding: UseAppCommandsDeps["getBinding"],
): Command[] {
	return commands.map((command) => {
		const definition = getCommandDefinition(command.id);
		const commandWithManifest = definition
			? {
					...command,
					label: command.label ?? definition.label ?? command.id,
					category: SHORTCUT_CATEGORY_LABELS[definition.category],
					allowInEditable: definition.allowInEditable,
					shortcut: definition.defaultBinding ?? command.shortcut,
				}
			: command;

		return isShortcutActionId(command.id)
			? {
					...commandWithManifest,
					shortcut: getBinding(command.id) ?? undefined,
				}
			: commandWithManifest;
	});
}

export function useAppCommands({
	activeDirPath,
	activeFilePath,
	activeMarkdownTabPath,
	aiEnabled,
	attachAllOpenNotesToAi,
	attachCurrentNoteToAi,
	activateNextTab,
	activatePreviousTab,
	canGoBack,
	canGoForward,
	closeActiveTab,
	closeAllTabs,
	closeSpace,
	createDatabaseAndOpen,
	createNoteInSelectedFolder,
	fileTree,
	getBinding,
	gitSync,
	goBack,
	goForward,
	handleCopyOpenNoteAsMarkdown,
	handleCreateFromTemplateFromMenu,
	handleDuplicateActiveMarkdown,
	handleGitSyncFailure,
	handleOpenAiSettings,
	handleOpenSpaceSettings,
	handleRevealSpaceFromMenu,
	movePickerSourcePath,
	moveTargetDirs,
	onCreateSpace,
	onOpenSpace,
	openAllDocsTab,
	openBlankTab,
	openDatabasesTab,
	openGettingStarted,
	openCalendar,
	openConnectionsView,
	openPalette,
	openQuickNoteWindow,
	openSearchPalette,
	openSettings,
	openWorkspaceFile,
	showWelcomeNote,
	openMarkdownTabsLength,
	pinnedFiles,
	requestOpenDailyNote,
	saveCurrentEditor,
	setCurrentEditorMode,
	setAiPanelOpen,
	setMovePickerSourcePath,
	setSidebarCollapsed,
	showCollapsibleHeadings,
	sidebarCollapsed,
	spacePath,
	tabsLength,
	togglePinnedFile,
	refreshMoveTargetDirs,
}: UseAppCommandsDeps): Command[] {
	return useMemo<Command[]>(() => {
		const movePickerCommands = buildMovePickerCommands({
			fileTree,
			movePickerSourcePath,
			moveTargetDirs,
			openWorkspaceFile,
		});
		if (movePickerCommands) return movePickerCommands;
		const aiCommands = buildAiCommands({
			activeMarkdownTabPath,
			aiEnabled,
			attachAllOpenNotesToAi,
			attachCurrentNoteToAi,
			openMarkdownTabsLength,
			setAiPanelOpen,
			spacePath,
		});
		const editorCommands = buildEditorCommands({
			activeMarkdownTabPath,
			setCurrentEditorMode,
			showCollapsibleHeadings,
		});
		const settingsSearchCommands = buildSettingsSearchCommands(openSettings);

		const baseCommands: Command[] = [
			{
				id: "new-note",
				label: "New note",
				icon: (
					<HugeiconsIcon
						icon={PencilEdit02Icon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "File Operations",
				shortcut: { meta: true, key: "n" },
				enabled: Boolean(spacePath),
				action: () => void createNoteInSelectedFolder(),
			},
			{
				id: "open-quick-note",
				label: "Open quick note",
				icon: (
					<HugeiconsIcon
						icon={NoteIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "File Operations",
				enabled: true,
				allowInEditable: true,
				action: openQuickNoteWindow,
			},
			{
				id: "create-from-template",
				label: "Create from template",
				icon: (
					<HugeiconsIcon
						icon={ColorsIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "File Operations",
				shortcut: { meta: true, shift: true, key: "m" },
				enabled: Boolean(spacePath),
				action: handleCreateFromTemplateFromMenu,
			},
			{
				id: "new-tab",
				label: "New tab",
				icon: (
					<HugeiconsIcon
						icon={CursorInWindowIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Navigation",
				shortcut: { meta: true, key: "t" },
				enabled: Boolean(spacePath),
				allowInEditable: true,
				action: openBlankTab,
			},
			{
				id: "close-active-tab",
				label: "Close current tab",
				category: "Tabs",
				enabled: tabsLength > 0,
				action: closeActiveTab,
			},
			{
				id: "close-all-tabs",
				label: "Close all tabs",
				category: "Tabs",
				enabled: tabsLength > 0,
				action: closeAllTabs,
			},
			{
				id: "next-tab",
				label: "Next tab",
				category: "Tabs",
				enabled: tabsLength > 1,
				action: activateNextTab,
			},
			{
				id: "previous-tab",
				label: "Previous tab",
				category: "Tabs",
				enabled: tabsLength > 1,
				action: activatePreviousTab,
			},
			{
				id: "new-database",
				label: "New collection",
				icon: (
					<HugeiconsIcon
						icon={TableIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "File Operations",
				enabled: Boolean(spacePath),
				action: createDatabaseAndOpen,
			},
			{
				id: "new-folder",
				label: "New folder",
				icon: (
					<HugeiconsIcon
						icon={Folder01Icon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "File Operations",
				enabled: Boolean(spacePath),
				action: () => {
					const dir =
						activeDirPath ?? (activeFilePath ? parentDir(activeFilePath) : "");
					void fileTree.requestCreateFolder(dir);
				},
			},
			{
				id: "duplicate-current-note",
				label: "Duplicate current note",
				icon: (
					<HugeiconsIcon
						icon={NoteIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "File Operations",
				enabled:
					activeMarkdownTabPath !== null &&
					isMarkdownPath(activeMarkdownTabPath),
				action: () => void handleDuplicateActiveMarkdown(),
			},
			{
				id: "open-daily-note",
				label: "Open daily note (today)",
				icon: (
					<HugeiconsIcon
						icon={CalendarAdd01Icon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "File Operations",
				shortcut: { meta: true, shift: true, key: "d" },
				enabled: Boolean(spacePath),
				action: requestOpenDailyNote,
			},
			{
				id: "toggle-pin-active-file",
				label:
					activeFilePath && pinnedFiles.includes(activeFilePath)
						? "Unpin current file"
						: "Pin current file",
				icon: (
					<HugeiconsIcon
						icon={
							activeFilePath && pinnedFiles.includes(activeFilePath)
								? PinOffIcon
								: PinIcon
						}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "File Operations",
				enabled: Boolean(spacePath) && Boolean(activeFilePath),
				allowInEditable: true,
				action: () => {
					if (!activeFilePath) return;
					void togglePinnedFile(activeFilePath);
				},
			},
			{
				id: "save-note",
				label: "Save",
				icon: (
					<HugeiconsIcon
						icon={NoteIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "File Operations",
				shortcut: { meta: true, key: "s" },
				enabled: Boolean(spacePath),
				allowInEditable: true,
				action: () => void saveCurrentEditor(),
			},
			{
				id: "open-local-connections",
				label: "Open local connections",
				icon: (
					<HugeiconsIcon
						icon={ChartRelationshipIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "File Operations",
				shortcut: { meta: true, shift: true, key: "g" },
				enabled: Boolean(activeMarkdownTabPath),
				allowInEditable: true,
				action: () => {
					if (!activeMarkdownTabPath) return;
					dispatchOpenLocalConnections({ path: activeMarkdownTabPath });
				},
			},
			{
				id: "toggle-note-info-sidebar",
				label: "Toggle note info sidebar",
				icon: (
					<HugeiconsIcon
						icon={InformationCircleIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "File Operations",
				shortcut: { meta: true, shift: true, key: "i" },
				enabled: Boolean(activeMarkdownTabPath),
				allowInEditable: true,
				action: () => {
					if (!activeMarkdownTabPath) return;
					dispatchToggleNoteInfoSidebar({ path: activeMarkdownTabPath });
				},
			},
			{
				id: "copy-note-markdown",
				label: "Copy note as Markdown",
				icon: (
					<HugeiconsIcon
						icon={NoteIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "File Operations",
				shortcut: { meta: true, shift: true, key: "c" },
				enabled: Boolean(activeMarkdownTabPath),
				allowInEditable: true,
				action: () => void handleCopyOpenNoteAsMarkdown(),
			},
			{
				id: "copy-active-file-relative-path",
				label: "Copy current file relative path",
				icon: (
					<HugeiconsIcon
						icon={Link01Icon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "File Operations",
				enabled: Boolean(activeFilePath),
				allowInEditable: true,
				searchTerms: ["copy file path", "relative path"],
				action: () => {
					if (!activeFilePath) return;
					void copyRelativePath(activeFilePath);
				},
			},
			{
				id: "copy-active-file-absolute-path",
				label: "Copy current file absolute path",
				icon: (
					<HugeiconsIcon
						icon={Link01Icon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "File Operations",
				enabled: Boolean(spacePath) && Boolean(activeFilePath),
				allowInEditable: true,
				searchTerms: ["copy file path", "absolute path", "full path"],
				action: () => {
					if (!activeFilePath) return;
					void copyAbsolutePath(spacePath, activeFilePath);
				},
			},
			{
				id: "move-active-file",
				label: "Move to…",
				icon: (
					<HugeiconsIcon
						icon={MoveIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "File Operations",
				enabled: Boolean(spacePath) && Boolean(activeFilePath),
				action: () => {
					if (!activeFilePath) return;
					setMovePickerSourcePath(activeFilePath);
					void refreshMoveTargetDirs(activeFilePath);
					openPalette("commands");
				},
			},
			{
				id: "go-back-note",
				label: "Go back",
				icon: (
					<HugeiconsIcon
						icon={ArrowLeft}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Navigation",
				shortcut: { meta: true, key: "[" },
				enabled: canGoBack,
				allowInEditable: true,
				action: goBack,
			},
			{
				id: "go-forward-note",
				label: "Go forward",
				icon: (
					<HugeiconsIcon
						icon={ArrowRight}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Navigation",
				shortcut: { meta: true, key: "]" },
				enabled: canGoForward,
				allowInEditable: true,
				action: goForward,
			},
			{
				id: "quick-open",
				label: "Quick open",
				icon: (
					<HugeiconsIcon
						icon={SearchIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Navigation",
				shortcut: { meta: true, key: "p" },
				enabled: Boolean(spacePath),
				allowInEditable: true,
				action: openSearchPalette,
			},
			{
				id: "open-all-docs",
				label: "Open all notes",
				icon: (
					<HugeiconsIcon
						icon={Archive04Icon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Navigation",
				enabled: Boolean(spacePath),
				action: openAllDocsTab,
			},
			{
				id: "open-connections",
				label: "Open Connections",
				icon: (
					<HugeiconsIcon
						icon={ChartRelationshipIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Navigation",
				enabled: Boolean(spacePath),
				action: openConnectionsView,
			},
			{
				id: "open-databases",
				label: "Open collections",
				icon: (
					<HugeiconsIcon
						icon={LibraryIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Navigation",
				enabled: Boolean(spacePath),
				action: () => openDatabasesTab(),
			},
			{
				id: "open-calendar",
				label: "Open calendar",
				icon: (
					<HugeiconsIcon
						icon={Calendar03Icon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Navigation",
				enabled: Boolean(spacePath),
				action: openCalendar,
			},
			{
				id: "create-space",
				label: "Create space",
				icon: (
					<HugeiconsIcon
						icon={Folder01Icon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Workspace",
				shortcut: { meta: true, shift: true, key: "n" },
				action: onCreateSpace,
			},
			{
				id: "open-space",
				label: spacePath ? "Open another space" : "Open space",
				icon: (
					<HugeiconsIcon
						icon={FolderOpenIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Workspace",
				shortcut: { meta: true, key: "o" },
				action: onOpenSpace,
			},
			{
				id: "reveal-space",
				label: "Reveal space",
				icon: (
					<HugeiconsIcon
						icon={FolderOpenIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Workspace",
				enabled: Boolean(spacePath),
				action: handleRevealSpaceFromMenu,
			},
			{
				id: "close-space",
				label: "Close current space",
				icon: (
					<HugeiconsIcon
						icon={FolderRemoveIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Workspace",
				enabled: Boolean(spacePath),
				action: closeSpace,
			},
			{
				id: "git-sync-now",
				label: "Sync now",
				icon: (
					<HugeiconsIcon
						icon={Link01Icon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Workspace",
				enabled: Boolean(spacePath),
				action: async () => {
					try {
						await gitSync.syncNow();
					} catch (error) {
						handleGitSyncFailure(error);
					}
				},
			},
			{
				id: "toggle-sidebar",
				label: "Toggle sidebar",
				icon: (
					<HugeiconsIcon
						icon={SidebarLeftIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Workspace",
				shortcut: { meta: true, shift: true, key: "b" },
				action: () => setSidebarCollapsed(!sidebarCollapsed),
			},
			{
				id: "buy-glyph-license",
				label: "Buy Glyph license",
				icon: (
					<HugeiconsIcon
						icon={SquareLock02Icon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Workspace",
				action: async () => {
					try {
						const status = await getLicenseStatus();
						await openUrl(status.purchase_url);
					} catch (error) {
						console.error("Failed to open Gumroad purchase page", error);
						toast.error("Could not open the license page", {
							description:
								error instanceof Error
									? error.message
									: "Try again in a moment.",
						});
					}
				},
			},
			{
				id: "open-settings",
				label: "Settings",
				icon: (
					<HugeiconsIcon
						icon={Settings01Icon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Workspace",
				shortcut: { meta: true, key: "," },
				action: () => openSettings(),
			},
			{
				id: "open-space-settings",
				label: "Space settings",
				icon: (
					<HugeiconsIcon
						icon={Settings01Icon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Workspace",
				enabled: Boolean(spacePath),
				action: handleOpenSpaceSettings,
			},
			{
				id: "open-license-settings",
				label: "Manage license",
				icon: (
					<HugeiconsIcon
						icon={SquareLock02Icon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Workspace",
				action: () => openSettings("general"),
			},
			{
				id: "open-git-sync-settings",
				label: "Git Sync settings",
				icon: (
					<HugeiconsIcon
						icon={Settings01Icon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Workspace",
				enabled: Boolean(spacePath),
				action: gitSync.openGitSettings,
			},
			{
				id: "open-ai-settings",
				label: "AI settings",
				icon: (
					<HugeiconsIcon
						icon={Settings01Icon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Workspace",
				action: handleOpenAiSettings,
			},
			{
				id: "show-getting-started",
				icon: (
					<HugeiconsIcon
						icon={InformationCircleIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				enabled: Boolean(spacePath),
				action: openGettingStarted,
			},
			{
				id: "show-welcome-note",
				icon: (
					<HugeiconsIcon
						icon={NoteIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				enabled: Boolean(spacePath),
				action: showWelcomeNote,
			},
		];
		return resolveCommandShortcuts(
			[
				...baseCommands,
				...settingsSearchCommands,
				...aiCommands,
				...editorCommands,
			],
			getBinding,
		);
	}, [
		activeMarkdownTabPath,
		activeFilePath,
		activateNextTab,
		activatePreviousTab,
		pinnedFiles,
		aiEnabled,
		attachAllOpenNotesToAi,
		attachCurrentNoteToAi,
		activeDirPath,
		closeActiveTab,
		closeAllTabs,
		handleGitSyncFailure,
		handleCopyOpenNoteAsMarkdown,
		handleDuplicateActiveMarkdown,
		handleOpenAiSettings,
		handleOpenSpaceSettings,
		handleRevealSpaceFromMenu,
		fileTree,
		closeSpace,
		onCreateSpace,
		onOpenSpace,
		openMarkdownTabsLength,
		createDatabaseAndOpen,
		createNoteInSelectedFolder,
		requestOpenDailyNote,
		saveCurrentEditor,
		setCurrentEditorMode,
		handleCreateFromTemplateFromMenu,
		setAiPanelOpen,
		togglePinnedFile,
		setSidebarCollapsed,
		sidebarCollapsed,
		showCollapsibleHeadings,
		spacePath,
		openAllDocsTab,
		openSearchPalette,
		openDatabasesTab,
		openGettingStarted,
		openCalendar,
		openConnectionsView,
		openBlankTab,
		openQuickNoteWindow,
		openWorkspaceFile,
		showWelcomeNote,
		gitSync,
		getBinding,
		moveTargetDirs,
		movePickerSourcePath,
		openSettings,
		refreshMoveTargetDirs,
		openPalette,
		setMovePickerSourcePath,
		tabsLength,
		canGoBack,
		canGoForward,
		goBack,
		goForward,
	]);
}
