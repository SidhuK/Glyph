import {
	type Connection,
	Controls,
	MiniMap,
	type NodeMouseHandler,
	type OnSelectionChangeParams,
	ReactFlow,
	addEdge,
	useEdgesState,
	useNodesState,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GRID_SIZE, snapPoint } from "../../lib/canvasLayout";
import { CanvasNoteOverlayEditor } from "./CanvasNoteOverlayEditor";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasActionsContext, CanvasNoteEditContext } from "./contexts";
import { useCanvasHistory } from "./hooks/useCanvasHistory";
import { useCanvasTabs } from "./hooks/useCanvasTabs";
import { useCanvasToolbarActions } from "./hooks/useCanvasToolbarActions";
import { useExternalCanvasCommands } from "./hooks/useExternalCanvasCommands";
import { useNoteEditSession } from "./hooks/useNoteEditSession";
import {
	FileNode,
	FolderNode,
	FolderPreviewNode,
	FrameNode,
	LinkNode,
	NoteNode,
	TextNode,
} from "./nodes";
import {
	isFileNode,
	isFolderNode,
	isFolderPreviewNode,
	isNoteNode,
} from "./types";
import type {
	CanvasActions,
	CanvasEdge,
	CanvasNode,
	CanvasNoteEditActions,
	CanvasPaneProps,
} from "./types";
import { snapshotPersistedShape } from "./utils";
import "@xyflow/react/dist/style.css";

const nodeTypes = {
	note: NoteNode,
	text: TextNode,
	file: FileNode,
	link: LinkNode,
	frame: FrameNode,
	folder: FolderNode,
	folderPreview: FolderPreviewNode,
};

