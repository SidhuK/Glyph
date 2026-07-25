import { AnimatePresence, m, useReducedMotion } from "motion/react";
import {
	type CSSProperties,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	Suspense,
	lazy,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
	useAISidebarContext,
	useSpace,
	useUILayoutContext,
} from "../../contexts";
import { useResizablePanel } from "../../hooks/useResizablePanel";
import { useShortcutBindings } from "../../hooks/useShortcutBindings";
import { ACTIVITY_TIMELINE_TAB_ID } from "../../lib/activityTimeline";
import { ALL_DOCS_TAB_ID } from "../../lib/allDocs";
import {
	PATH_REMOVED_EVENT,
	PATH_RENAMED_EVENT,
	type PathRemovedDetail,
	type PathRenamedDetail,
} from "../../lib/appEvents";
import { APP_TAGLINE } from "../../lib/copy";
import type { DatabasesOpenRequest } from "../../lib/database/openDatabasesRequest";
import { DATABASES_TAB_ID } from "../../lib/databases";
import {
	ACTIVITY_DOCS_PAGE_SIZE,
	getPrefetchedAllDocs,
	getPrefetchedDatabaseDocument,
	getPrefetchedNote,
	prefetchAllDocs,
	prefetchDatabasesLanding,
	prefetchNote,
} from "../../lib/navigationPrefetch";
import { PINNED_DOCS_TAB_ID } from "../../lib/pinnedDocs";
import {
	DEFAULT_ONBOARDING_SETTINGS,
	type OnboardingSettings,
	loadSettings,
	updateOnboardingSettings,
} from "../../lib/settings";
import { formatShortcutPartsForPlatform } from "../../lib/shortcuts/platform";
import { SPACE_CONNECTIONS_TAB_ID } from "../../lib/spaceConnections";
import type { FsEntry, GitCommitDiff } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { toast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { onWindowDragMouseDown } from "../../utils/window";
import { Calendar, FileText } from "../Icons";
import { AIFloatingHost } from "../ai/AIFloatingHost";
import type {
	CreateMarkdownFileOptions,
	ExtractToNoteActions,
} from "../editor/types";
import { FolioWorkspace } from "../folio/FolioWorkspace";
import { NotePane } from "../preview/NotePane";
import { AboutSettingsPane } from "../settings/AboutSettingsPane";
import { AiSettingsPane } from "../settings/AiSettingsPane";
import { AppearanceSettingsPane } from "../settings/AppearanceSettingsPane";
import { GeneralSettingsPane } from "../settings/GeneralSettingsPane";
import { GitSettingsPane } from "../settings/GitSettingsPane";
import { SpaceSettingsPane } from "../settings/SpaceSettingsPane";
import { SETTINGS_TABS, type SettingsTab } from "../settings/settingsConfig";
import { localizedSettingsTabLabel } from "../settings/settingsSearch";
import { springPresets } from "../ui/animations";
import { CanvasPaneAwait } from "./CanvasPaneAwait";
import { GettingStartedPane } from "./GettingStartedPane";
import { SplitEditorLayout } from "./SplitEditorLayout";
import { TabBar } from "./TabBar";
import { WelcomeScreen } from "./WelcomeScreen";
import {
	loadActivityTimelinePane,
	loadAllDocsPane,
	loadDatabasesPane,
} from "./prefetchablePanes";
import type {
	SplitEditorDragSource,
	SplitEditorDropTarget,
} from "./splitEditorDnd";
import type { SplitEditorNode } from "./splitEditorModel";
import type {
	WorkspaceEditorPane,
	WorkspaceTab,
} from "./useTabManager";

const PinnedDocsPane = lazy(() =>
	import("./PinnedDocsPane").then((module) => ({
		default: module.PinnedDocsPane,
	})),
);

const DatabasesPane = lazy(loadDatabasesPane);
const AllDocsPane = lazy(loadAllDocsPane);
const ActivityTimelinePane = lazy(loadActivityTimelinePane);
const DAILY_NOTES_SETUP_TOAST_ID = "daily-notes-setup";
const ShortcutsSettingsPane = lazy(() =>
	import("../settings/ShortcutsSettingsPane").then((module) => ({
		default: module.ShortcutsSettingsPane,
	})),
);
const SpaceConnectionsView = lazy(() =>
	import("../connections/SpaceConnectionsView").then((module) => ({
		default: module.SpaceConnectionsView,
	})),
);

interface ActiveGitDiffState {
	path: string;
	diff: GitCommitDiff;
}

interface EmptyTip {
	key: string;
	icon: React.ReactNode;
	text: string;
	action: string;
	onClick: () => void;
}

function ContextualEmptyState({
	onboarding,
	commandShortcutParts,
	showDailyNoteAction,
	onCreateNote,
	onOpenCommandPalette,
	onOpenDailyNote,
}: {
	onboarding: OnboardingSettings;
	commandShortcutParts: string[];
	showDailyNoteAction: boolean;
	onCreateNote: () => void;
	onOpenCommandPalette: () => void;
	onOpenDailyNote: () => void;
}) {
	const reduced = useReducedMotion() ?? false;

	const tips = useMemo(() => {
		const t: EmptyTip[] = [];
		if (!onboarding.createdFirstNote) {
			t.push({
				key: "note",
				icon: <FileText size="var(--icon-lg)" />,
				text: "Create your first note",
				action: "New note",
				onClick: onCreateNote,
			});
		}
		if (!onboarding.openedDailyNote && showDailyNoteAction) {
			t.push({
				key: "daily",
				icon: <Calendar size="var(--icon-lg)" />,
				text: "Try a daily note — saved to your daily notes folder",
				action: "Open daily note",
				onClick: onOpenDailyNote,
			});
		}
		if (!onboarding.usedCommandPalette) {
			t.push({
				key: "palette",
				icon: null,
				text: "Open the command palette",
				action: "Open",
				onClick: onOpenCommandPalette,
			});
		}
		return t;
	}, [
		onboarding,
		showDailyNoteAction,
		onCreateNote,
		onOpenDailyNote,
		onOpenCommandPalette,
	]);

	const [tipIndex, setTipIndex] = useState(0);

	useEffect(() => {
		if (tips.length <= 1) return;
		const interval = setInterval(() => {
			setTipIndex((i) => i + 1);
		}, 5000);
		return () => clearInterval(interval);
	}, [tips.length]);

	if (tips.length === 0) {
		return (
			<div className="mainEmptyBottomBlock">
				<p className="mainEmptyPrompt">
					Press{" "}
					<button
						type="button"
						className="mainEmptyShortcutInline"
						onClick={onOpenCommandPalette}
						title="Open command palette"
					>
						<kbd className="mainEmptyShortcutBadge">
							<span className="mainEmptyShortcutCombo">
								{commandShortcutParts.map((part) => (
									<span key={part} className="mainEmptyShortcutPart">
										{part}
									</span>
								))}
							</span>
						</kbd>
					</button>{" "}
					to get started
				</p>
				<div className="mainEmptyTagline">{APP_TAGLINE}</div>
			</div>
		);
	}

	const activeTip = tips[tipIndex % tips.length];
	const transition = reduced ? { duration: 0 } : springPresets.gentle;

	return (
		<div className="mainEmptyContextual">
			<AnimatePresence mode="wait">
				<m.div
					key={activeTip.key}
					className="mainEmptyTip"
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -8 }}
					transition={transition}
				>
					{activeTip.icon && (
						<span className="mainEmptyTipIcon">{activeTip.icon}</span>
					)}
					{activeTip.key === "palette" && (
						<span className="mainEmptyTipIcon">
							{commandShortcutParts.map((part) => (
								<kbd key={part} className="mainEmptyTipKbd">
									{part}
								</kbd>
							))}
						</span>
					)}
					<span className="mainEmptyTipText">{activeTip.text}</span>
					<button
						type="button"
						className="mainEmptyTipAction"
						onClick={activeTip.onClick}
					>
						{activeTip.action}
					</button>
				</m.div>
			</AnimatePresence>
			<div className="mainEmptyTagline mainEmptyTaglineEdge">{APP_TAGLINE}</div>
			{tips.length > 1 && (
				<div className="mainEmptyTipDots">
					{tips.map((tip, i) => (
						<span
							key={tip.key}
							className={`mainEmptyTipDot${i === tipIndex % tips.length ? " mainEmptyTipDotActive" : ""}`}
						/>
					))}
				</div>
			)}
		</div>
	);
}

