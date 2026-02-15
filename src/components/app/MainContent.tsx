import { motion } from "motion/react";
import { memo, useMemo } from "react";
import { useVault } from "../../contexts";
import { formatShortcutPartsForPlatform } from "../../lib/shortcuts/platform";
import { isInAppPreviewable } from "../../utils/filePreview";
import { FileText } from "../Icons";
import { FilePreviewPane } from "../preview/FilePreviewPane";
import { MarkdownEditorPane } from "../preview/MarkdownEditorPane";
import { TabBar } from "./TabBar";
import { WelcomeScreen } from "./WelcomeScreen";
import { useTabManager } from "./useTabManager";

interface MainContentProps {
	fileTree: {
		openFile: (relPath: string) => Promise<void>;
		openNonMarkdownExternally: (relPath: string) => Promise<void>;
	};
	onOpenFolder: (dirPath: string) => Promise<void>;
	onOpenCommandPalette: () => void;
	onOpenSearchPalette: () => void;
}

export const MainContent = memo(function MainContent({
	fileTree,
	onOpenFolder,
	onOpenCommandPalette,
	onOpenSearchPalette,
}: MainContentProps) {
	const {
		info,
		vaultPath,
		lastVaultPath,
		recentVaults,
		settingsLoaded,
		onOpenVault,
		onOpenVaultAtPath,
		onContinueLastVault,
		onCreateVault,
	} = useVault();

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
		recentFiles,
		canvasLoadingMessage,
	} = useTabManager(vaultPath);

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
		if (viewerPath.toLowerCase().endsWith(".md")) {
			return (
				<MarkdownEditorPane
					relPath={viewerPath}
					onOpenFolder={(dirPath) => void onOpenFolder(dirPath)}
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
		if (canvasLoadingMessage) {
			return <div className="canvasEmpty">{canvasLoadingMessage}</div>;
		}
		return null;
	}, [
		canvasLoadingMessage,
		closeTab,
		fileTree,
		onOpenFolder,
		viewerPath,
		setDirtyByPath,
	]);

	if (!vaultPath) {
		if (!settingsLoaded) return <main className="mainArea" />;
		return (
			<main className="mainArea mainAreaWelcome">
				<WelcomeScreen
					appName={info?.name ?? null}
					lastVaultPath={lastVaultPath}
					recentVaults={recentVaults}
					onOpenVault={onOpenVault}
					onCreateVault={onCreateVault}
					onContinueLastVault={onContinueLastVault}
					onSelectRecentVault={onOpenVaultAtPath}
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
											<motion.button
												key={`${file.vaultPath}:${file.path}`}
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
													{file.path.split("/").pop() ?? file.path}
												</span>
												<span className="mainRecentFilePath">{file.path}</span>
											</motion.button>
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
