import {
	AiBrain04Icon,
	ArrowLeft,
	ArrowRight,
	CalendarAdd01Icon,
	CheckListIcon,
	ColorsIcon,
	CursorInWindowIcon,
	File01Icon,
	Folder01Icon,
	FolderOpenIcon,
	FolderRemoveIcon,
	Home01Icon,
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
	ThreeDMoveIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { type Dispatch, type SetStateAction, useMemo } from "react";
import { toast } from "sonner";
import type { UseFileTreeResult } from "../../hooks/useFileTree";
import {
	dispatchEditorMenuAction,
	dispatchOpenLocalGraph,
	dispatchToggleNoteInfoSidebar,
} from "../../lib/appEvents";
import { getCommandDefinition } from "../../lib/commands/commandManifest";
import { getLicenseStatus } from "../../lib/license";
import type { EffectiveShortcutBindings } from "../../lib/settings";
import {
	SHORTCUT_CATEGORY_LABELS,
	type ShortcutActionId,
	isShortcutActionId,
} from "../../lib/shortcuts/registry";
import { isMarkdownPath, parentDir } from "../../utils/path";
import { ChevronDown, ChevronUp } from "../Icons";
import { EDITOR_ACTIONS } from "../editor/editorActions";
import type { SettingsTab } from "../settings/settingsConfig";
import {
	SETTINGS_SEARCH_ENTRIES,
	type SettingsSearchEntry,
	scrollToSettingsSearchEntry,
} from "../settings/settingsSearch";
import type { Command } from "./CommandPalette";

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
	createDatabaseAndOpen: () => Promise<string | null>;
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
	openCalendarTab: () => void;
	openDatabasesTab: (databaseId?: string | null) => void;
	openGettingStarted: () => void;
	openGraphView: () => void;
	openPalette: (tab: "commands" | "search", query?: string) => void;
	openQuickNoteWindow: () => void;
	openQuickTaskWindow: () => void;
	openSearchPalette: () => void;
	openSettings: (tab?: SettingsTab) => void;
	openTasksView: () => void;
	openWorkspaceFile: (path: string) => Promise<void>;
	showWelcomeNote: () => Promise<void>;
	openMarkdownTabsLength: number;
	pinnedFiles: string[];
	requestOpenDailyNote: () => void;
	saveCurrentEditor: () => Promise<unknown>;
	setAiPanelOpen: Dispatch<SetStateAction<boolean>>;
	setError: (error: string) => void;
	setMovePickerSourcePath: (path: string | null) => void;
	setSidebarCollapsed: (collapsed: boolean) => void;
	showCollapsibleHeadings: boolean;
	sidebarCollapsed: boolean;
	spacePath: string | null;
	tabsLength: number;
	togglePinnedFile: (path: string) => Promise<void>;
	refreshMoveTargetDirs: (sourcePath: string) => Promise<void>;
}

function buildMovePickerCommands({
	fileTree,
	movePickerSourcePath,
	moveTargetDirs,
	openWorkspaceFile,
}: Pick<
	UseAppCommandsDeps,
	"fileTree" | "movePickerSourcePath" | "moveTargetDirs" | "openWorkspaceFile"
>): Command[] | null {
	if (!movePickerSourcePath) return null;
	return [
		{
			id: "move-picker-root",
			label: "/",
			icon: (
				<HugeiconsIcon
					icon={Folder01Icon}
					size="var(--icon-lg)"
					strokeWidth={0.9}
				/>
			),
			category: "Move Destination",
			action: async () => {
				const n = await fileTree.onMovePath(movePickerSourcePath, "");
				if (n) await openWorkspaceFile(n);
			},
		},
		...moveTargetDirs.map((dir) => ({
			id: `move-picker:${dir}`,
			label: `/${dir}`,
			icon: (
				<HugeiconsIcon
					icon={Folder01Icon}
					size="var(--icon-lg)"
					strokeWidth={0.9}
				/>
			),
			category: "Move Destination",
			action: async () => {
				const n = await fileTree.onMovePath(movePickerSourcePath, dir);
				if (n) await openWorkspaceFile(n);
			},
		})),
	];
}

function buildEditorCommands({
	activeMarkdownTabPath,
}: Pick<UseAppCommandsDeps, "activeMarkdownTabPath">): Command[] {
	return EDITOR_ACTIONS.filter(
		(action) =>
			action.id !== "collapse_all_headings" &&
			action.id !== "expand_all_headings",
	).map((action) => ({
		id: action.id,
		label: action.label,
		category: "Editor",
		enabled: Boolean(activeMarkdownTabPath),
		allowInEditable: true,
		action: () => {
			dispatchEditorMenuAction({ action: action.id });
		},
	}));
}

const SETTINGS_TAB_LABELS = {
	general: "General",
	appearance: "Appearance",
	shortcuts: "Shortcuts",
	ai: "Glyph AI",
	space: "Space",
	git: "Git",
	advanced: "Advanced",
	about: "About",
} as const satisfies Record<SettingsTab, string>;

function settingsSearchCommandLabel({
	section,
	title,
}: Pick<SettingsSearchEntry, "section" | "title">) {
	return section && section !== title ? `${section}: ${title}` : title;
}