interface EditorPaneCanvasProps {
	fileTree: MainContentProps["fileTree"];
	pane: WorkspaceEditorPane;
	focused: boolean;
	allowWindowDrag: boolean;
	rootEntries: FsEntry[];
	childrenByDir: Record<string, FsEntry[] | undefined>;
	onOpenFile: (relPath: string) => Promise<void>;
	onOpenFileInNewTab: (relPath: string) => Promise<void>;
	onOpenActivity: () => void;
	onPrefetchActivity: () => void;
	onOpenDatabase: (databaseId: string) => void;
	onCreateNote: () => void;
	onOpenCommandPalette: () => void;
	onOpenDailyNote: () => void;
	onStartRenamePath: (path: string) => void;
	onNavigateBreadcrumbPath: (dirPath: string) => void;
	onLoadBreadcrumbDir: (dirPath: string) => Promise<void>;
	onSelectTab: (tabId: string) => void;
	onCloseTab: (tabId: string) => void;
	onReorderTabs: (fromTabId: string, toTabId: string) => void;
	onOpenBlankTab: (paneId: string) => void;
	onGoBack: (paneId: string) => void;
	onGoForward: (paneId: string) => void;
	setDirtyByPath: Dispatch<SetStateAction<Record<string, boolean>>>;
	onInfoSidebarOpenChange: (open: boolean) => void;
	onboarding: OnboardingSettings;
	commandShortcutParts: string[];
	showDailyNoteAction: boolean;
	showStarterPane: boolean;
	onDismissStarter: () => void;
	databasesOpenRequest: DatabasesOpenRequest;
	onConsumeDatabasesOpenRequest?: () => void;
}

