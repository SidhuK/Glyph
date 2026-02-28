import { m } from "motion/react";
import { Suspense, lazy, memo, useEffect, useMemo } from "react";
import { useSpace } from "../../contexts";
import { formatShortcutPartsForPlatform } from "../../lib/shortcuts/platform";
import { TASKS_TAB_ID } from "../../lib/tasks";
import { isInAppPreviewable } from "../../utils/filePreview";
import { FileText } from "../Icons";
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
	onOpenSearchPalette: () => void;
	openTasksRequest: number;
}

function recentDisplayName(relPath: string): string {
	const fileName = relPath.split("/").pop() ?? relPath;
	if (!fileName || fileName.startsWith(".")) return fileName || relPath;
	const withoutExt = fileName.replace(/\.[^./]+$/, "");
	return withoutExt || fileName;
}

function recentDisplayFolder(relPath: string): string {
	const parts = relPath.split("/").filter(Boolean);
	if (parts.length <= 1) return "";
	return `${parts.slice(0, -1).join("/")}/`;
}

export const MainContent = memo(function MainContent({
	fileTree,
	onOpenCommandPalette,
	onOpenSearchPalette,
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
		reorderTabs,
		openSpecialTab,
		recentFiles,
		canvasLoadingMessage,
	} = useTabManager(spacePath);

	useEffect(() => {
		if (!spacePath || openTasksRequest === 0) return;
		openSpecialTab(TASKS_TAB_ID);
	}, [openSpecialTab, openTasksRequest, spacePath]);

	const viewerPath = activeTabPath;
	const commandShortcutParts = useMemo(
		() => formatShortcutPartsForPlatform({ meta: true, key: "k" }),
		[],
	);
	const searchShortcutParts = useMemo(
		() => formatShortcutPartsForPlatform({ meta: true, key: "f" }),
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
							<div className="mainEmptyActions">
								<button
									type="button"
									className="mainEmptyAction"
									onClick={onOpenCommandPalette}
									title="List commands"
								>
									<span className="mainEmptyActionLabel">List commands</span>
									<span className="mainEmptyShortcut" aria-hidden>
										{commandShortcutParts.map((part) => (
											<kbd key={part}>{part}</kbd>
										))}
									</span>
								</button>
								<button
									type="button"
									className="mainEmptyAction"
									onClick={onOpenSearchPalette}
									title="Search files"
								>
									<span className="mainEmptyActionLabel">Search files</span>
									<span className="mainEmptyShortcut" aria-hidden>
										{searchShortcutParts.map((part) => (
											<kbd key={part}>{part}</kbd>
										))}
									</span>
								</button>
							</div>
							{recentFiles.length > 0 && (
								<div className="mainRecentFiles">
									<div className="mainRecentFilesTitle">Recently opened</div>
									<div className="mainRecentFilesList">
										{recentFiles.map((file, index) => (
											<m.button
												key={`${file.spacePath}:${file.path}`}
												type="button"
												className="mainRecentFileItem"
												onClick={() => setActiveTabPath(file.path)}
												initial={{ opacity: 0, y: 8 }}
												animate={{ opacity: 1, y: 0 }}
												transition={{
													delay: 0.05 + index * 0.04,
													duration: 0.22,
												}}
											>
												<FileText size={14} className="mainRecentFileIcon" />
												<span className="mainRecentFileName">
													{recentDisplayName(file.path)}
												</span>
												<span className="mainRecentFilePath">
													{recentDisplayFolder(file.path)}
												</span>
											</m.button>
										))}
									</div>
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</main>
	);
});
