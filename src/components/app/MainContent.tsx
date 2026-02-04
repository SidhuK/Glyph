import { Suspense, lazy, useCallback } from "react";
import type { FsEntry, RecentEntry } from "../../lib/tauri";
import { type ViewDoc, asCanvasDocLike, saveViewDoc } from "../../lib/views";
import type {
	CanvasEdge,
	CanvasExternalCommand,
	CanvasNode,
} from "../CanvasPane";
import { FolderShelf } from "../FolderShelf";
import { MainToolbar } from "./MainToolbar";
import { WelcomeScreen } from "./WelcomeScreen";

const CanvasPane = lazy(() => import("../CanvasPane"));

interface MainContentProps {
	vaultPath: string | null;
	appName: string | null;
	recentVaults: string[];
	activeViewDoc: ViewDoc | null;
	activeViewDocRef: React.RefObject<ViewDoc | null>;
	activeViewPathRef: React.RefObject<string | null>;
	canvasLoadingMessage: string;
	aiSidebarOpen: boolean;
	setAiSidebarOpen: (open: boolean) => void;
	activeNoteId: string | null;
	activeNoteTitle: string | null;
	canvasCommand: CanvasExternalCommand | null;
	setCanvasCommand: React.Dispatch<
		React.SetStateAction<CanvasExternalCommand | null>
	>;
	folderShelfSubfolders: FsEntry[];
	folderShelfRecents: RecentEntry[];
	setActiveFilePath: (path: string | null) => void;
	setActiveViewDoc: (doc: ViewDoc | null) => void;
	loadAndBuildFolderView: (dir: string) => Promise<void>;
	fileTree: {
		openFile: (relPath: string) => Promise<void>;
		openMarkdownFileInCanvas: (relPath: string) => Promise<void>;
		openNonMarkdownExternally: (relPath: string) => Promise<void>;
	};
	onOpenVault: () => void;
	onCreateVault: () => void;
	handleSelectRecentVault: (path: string) => void;
}

export function MainContent({
	vaultPath,
	appName,
	recentVaults,
	activeViewDoc,
	activeViewDocRef,
	activeViewPathRef,
	canvasLoadingMessage,
	aiSidebarOpen,
	setAiSidebarOpen,
	activeNoteId,
	activeNoteTitle,
	canvasCommand,
	setCanvasCommand,
	folderShelfSubfolders,
	folderShelfRecents,
	setActiveFilePath,
	setActiveViewDoc,
	loadAndBuildFolderView,
	fileTree,
	onOpenVault,
	onCreateVault,
	handleSelectRecentVault,
}: MainContentProps) {
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
					appName={appName}
					recentVaults={recentVaults}
					onOpenVault={onOpenVault}
					onCreateVault={onCreateVault}
					onSelectRecentVault={handleSelectRecentVault}
				/>
			</main>
		);
	}

	return (
		<main className="mainArea">
			<MainToolbar
				activeViewDoc={activeViewDoc}
				aiSidebarOpen={aiSidebarOpen}
				onToggleAISidebar={() => setAiSidebarOpen(!aiSidebarOpen)}
				onOpenFolder={(d) => void loadAndBuildFolderView(d)}
			/>

			{activeViewDoc?.kind === "folder" ? (
				<FolderShelf
					subfolders={folderShelfSubfolders}
					recents={folderShelfRecents}
					onOpenFolder={(d) => void loadAndBuildFolderView(d)}
					onOpenMarkdown={(p) => void fileTree.openMarkdownFileInCanvas(p)}
					onOpenNonMarkdown={(p) => {
						setActiveFilePath(p);
						void fileTree.openNonMarkdownExternally(p);
					}}
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
						{canvasLoadingMessage ? (
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