const EditorPaneCanvas = memo(function EditorPaneCanvas({
	fileTree,
	pane,
	focused,
	allowWindowDrag,
	rootEntries,
	childrenByDir,
	onOpenFile,
	onOpenFileInNewTab,
	onOpenActivity,
	onPrefetchActivity,
	onOpenDatabase,
	onCreateNote,
	onOpenCommandPalette,
	onOpenDailyNote,
	onStartRenamePath,
	onNavigateBreadcrumbPath,
	onLoadBreadcrumbDir,
	onSelectTab,
	onCloseTab,
	onReorderTabs,
	onOpenBlankTab,
	onGoBack,
	onGoForward,
	setDirtyByPath,
	onInfoSidebarOpenChange,
	onboarding,
	commandShortcutParts,
	showDailyNoteAction,
	showStarterPane,
	onDismissStarter,
	databasesOpenRequest,
	onConsumeDatabasesOpenRequest,
}: EditorPaneCanvasProps) {
	const [activeGitDiffState, setActiveGitDiffState] =
		useState<ActiveGitDiffState | null>(null);
	const viewerPath = pane.activeTabPath;
	const currentMarkdownPath = viewerPath?.toLowerCase().endsWith(".md")
		? viewerPath
		: null;
	const activeGitDiff =
		activeGitDiffState?.path === currentMarkdownPath
			? activeGitDiffState.diff
			: null;

	useEffect(() => {
		setActiveGitDiffState(null);
	}, [viewerPath]);

	const handleGitDiffChange = useCallback(
		(diff: GitCommitDiff | null) => {
			setActiveGitDiffState(
				diff && currentMarkdownPath
					? { path: currentMarkdownPath, diff }
					: null,
			);
		},
		[currentMarkdownPath],
	);

	const handlePrefetchTab = useCallback(
		(target: string | null) => {
			if (!target) return;
			if (target.toLowerCase().endsWith(".md")) {
				prefetchNote(target);
				return;
			}
			if (target === ALL_DOCS_TAB_ID) {
				void loadAllDocsPane();
				void prefetchAllDocs(null);
				return;
			}
			if (target === ACTIVITY_TIMELINE_TAB_ID) {
				void loadActivityTimelinePane();
				void prefetchAllDocs(null, ACTIVITY_DOCS_PAGE_SIZE);
				return;
			}
			if (target === DATABASES_TAB_ID) {
				void loadDatabasesPane();
				void prefetchDatabasesLanding(databasesOpenRequest.databaseId);
			}
		},
		[databasesOpenRequest.databaseId],
	);

	const content = useMemo(() => {
		if (!viewerPath) return null;
		if (viewerPath === ALL_DOCS_TAB_ID) {
			return (
				<Suspense fallback={<CanvasPaneAwait variant="all-docs" />}>
					<AllDocsPane
						onOpenFile={onOpenFile}
						onOpenActivity={onOpenActivity}
						onPrefetchActivity={onPrefetchActivity}
						initialNotes={getPrefetchedAllDocs(null)}
					/>
				</Suspense>
			);
		}
		if (viewerPath === PINNED_DOCS_TAB_ID) {
			return (
				<Suspense fallback={<CanvasPaneAwait variant="all-docs" />}>
					<PinnedDocsPane
						onOpenFile={onOpenFile}
						onOpenDatabase={onOpenDatabase}
					/>
				</Suspense>
			);
		}
		if (viewerPath === ACTIVITY_TIMELINE_TAB_ID) {
			return (
				<Suspense fallback={<CanvasPaneAwait variant="all-docs" />}>
					<ActivityTimelinePane onOpenFile={onOpenFile} />
				</Suspense>
			);
		}
		if (viewerPath === DATABASES_TAB_ID) {
			const initialDatabaseId = databasesOpenRequest.databaseId;
			return (
				<Suspense fallback={<CanvasPaneAwait variant="databases" />}>
					<DatabasesPane
						onOpenFile={onOpenFile}
						onRenameNotePath={(notePath, nextName) =>
							fileTree.onRenameDir(notePath, nextName, "file")
						}
						databasesOpenRequest={databasesOpenRequest}
						onConsumeOpenRequest={onConsumeDatabasesOpenRequest}
						initialDocument={
							initialDatabaseId
								? getPrefetchedDatabaseDocument(initialDatabaseId)
								: null
						}
					/>
				</Suspense>
			);
		}
		if (viewerPath === SPACE_CONNECTIONS_TAB_ID) {
			return (
				<Suspense fallback={<CanvasPaneAwait variant="connections" />}>
					<SpaceConnectionsView />
				</Suspense>
			);
		}
		if (!viewerPath.toLowerCase().endsWith(".md")) return null;
		const extractToNoteActions = {
			createMarkdownFile: fileTree.createMarkdownFileAtPath,
			openNote: onOpenFile,
			openNoteInNewTab: onOpenFileInNewTab,
		} satisfies ExtractToNoteActions;
		return (
			<NotePane
				relPath={viewerPath}
				initialDoc={getPrefetchedNote(viewerPath)}
				extractToNoteActions={extractToNoteActions}
				active={focused}
				onInfoSidebarOpenChange={
					focused ? onInfoSidebarOpenChange : undefined
				}
				gitDiff={activeGitDiff}
				onGitDiffChange={handleGitDiffChange}
				onDirtyChange={(dirty) =>
					setDirtyByPath((previous) =>
						previous[viewerPath] === dirty
							? previous
							: { ...previous, [viewerPath]: dirty },
					)
				}
			/>
		);
	}, [
		activeGitDiff,
		databasesOpenRequest,
		fileTree,
		focused,
		handleGitDiffChange,
		onConsumeDatabasesOpenRequest,
		onInfoSidebarOpenChange,
		onOpenActivity,
		onOpenDatabase,
		onOpenFile,
		onOpenFileInNewTab,
		onPrefetchActivity,
		setDirtyByPath,
		viewerPath,
	]);

	const isSpaceConnectionsTab = viewerPath === SPACE_CONNECTIONS_TAB_ID;
	const isAllDocsTab = viewerPath === ALL_DOCS_TAB_ID;
	const isActivityTab = viewerPath === ACTIVITY_TIMELINE_TAB_ID;
	const isDatabasesTab = viewerPath === DATABASES_TAB_ID;

	return (
		<div
			className="canvasPaneHost"
			data-space-connections={isSpaceConnectionsTab ? "true" : undefined}
			data-all-docs={isAllDocsTab || isActivityTab ? "true" : undefined}
			data-databases={isDatabasesTab ? "true" : undefined}
		>
			{pane.tabs.length > 0 ? (
				<div className="mainTabBarTransition">
					<TabBar
						tabs={pane.tabs}
						rootEntries={rootEntries}
						childrenByDir={childrenByDir}
						activeTabId={pane.activeTabId}
						activeTabPath={pane.activeTabPath}
						useWindowBackground={!content}
						allowWindowDrag={allowWindowDrag}
						canGoBack={pane.canGoBack}
						canGoForward={pane.canGoForward}
						onGoBack={() => onGoBack(pane.id)}
						onGoForward={() => onGoForward(pane.id)}
						onOpenBlankTab={() => onOpenBlankTab(pane.id)}
						onPrefetchTab={handlePrefetchTab}
						onNavigateBreadcrumbPath={onNavigateBreadcrumbPath}
						onLoadBreadcrumbDir={onLoadBreadcrumbDir}
						onOpenBreadcrumbFile={onOpenFile}
						onRenameFile={(path, nextName) =>
							fileTree.onRenameDir(path, nextName, "file")
						}
						onSelectTab={onSelectTab}
						onCloseTab={onCloseTab}
						onStartRenamePath={onStartRenamePath}
						onReorder={onReorderTabs}
					/>
				</div>
			) : (
				<div
					aria-hidden="true"
					className="mainTabsEmptyDragRegion"
					data-tauri-drag-region={allowWindowDrag ? "" : undefined}
					onMouseDown={allowWindowDrag ? onWindowDragMouseDown : undefined}
				/>
			)}
			{content ?? (
				<div className="mainEmptyState">
					{showStarterPane ? (
						<GettingStartedPane
							commandShortcutParts={commandShortcutParts}
							showDailyNoteAction={showDailyNoteAction}
							onCreateNote={onCreateNote}
							onOpenCommandPalette={onOpenCommandPalette}
							onOpenDailyNote={onOpenDailyNote}
							onDismiss={onDismissStarter}
						/>
					) : (
						<ContextualEmptyState
							onboarding={onboarding}
							commandShortcutParts={commandShortcutParts}
							showDailyNoteAction={showDailyNoteAction}
							onCreateNote={onCreateNote}
							onOpenCommandPalette={onOpenCommandPalette}
							onOpenDailyNote={onOpenDailyNote}
						/>
					)}
				</div>
			)}
		</div>
	);
});

