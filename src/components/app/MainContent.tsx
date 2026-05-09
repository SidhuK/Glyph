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
import { AI_AGENT_TAB_ID } from "../../lib/aiAgent";
import { ALL_DOCS_TAB_ID } from "../../lib/allDocs";
import {
	PATH_REMOVED_EVENT,
	PATH_RENAMED_EVENT,
	type PathRemovedDetail,
	type PathRenamedDetail,
} from "../../lib/appEvents";
import { CALENDAR_TAB_ID } from "../../lib/calendar";
import { APP_TAGLINE } from "../../lib/copy";
import { readStoredSelectedViewId } from "../../lib/database/selectedViewStorage";
import { DATABASES_TAB_ID } from "../../lib/databases";
import {
	getPrefetchedAllDocs,
	getPrefetchedCalendarData,
	getPrefetchedDatabaseDocument,
	getPrefetchedDatabaseRows,
	getPrefetchedNote,
	prefetchAllDocs,
	prefetchCalendarData,
	prefetchDatabasesLanding,
	prefetchNote,
} from "../../lib/navigationPrefetch";
import {
	DEFAULT_ONBOARDING_SETTINGS,
	type OnboardingSettings,
	loadSettings,
	updateOnboardingSettings,
} from "../../lib/settings";
import { formatShortcutPartsForPlatform } from "../../lib/shortcuts/platform";
import { todayIsoDateLocal } from "../../lib/tasks";
import type { FsEntry } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { TEMPLATES_TAB_ID } from "../../lib/templatesView";
import { cn } from "../../lib/utils";
import { Calendar, FileText, Settings } from "../Icons";
import { AIFloatingHost } from "../ai/AIFloatingHost";
import type {
	CreateMarkdownFileOptions,
	ExtractToNoteActions,
} from "../editor/types";
import { FolioWorkspace } from "../folio/FolioWorkspace";
import { FilePreviewPane } from "../preview/FilePreviewPane";
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
import { Button } from "../ui/shadcn/button";
import { GettingStartedPane } from "./GettingStartedPane";
import { TabBar } from "./TabBar";
import { WelcomeScreen } from "./WelcomeScreen";
import {
	loadAIAgentPane,
	loadAllDocsPane,
	loadCalendarPane,
	loadDatabasesPane,
} from "./prefetchablePanes";
import type { WorkspaceTab } from "./useTabManager";

const AIAgentPane = lazy(loadAIAgentPane);
const DatabasesPane = lazy(loadDatabasesPane);
const CalendarPane = lazy(loadCalendarPane);
const AllDocsPane = lazy(loadAllDocsPane);
const ShortcutsSettingsPane = lazy(() =>
	import("../settings/ShortcutsSettingsPane").then((module) => ({
		default: module.ShortcutsSettingsPane,
	})),
);

