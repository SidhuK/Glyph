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
import { GRID_SIZE, computeGridPositions, snapPoint } from "../../lib/canvasLayout";
import { parseNotePreview } from "../../lib/notePreview";
import { invoke } from "../../lib/tauri";
import { CanvasNoteOverlayEditor } from "./CanvasNoteOverlayEditor";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasActionsContext, CanvasNoteEditContext } from "./contexts";
import { useCanvasHistory } from "./hooks/useCanvasHistory";
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
import type {
	CanvasActions,
	CanvasEdge,
	CanvasNode,
	CanvasNoteEditActions,
	CanvasPaneProps,
} from "./types";

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

type AlignMode = "left" | "right" | "top" | "bottom" | "centerX" | "centerY";

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
	const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());

	const docIdRef = useRef<string | null>(null);
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const initializedRef = useRef(false);
	const folderPreviewHoldsRef = useRef<Map<string, number>>(new Map());

	const stripEphemeral = useCallback(
		(n: CanvasNode[], e: CanvasEdge[]) => ({
			nodes: n.filter((node) => node.type !== "folderPreview"),
			edges: e,
		}),
		[],
	);

	const { pushHistory, undo, redo, resetHistory, applyingHistoryRef } = useCanvasHistory(
		nodes,
		edges,
		setNodes,
		setEdges,
		stripEphemeral,
	);

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

	const scheduleSave = useCallback(() => {
		if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
		saveTimeoutRef.current = setTimeout(async () => {
			if (!doc) return;
			const stable = stripEphemeral(nodes, edges);
			setIsSaving(true);
			try {
				await onSave({ ...doc, nodes: stable.nodes, edges: stable.edges });
			} finally {
				setIsSaving(false);
			}
		}, 800);
	}, [doc, nodes, edges, onSave, stripEphemeral]);

	useEffect(() => {
		if (!doc) return;
		if (docIdRef.current === doc.id && initializedRef.current) return;
		docIdRef.current = doc.id;
		initializedRef.current = true;
		setNodes(doc.nodes);
		setEdges(doc.edges);
		resetHistory(doc.nodes, doc.edges);
	}, [doc, setNodes, setEdges, resetHistory]);

	useEffect(() => {
		if (!initializedRef.current || applyingHistoryRef.current) return;
		pushHistory(nodes, edges);
		scheduleSave();
	}, [nodes, edges, pushHistory, scheduleSave, applyingHistoryRef]);

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
		const existingBounds = nodes.map((n) => ({
			x: n.position.x,
			y: n.position.y,
			w: 200,
			h: 140,
		}));
		let x = 100;
		let y = 100;
		for (const b of existingBounds) {
			if (b.x + b.w > x) x = b.x + b.w + 40;
		}
		return snapToGrid ? snapPoint({ x, y }) : { x, y };
	}, [nodes, snapToGrid]);

	const handleAddTextNode = useCallback(() => {
		const text = prompt("Enter text:");
		if (!text) return;
		const pos = findDropPosition();
		const node: CanvasNode = {
			id: crypto.randomUUID(),
			type: "text",
			position: pos,
			data: { text },
		};
		setNodes((prev) => [...prev, node]);
	}, [findDropPosition, setNodes]);

	const handleAddLinkNode = useCallback(async () => {
		const url = prompt("Enter URL:");
		if (!url) return;
		const pos = findDropPosition();
		const nodeId = crypto.randomUUID();
		const node: CanvasNode = {
			id: nodeId,
			type: "link",
			position: pos,
			data: { url, status: "Loading…" },
		};
		setNodes((prev) => [...prev, node]);
		try {
			const preview = await invoke("link_preview", { url });
			setNodes((prev) =>
				prev.map((n) =>
					n.id === nodeId
						? {
								...n,
								data: {
									...n.data,
									preview,
									status: preview.ok ? "" : "Failed to load preview",
									image_src: preview.image_cache_rel_path
										? `asset://${vaultPath}/.tether/cache/${preview.image_cache_rel_path}`
										: preview.image_url ?? "",
								},
							}
						: n,
				),
			);
		} catch {
			setNodes((prev) =>
				prev.map((n) =>
					n.id === nodeId ? { ...n, data: { ...n.data, status: "Failed to load" } } : n,
				),
			);
		}
	}, [findDropPosition, setNodes, vaultPath]);

	const handleAddCurrentNote = useCallback(() => {
		if (!activeNoteId) return;
		const existing = nodes.find(
			(n) => n.type === "note" && (n.data as Record<string, unknown>)?.noteId === activeNoteId,
		);
		if (existing) return;
		const pos = findDropPosition();
		const node: CanvasNode = {
			id: crypto.randomUUID(),
			type: "note",
			position: pos,
			data: { noteId: activeNoteId, title: activeNoteTitle ?? "Note", content: "" },
		};
		setNodes((prev) => [...prev, node]);
	}, [activeNoteId, activeNoteTitle, nodes, findDropPosition, setNodes]);

	const handleRefreshLink = useCallback(async () => {
		const selectedLinks = nodes.filter(
			(n) => selectedNodeIds.has(n.id) && n.type === "link",
		);
		for (const node of selectedLinks) {
			const url = (node.data as Record<string, unknown>)?.url;
			if (typeof url !== "string") continue;
			setNodes((prev) =>
				prev.map((n) =>
					n.id === node.id ? { ...n, data: { ...n.data, status: "Refreshing…" } } : n,
				),
			);
			try {
				const preview = await invoke("link_preview", { url, force: true });
				setNodes((prev) =>
					prev.map((n) =>
						n.id === node.id
							? {
									...n,
									data: {
										...n.data,
										preview,
										status: preview.ok ? "" : "Failed",
										image_src: preview.image_cache_rel_path
											? `asset://${vaultPath}/.tether/cache/${preview.image_cache_rel_path}`
											: preview.image_url ?? "",
									},
								}
							: n,
					),
				);
			} catch {
				setNodes((prev) =>
					prev.map((n) =>
						n.id === node.id ? { ...n, data: { ...n.data, status: "Failed" } } : n,
					),
				);
			}
		}
	}, [nodes, selectedNodeIds, setNodes, vaultPath]);

	const handleFrameSelection = useCallback(() => {
		const selected = nodes.filter((n) => selectedNodeIds.has(n.id));
		if (!selected.length) return;
		const minX = Math.min(...selected.map((n) => n.position.x));
		const minY = Math.min(...selected.map((n) => n.position.y));
		const maxX = Math.max(...selected.map((n) => n.position.x + 200));
		const maxY = Math.max(...selected.map((n) => n.position.y + 140));
		const padding = 32;
		const frame: CanvasNode = {
			id: crypto.randomUUID(),
			type: "frame",
			position: { x: minX - padding, y: minY - padding },
			data: {
				title: "Frame",
				width: maxX - minX + padding * 2,
				height: maxY - minY + padding * 2,
			},
		};
		setNodes((prev) => [frame, ...prev]);
	}, [nodes, selectedNodeIds, setNodes]);

	const handleReflowGrid = useCallback(() => {
		const positions = computeGridPositions(nodes);
		setNodes((prev) =>
			prev.map((n) => {
				const pos = positions.get(n.id);
				return pos ? { ...n, position: pos } : n;
			}),
		);
	}, [nodes, setNodes]);

	const handleAlign = useCallback(
		(mode: AlignMode) => {
			const selected = nodes.filter((n) => selectedNodeIds.has(n.id));
			if (selected.length < 2) return;
			let target: number;
			switch (mode) {
				case "left":
					target = Math.min(...selected.map((n) => n.position.x));
					break;
				case "right":
					target = Math.max(...selected.map((n) => n.position.x));
					break;
				case "top":
					target = Math.min(...selected.map((n) => n.position.y));
					break;
				case "bottom":
					target = Math.max(...selected.map((n) => n.position.y));
					break;
				case "centerX":
					target =
						selected.reduce((sum, n) => sum + n.position.x, 0) / selected.length;
					break;
				case "centerY":
					target =
						selected.reduce((sum, n) => sum + n.position.y, 0) / selected.length;
					break;
			}
			setNodes((prev) =>
				prev.map((n) => {
					if (!selectedNodeIds.has(n.id)) return n;
					const pos = { ...n.position };
					if (mode === "left" || mode === "right" || mode === "centerX") {
						pos.x = target;
					} else {
						pos.y = target;
					}
					return { ...n, position: snapToGrid ? snapPoint(pos) : pos };
				}),
			);
		},
		[nodes, selectedNodeIds, setNodes, snapToGrid],
	);

	const handleDistribute = useCallback(
		(axis: "x" | "y") => {
			const selected = nodes.filter((n) => selectedNodeIds.has(n.id));
			if (selected.length < 3) return;
			const sorted = [...selected].sort((a, b) =>
				axis === "x" ? a.position.x - b.position.x : a.position.y - b.position.y,
			);
			const first = sorted[0].position[axis];
			const last = sorted[sorted.length - 1].position[axis];
			const gap = (last - first) / (sorted.length - 1);
			const positionMap = new Map<string, number>();
			sorted.forEach((n, i) => positionMap.set(n.id, first + gap * i));
			setNodes((prev) =>
				prev.map((n) => {
					if (!positionMap.has(n.id)) return n;
					const pos = { ...n.position };
					pos[axis] = positionMap.get(n.id)!;
					return { ...n, position: snapToGrid ? snapPoint(pos) : pos };
				}),
			);
		},
		[nodes, selectedNodeIds, setNodes, snapToGrid],
	);

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
							n.type !== "folderPreview" ||
							(n.data as Record<string, unknown>)?.parentFolderNodeId !== folderNodeId,
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
			if (node.type === "note") {
				const noteId =
					typeof (node.data as Record<string, unknown>)?.noteId === "string"
						? ((node.data as Record<string, unknown>).noteId as string)
						: node.id;
				const title =
					typeof (node.data as Record<string, unknown>)?.title === "string"
						? ((node.data as Record<string, unknown>).title as string)
						: "Untitled";
				ensureTabForNote(noteId, title);
				void beginInlineEdit(node);
			} else if (node.type === "folder") {
				const dir = (node.data as Record<string, unknown>)?.dir;
				if (typeof dir === "string") onOpenFolder(dir);
			}
		},
		[beginInlineEdit, ensureTabForNote, onOpenFolder],
	);

	useEffect(() => {
		if (!externalCommand) return;
		const cmd = externalCommand;
		const markHandled = () => onExternalCommandHandled?.(cmd.id);

		switch (cmd.kind) {
			case "add_note_node": {
				const existing = nodes.find(
					(n) =>
						n.type === "note" &&
						(n.data as Record<string, unknown>)?.noteId === cmd.noteId,
				);
				if (!existing) {
					const pos = findDropPosition();
					const node: CanvasNode = {
						id: crypto.randomUUID(),
						type: "note",
						position: pos,
						data: { noteId: cmd.noteId, title: cmd.title, content: "" },
					};
					setNodes((prev) => [...prev, node]);
				}
				markHandled();
				break;
			}
			case "focus_node": {
				markHandled();
				break;
			}
			case "open_note_editor": {
				const node = nodes.find(
					(n) =>
						n.type === "note" &&
						(n.data as Record<string, unknown>)?.noteId === cmd.noteId,
				);
				if (node) {
					ensureTabForNote(cmd.noteId, cmd.title ?? "Untitled");
					void beginInlineEdit(node);
				}
				markHandled();
				break;
			}
			case "apply_note_markdown": {
				if (noteEditSession?.noteId === cmd.noteId) {
					updateInlineMarkdown(cmd.markdown);
				}
				markHandled();
				break;
			}
			case "add_text_node": {
				const pos = findDropPosition();
				const node: CanvasNode = {
					id: crypto.randomUUID(),
					type: "text",
					position: pos,
					data: { text: cmd.text },
				};
				setNodes((prev) => [...prev, node]);
				markHandled();
				break;
			}
			case "add_link_node": {
				(async () => {
					const pos = findDropPosition();
					const nodeId = crypto.randomUUID();
					const node: CanvasNode = {
						id: nodeId,
						type: "link",
						position: pos,
						data: { url: cmd.url, status: "Loading…" },
					};
					setNodes((prev) => [...prev, node]);
					try {
						const preview = await invoke("link_preview", { url: cmd.url });
						setNodes((prev) =>
							prev.map((n) =>
								n.id === nodeId
									? {
											...n,
											data: {
												...n.data,
												preview,
												status: preview.ok ? "" : "Failed",
												image_src: preview.image_cache_rel_path
													? `asset://${vaultPath}/.tether/cache/${preview.image_cache_rel_path}`
													: preview.image_url ?? "",
											},
										}
									: n,
							),
						);
					} catch {
						setNodes((prev) =>
							prev.map((n) =>
								n.id === nodeId
									? { ...n, data: { ...n.data, status: "Failed" } }
									: n,
							),
						);
					}
					markHandled();
				})();
				break;
			}
		}
	}, [
		externalCommand,
		onExternalCommandHandled,
		nodes,
		findDropPosition,
		setNodes,
		ensureTabForNote,
		beginInlineEdit,
		noteEditSession,
		updateInlineMarkdown,
		vaultPath,
	]);

	const canvasActions: CanvasActions = useMemo(
		() => ({
			openNote: onOpenNote,
			openFolder: onOpenFolder,
			holdFolderPreview: handleFolderPreviewHold,
			releaseFolderPreview: handleFolderPreviewRelease,
		}),
		[onOpenNote, onOpenFolder, handleFolderPreviewHold, handleFolderPreviewRelease],
	);

	const noteEditActions: CanvasNoteEditActions = useMemo(
		() => ({
			session: noteEditSession,
			openEditor: (nodeId: string) => {
				const node = nodes.find((n) => n.id === nodeId);
				if (node?.type === "note") {
					const noteId =
						typeof (node.data as Record<string, unknown>)?.noteId === "string"
							? ((node.data as Record<string, unknown>).noteId as string)
							: node.id;
					const title =
						typeof (node.data as Record<string, unknown>)?.title === "string"
							? ((node.data as Record<string, unknown>).title as string)
							: "Untitled";
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
			nodes,
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

	const handleCloseTab = useCallback(
		(tabId: string) => {
			const tab = noteTabs.find((t) => t.tabId === tabId);
			if (tab?.noteId === noteEditSession?.noteId) {
				void closeInlineEditor();
			}
			setNoteTabs((prev) => prev.filter((t) => t.tabId !== tabId));
			if (activeTabId === tabId) {
				const remaining = noteTabs.filter((t) => t.tabId !== tabId);
				setActiveTabId(remaining.length ? remaining[0].tabId : null);
			}
		},
		[noteTabs, noteEditSession, closeInlineEditor, setNoteTabs, activeTabId, setActiveTabId],
	);

	const handleSelectTab = useCallback(
		(tabId: string) => {
			setActiveTabId(tabId);
			const tab = noteTabs.find((t) => t.tabId === tabId);
			if (tab?.noteId) {
				const node = nodes.find(
					(n) =>
						n.type === "note" &&
						(n.data as Record<string, unknown>)?.noteId === tab.noteId,
				);
				if (node) void beginInlineEdit(node);
			}
		},
		[setActiveTabId, noteTabs, nodes, beginInlineEdit],
	);

	const hasSelectedLink = useMemo(
		() =>
			nodes.some((n) => selectedNodeIds.has(n.id) && n.type === "link"),
		[nodes, selectedNodeIds],
	);

	if (!doc) {
		return (
			<div className="canvasPaneEmpty">
				<div className="canvasPaneEmptyText">Select a canvas to get started</div>
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
