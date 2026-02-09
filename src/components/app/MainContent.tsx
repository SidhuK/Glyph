import { Suspense, lazy, useCallback } from "react";
import {
	useFileTreeContext,
	useUIContext,
	useVault,
	useViewContext,
} from "../../contexts";
import { touchCanvas } from "../../lib/canvases";
import type { ViewDoc } from "../../lib/views";
import { asCanvasDocLike, saveViewDoc } from "../../lib/views";
import { isInAppPreviewable } from "../../utils/filePreview";
import type {
	CanvasEdge,
	CanvasExternalCommand,
	CanvasNode,
} from "../CanvasPane";
import { FilePreviewPane } from "../preview/FilePreviewPane";
import { WelcomeScreen } from "./WelcomeScreen";

const CanvasPane = lazy(() => import("../CanvasPane"));

interface MainContentProps {
	canvasCommand: CanvasExternalCommand | null;
	setCanvasCommand: React.Dispatch<
		React.SetStateAction<CanvasExternalCommand | null>
	>;
	loadAndBuildFolderView: (dir: string) => Promise<void>;
	fileTree: {
		openFile: (relPath: string) => Promise<void>;
		openMarkdownFileInCanvas: (relPath: string) => Promise<void>;
		openNonMarkdownExternally: (relPath: string) => Promise<void>;
	};
	aiOverlay?: React.ReactNode;
}

export function MainContent({
	canvasCommand,
	setCanvasCommand,
	loadAndBuildFolderView,
	fileTree,
	aiOverlay,
}: MainContentProps) {
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

	const { activePreviewPath, setActivePreviewPath } = useUIContext();

	const onCanvasSelectionChange = useCallback(
		(_selected: CanvasNode[]) => {},
		[],
	);

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
			if (next.kind === "canvas") {
				await touchCanvas(next.selector, next.title);
			}
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
				{aiOverlay}
			</div>
		</main>
	);
}