function readStorage(key: string): string | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
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
				icon: <FileText size={16} />,
				text: "Create your first note",
				action: "New note",
				onClick: onCreateNote,
			});
		}
		if (!onboarding.openedDailyNote && showDailyNoteAction) {
			t.push({
				key: "daily",
				icon: <Calendar size={16} />,
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
	tabs: WorkspaceTab[];
	rootEntries: FsEntry[];
	childrenByDir: Record<string, FsEntry[] | undefined>;
	activeTabId: string | null;
	activeTabPath: string | null;
	setActiveTabId: (tabId: string | null) => void;
	setDirtyByPath: Dispatch<SetStateAction<Record<string, boolean>>>;
	closeTab: (tabId: string) => void;
	closeActiveTab: () => void;
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
	openDatabasesId: string | null;
	dailyNoteSetupNoticeRequest: number;
	onOpenDailyNotesSettings: () => void;
	onRightSidebarOpenChange?: (open: boolean) => void;
}

function DailyNotesSetupToast({
	visible,
	onOpenSettings,
	onDismiss,
}: {
	visible: boolean;
	onOpenSettings: () => void;
	onDismiss: () => void;
}) {
	const reduced = useReducedMotion() ?? false;

	return (
		<AnimatePresence>
			{visible ? (
				<m.div
					className="dailyNotesSetupToastLayer"
					initial={reduced ? false : { opacity: 0, scale: 0.96, y: 18 }}
					animate={{ opacity: 1, scale: 1, y: 0 }}
					exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 12 }}
					transition={
						reduced
							? { duration: 0.16 }
							: { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
					}
				>
					<output className="dailyNotesSetupToast" aria-live="polite">
						<div className="dailyNotesSetupToastHeader">
							<div className="dailyNotesSetupToastIcon">
								<Calendar size={16} />
							</div>
							<div className="dailyNotesSetupToastTitleBlock">
								<div className="dailyNotesSetupToastEyebrow">Daily notes</div>
								<h2 className="dailyNotesSetupToastTitle">
									Set a folder to use daily notes
								</h2>
							</div>
						</div>
						<p className="dailyNotesSetupToastText">
							Glyph will create each day&apos;s note there automatically.
						</p>
						<div className="dailyNotesSetupToastActions">
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="dailyNotesSetupToastSecondary"
								onClick={onDismiss}
							>
								Not now
							</Button>
							<Button
								type="button"
								size="sm"
								className="dailyNotesSetupToastPrimary"
								onClick={onOpenSettings}
							>
								<Settings size={14} />
								<span>Open settings</span>
							</Button>
						</div>
					</output>
				</m.div>
			) : null}
		</AnimatePresence>
	);
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
	tabs,
	rootEntries,
	childrenByDir,
	activeTabId,
	activeTabPath,
	setActiveTabId,
	setDirtyByPath,
	closeTab,
	closeActiveTab,
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
	openDatabasesId,
	dailyNoteSetupNoticeRequest,
	onOpenDailyNotesSettings,
	onRightSidebarOpenChange,
}: MainContentProps) {
	const { spacePath, settingsLoaded, onOpenSpace } = useSpace();
	const { getBinding } = useShortcutBindings();
	const {
		dailyNotesFolder,
		templateFolder,
		folioMode,
		settingsMode,
		settingsTab,
	} = useUILayoutContext();
	const { aiEnabled, aiPanelOpen, setAiPanelOpen } = useAISidebarContext();
	const [onboarding, setOnboarding] = useState<OnboardingSettings>(
		DEFAULT_ONBOARDING_SETTINGS,
	);
	const [onboardingLoaded, setOnboardingLoaded] = useState(false);
	const [starterOverrideVisible, setStarterOverrideVisible] = useState(false);
	const [dailyNoteSetupToastVisible, setDailyNoteSetupToastVisible] =
		useState(false);
	const [infoSidebarWidth, setInfoSidebarWidth] = useState(340);
	const [infoSidebarOpen, setInfoSidebarOpen] = useState(false);
	const handledShowGettingStartedRequestRef = useRef(0);
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
		const handleCloseActiveTab = () => {
			closeActiveTab();
		};
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
		window.addEventListener("glyph:close-active-tab", handleCloseActiveTab);
		window.addEventListener(PATH_REMOVED_EVENT, handlePathRemoved);
		window.addEventListener(PATH_RENAMED_EVENT, handlePathRenamed);
		return () => {
			window.removeEventListener(
				"glyph:close-active-tab",
				handleCloseActiveTab,
			);
			window.removeEventListener(PATH_REMOVED_EVENT, handlePathRemoved);
			window.removeEventListener(PATH_RENAMED_EVENT, handlePathRenamed);
		};
	}, [closeActiveTab, closeTabsForPathRemoval, renameTabsForPath]);

	const viewerPath = activeTabPath;
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
		if (!spacePath || dailyNoteSetupNoticeRequest === 0) return;
		setDailyNoteSetupToastVisible(true);
		const timeout = window.setTimeout(() => {
			setDailyNoteSetupToastVisible(false);
		}, 5200);
		return () => window.clearTimeout(timeout);
	}, [dailyNoteSetupNoticeRequest, spacePath]);

	useEffect(() => {
		if (!spacePath) return;
		let cancelled = false;
		const run = () => {
			if (cancelled) return;
			void loadCalendarPane();
			void loadDatabasesPane();
			void loadAllDocsPane();
			void prefetchAllDocs(null);
			if (templateFolder) {
				void prefetchAllDocs(templateFolder);
			}
			void prefetchCalendarData({
				anchorDate:
					readStorage("glyph.calendar.anchorDate") ?? todayIsoDateLocal(),
				selectedDate:
					readStorage("glyph.calendar.selectedDate") ?? todayIsoDateLocal(),
				dailyNotesFolder,
			});
			void prefetchDatabasesLanding(openDatabasesId);
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
	}, [dailyNotesFolder, openDatabasesId, spacePath, templateFolder]);

	const handleInfoSidebarResizePointerDown = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			if (!rightSidebarOpen) return;
			infoSidebarResize.handlePointerDown(event);
		},
		[infoSidebarResize, rightSidebarOpen],
	);

	const content = useMemo(() => {
		if (!viewerPath) return null;
		if (viewerPath === AI_AGENT_TAB_ID) {
			return (
				<Suspense
					fallback={
						<div className="databaseLoadingState">Loading AI Agent…</div>
					}
				>
					<AIAgentPane />
				</Suspense>
			);
		}
		if (viewerPath === ALL_DOCS_TAB_ID) {
			const initialNotes = getPrefetchedAllDocs(null);
			return (
				<Suspense
					fallback={
						<div className="databaseLoadingState">Loading all notes…</div>
					}
				>
					<AllDocsPane onOpenFile={onOpenFile} initialNotes={initialNotes} />
				</Suspense>
			);
		}
		if (viewerPath === TEMPLATES_TAB_ID) {
			const initialNotes = getPrefetchedAllDocs(templateFolder);
			return (
				<Suspense
					fallback={
						<div className="databaseLoadingState">Loading templates…</div>
					}
				>
					<AllDocsPane
						title="Templates"
						folderPrefix={templateFolder}
						emptyMessage={
							templateFolder
								? "No notes found in the template folder yet."
								: "Set a template folder in Settings to browse templates here."
						}
						initialNotes={initialNotes}
						onOpenFile={onOpenFile}
					/>
				</Suspense>
			);
		}
		if (viewerPath === CALENDAR_TAB_ID) {
			const initialCalendarData = getPrefetchedCalendarData({
				anchorDate:
					readStorage("glyph.calendar.anchorDate") ?? todayIsoDateLocal(),
				selectedDate:
					readStorage("glyph.calendar.selectedDate") ?? todayIsoDateLocal(),
				dailyNotesFolder,
			});
			return (
				<Suspense
					fallback={
						<div className="databaseLoadingState">Loading calendar…</div>
					}
				>
					<CalendarPane
						initialData={initialCalendarData}
						onOpenFile={onOpenFile}
						onOpenDailyNotesSettings={onOpenDailyNotesSettings}
					/>
				</Suspense>
			);
		}
		if (viewerPath === DATABASES_TAB_ID) {
			const initialDatabaseId = openDatabasesId ?? null;
			const initialDocument = initialDatabaseId
				? getPrefetchedDatabaseDocument(initialDatabaseId)
				: null;
			const initialViewId =
				initialDatabaseId && initialDocument
					? (readStoredSelectedViewId(
							initialDatabaseId,
							initialDocument.database.views.map((view) => view.id),
						) ??
						initialDocument.database.views[0]?.id ??
						null)
					: null;
			const initialRows =
				initialViewId && initialDatabaseId
					? getPrefetchedDatabaseRows(initialDatabaseId, initialViewId)
					: null;
			return (
				<Suspense
					fallback={
						<div className="databaseLoadingState">Loading collections…</div>
					}
				>
					<DatabasesPane
						onOpenFile={onOpenFile}
						onRenameNotePath={(notePath, nextName) =>
							fileTree.onRenameDir(notePath, nextName, "file")
						}
						initialDatabaseId={initialDatabaseId}
						initialDocument={initialDocument}
						initialRows={initialRows}
					/>
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
		return (
			<FilePreviewPane
				relPath={viewerPath}
				onClose={() => {
					if (activeTabId) closeTab(activeTabId);
				}}
				onOpenExternally={(path) => fileTree.openNonMarkdownExternally(path)}
			/>
		);
	}, [
		activeTabId,
		closeTab,
		fileTree,
		onOpenFile,
		onOpenFileInNewTab,
		onOpenDailyNotesSettings,
		openDatabasesId,
		dailyNotesFolder,
		templateFolder,
		viewerPath,
		setDirtyByPath,
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
			if (target === TEMPLATES_TAB_ID) {
				void loadAllDocsPane();
				void prefetchAllDocs(templateFolder);
				return;
			}
			if (target === CALENDAR_TAB_ID) {
				void loadCalendarPane();
				void prefetchCalendarData({
					anchorDate:
						readStorage("glyph.calendar.anchorDate") ?? todayIsoDateLocal(),
					selectedDate:
						readStorage("glyph.calendar.selectedDate") ?? todayIsoDateLocal(),
					dailyNotesFolder,
				});
				return;
			}
			if (target === DATABASES_TAB_ID) {
				void loadDatabasesPane();
				void prefetchDatabasesLanding(openDatabasesId);
			}
		},
		[dailyNotesFolder, openDatabasesId, templateFolder],
	);

	const settingsTabContentByTab: Record<SettingsTab, ReactNode> = {
		general: <GeneralSettingsPane />,
		appearance: <AppearanceSettingsPane />,
		shortcuts: (
			<Suspense
				fallback={
					<div className="databaseLoadingState">Loading shortcuts…</div>
				}
			>
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
	const editorCanvas = (
		<div className="canvasPaneHost">
			<DailyNotesSetupToast
				visible={dailyNoteSetupToastVisible}
				onDismiss={() => setDailyNoteSetupToastVisible(false)}
				onOpenSettings={() => {
					setDailyNoteSetupToastVisible(false);
					onOpenDailyNotesSettings();
				}}
			/>
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
						onSelectTab={setActiveTabId}
						onCloseTab={closeTab}
						onStartRenamePath={onStartRenamePath}
						onReorder={reorderTabs}
					/>
				</div>
			) : null}
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
							{activeSettingsTabMeta.badgeText ? (
								<span
									className={`settingsPanelBadge earlyAccessBadge ${activeSettingsTabMeta.id === "git" ? "settingsBetaBadge" : ""}`}
								>
									{activeSettingsTabMeta.badgeIcon
										? activeSettingsTabMeta.badgeIcon()
										: null}
									<span>{activeSettingsTabMeta.badgeText}</span>
								</span>
							) : null}
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
