import {
	DashboardSquare02Icon,
	MapingIcon,
	More01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	type Connection,
	ControlButton,
	Controls,
	MiniMap,
	type NodeMouseHandler,
	type OnSelectionChangeParams,
	ReactFlow,
	addEdge,
	useEdgesState,
	useNodesState,
} from "@xyflow/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GRID_SIZE, estimateNodeSize, snapPoint } from "../../lib/canvasLayout";
import { Grid3X3 } from "../Icons";
import { CanvasNoteOverlayEditor } from "./CanvasNoteOverlayEditor";
import { CanvasActionsContext, CanvasNoteEditContext } from "./contexts";
import { useCanvasHistory } from "./hooks/useCanvasHistory";
import { useCanvasToolbarActions } from "./hooks/useCanvasToolbarActions";
import { useExternalCanvasCommands } from "./hooks/useExternalCanvasCommands";
import { useNoteEditSession } from "./hooks/useNoteEditSession";
import {
	FileNode,
	FolderNode,
	FrameNode,
	LinkNode,
	NoteNode,
	TextNode,
} from "./nodes";
import { isFileNode, isNoteNode } from "./types";
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
};

const FLOW_SURFACE_SIDE_PADDING = 260;
const FLOW_SURFACE_BOTTOM_PADDING = 220;
const FLOW_DEFAULT_VIEWPORT_X = 0;
const FLOW_DEFAULT_VIEWPORT_Y = 0;

type BreadcrumbItem = {
	key: string;
	label: string;
	dir: string | null;
	isActive: boolean;
};

function buildCanvasBreadcrumbItems(
	doc: CanvasPaneProps["doc"],
): BreadcrumbItem[] {
	if (!doc) return [];
	if (doc.id.startsWith("folder:")) {
		const rawDir = doc.id.slice("folder:".length).trim();
		const segments = rawDir
			.split("/")
			.map((segment) => segment.trim())
			.filter(Boolean);
		if (segments.length === 0) {
			return [{ key: "vault", label: "Vault", dir: "", isActive: true }];
		}
		const items: BreadcrumbItem[] = [
			{
				key: "vault",
				label: "Vault",
				dir: "",
				isActive: false,
			},
		];
		for (let i = 0; i < segments.length; i++) {
			const dir = segments.slice(0, i + 1).join("/");
			items.push({
				key: `dir-${dir}`,
				label: segments[i],
				dir,
				isActive: i === segments.length - 1,
			});
		}
		return items;
	}
	if (doc.id.startsWith("tag:")) {
		return [
			{ key: "tag-root", label: "Tag", dir: null, isActive: false },
			{ key: "tag", label: doc.title || "Tag", dir: null, isActive: true },
		];
	}
	if (doc.id.startsWith("search:")) {
		return [
			{ key: "search-root", label: "Search", dir: null, isActive: false },
			{
				key: "search",
				label: doc.title || "Results",
				dir: null,
				isActive: true,
			},
		];
	}
	if (doc.id.startsWith("canvas:")) {
		return [
			{ key: "canvas-root", label: "Canvas", dir: null, isActive: false },
			{
				key: "canvas",
				label: doc.title || "Untitled Canvas",
				dir: null,
				isActive: true,
			},
		];
	}
	return [
		{ key: "view", label: doc.title || "View", dir: null, isActive: true },
	];
}