function buildSettingsSearchCommands(
	openSettings: UseAppCommandsDeps["openSettings"],
): Command[] {
	return SETTINGS_SEARCH_ENTRIES.map((entry: SettingsSearchEntry) => {
		const tabLabel = SETTINGS_TAB_LABELS[entry.tab];
		return {
			id: `settings-search:${entry.id}`,
			label: settingsSearchCommandLabel(entry),
			icon: (
				<HugeiconsIcon
					icon={Settings01Icon}
					size="var(--icon-lg)"
					strokeWidth={0.9}
				/>
			),
			category: `Settings > ${tabLabel}`,
			searchTerms: [
				"settings",
				tabLabel,
				entry.section ?? "",
				entry.description ?? "",
				...(entry.keywords ?? []),
			],
			hideWhenQueryEmpty: true,
			action: () => {
				openSettings(entry.tab);
				scrollToSettingsSearchEntry(entry);
			},
		};
	});
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
					label: definition.label,
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
	openCalendarTab,
	openDatabasesTab,
	openGettingStarted,
	openGraphView,
	openPalette,
	openQuickNoteWindow,
	openQuickTaskWindow,
	openSearchPalette,
	openSettings,
	openTasksView,
	openWorkspaceFile,
	showWelcomeNote,
	openMarkdownTabsLength,
	pinnedFiles,
	requestOpenDailyNote,
	saveCurrentEditor,
	setAiPanelOpen,
	setError,
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
		const editorCommands = buildEditorCommands({ activeMarkdownTabPath });
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
				id: "open-quick-task",
				label: "Open quick task",
				icon: (
					<HugeiconsIcon
						icon={CheckListIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "File Operations",
				enabled: true,
				allowInEditable: true,
				action: openQuickTaskWindow,
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
				action: () => void createDatabaseAndOpen(),
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
				action: async () => {
					try {
						const dir =
							activeDirPath ??
							(activeFilePath ? parentDir(activeFilePath) : "");
						await fileTree.onNewFolderInDir(dir);
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						console.error("Failed to create folder", error);
						setError(message);
						toast.error("Could not create folder", {
							description: message,
						});
					}
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
				id: "collapse_all_headings",
				label: "Collapse all headings",
				icon: <ChevronUp size="var(--icon-lg)" />,
				category: "Editor",
				enabled: Boolean(activeMarkdownTabPath) && showCollapsibleHeadings,
				allowInEditable: true,
				action: () =>
					dispatchEditorMenuAction({ action: "collapse_all_headings" }),
			},
			{
				id: "expand_all_headings",
				label: "Expand all headings",
				icon: <ChevronDown size="var(--icon-lg)" />,
				category: "Editor",
				enabled: Boolean(activeMarkdownTabPath) && showCollapsibleHeadings,
				allowInEditable: true,
				action: () =>
					dispatchEditorMenuAction({ action: "expand_all_headings" }),
			},
			{
				id: "open-local-graph",
				label: "Open local graph",
				icon: (
					<HugeiconsIcon
						icon={ThreeDMoveIcon}
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
					dispatchOpenLocalGraph({ path: activeMarkdownTabPath });
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
						icon={File01Icon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Navigation",
				enabled: Boolean(spacePath),
				action: openAllDocsTab,
			},
			{
				id: "open-tasks",
				label: "Open tasks",
				icon: (
					<HugeiconsIcon
						icon={CheckListIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Navigation",
				enabled: Boolean(spacePath),
				action: openTasksView,
			},
			{
				id: "open-graph-view",
				label: "Open graph view",
				icon: (
					<HugeiconsIcon
						icon={ThreeDMoveIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Navigation",
				enabled: Boolean(spacePath),
				action: openGraphView,
			},
			{
				id: "open-dashboard",
				label: "Open home",
				icon: (
					<HugeiconsIcon
						icon={Home01Icon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Navigation",
				enabled: Boolean(spacePath),
				action: openCalendarTab,
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
				label: "Show getting started",
				icon: (
					<HugeiconsIcon
						icon={InformationCircleIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Help",
				enabled: Boolean(spacePath),
				action: openGettingStarted,
			},
			{
				id: "show-welcome-note",
				label: "Show welcome note",
				icon: (
					<HugeiconsIcon
						icon={NoteIcon}
						size="var(--icon-lg)"
						strokeWidth={0.9}
					/>
				),
				category: "Help",
				enabled: Boolean(spacePath),
				action: () => void showWelcomeNote(),
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
		handleCreateFromTemplateFromMenu,
		setAiPanelOpen,
		togglePinnedFile,
		setSidebarCollapsed,
		sidebarCollapsed,
		showCollapsibleHeadings,
		spacePath,
		openAllDocsTab,
		openTasksView,
		openSearchPalette,
		openCalendarTab,
		openDatabasesTab,
		openGettingStarted,
		openGraphView,
		openBlankTab,
		openQuickNoteWindow,
		openQuickTaskWindow,
		openWorkspaceFile,
		showWelcomeNote,
		gitSync,
		getBinding,
		moveTargetDirs,
		movePickerSourcePath,
		setError,
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