interface MainContentProps {
	fileTree: {
		createMarkdownFileAtPath: (
			options: CreateMarkdownFileOptions,
		) => Promise<string | null>;
		openNonMarkdownExternally: (relPath: string) => Promise<void>;
		onRenameDir: (
			path: string,
			nextName: string,
			kind: "dir" | "file",
		) => Promise<string | null>;
		onDeletePath: (path: string, kind: "dir" | "file") => Promise<boolean>;
	};
	onOpenFile: (relPath: string) => Promise<void>;
	onOpenFolioFile: (relPath: string) => Promise<void>;
	onOpenFileInNewTab: (relPath: string) => Promise<void>;
	onOpenFolioFileInNewTab: (relPath: string) => Promise<void>;
	onOpenCommandPalette: () => void;
	onCreateNote: () => void;
	onOpenDailyNote: () => void;
	onOpenActivity: () => void;
	onPrefetchActivity: () => void;
	onOpenDatabase: (databaseId: string) => void;
	tabs: WorkspaceTab[];
	panes: Record<string, WorkspaceEditorPane>;
	splitLayout: SplitEditorNode;
	focusedPaneId: string;
	rootEntries: FsEntry[];
	childrenByDir: Record<string, FsEntry[] | undefined>;
	activeTabId: string | null;
	activeTabPath: string | null;
	setActiveTabId: (tabId: string | null) => void;
	setDirtyByPath: Dispatch<SetStateAction<Record<string, boolean>>>;
	closeTab: (tabId: string) => void;
	closeTabsForPathRemoval: (path: string, recursive?: boolean) => void;
	renameTabsForPath: (
		fromPath: string,
		toPath: string,
		recursive?: boolean,
	) => void;
	reorderTabs: (fromTabId: string, toTabId: string) => void;
	openBlankTabInPane: (paneId: string) => void;
	openFileInPane: (path: string, paneId: string) => boolean;
	splitPaneWithFile: (
		paneId: string,
		edge: Exclude<SplitEditorDropTarget["edge"], "center">,
		path: string,
	) => void;
	moveTabToPane: (
		tabId: string,
		paneId: string,
		edge: SplitEditorDropTarget["edge"],
	) => void;
	focusPane: (paneId: string) => void;
	resizeSplit: (splitId: string, ratio: number) => void;
	onStartRenamePath: (path: string) => void;
	onNavigateBreadcrumbPath: (dirPath: string) => void;
	onLoadBreadcrumbDir: (dirPath: string) => Promise<void>;
	replaceActiveTabWithBlank: () => void;
	onGoBackInPane: (paneId: string) => void;
	onGoForwardInPane: (paneId: string) => void;
	showGettingStartedRequest: number;
	databasesOpenRequest: DatabasesOpenRequest;
	onConsumeDatabasesOpenRequest?: () => void;
	dailyNoteSetupNoticeRequest: number;
	onOpenDailyNotesSettings: () => void;
	onRightSidebarOpenChange?: (open: boolean) => void;
}

