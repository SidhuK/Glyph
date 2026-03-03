import { Suspense, lazy, memo, useEffect, useMemo } from "react";
import { useSpace } from "../../contexts";
import {
	PATH_REMOVED_EVENT,
	type PathRemovedDetail,
} from "../../lib/appEvents";
import { APP_TAGLINE } from "../../lib/copy";
import { formatShortcutPartsForPlatform } from "../../lib/shortcuts/platform";
import { TASKS_TAB_ID } from "../../lib/tasks";
import { isInAppPreviewable } from "../../utils/filePreview";
import { FilePreviewPane } from "../preview/FilePreviewPane";
import { TasksPane } from "../tasks/TasksPane";
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
	openTasksRequest: number;
}

export const MainContent = memo(function MainContent({
	fileTree,
	onOpenCommandPalette,
	openTasksRequest,
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
		reorderTabs,
		openSpecialTab,
		canvasLoadingMessage,
	} = useTabManager(spacePath);

	useEffect(() => {
		if (!spacePath || openTasksRequest === 0) return;
		openSpecialTab(TASKS_TAB_ID);
	}, [openSpecialTab, openTasksRequest, spacePath]);

	useEffect(() => {
		const handleCloseActiveTab = () => {
			closeActiveTab();
		};
		const handlePathRemoved = (event: Event) => {
			const detail = (event as CustomEvent<PathRemovedDetail>).detail;
			if (!detail?.path) return;
			closeTabsForPathRemoval(detail.path, detail.recursive);
		};
		window.addEventListener("glyph:close-active-tab", handleCloseActiveTab);
		window.addEventListener(PATH_REMOVED_EVENT, handlePathRemoved);
		return () => {
			window.removeEventListener(
				"glyph:close-active-tab",
				handleCloseActiveTab,
			);
			window.removeEventListener(PATH_REMOVED_EVENT, handlePathRemoved);
		};
	}, [closeActiveTab, closeTabsForPathRemoval]);

	const viewerPath = activeTabPath;
	const commandShortcutParts = useMemo(
		() => formatShortcutPartsForPlatform({ meta: true, key: "k" }),
		[],
	);

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
						</div>
					)}
				</div>
			</div>
		</main>
	);
});
