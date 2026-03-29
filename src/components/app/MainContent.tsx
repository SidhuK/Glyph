import { AiNetworkIcon, DocumentCodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import {
	Suspense,
	lazy,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	useAISidebarContext,
	useSpace,
	useUILayoutContext,
} from "../../contexts";
import { ALL_DOCS_TAB_ID } from "../../lib/allDocs";
import {
	PATH_REMOVED_EVENT,
	PATH_RENAMED_EVENT,
	type PathRemovedDetail,
	type PathRenamedDetail,
} from "../../lib/appEvents";
import { CALENDAR_TAB_ID } from "../../lib/calendar";
import { APP_TAGLINE } from "../../lib/copy";
import { DATABASES_TAB_ID } from "../../lib/databases";
import {
	DEFAULT_ONBOARDING_SETTINGS,
	type OnboardingSettings,
	loadSettings,
	updateOnboardingSettings,
} from "../../lib/settings";
import { formatShortcutPartsForPlatform } from "../../lib/shortcuts/platform";
import { useTauriEvent } from "../../lib/tauriEvents";
import { TEMPLATES_TAB_ID } from "../../lib/templatesView";
import { isInAppPreviewable } from "../../utils/filePreview";
import { Calendar, FileText, Settings } from "../Icons";
import { FilePreviewPane } from "../preview/FilePreviewPane";
import { NotePane } from "../preview/NotePane";
import { springPresets } from "../ui/animations";
import { Button } from "../ui/shadcn/button";
import { GettingStartedPane } from "./GettingStartedPane";
import { TabBar } from "./TabBar";
import { WelcomeScreen } from "./WelcomeScreen";
import { useTabManager } from "./useTabManager";

const DatabasesPane = lazy(() =>
	import("../databases/DatabasesPane").then((module) => ({
		default: module.DatabasesPane,
	})),
);

const CalendarPane = lazy(() =>
	import("../calendar/CalendarPane").then((module) => ({
		default: module.CalendarPane,
	})),
);

const AllDocsPane = lazy(() =>
	import("./AllDocsPane").then((module) => ({
		default: module.AllDocsPane,
	})),
);

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
				icon: <FileText size={16} strokeWidth={1.7} />,
				text: "Create your first note",
				action: "New note",
				onClick: onCreateNote,
			});
		}
		if (!onboarding.openedDailyNote && showDailyNoteAction) {
			t.push({
				key: "daily",
				icon: <Calendar size={16} strokeWidth={1.7} />,
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
		openFile: (relPath: string) => Promise<void>;
		openNonMarkdownExternally: (relPath: string) => Promise<void>;
	};
	onOpenCommandPalette: () => void;
	onCreateNote: () => void;
	onOpenDailyNote: () => void;
	openAllDocsRequest: number;
	onConsumeOpenAllDocsRequest: () => void;
	openTemplatesRequest: number;
	onConsumeOpenTemplatesRequest: () => void;
	openCalendarRequest: number;
	openDatabasesRequest: {
		nonce: number;
		databaseId: string | null;
	};
	openBlankTabRequest: number;
	showGettingStartedRequest: number;
	dailyNoteSetupNoticeRequest: number;
	onOpenDailyNotesSettings: () => void;
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
								<Calendar size={16} strokeWidth={1.8} />
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
								<Settings size={14} strokeWidth={1.8} />
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
	onOpenCommandPalette,
	onCreateNote,
	onOpenDailyNote,
	openAllDocsRequest,
	onConsumeOpenAllDocsRequest,
	openTemplatesRequest,
	onConsumeOpenTemplatesRequest,
	openCalendarRequest,
	openDatabasesRequest,
	openBlankTabRequest,
	showGettingStartedRequest,
	dailyNoteSetupNoticeRequest,
	onOpenDailyNotesSettings,
}: MainContentProps) {
	const {
		info,
		spacePath,
		lastSpacePath,
		recentSpaces,
		settingsLoaded,
		onOpenSpace,
		onOpenSpaceAtPath,
		onContinueLastSpace,
		onCreateSpace,
	} = useSpace();
	const { dailyNotesFolder, templateFolder } = useUILayoutContext();
	const { aiEnabled, aiPanelOpen, setAiPanelOpen } = useAISidebarContext();
	const [onboarding, setOnboarding] = useState<OnboardingSettings>(
		DEFAULT_ONBOARDING_SETTINGS,
	);
	const [onboardingLoaded, setOnboardingLoaded] = useState(false);
	const [starterOverrideVisible, setStarterOverrideVisible] = useState(false);
	const [dailyNoteSetupToastVisible, setDailyNoteSetupToastVisible] =
		useState(false);
	const handleTabActivated = useCallback(() => {
		setStarterOverrideVisible(false);
	}, []);

	const {
		openTabs,
		activeTabPath,
		setActiveTabPath,
		dragTabPath,
		setDragTabPath,
		setDirtyByPath,
		closeTab,
		closeActiveTab,
		closeTabsForPathRemoval,
		renameTabsForPath,
		reorderTabs,
		openSpecialTab,
	} = useTabManager(spacePath, { onActivateTab: handleTabActivated });

	useEffect(() => {
		if (!spacePath || openAllDocsRequest === 0) return;
		openSpecialTab(ALL_DOCS_TAB_ID);
		onConsumeOpenAllDocsRequest();
	}, [
		onConsumeOpenAllDocsRequest,
		openAllDocsRequest,
		openSpecialTab,
		spacePath,
	]);

	useEffect(() => {
		if (!spacePath || openTemplatesRequest === 0) return;
		openSpecialTab(TEMPLATES_TAB_ID);
		onConsumeOpenTemplatesRequest();
	}, [
		onConsumeOpenTemplatesRequest,
		openSpecialTab,
		openTemplatesRequest,
		spacePath,
	]);

	useEffect(() => {
		if (!spacePath || openCalendarRequest === 0) return;
		openSpecialTab(CALENDAR_TAB_ID);
	}, [openCalendarRequest, openSpecialTab, spacePath]);

	useEffect(() => {
		if (!spacePath || openDatabasesRequest.nonce === 0) return;
		openSpecialTab(DATABASES_TAB_ID);
	}, [openDatabasesRequest, openSpecialTab, spacePath]);

	useEffect(() => {
		if (!spacePath || openBlankTabRequest === 0) return;
		setActiveTabPath(null);
	}, [openBlankTabRequest, setActiveTabPath, spacePath]);

	useEffect(() => {
		if (!spacePath || showGettingStartedRequest === 0) return;
		setStarterOverrideVisible(true);
		setActiveTabPath(null);
	}, [setActiveTabPath, showGettingStartedRequest, spacePath]);

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
	const commandShortcutParts = useMemo(
		() => formatShortcutPartsForPlatform({ meta: true, key: "k" }),
		[],
	);
	const hasStarterCompletion =
		onboarding.createdFirstNote ||
		onboarding.usedCommandPalette ||
		onboarding.openedDailyNote;
	const showStarterByDefault =
		onboardingLoaded &&
		!onboarding.starterDismissed &&
		!hasStarterCompletion &&
		openTabs.length === 0 &&
		!activeTabPath;
	const showStarterPane =
		Boolean(spacePath) &&
		(showStarterByDefault || (starterOverrideVisible && !activeTabPath));
	const showTabBar = openTabs.length > 0 || aiEnabled;

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

	const content = useMemo(() => {
		if (!viewerPath) return null;
		if (viewerPath === ALL_DOCS_TAB_ID) {
			return (
				<Suspense
					fallback={
						<div className="databaseLoadingState">Loading all docs…</div>
					}
				>
					<AllDocsPane onOpenFile={(relPath) => fileTree.openFile(relPath)} />
				</Suspense>
			);
		}
		if (viewerPath === TEMPLATES_TAB_ID) {
			return (
				<Suspense
					fallback={
						<div className="databaseLoadingState">Loading templates…</div>
					}
				>
					<AllDocsPane
						title="Templates"
						icon={DocumentCodeIcon}
						folderPrefix={templateFolder}
						emptyMessage={
							templateFolder
								? "No notes found in the template folder yet."
								: "Set a template folder in Settings to browse templates here."
						}
						onOpenFile={(relPath) => fileTree.openFile(relPath)}
					/>
				</Suspense>
			);
		}
		if (viewerPath === CALENDAR_TAB_ID) {
			return (
				<Suspense
					fallback={
						<div className="databaseLoadingState">Loading calendar…</div>
					}
				>
					<CalendarPane
						onOpenFile={(relPath) => fileTree.openFile(relPath)}
						onOpenDailyNotesSettings={onOpenDailyNotesSettings}
					/>
				</Suspense>
			);
		}
		if (viewerPath === DATABASES_TAB_ID) {
			return (
				<Suspense
					fallback={
						<div className="databaseLoadingState">Loading collections…</div>
					}
				>
					<DatabasesPane
						onOpenFile={(relPath) => fileTree.openFile(relPath)}
						initialDatabaseId={openDatabasesRequest.databaseId}
						openRequestNonce={openDatabasesRequest.nonce}
					/>
				</Suspense>
			);
		}
		if (viewerPath.toLowerCase().endsWith(".md")) {
			return (
				<NotePane
					relPath={viewerPath}
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
		if (isInAppPreviewable(viewerPath)) {
			return (
				<FilePreviewPane
					relPath={viewerPath}
					onClose={() => closeTab(viewerPath)}
					onOpenExternally={(path) => fileTree.openNonMarkdownExternally(path)}
				/>
			);
		}
		return null;
	}, [
		closeTab,
		fileTree,
		onOpenDailyNotesSettings,
		openDatabasesRequest.databaseId,
		openDatabasesRequest.nonce,
		templateFolder,
		viewerPath,
		setDirtyByPath,
	]);

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
				<WelcomeScreen
					appName={info?.name ?? null}
					lastSpacePath={lastSpacePath}
					recentSpaces={recentSpaces}
					onOpenSpace={onOpenSpace}
					onCreateSpace={onCreateSpace}
					onContinueLastSpace={onContinueLastSpace}
					onSelectRecentSpace={onOpenSpaceAtPath}
				/>
			</m.main>
		);
	}

	return (
		<main className="mainArea">
			<div className="canvasWrapper">
				<div className="canvasPaneHost">
					<DailyNotesSetupToast
						visible={dailyNoteSetupToastVisible}
						onDismiss={() => setDailyNoteSetupToastVisible(false)}
						onOpenSettings={() => {
							setDailyNoteSetupToastVisible(false);
							onOpenDailyNotesSettings();
						}}
					/>
					{showTabBar && (
						<TabBar
							openTabs={openTabs}
							activeTabPath={activeTabPath}
							dragTabPath={dragTabPath}
							useWindowBackground={!content}
							onOpenBlankTab={() => setActiveTabPath(null)}
							onSelectTab={setActiveTabPath}
							onCloseTab={closeTab}
							onDragStart={setDragTabPath}
							onDragEnd={() => setDragTabPath(null)}
							onReorder={reorderTabs}
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
					{aiEnabled && !aiPanelOpen ? (
						<button
							type="button"
							className="mainAiFloatingToggle"
							onClick={() => setAiPanelOpen((open) => !open)}
							aria-label="Open AI panel"
							title="Open AI panel"
						>
							<HugeiconsIcon icon={AiNetworkIcon} size={32} />
						</button>
					) : null}
				</div>
			</div>
		</main>
	);
});