function CanvasPane({
	doc,
	onSave,
	onOpenNote,
	onOpenFolder,
	onNewFileInDir,
	onNewFolderInDir,
	onRenamePath,
	vaultPath,
	onSelectionChange,
	externalCommand,
	onExternalCommandHandled,
}: CanvasPaneProps) {
	const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>([]);
	const [, setIsSaving] = useState(false);
	const [snapToGrid, setSnapToGrid] = useState(true);
	const [showMiniMap, setShowMiniMap] = useState(false);
	const [controlsCollapsed, setControlsCollapsed] = useState(false);

	const docIdRef = useRef<string | null>(null);
	const latestDocRef = useRef(doc);
	const lastSavedSnapshotRef = useRef("");
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingSaveRef = useRef<{
		nodes: CanvasNode[];
		edges: CanvasEdge[];
	} | null>(null);
	const initializedRef = useRef(false);
	const flowWrapperRef = useRef<HTMLDivElement | null>(null);
	const [flowViewportSize, setFlowViewportSize] = useState({
		width: 0,
		height: 0,
	});

	const stripEphemeral = useCallback(
		(
			n: CanvasNode[],
			e: CanvasEdge[],
		): { nodes: CanvasNode[]; edges: CanvasEdge[] } => ({
			nodes: n,
			edges: e,
		}),
		[],
	);

	const { pushHistory, undo, redo, resetHistory, applyingHistoryRef } =
		useCanvasHistory(nodes, edges, setNodes, setEdges, stripEphemeral);

	const {
		noteEditSession,
		beginInlineEdit,
		updateInlineMarkdown,
		setInlineEditorMode,
		closeInlineEditor,
		reloadInlineFromDisk,
		overwriteInlineToDisk,
		saveInlineNow,
	} = useNoteEditSession(setNodes);
	const isNoteEditorOpen = Boolean(noteEditSession);

	const nodeById = useMemo(() => {
		const byId = new Map<string, CanvasNode>();
		for (const node of nodes) byId.set(node.id, node);
		return byId;
	}, [nodes]);

	const canvasBounds = useMemo(() => {
		let maxRight = 80;
		let maxBottom = 80;
		for (const node of nodes) {
			const size = estimateNodeSize({
				id: node.id,
				type: node.type ?? "",
				data: node.data ?? {},
			});
			const right = node.position.x + size.w;
			const bottom = node.position.y + size.h;
			if (right > maxRight) maxRight = right;
			if (bottom > maxBottom) maxBottom = bottom;
		}
		return { maxRight, maxBottom };
	}, [nodes]);

	const flowSurfaceWidth = useMemo(
		() =>
			Math.max(
				flowViewportSize.width,
				canvasBounds.maxRight + FLOW_SURFACE_SIDE_PADDING,
			),
		[canvasBounds.maxRight, flowViewportSize.width],
	);

	const flowSurfaceHeight = useMemo(
		() =>
			Math.max(
				flowViewportSize.height,
				canvasBounds.maxBottom + FLOW_SURFACE_BOTTOM_PADDING,
			),
		[canvasBounds.maxBottom, flowViewportSize.height],
	);

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
		if (isNoteEditorOpen) return;
		const wrapper = flowWrapperRef.current;
		if (!wrapper) return;
		const update = () => {
			setFlowViewportSize({
				width: wrapper.clientWidth,
				height: wrapper.clientHeight,
			});
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(wrapper);
		return () => observer.disconnect();
	}, [isNoteEditorOpen]);

	useEffect(() => {
		if (!doc) return;
		const incomingSnapshot = snapshotPersistedShape(doc.nodes, doc.edges);
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
		const x = canvasBounds.maxRight + 40;
		const y = 100;
		return snapToGrid ? snapPoint({ x, y }) : { x, y };
	}, [canvasBounds.maxRight, snapToGrid]);

	const { handleAddLinkNode, handleReflowGrid } = useCanvasToolbarActions({
		setNodes,
		findDropPosition,
		vaultPath,
	});

	useExternalCanvasCommands({
		externalCommand,
		onExternalCommandHandled,
		nodes,
		findDropPosition,
		setNodes,
		beginInlineEdit,
		noteEditSessionNoteId: noteEditSession?.noteId ?? null,
		updateInlineMarkdown,
		handleAddLinkNode,
	});

	const handleSelectionChange = useCallback(
		(params: OnSelectionChangeParams) => {
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
				void beginInlineEdit(node);
			} else if (isFileNode(node)) {
				if (node.data.path) onOpenNote(node.data.path);
			}
		},
		[beginInlineEdit, onOpenNote],
	);

	const canvasActions: CanvasActions = useMemo(
		() => ({
			openNote: onOpenNote,
			openFolder: onOpenFolder,
			newFileInDir: onNewFileInDir,
			newFolderInDir: onNewFolderInDir,
			reflowGrid: handleReflowGrid,
			renamePath: onRenamePath,
		}),
		[
			onOpenNote,
			onOpenFolder,
			onNewFileInDir,
			onNewFolderInDir,
			handleReflowGrid,
			onRenamePath,
		],
	);

	const noteEditActions: CanvasNoteEditActions = useMemo(
		() => ({
			session: noteEditSession,
			openEditor: (nodeId: string) => {
				const node = nodeById.get(nodeId);
				if (node && isNoteNode(node)) {
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
			beginInlineEdit,
			closeInlineEditor,
			saveInlineNow,
			reloadInlineFromDisk,
			overwriteInlineToDisk,
			setInlineEditorMode,
			updateInlineMarkdown,
		],
	);
	const breadcrumbItems = useMemo(() => buildCanvasBreadcrumbItems(doc), [doc]);

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
					<AnimatePresence mode="wait" initial={false}>
						{isNoteEditorOpen ? (
							<motion.div
								key="note-editor"
								className="canvasViewportSwap"
								initial={{ opacity: 0, y: 12, scale: 0.992 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={{ opacity: 0, y: -8, scale: 0.996 }}
								transition={{ type: "spring", stiffness: 260, damping: 28 }}
							>
								<CanvasNoteOverlayEditor nodes={nodes} />
							</motion.div>
						) : (
							<motion.div
								key="canvas-flow"
								className="canvasViewportSwap"
								initial={{ opacity: 0, y: -10, scale: 0.996 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={{ opacity: 0, y: 8, scale: 0.992 }}
								transition={{ type: "spring", stiffness: 260, damping: 28 }}
							>
								<div className="canvasFlowWrapper" ref={flowWrapperRef}>
									<div className="canvasFloatingBreadcrumbWrap">
										<AnimatePresence mode="wait" initial={false}>
											<motion.nav
												key={doc.id}
												className="canvasFloatingBreadcrumb"
												aria-label="Canvas breadcrumb"
												transition={{
													type: "tween",
													duration: 0.16,
													ease: [0.22, 1, 0.36, 1],
												}}
												variants={{
													hidden: {
														opacity: 0,
														y: -8,
														scale: 0.98,
														filter: "blur(2px)",
														transition: { staggerChildren: 0.012 },
													},
													visible: {
														opacity: 1,
														y: 0,
														scale: 1,
														filter: "blur(0px)",
														transition: {
															delayChildren: 0.01,
															staggerChildren: 0.015,
														},
													},
												}}
												initial="hidden"
												animate="visible"
												exit="hidden"
											>
												{breadcrumbItems.map((item, index) => {
													const clickable = item.dir !== null && !item.isActive;
													return (
														<motion.div
															className="canvasBreadcrumbItem"
															key={item.key}
															layout
															variants={{
																hidden: { opacity: 0, y: -4, scale: 0.95 },
																visible: { opacity: 1, y: 0, scale: 1 },
															}}
															transition={{
																type: "tween",
																duration: 0.12,
																ease: [0.22, 1, 0.36, 1],
															}}
														>
															{clickable ? (
																<motion.button
																	type="button"
																	className="canvasBreadcrumbBtn"
																	onClick={() => {
																		if (item.dir == null) return;
																		onOpenFolder(item.dir);
																	}}
																	title={`Open ${item.label}`}
																	whileHover={{ y: -1, scale: 1.015 }}
																	whileTap={{ scale: 0.97 }}
																>
																	{item.label}
																</motion.button>
															) : (
																<span
																	className={`canvasBreadcrumbText ${
																		item.isActive
																			? "canvasBreadcrumbTextActive"
																			: ""
																	}`}
																>
																	{item.label}
																</span>
															)}
															{index < breadcrumbItems.length - 1 ? (
																<span
																	className="canvasBreadcrumbSep"
																	aria-hidden="true"
																>
																	/
																</span>
															) : null}
														</motion.div>
													);
												})}
											</motion.nav>
										</AnimatePresence>
									</div>
									<ReactFlow
										nodes={nodes}
										edges={edges}
										style={{
											width: flowSurfaceWidth,
											height: flowSurfaceHeight,
										}}
										onNodesChange={onNodesChange}
										onEdgesChange={onEdgesChange}
										onConnect={handleConnect}
										onSelectionChange={handleSelectionChange}
										onNodeDoubleClick={handleNodeDoubleClick}
										nodeTypes={nodeTypes}
										snapToGrid={snapToGrid}
										snapGrid={[GRID_SIZE, GRID_SIZE]}
										defaultViewport={{
											x: FLOW_DEFAULT_VIEWPORT_X,
											y: FLOW_DEFAULT_VIEWPORT_Y,
											zoom: 1,
										}}
										preventScrolling={false}
										zoomOnScroll={false}
										minZoom={0.1}
										maxZoom={2}
										proOptions={{ hideAttribution: true }}
									>
										<Controls
											showZoom={!controlsCollapsed}
											showFitView={!controlsCollapsed}
											showInteractive={!controlsCollapsed}
										>
											<ControlButton
												onClick={() => setControlsCollapsed((v) => !v)}
												title={
													controlsCollapsed
														? "Expand controls"
														: "Collapse controls"
												}
												aria-label={
													controlsCollapsed
														? "Expand controls"
														: "Collapse controls"
												}
												className="canvasControlToggle"
											>
												<HugeiconsIcon icon={More01Icon} size={14} />
											</ControlButton>
											<AnimatePresence initial={false}>
												{!controlsCollapsed ? (
													<motion.div
														key="canvas-controls-extras"
														className="canvasControlsExtras"
														initial={{ width: 0, opacity: 0 }}
														animate={{ width: "auto", opacity: 1 }}
														exit={{ width: 0, opacity: 0 }}
														transition={{
															type: "spring",
															stiffness: 360,
															damping: 30,
														}}
													>
														<ControlButton
															onClick={() => setSnapToGrid((v) => !v)}
															title="Toggle snap to grid"
															aria-label="Toggle snap to grid"
															className={
																snapToGrid ? "canvasControlActive" : undefined
															}
														>
															<Grid3X3 size={14} />
														</ControlButton>
														<ControlButton
															onClick={handleReflowGrid}
															title="Reflow to grid"
															aria-label="Reflow to grid"
														>
															<HugeiconsIcon icon={DashboardSquare02Icon} size={14} />
														</ControlButton>
														<ControlButton
															onClick={() => setShowMiniMap((v) => !v)}
															title={
																showMiniMap ? "Hide minimap" : "Show minimap"
															}
															aria-label={
																showMiniMap ? "Hide minimap" : "Show minimap"
															}
															className={
																showMiniMap ? "canvasControlActive" : undefined
															}
														>
															<HugeiconsIcon icon={MapingIcon} size={14} />
														</ControlButton>
													</motion.div>
												) : null}
											</AnimatePresence>
										</Controls>
										{showMiniMap ? (
											<MiniMap zoomable pannable position="top-right" />
										) : null}
									</ReactFlow>
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</CanvasNoteEditContext.Provider>
		</CanvasActionsContext.Provider>
	);
}

export default CanvasPane;
