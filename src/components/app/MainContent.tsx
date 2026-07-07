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
import { AdvancedSettingsPane } from "../settings/AdvancedSettingsPane";
import { AiSettingsPane } from "../settings/AiSettingsPane";
import { AppearanceSettingsPane } from "../settings/AppearanceSettingsPane";
import { GeneralSettingsPane } from "../settings/GeneralSettingsPane";
import { GitSettingsPane } from "../settings/GitSettingsPane";
import { SpaceSettingsPane } from "../settings/SpaceSettingsPane";
import { SETTINGS_TABS, type SettingsTab } from "../settings/settingsConfig";
import { springPresets } from "../ui/animations";
import { CanvasPaneAwait } from "./CanvasPaneAwait";
import { GettingStartedPane } from "./GettingStartedPane";
import { TabBar } from "./TabBar";
import { WelcomeScreen } from "./WelcomeScreen";
import {
	loadActivityTimelinePane,
	loadAllDocsPane,
	loadDatabasesPane,
} from "./prefetchablePanes";
import type { WorkspaceTab } from "./useTabManager";

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
	tabs: WorkspaceTab[];
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
	openBlankTab: () => void;
	onStartRenamePath: (path: string) => void;
	onNavigateBreadcrumbPath: (dirPath: string) => void;
	onLoadBreadcrumbDir: (dirPath: string) => Promise<void>;
	replaceActiveTabWithBlank: () => void;
	canGoBack: boolean;
	canGoForward: boolean;
	onGoBack: () => void;
	onGoForward: () => void;
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
	tabs,
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
	openBlankTab,
	onStartRenamePath,
	onNavigateBreadcrumbPath,
	onLoadBreadcrumbDir,
	replaceActiveTabWithBlank,
	canGoBack,
	canGoForward,
	onGoBack,
	onGoForward,
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
	const [activeGitDiffState, setActiveGitDiffState] =
		useState<ActiveGitDiffState | null>(null);
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

	const viewerPath = activeTabPath;
	const currentMarkdownPath = viewerPath?.toLowerCase().endsWith(".md")
		? viewerPath
		: null;
	const activeGitDiff =
		activeGitDiffState?.path === currentMarkdownPath
			? activeGitDiffState.diff
			: null;

	// biome-ignore lint/correctness/useExhaustiveDependencies: clear the active git diff when the viewer path changes.
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
	const showTabBar = tabs.length > 0;
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

	useEffect(() => {
		if (!spacePath) return;
		let cancelled = false;
		const run = () => {
			if (cancelled) return;
			void loadDatabasesPane();
			void loadAllDocsPane();
			void prefetchDatabasesLanding(databasesOpenRequest.databaseId);
		};
		if (typeof window.requestIdleCallback === "function") {
			const idleId = window.requestIdleCallback(run, { timeout: 900 });
			return () => {
				cancelled = true;
				window.cancelIdleCallback(idleId);
			};
		}
		const timeout = window.setTimeout(run, 180);
		return () => {
			cancelled = true;
			window.clearTimeout(timeout);
		};
	}, [databasesOpenRequest.databaseId, spacePath]);

	const handleInfoSidebarResizePointerDown = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			if (!rightSidebarOpen) return;
			infoSidebarResize.handlePointerDown(event);
		},
		[infoSidebarResize, rightSidebarOpen],
	);

	const content = useMemo(() => {
		if (!viewerPath) return null;
		if (viewerPath === ALL_DOCS_TAB_ID) {
			const initialNotes = getPrefetchedAllDocs(null);
			return (
				<Suspense fallback={<CanvasPaneAwait variant="all-docs" />}>
					<AllDocsPane
						onOpenFile={onOpenFile}
						onOpenActivity={onOpenActivity}
						onPrefetchActivity={onPrefetchActivity}
						initialNotes={initialNotes}
					/>
				</Suspense>
			);
		}
		if (viewerPath === PINNED_DOCS_TAB_ID) {
			return (
				<Suspense fallback={<CanvasPaneAwait variant="all-docs" />}>
					<PinnedDocsPane onOpenFile={onOpenFile} />
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
			const initialDocument = initialDatabaseId
				? getPrefetchedDatabaseDocument(initialDatabaseId)
				: null;
			return (
				<Suspense fallback={<CanvasPaneAwait variant="databases" />}>
					<DatabasesPane
						onOpenFile={onOpenFile}
						onRenameNotePath={(notePath, nextName) =>
							fileTree.onRenameDir(notePath, nextName, "file")
						}
						databasesOpenRequest={databasesOpenRequest}
						onConsumeOpenRequest={onConsumeDatabasesOpenRequest}
						initialDocument={initialDocument}
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
		if (viewerPath.toLowerCase().endsWith(".md")) {
			const initialDoc = getPrefetchedNote(viewerPath);
			const extractToNoteActions = {
				createMarkdownFile: fileTree.createMarkdownFileAtPath,
				openNote: onOpenFile,
				openNoteInNewTab: onOpenFileInNewTab,
			} satisfies ExtractToNoteActions;
			return (
				<NotePane
					relPath={viewerPath}
					initialDoc={initialDoc}
					extractToNoteActions={extractToNoteActions}
					onInfoSidebarOpenChange={setInfoSidebarOpen}
					gitDiff={activeGitDiff}
					onGitDiffChange={handleGitDiffChange}
					onDirtyChange={(dirty) =>
						setDirtyByPath((prev) =>
							prev[viewerPath] === dirty
								? prev
								: { ...prev, [viewerPath]: dirty },
						)
					}
				/>
			);
		}
		return null;
	}, [
		fileTree,
		onOpenFile,
		onOpenFileInNewTab,
		onOpenActivity,
		onPrefetchActivity,
		databasesOpenRequest,
		onConsumeDatabasesOpenRequest,
		viewerPath,
		setDirtyByPath,
		activeGitDiff,
		handleGitDiffChange,
	]);

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
				return;
			}
			if (target === SPACE_CONNECTIONS_TAB_ID) {
				return;
			}
		},
		[databasesOpenRequest.databaseId],
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
		advanced: <AdvancedSettingsPane />,
		about: <AboutSettingsPane />,
	};

	const activeSettingsTabMeta = useMemo(
		() =>
			SETTINGS_TABS.find((tab) => tab.id === settingsTab) ?? SETTINGS_TABS[0],
		[settingsTab],
	);
	const isSpaceConnectionsTab = viewerPath === SPACE_CONNECTIONS_TAB_ID;
	const isAllDocsTab = viewerPath === ALL_DOCS_TAB_ID;
	const isActivityTab = viewerPath === ACTIVITY_TIMELINE_TAB_ID;
	const isDatabasesTab = viewerPath === DATABASES_TAB_ID;
	const editorCanvas = (
		<div
			className="canvasPaneHost"
			data-space-connections={isSpaceConnectionsTab ? "true" : undefined}
			data-all-docs={isAllDocsTab || isActivityTab ? "true" : undefined}
			data-databases={isDatabasesTab ? "true" : undefined}
		>
			{showTabBar ? (
				<div className="mainTabBarTransition">
					<TabBar
						tabs={tabs}
						rootEntries={rootEntries}
						childrenByDir={childrenByDir}
						activeTabId={activeTabId}
						activeTabPath={activeTabPath}
						useWindowBackground={!content}
						canGoBack={canGoBack}
						canGoForward={canGoForward}
						onGoBack={onGoBack}
						onGoForward={onGoForward}
						onOpenBlankTab={openBlankTab}
						onPrefetchTab={handlePrefetchTab}
						onNavigateBreadcrumbPath={onNavigateBreadcrumbPath}
						onLoadBreadcrumbDir={onLoadBreadcrumbDir}
						onOpenBreadcrumbFile={onOpenFile}
						onRenameFile={(path, nextName) =>
							fileTree.onRenameDir(path, nextName, "file")
						}
						onSelectTab={setActiveTabId}
						onCloseTab={closeTab}
						onStartRenamePath={onStartRenamePath}
						onReorder={reorderTabs}
					/>
				</div>
			) : (
				<div
					aria-hidden="true"
					className="mainTabsEmptyDragRegion"
					data-tauri-drag-region
					onMouseDown={onWindowDragMouseDown}
				/>
			)}
			{content ?? (
				<div className="mainEmptyState">
					{showStarterPane ? (
						<GettingStartedPane
							commandShortcutParts={commandShortcutParts}
							showDailyNoteAction={Boolean(dailyNotesFolder)}
							onCreateNote={onCreateNote}
							onOpenCommandPalette={onOpenCommandPalette}
							onOpenDailyNote={onOpenDailyNote}
							onDismiss={() => {
								setStarterOverrideVisible(false);
								void updateOnboardingSettings({ starterDismissed: true });
							}}
						/>
					) : (
						<ContextualEmptyState
							onboarding={onboarding}
							commandShortcutParts={commandShortcutParts}
							showDailyNoteAction={Boolean(dailyNotesFolder)}
							onCreateNote={onCreateNote}
							onOpenCommandPalette={onOpenCommandPalette}
							onOpenDailyNote={onOpenDailyNote}
						/>
					)}
				</div>
			)}
		</div>
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
							<h2 className="settingsPanelTitle">
								{activeSettingsTabMeta.label}
							</h2>
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
