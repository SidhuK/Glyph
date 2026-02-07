import { Suspense, lazy, useCallback } from "react";
import {
	useFileTreeContext,
	useUIContext,
	useVault,
	useViewContext,
} from "../../contexts";
import type { FsEntry, RecentEntry } from "../../lib/tauri";
import { type ViewDoc, asCanvasDocLike, saveViewDoc } from "../../lib/views";
import { isInAppPreviewable } from "../../utils/filePreview";
import type {
	CanvasEdge,
	CanvasExternalCommand,
	CanvasNode,
} from "../CanvasPane";
import { FolderShelf } from "../FolderShelf";
import { FilePreviewPane } from "../preview/FilePreviewPane";
import { MainToolbar } from "./MainToolbar";
import { WelcomeScreen } from "./WelcomeScreen";

const CanvasPane = lazy(() => import("../CanvasPane"));

interface MainContentProps {
	canvasCommand: CanvasExternalCommand | null;
	setCanvasCommand: React.Dispatch<
		React.SetStateAction<CanvasExternalCommand | null>
	>;
	folderShelfSubfolders: FsEntry[];
	folderShelfRecents: RecentEntry[];
	loadAndBuildFolderView: (dir: string) => Promise<void>;
	fileTree: {
		openFile: (relPath: string) => Promise<void>;
		openMarkdownFileInCanvas: (relPath: string) => Promise<void>;
		openNonMarkdownExternally: (relPath: string) => Promise<void>;
	};
}

export function MainContent({
	canvasCommand,
	setCanvasCommand,
	folderShelfSubfolders,
	folderShelfRecents,
	loadAndBuildFolderView,
	fileTree,
}: MainContentProps) {
	// Contexts
	const {
		info,
		vaultPath,
		lastVaultPath,
		recentVaults,
		onOpenVault,
		onOpenVaultAtPath,
		onContinueLastVault,
		onCreateVault,
	} = useVault();

	const { activeNoteId, activeNoteTitle } = useFileTreeContext();

	const {
		activeViewDoc,
		activeViewDocRef,
		activeViewPathRef,
		canvasLoadingMessage,
		setActiveViewDoc,
	} = useViewContext();

	const {
		aiSidebarOpen,
		setAiSidebarOpen,
		activePreviewPath,
		setActivePreviewPath,
	} = useUIContext();

	const onCanvasSelectionChange = useCallback((_selected: CanvasNode[]) => {
		// Selection tracking available for future AI features
	}, []);

	const onSaveView = useCallback(
		async (payload: {
			version: number;
			id: string;
			title: string;
			nodes: CanvasNode[];
			edges: CanvasEdge[];
		}) => {
			const path = activeViewPathRef.current;
			const prev = activeViewDocRef.current;
			if (!path || !prev) return;
			const next: ViewDoc = {
				...prev,
				nodes: payload.nodes,
				edges: payload.edges,
			};
			await saveViewDoc(path, next);
			setActiveViewDoc(next);
		},
		[activeViewDocRef, activeViewPathRef, setActiveViewDoc],
	);

	if (!vaultPath) {
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
			<MainToolbar
				activeViewDoc={activeViewDoc}
				aiSidebarOpen={aiSidebarOpen}
				onToggleAISidebar={() => setAiSidebarOpen((v) => !v)}
				onOpenFolder={(d) => void loadAndBuildFolderView(d)}
			/>

			{activeViewDoc?.kind === "folder" ? (
				<FolderShelf
					subfolders={folderShelfSubfolders}
					recents={folderShelfRecents}
					onOpenFolder={(d) => void loadAndBuildFolderView(d)}
					onOpenMarkdown={(p) => void fileTree.openMarkdownFileInCanvas(p)}
					onOpenNonMarkdown={(p) => void fileTree.openFile(p)}
					onFocusNode={(nodeId) => {
						setCanvasCommand({
							id: crypto.randomUUID(),
							kind: "focus_node",
							nodeId,
						});
					}}
				/>
			) : null}

			<div className="canvasWrapper">
				<div className="canvasPaneHost">
					<Suspense
						fallback={<div className="canvasEmpty">Loading canvas…</div>}
					>
						{activePreviewPath && isInAppPreviewable(activePreviewPath) ? (
							<FilePreviewPane
								relPath={activePreviewPath}
								onClose={() => setActivePreviewPath(null)}
								onOpenExternally={(path) =>
									fileTree.openNonMarkdownExternally(path)
								}
							/>
						) : canvasLoadingMessage ? (
							<div className="canvasEmpty">{canvasLoadingMessage}</div>
						) : (
							<CanvasPane
								doc={activeViewDoc ? asCanvasDocLike(activeViewDoc) : null}
								onSave={onSaveView}
								onOpenNote={(p) => void fileTree.openFile(p)}
								onOpenFolder={(dir) => void loadAndBuildFolderView(dir)}
								activeNoteId={activeNoteId}
								activeNoteTitle={activeNoteTitle}
								vaultPath={vaultPath}
								onSelectionChange={onCanvasSelectionChange}
								externalCommand={canvasCommand}
								onExternalCommandHandled={(id) => {
									setCanvasCommand((prev) => (prev?.id === id ? null : prev));
								}}
							/>
						)}
					</Suspense>
				</div>
			</div>
		</main>
	);
}