function CanvasPane({
	doc,
	onSave,
	onOpenNote,
	onOpenFolder,
	activeNoteId,
	activeNoteTitle,
	vaultPath,
	onSelectionChange,
	externalCommand,
	onExternalCommandHandled,
}: CanvasPaneProps) {
	const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>([]);
	const [isSaving, setIsSaving] = useState(false);
	const [snapToGrid, setSnapToGrid] = useState(true);
	const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
		new Set(),
	);

	const docIdRef = useRef<string | null>(null);
	const latestDocRef = useRef(doc);
	const lastSavedSnapshotRef = useRef("");
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingSaveRef = useRef<{
		nodes: CanvasNode[];
		edges: CanvasEdge[];
	} | null>(null);
	const initializedRef = useRef(false);
	const folderPreviewHoldsRef = useRef<Map<string, number>>(new Map());

	const stripEphemeral = useCallback(
		(n: CanvasNode[], e: CanvasEdge[]) => ({
			nodes: n.filter((node) => node.type !== "folderPreview"),
			edges: e,
		}),
		[],
	);

	const { pushHistory, undo, redo, resetHistory, applyingHistoryRef } =
		useCanvasHistory(nodes, edges, setNodes, setEdges, stripEphemeral);

	const {
		noteEditSession,
		noteTabs,
		activeTabId,
		setActiveTabId,
		setNoteTabs,
		ensureTabForNote,
		createNewTab,
		beginInlineEdit,
		updateInlineMarkdown,
		setInlineEditorMode,
		closeInlineEditor,
		reloadInlineFromDisk,
		overwriteInlineToDisk,
		saveInlineNow,
	} = useNoteEditSession(setNodes);

	const nodeById = useMemo(() => {
		const byId = new Map<string, CanvasNode>();
		for (const node of nodes) byId.set(node.id, node);
		return byId;
	}, [nodes]);

	const maxRightEdge = useMemo(() => {
		let max = 60;
		for (const node of nodes) {
			const right = node.position.x + 200;
			if (right > max) max = right;
		}
		return max;
	}, [nodes]);

	const scheduleSave = useCallback(
		(n: CanvasNode[], e: CanvasEdge[]) => {
			pendingSaveRef.current = { nodes: n, edges: e };
			if (saveTimeoutRef.current) return;
			saveTimeoutRef.current = setTimeout(async () => {
				saveTimeoutRef.current = null;
				const latestDoc = latestDocRef.current;
				if (!latestDoc) return;
				const pending = pendingSaveRef.current;
				if (!pending) return;
				pendingSaveRef.current = null;
				const stable = stripEphemeral(pending.nodes, pending.edges);
				const snapshot = snapshotPersistedShape(stable.nodes, stable.edges);
				if (snapshot === lastSavedSnapshotRef.current) return;
				setIsSaving(true);
				try {
					await onSave({
						...latestDoc,
						nodes: stable.nodes,
						edges: stable.edges,
					});
					lastSavedSnapshotRef.current = snapshot;
				} finally {
					setIsSaving(false);
				}
			}, 800);
		},
		[onSave, stripEphemeral],
	);

	useEffect(() => {
		latestDocRef.current = doc;
	}, [doc]);

	useEffect(() => {
		if (!doc) return;
		const incomingSnapshot = snapshotPersistedShape(
			doc.nodes.filter((node) => node.type !== "folderPreview"),
			doc.edges,
		);
		if (
			docIdRef.current === doc.id &&
			initializedRef.current &&
			incomingSnapshot === lastSavedSnapshotRef.current
		)
			return;
		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current);
			saveTimeoutRef.current = null;
		}
		pendingSaveRef.current = null;
		docIdRef.current = doc.id;
		initializedRef.current = true;
		setNodes(doc.nodes);
		setEdges(doc.edges);
		lastSavedSnapshotRef.current = incomingSnapshot;
		resetHistory(doc.nodes, doc.edges);
	}, [doc, resetHistory, setEdges, setNodes]);

	useEffect(() => {
		if (!initializedRef.current || applyingHistoryRef.current) return;
		pushHistory(nodes, edges);
		scheduleSave(nodes, edges);
	}, [nodes, edges, pushHistory, scheduleSave, applyingHistoryRef]);

	useEffect(
		() => () => {
			if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
		},
		[],
	);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
				e.preventDefault();
				undo();
			} else if (
				((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "z") ||
				((e.metaKey || e.ctrlKey) && e.key === "y")
			) {
				e.preventDefault();
				redo();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [undo, redo]);

	const findDropPosition = useCallback((): { x: number; y: number } => {
		const x = maxRightEdge + 40;
		const y = 100;
		return snapToGrid ? snapPoint({ x, y }) : { x, y };
	}, [maxRightEdge, snapToGrid]);

	const {
		handleAddTextNode,
		handleAddLinkNode,
		handleAddCurrentNote,
		handleRefreshLink,
		handleFrameSelection,
		handleReflowGrid,
		handleAlign,
		handleDistribute,
	} = useCanvasToolbarActions({
		nodes,
		selectedNodeIds,
		setNodes,
		findDropPosition,
		snapToGrid,
		activeNoteId,
		activeNoteTitle,
		vaultPath,
	});

	useExternalCanvasCommands({
		externalCommand,
		onExternalCommandHandled,
		nodes,
		findDropPosition,
		setNodes,
		ensureTabForNote,
		beginInlineEdit,
		noteEditSessionNoteId: noteEditSession?.noteId ?? null,
		updateInlineMarkdown,
		handleAddLinkNode,
	});

	const handleFolderPreviewHold = useCallback((folderNodeId: string) => {
		const holds = folderPreviewHoldsRef.current;
		holds.set(folderNodeId, (holds.get(folderNodeId) ?? 0) + 1);
	}, []);

	const handleFolderPreviewRelease = useCallback(
		(folderNodeId: string) => {
			const holds = folderPreviewHoldsRef.current;
			const count = (holds.get(folderNodeId) ?? 1) - 1;
			if (count <= 0) {
				holds.delete(folderNodeId);
				setNodes((prev) =>
					prev.filter(
						(n) =>
							!isFolderPreviewNode(n) ||
							n.data.parentFolderNodeId !== folderNodeId,
					),
				);
			} else {
				holds.set(folderNodeId, count);
			}
		},
		[setNodes],
	);

	const handleSelectionChange = useCallback(
		(params: OnSelectionChangeParams) => {
			const ids = new Set(params.nodes.map((n) => n.id));
			setSelectedNodeIds(ids);
			onSelectionChange?.(params.nodes as CanvasNode[]);
		},
		[onSelectionChange],
	);

	const handleConnect = useCallback(
		(connection: Connection) => {
			setEdges((prev) => addEdge(connection, prev));
		},
		[setEdges],
	);

	const handleNodeDoubleClick: NodeMouseHandler<CanvasNode> = useCallback(
		(_event, node) => {
			if (isNoteNode(node)) {
				const noteId = node.data.noteId ?? node.id;
				const title = node.data.title ?? "Untitled";
				ensureTabForNote(noteId, title);
				void beginInlineEdit(node);
			} else if (isFolderNode(node)) {
				if (typeof node.data.dir === "string") onOpenFolder(node.data.dir);
			} else if (isFileNode(node)) {
				if (node.data.path) onOpenNote(node.data.path);
			}
		},
		[beginInlineEdit, ensureTabForNote, onOpenFolder, onOpenNote],
	);

	const canvasActions: CanvasActions = useMemo(
		() => ({
			openNote: onOpenNote,
			openFolder: onOpenFolder,
			holdFolderPreview: handleFolderPreviewHold,
			releaseFolderPreview: handleFolderPreviewRelease,
		}),
		[
			onOpenNote,
			onOpenFolder,
			handleFolderPreviewHold,
			handleFolderPreviewRelease,
		],
	);

	const noteEditActions: CanvasNoteEditActions = useMemo(
		() => ({
			session: noteEditSession,
			openEditor: (nodeId: string) => {
				const node = nodeById.get(nodeId);
				if (node && isNoteNode(node)) {
					const noteId = node.data.noteId ?? node.id;
					const title = node.data.title ?? "Untitled";
					ensureTabForNote(noteId, title);
					void beginInlineEdit(node);
				}
			},
			closeEditor: closeInlineEditor,
			saveNow: saveInlineNow,
			reloadFromDisk: reloadInlineFromDisk,
			overwriteDisk: overwriteInlineToDisk,
			setEditorMode: setInlineEditorMode,
			updateMarkdown: updateInlineMarkdown,
		}),
		[
			noteEditSession,
			nodeById,
			ensureTabForNote,
			beginInlineEdit,
			closeInlineEditor,
			saveInlineNow,
			reloadInlineFromDisk,
			overwriteInlineToDisk,
			setInlineEditorMode,
			updateInlineMarkdown,
		],
	);

	const { handleCloseTab, handleSelectTab } = useCanvasTabs({
		noteTabs,
		activeTabId,
		noteEditSession,
		nodes,
		setNoteTabs,
		setActiveTabId,
		closeInlineEditor,
		beginInlineEdit,
	});

	const hasSelectedLink = useMemo(
		() => nodes.some((n) => selectedNodeIds.has(n.id) && n.type === "link"),
		[nodes, selectedNodeIds],
	);

	if (!doc) {
		return (
			<div className="canvasPaneEmpty">
				<div className="canvasPaneEmptyText">
					Select a canvas to get started
				</div>
			</div>
		);
	}

	return (
		<CanvasActionsContext.Provider value={canvasActions}>
			<CanvasNoteEditContext.Provider value={noteEditActions}>
				<div className="canvasPane">
					<CanvasToolbar
						title={doc.title}
						isSaving={isSaving}
						snapToGrid={snapToGrid}
						hasActiveNote={Boolean(activeNoteId)}
						selectedCount={selectedNodeIds.size}
						hasSelectedLink={hasSelectedLink}
						onAddText={handleAddTextNode}
						onAddLink={handleAddLinkNode}
						onAddNote={handleAddCurrentNote}
						onRefreshLink={handleRefreshLink}
						onFrameSelection={handleFrameSelection}
						onToggleSnap={() => setSnapToGrid((v) => !v)}
						onReflowGrid={handleReflowGrid}
						onAlign={handleAlign}
						onDistribute={handleDistribute}
					/>
					<div className="canvasFlowWrapper">
						<ReactFlow
							nodes={nodes}
							edges={edges}
							onNodesChange={onNodesChange}
							onEdgesChange={onEdgesChange}
							onConnect={handleConnect}
							onSelectionChange={handleSelectionChange}
							onNodeDoubleClick={handleNodeDoubleClick}
							nodeTypes={nodeTypes}
							snapToGrid={snapToGrid}
							snapGrid={[GRID_SIZE, GRID_SIZE]}
							fitView
							fitViewOptions={{ padding: 0.2 }}
							minZoom={0.1}
							maxZoom={2}
							proOptions={{ hideAttribution: true }}
						>
							<Controls />
							<MiniMap zoomable pannable />
						</ReactFlow>
					</div>
					<CanvasNoteOverlayEditor
						nodes={nodes}
						tabs={noteTabs}
						activeTabId={activeTabId}
						onSelectTab={handleSelectTab}
						onCloseTab={handleCloseTab}
						onNewTab={createNewTab}
					/>
				</div>
			</CanvasNoteEditContext.Provider>
		</CanvasActionsContext.Provider>
	);
}

export default CanvasPane;
