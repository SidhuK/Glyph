import { Suspense, lazy, memo, useEffect, useMemo, useState } from "react";
import { useSpace, useUILayoutContext } from "../../contexts";
import {
	PATH_MOVED_EVENT,
	PATH_REMOVED_EVENT,
	type PathMovedDetail,
	type PathRemovedDetail,
} from "../../lib/appEvents";
import { APP_TAGLINE } from "../../lib/copy";
import {
	DEFAULT_ONBOARDING_SETTINGS,
	type OnboardingSettings,
	loadSettings,
	updateOnboardingSettings,
} from "../../lib/settings";
import { formatShortcutPartsForPlatform } from "../../lib/shortcuts/platform";
import { TASKS_TAB_ID } from "../../lib/tasks";
import { useTauriEvent } from "../../lib/tauriEvents";
import { isInAppPreviewable } from "../../utils/filePreview";
import { FilePreviewPane } from "../preview/FilePreviewPane";
import { TasksPane } from "../tasks/TasksPane";
import { GettingStartedPane } from "./GettingStartedPane";
import { TabBar } from "./TabBar";
import { WelcomeScreen } from "./WelcomeScreen";
import { useTabManager } from "./useTabManager";

const LazyDatabasePane = lazy(() =>
	import("../database/DatabasePane").then((module) => ({
		default: module.DatabasePane,
	})),
);

interface MainContentProps {
	fileTree: {
		openFile: (relPath: string) => Promise<void>;
		openNonMarkdownExternally: (relPath: string) => Promise<void>;
	};
	onOpenCommandPalette: () => void;
	onCreateNote: () => void;
	onOpenDailyNote: () => void;
	onOpenTasks: () => void;
	openTasksRequest: number;
	showGettingStartedRequest: number;
}

export const MainContent = memo(function MainContent({
	fileTree,
	onOpenCommandPalette,
	onCreateNote,
	onOpenDailyNote,
	onOpenTasks,
	openTasksRequest,
	showGettingStartedRequest,
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
	const { dailyNotesFolder } = useUILayoutContext();
	const [onboarding, setOnboarding] = useState<OnboardingSettings>(
		DEFAULT_ONBOARDING_SETTINGS,
	);
	const [onboardingLoaded, setOnboardingLoaded] = useState(false);
	const [starterOverrideVisible, setStarterOverrideVisible] = useState(false);

	const {
		openTabs,
		activeTabPath,
		setActiveTabPath,
		dragTabPath,
		setDragTabPath,
		dirtyByPath,
		setDirtyByPath,
		closeTab,
		closeActiveTab,
		closeTabsForPathRemoval,
		rewriteTabsForPathMove,
		reorderTabs,
		openSpecialTab,
		canvasLoadingMessage,
	} = useTabManager(spacePath);

	useEffect(() => {
		if (!spacePath || openTasksRequest === 0) return;
		openSpecialTab(TASKS_TAB_ID);
	}, [openSpecialTab, openTasksRequest, spacePath]);

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
		const handlePathMoved = (event: Event) => {
			const detail = (event as CustomEvent<PathMovedDetail>).detail;
			if (!detail?.fromPath || !detail?.toPath) return;
			rewriteTabsForPathMove(
				detail.fromPath,
				detail.toPath,
				detail.recursive,
			);
		};
		window.addEventListener("glyph:close-active-tab", handleCloseActiveTab);
		window.addEventListener(PATH_MOVED_EVENT, handlePathMoved);
		window.addEventListener(PATH_REMOVED_EVENT, handlePathRemoved);
		return () => {
			window.removeEventListener(
				"glyph:close-active-tab",
				handleCloseActiveTab,
			);
			window.removeEventListener(PATH_MOVED_EVENT, handlePathMoved);
			window.removeEventListener(PATH_REMOVED_EVENT, handlePathRemoved);
		};
	}, [closeActiveTab, closeTabsForPathRemoval, rewriteTabsForPathMove]);

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
		if (activeTabPath) {
			setStarterOverrideVisible(false);
		}
	}, [activeTabPath]);

	const content = useMemo(() => {
		if (!viewerPath) return null;
		if (viewerPath === TASKS_TAB_ID) {
			return (
				<TasksPane
					onOpenFile={(relPath) => void fileTree.openFile(relPath)}
					onClosePane={() => closeTab(TASKS_TAB_ID)}
				/>
			);
		}
		if (viewerPath.toLowerCase().endsWith(".md")) {
			return (
				<Suspense
					fallback={<div className="mainEmptyState">Loading note…</div>}
				>
					<LazyDatabasePane
						relPath={viewerPath}
						onOpenFile={(relPath) => fileTree.openFile(relPath)}
						onDirtyChange={(dirty) =>
							setDirtyByPath((prev) =>
								prev[viewerPath] === dirty
									? prev
									: { ...prev, [viewerPath]: dirty },
							)
						}
					/>
				</Suspense>
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
		if (canvasLoadingMessage) {
			return <div className="canvasEmpty">{canvasLoadingMessage}</div>;
		}
		return null;
	}, [canvasLoadingMessage, closeTab, fileTree, viewerPath, setDirtyByPath]);

	if (!spacePath) {
		if (!settingsLoaded) return <main className="mainArea" />;
		return (
			<main className="mainArea mainAreaWelcome">
				<WelcomeScreen
					appName={info?.name ?? null}
					lastSpacePath={lastSpacePath}
					recentSpaces={recentSpaces}
					onOpenSpace={onOpenSpace}
					onCreateSpace={onCreateSpace}
					onContinueLastSpace={onContinueLastSpace}
					onSelectRecentSpace={onOpenSpaceAtPath}
				/>
			</main>
		);
	}

	return (
		<main className="mainArea">
			<div className="canvasWrapper">
				<div className="canvasPaneHost">
					{openTabs.length > 0 && (
						<TabBar
							openTabs={openTabs}
							activeTabPath={activeTabPath}
							dirtyByPath={dirtyByPath}
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
									onOpenTasks={onOpenTasks}
									onDismiss={() => {
										setStarterOverrideVisible(false);
										void updateOnboardingSettings({ starterDismissed: true });
									}}
								/>
							) : (
								<>
									<p className="mainEmptyPrompt">
										Press{" "}
										<button
											type="button"
											className="mainEmptyShortcutInline"
											onClick={onOpenCommandPalette}
											title="Open command palette"
										>
											{commandShortcutParts.map((part) => (
												<kbd key={part}>{part}</kbd>
											))}
										</button>{" "}
										to get started
									</p>
									<div className="mainEmptyTagline">{APP_TAGLINE}</div>
								</>
							)}
						</div>
					)}
				</div>
			</div>
		</main>
	);
});