export const MainContent = memo(function MainContent({
	fileTree,
	onOpenFile,
	onOpenFolioFile,
	onOpenFileInNewTab,
	onOpenFolioFileInNewTab,
	onOpenCommandPalette,
	onCreateNote,
	onOpenDailyNote,
	onOpenActivity,
	onPrefetchActivity,
	onOpenDatabase,
	tabs,
	panes,
	splitLayout,
	focusedPaneId,
	rootEntries,
	childrenByDir,
	activeTabId,
	activeTabPath,
	setActiveTabId,
	setDirtyByPath,
	closeTab,
	closeTabsForPathRemoval,
	renameTabsForPath,
	reorderTabs,
	openBlankTabInPane,
	openFileInPane,
	splitPaneWithFile,
	moveTabToPane,
	focusPane,
	resizeSplit,
	onStartRenamePath,
	onNavigateBreadcrumbPath,
	onLoadBreadcrumbDir,
	replaceActiveTabWithBlank,
	onGoBackInPane,
	onGoForwardInPane,
	showGettingStartedRequest,
	databasesOpenRequest,
	onConsumeDatabasesOpenRequest,
	dailyNoteSetupNoticeRequest,
	onOpenDailyNotesSettings,
	onRightSidebarOpenChange,
}: MainContentProps) {
	const { spacePath, settingsLoaded, onOpenSpace } = useSpace();
	const { getBinding } = useShortcutBindings();
	const { dailyNotesFolder, folioMode, settingsMode, settingsTab } =
		useUILayoutContext();
	const { aiEnabled, aiPanelOpen, setAiPanelOpen } = useAISidebarContext();
	const [onboarding, setOnboarding] = useState<OnboardingSettings>(
		DEFAULT_ONBOARDING_SETTINGS,
	);
	const [onboardingLoaded, setOnboardingLoaded] = useState(false);
	const [starterOverrideVisible, setStarterOverrideVisible] = useState(false);
	const [infoSidebarWidth, setInfoSidebarWidth] = useState(340);
	const [infoSidebarOpen, setInfoSidebarOpen] = useState(false);
	const handledShowGettingStartedRequestRef = useRef(0);
	const handledDailyNoteSetupNoticeRequestRef = useRef(0);
	const activeTab = useMemo(
		() => tabs.find((tab) => tab.id === activeTabId) ?? null,
		[tabs, activeTabId],
	);

	useEffect(() => {
		if (!activeTab || activeTab.kind === "blank") return;
		setStarterOverrideVisible(false);
	}, [activeTab]);

	useEffect(() => {
		if (
			!spacePath ||
			showGettingStartedRequest === 0 ||
			showGettingStartedRequest === handledShowGettingStartedRequestRef.current
		) {
			return;
		}
		handledShowGettingStartedRequestRef.current = showGettingStartedRequest;
		setStarterOverrideVisible(true);
		replaceActiveTabWithBlank();
	}, [replaceActiveTabWithBlank, showGettingStartedRequest, spacePath]);

	useEffect(() => {
		const handlePathRemoved = (event: Event) => {
			const detail = (event as CustomEvent<PathRemovedDetail>).detail;
			if (!detail?.path) return;
			closeTabsForPathRemoval(detail.path, detail.recursive);
		};
		const handlePathRenamed = (event: Event) => {
			const detail = (event as CustomEvent<PathRenamedDetail>).detail;
			if (!detail?.fromPath || !detail?.toPath) return;
			renameTabsForPath(detail.fromPath, detail.toPath, detail.recursive);
		};
		window.addEventListener(PATH_REMOVED_EVENT, handlePathRemoved);
		window.addEventListener(PATH_RENAMED_EVENT, handlePathRenamed);
		return () => {
			window.removeEventListener(PATH_REMOVED_EVENT, handlePathRemoved);
			window.removeEventListener(PATH_RENAMED_EVENT, handlePathRenamed);
		};
	}, [closeTabsForPathRemoval, renameTabsForPath]);

	const openCommandPaletteShortcut = getBinding("open-command-palette");
	const commandShortcutParts = useMemo(
		() =>
			openCommandPaletteShortcut
				? formatShortcutPartsForPlatform(openCommandPaletteShortcut)
				: [],
		[openCommandPaletteShortcut],
	);
	const hasStarterCompletion =
		onboarding.createdFirstNote ||
		onboarding.usedCommandPalette ||
		onboarding.openedDailyNote;
	const showStarterByDefault =
		onboardingLoaded &&
		!onboarding.starterDismissed &&
		!hasStarterCompletion &&
		tabs.length === 0 &&
		!activeTabPath;
	const showStarterPane =
		Boolean(spacePath) &&
		(showStarterByDefault || (starterOverrideVisible && !activeTabPath));
	const aiSidebarVisible = aiEnabled && aiPanelOpen && !infoSidebarOpen;
	const rightSidebarOpen =
		Boolean(spacePath) &&
		!settingsMode &&
		(aiSidebarVisible || infoSidebarOpen);
	const infoSidebarResize = useResizablePanel({
		min: 260,
		max: 620,
		direction: "left",
		onResize: setInfoSidebarWidth,
		currentWidth: infoSidebarWidth,
	});
	const notesInfoSidebarHostStyle = useMemo<CSSProperties>(
		() =>
			({
				"--markdown-info-sidebar-width": `${infoSidebarWidth}px`,
			}) as CSSProperties,
		[infoSidebarWidth],
	);
	useEffect(() => {
		onRightSidebarOpenChange?.(rightSidebarOpen);
	}, [onRightSidebarOpenChange, rightSidebarOpen]);

	useEffect(
		() => () => {
			onRightSidebarOpenChange?.(false);
		},
		[onRightSidebarOpenChange],
	);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const settings = await loadSettings();
				if (cancelled) return;
				setOnboarding(settings.onboarding);
			} finally {
				if (!cancelled) setOnboardingLoaded(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		if (!payload.onboarding) return;
		setOnboarding((prev) => ({ ...prev, ...payload.onboarding }));
	});

	useEffect(() => {
		if (
			dailyNoteSetupNoticeRequest === 0 ||
			dailyNoteSetupNoticeRequest ===
				handledDailyNoteSetupNoticeRequestRef.current
		) {
			return;
		}
		if (!spacePath) return;
		handledDailyNoteSetupNoticeRequestRef.current = dailyNoteSetupNoticeRequest;
		toast.info("Set a folder to use daily notes", {
			id: DAILY_NOTES_SETUP_TOAST_ID,
			description: "Glyph will create each day's note there automatically.",
			duration: 7200,
			action: {
				label: "Open settings",
				onClick: () => {
					toast.dismiss(DAILY_NOTES_SETUP_TOAST_ID);
					onOpenDailyNotesSettings();
				},
			},
		});
	}, [dailyNoteSetupNoticeRequest, onOpenDailyNotesSettings, spacePath]);

	useEffect(() => {
		if (spacePath) return;
		toast.dismiss(DAILY_NOTES_SETUP_TOAST_ID);
	}, [spacePath]);

	const handleInfoSidebarResizePointerDown = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			if (!rightSidebarOpen) return;
			infoSidebarResize.handlePointerDown(event);
		},
		[infoSidebarResize, rightSidebarOpen],
	);

	const settingsTabContentByTab: Record<SettingsTab, ReactNode> = {
		general: <GeneralSettingsPane />,
		appearance: <AppearanceSettingsPane />,
		shortcuts: (
			<Suspense fallback={null}>
				<ShortcutsSettingsPane />
			</Suspense>
		),
		ai: <AiSettingsPane />,
		space: <SpaceSettingsPane />,
		git: <GitSettingsPane />,
		about: <AboutSettingsPane />,
	};

	const { i18n } = useTranslation();
	const activeSettingsTabMeta = useMemo(
		() =>
			SETTINGS_TABS.find((tab) => tab.id === settingsTab) ?? SETTINGS_TABS[0],
		[settingsTab],
	);
	const settingsPanelTitle = localizedSettingsTabLabel(
		activeSettingsTabMeta.id,
		i18n.language,
	);
	const handleSplitDrop = useCallback(
		(source: SplitEditorDragSource, target: SplitEditorDropTarget) => {
			if (source.kind === "tab") {
				moveTabToPane(source.tabId, target.paneId, target.edge);
				return;
			}
			const existingTab = tabs.find((tab) => tab.target === source.path);
			if (existingTab) {
				moveTabToPane(existingTab.id, target.paneId, target.edge);
				return;
			}
			if (target.edge === "center") {
				openFileInPane(source.path, target.paneId);
				return;
			}
			splitPaneWithFile(target.paneId, target.edge, source.path);
		},
		[moveTabToPane, openFileInPane, splitPaneWithFile, tabs],
	);

	const renderEditorPane = useCallback(
		(paneId: string, focused: boolean) => {
			const pane = panes[paneId];
			if (!pane) return null;
			return (
				<EditorPaneCanvas
					key={paneId}
					fileTree={fileTree}
					pane={pane}
					focused={focused}
					allowWindowDrag={Object.keys(panes).length === 1}
					rootEntries={rootEntries}
					childrenByDir={childrenByDir}
					onOpenFile={onOpenFile}
					onOpenFileInNewTab={onOpenFileInNewTab}
					onOpenActivity={onOpenActivity}
					onPrefetchActivity={onPrefetchActivity}
					onOpenDatabase={onOpenDatabase}
					onCreateNote={onCreateNote}
					onOpenCommandPalette={onOpenCommandPalette}
					onOpenDailyNote={onOpenDailyNote}
					onStartRenamePath={onStartRenamePath}
					onNavigateBreadcrumbPath={onNavigateBreadcrumbPath}
					onLoadBreadcrumbDir={onLoadBreadcrumbDir}
					onSelectTab={setActiveTabId}
					onCloseTab={closeTab}
					onReorderTabs={reorderTabs}
					onOpenBlankTab={openBlankTabInPane}
					onGoBack={onGoBackInPane}
					onGoForward={onGoForwardInPane}
					setDirtyByPath={setDirtyByPath}
					onInfoSidebarOpenChange={setInfoSidebarOpen}
					onboarding={onboarding}
					commandShortcutParts={commandShortcutParts}
					showDailyNoteAction={Boolean(dailyNotesFolder)}
					showStarterPane={focused && showStarterPane}
					onDismissStarter={() => {
						setStarterOverrideVisible(false);
						void updateOnboardingSettings({ starterDismissed: true });
					}}
					databasesOpenRequest={databasesOpenRequest}
					onConsumeDatabasesOpenRequest={onConsumeDatabasesOpenRequest}
				/>
			);
		},
		[
			childrenByDir,
			closeTab,
			commandShortcutParts,
			dailyNotesFolder,
			databasesOpenRequest,
			fileTree,
			onConsumeDatabasesOpenRequest,
			onLoadBreadcrumbDir,
			onNavigateBreadcrumbPath,
			onOpenActivity,
			onOpenCommandPalette,
			onOpenDailyNote,
			onOpenDatabase,
			onOpenFile,
			onOpenFileInNewTab,
			onCreateNote,
			onGoBackInPane,
			onGoForwardInPane,
			onPrefetchActivity,
			onStartRenamePath,
			onboarding,
			openBlankTabInPane,
			panes,
			reorderTabs,
			rootEntries,
			setActiveTabId,
			setDirtyByPath,
			showStarterPane,
			starterOverrideVisible,
		],
	);
	const editorCanvas = (
		<SplitEditorLayout
			layout={splitLayout}
			focusedPaneId={focusedPaneId}
			onFocusPane={focusPane}
			onDrop={handleSplitDrop}
			onResizeSplit={resizeSplit}
			renderPane={renderEditorPane}
		/>
	);
	const rightSidebarSurface = (
		<>
			<div
				ref={infoSidebarResize.resizeRef}
				className={cn(
					"notesInfoSidebarResizeHandle",
					!rightSidebarOpen && "is-hidden",
				)}
				onPointerDown={handleInfoSidebarResizePointerDown}
				onPointerMove={infoSidebarResize.handlePointerMove}
				onPointerUp={infoSidebarResize.handlePointerUp}
				data-window-drag-ignore
			/>
			<div
				id="notes-info-sidebar-root"
				className="notesInfoSidebarHost"
				aria-live="polite"
				data-open={rightSidebarOpen ? "true" : undefined}
				style={notesInfoSidebarHostStyle}
			>
				{aiSidebarVisible ? (
					<AIFloatingHost
						isOpen={aiPanelOpen}
						onToggle={() => setAiPanelOpen((open) => !open)}
					/>
				) : null}
			</div>
		</>
	);

	if (settingsMode) {
		return (
			<main className="mainArea">
				<div className="settingsTabPanel">
					<header className="settingsPanelHeader">
						<div className="settingsPanelTitleRow">
							<h2 className="settingsPanelTitle">{settingsPanelTitle}</h2>
						</div>
					</header>
					{settingsTabContentByTab[settingsTab]}
				</div>
			</main>
		);
	}

	if (!spacePath) {
		if (!settingsLoaded) return <main className="mainArea" />;
		return (
			<m.main
				className="mainArea mainAreaWelcome"
				initial={{ opacity: 0, scale: 0.98 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{
					type: "spring",
					stiffness: 260,
					damping: 24,
					duration: 0.4,
				}}
			>
				<WelcomeScreen onOpenSpace={onOpenSpace} />
			</m.main>
		);
	}

	return (
		<>
			<main
				className="mainArea"
				data-right-sidebar-open={rightSidebarOpen ? "true" : undefined}
			>
				<div className="canvasWrapper">
					{folioMode ? (
						<FolioWorkspace
							activeTabPath={activeTabPath}
							onOpenFile={onOpenFolioFile}
							onOpenFileInNewTab={onOpenFolioFileInNewTab}
							onRenameFile={(path, nextName) =>
								fileTree.onRenameDir(path, nextName, "file")
							}
							onDeleteFile={(path) => fileTree.onDeletePath(path, "file")}
						>
							{editorCanvas}
						</FolioWorkspace>
					) : (
						editorCanvas
					)}
				</div>
			</main>
			{rightSidebarSurface}
		</>
	);
});
