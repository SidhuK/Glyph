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
import {
	FAN_COLLISION_MARGIN,
	FAN_MAX_ENTRIES,
	FAN_MOVE_TRANSITION,
	FAN_MOVE_TRANSITION_MS,
	FAN_REFLOW_SCAN_STEP,
	FAN_REFLOW_X_PADDING,
	type FolderFanState,
	type RectBox,
	computeFanGridLayout,
	createSpatialHash,
	folderFanNodeId,
	intersectsRect,
	nodeRectAtPosition,
	sanitizeFolderDataForSave,
} from "../../lib/fanLayout";
import { titleForFile } from "../../lib/notePreview";
import type { IndexNotePreview, RecentEntry } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { CanvasNoteOverlayEditor } from "./CanvasNoteOverlayEditor";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasActionsContext, CanvasNoteEditContext } from "./contexts";
import { useCanvasHistory } from "./hooks/useCanvasHistory";
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
import { Grid3X3 } from "../Icons";
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

const FLOW_SURFACE_SIDE_PADDING = 260;
const FLOW_SURFACE_BOTTOM_PADDING = 220;
const FLOW_DEFAULT_VIEWPORT_X = 0;
const FLOW_DEFAULT_VIEWPORT_Y = 0;

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
	const [, setIsSaving] = useState(false);
	const [snapToGrid, setSnapToGrid] = useState(true);
	const [showMiniMap, setShowMiniMap] = useState(false);
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
	const nodesRef = useRef<CanvasNode[]>([]);
	const folderPreviewHoldsRef = useRef<Map<string, number>>(new Map());
	const folderFanStateRef = useRef<Map<string, FolderFanState>>(new Map());
	const folderFanLoadingRef = useRef<Set<string>>(new Set());
	const fanTransitionCleanupRef = useRef<number | null>(null);
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
			nodes: n
				.filter(
					(node) =>
						node.type !== "folderPreview" &&
						typeof node.data.fan_parent_folder_id !== "string",
				)
				.map((node) =>
					node.type === "folder"
						? {
								...node,
								data: sanitizeFolderDataForSave(node.data ?? {}),
							}
						: node,
				),
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
		nodesRef.current = nodes;
	}, [nodes]);

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
		folderFanStateRef.current.clear();
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
			if (fanTransitionCleanupRef.current)
				clearTimeout(fanTransitionCleanupRef.current);
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

	const collapseFolderFan = useCallback(
		(folderNodeId: string) => {
			setNodes((prev) => {
				const state = folderFanStateRef.current.get(folderNodeId);
				if (!state) return prev;
				const next = prev.map((node) => {
					if (node.id === folderNodeId) {
						return {
							...node,
							data: { ...node.data, fan_expanded: false },
						};
					}
					const original = state.displacedByNodeId.get(node.id);
					if (!original || state.fanNodeIds.has(node.id)) return node;
					return {
						...node,
						position: original,
						style: {
							...(node.style ?? {}),
							transition: FAN_MOVE_TRANSITION,
						},
					};
				});
				folderFanStateRef.current.delete(folderNodeId);
				return next.filter((node) => !state.fanNodeIds.has(node.id));
			});
		},
		[setNodes],
	);

	const loadFolderFanEntries = useCallback(async (dir: string) => {
		const entries = await invoke("vault_dir_recent_entries", {
			dir: dir || null,
			limit: FAN_MAX_ENTRIES,
		});
		const files = entries as RecentEntry[];
		const markdownIds = files
			.filter((entry) => entry.is_markdown)
			.map((entry) => entry.rel_path);

		let previews: IndexNotePreview[] = [];
		try {
			previews = await invoke("index_note_previews_batch", {
				ids: markdownIds,
			});
		} catch {
			previews = [];
		}
		const previewsById = new Map(
			previews.map((preview) => [preview.id, preview]),
		);
		return { files, previewsById };
	}, []);

	const toggleFolderFan = useCallback(
		(folderNodeId: string) => {
			if (folderFanStateRef.current.has(folderNodeId)) {
				collapseFolderFan(folderNodeId);
				return;
			}
			if (folderFanLoadingRef.current.has(folderNodeId)) return;

			const folderNode = nodesRef.current.find(
				(node) => node.id === folderNodeId,
			);
			if (!folderNode || !isFolderNode(folderNode)) return;
			const dir =
				typeof folderNode.data.dir === "string" ? folderNode.data.dir : "";
			if (!dir) return;

			folderFanLoadingRef.current.add(folderNodeId);
			void loadFolderFanEntries(dir)
				.then(({ files, previewsById }) => {
					if (!files.length) return;
					setNodes((prev) => {
						const currentFolderNode = prev.find(
							(node) => node.id === folderNodeId,
						);
						if (!currentFolderNode || !isFolderNode(currentFolderNode))
							return prev;

						const fanNodeIds = new Set<string>();
						const fanNodes: CanvasNode[] = [];
						const layoutItems = files.map((file) =>
							file.is_markdown
								? { width: 230, height: 160 }
								: { width: 220, height: 200 },
						);
						const fanLayout = computeFanGridLayout(
							currentFolderNode,
							files.length,
						);

						let minX = Number.POSITIVE_INFINITY;
						let minY = Number.POSITIVE_INFINITY;
						let maxX = Number.NEGATIVE_INFINITY;
						let maxY = Number.NEGATIVE_INFINITY;

						for (const [index, file] of files.entries()) {
							const layout = fanLayout[index];
							const position = { x: layout.x, y: layout.y };
							const { width, height } = layoutItems[index];
							const id = folderFanNodeId(folderNodeId, file.rel_path);
							fanNodeIds.add(id);
							const preview = previewsById.get(file.rel_path);
							const commonData = {
								fan_parent_folder_id: folderNodeId,
								fan_rel_path: file.rel_path,
								fan_index: index,
								fan_rotation: layout.rotation,
							};
							const fanNodeTransition = `${FAN_MOVE_TRANSITION} ${Math.min(
								0.18,
								index * 0.022,
							).toFixed(3)}s`;
							if (file.is_markdown) {
								fanNodes.push({
									id,
									type: "note",
									position,
									zIndex: layout.zIndex,
									style: { transition: fanNodeTransition },
									data: {
										noteId: file.rel_path,
										title:
											preview?.title?.trim() || titleForFile(file.rel_path),
										content: preview?.preview ?? "",
										...commonData,
									},
								});
							} else {
								fanNodes.push({
									id,
									type: "file",
									position,
									zIndex: layout.zIndex,
									style: { transition: fanNodeTransition },
									data: {
										path: file.rel_path,
										title: file.name || titleForFile(file.rel_path),
										...commonData,
									},
								});
							}
							minX = Math.min(minX, position.x);
							minY = Math.min(minY, position.y);
							maxX = Math.max(maxX, position.x + width);
							maxY = Math.max(maxY, position.y + height);
						}

						const fanBounds: RectBox = {
							left: minX,
							top: minY,
							right: maxX,
							bottom: maxY,
						};
						const reflowDeltaX =
							maxX - minX + FAN_REFLOW_X_PADDING + FAN_COLLISION_MARGIN;
						const displacedByNodeId = new Map<
							string,
							{ x: number; y: number }
						>();
						const next: CanvasNode[] = [];
						const spatialIndex = createSpatialHash(256);

						for (const node of prev) {
							if (fanNodeIds.has(node.id)) continue;
							if (node.id === folderNodeId) {
								const expandedFolderNode: CanvasNode = {
									...node,
									data: { ...node.data, fan_expanded: true },
								};
								next.push(expandedFolderNode);
								const rect = nodeRectAtPosition(
									expandedFolderNode,
									expandedFolderNode.position,
								);
								spatialIndex.insert(rect);
								continue;
							}
							if (typeof node.data.fan_parent_folder_id === "string") continue;
							next.push(node);
						}

						for (const node of fanNodes) {
							const rect = nodeRectAtPosition(node, node.position);
							spatialIndex.insert(rect);
						}

						const reflowCandidates = next
							.filter((node) => node.id !== folderNodeId)
							.map((node) => ({
								node,
								rect: nodeRectAtPosition(node, node.position),
							}))
							.filter(({ rect }) =>
								intersectsRect(rect, fanBounds, FAN_COLLISION_MARGIN),
							)
							.sort((a, b) => a.node.position.x - b.node.position.x);

						const movedNodeById = new Map<string, CanvasNode>();

						for (const { node } of reflowCandidates) {
							displacedByNodeId.set(node.id, { ...node.position });
							let nextPosition = {
								x: node.position.x + reflowDeltaX,
								y: node.position.y,
							};
							if (snapToGrid) nextPosition = snapPoint(nextPosition);

							let nextRect = nodeRectAtPosition(node, nextPosition);
							let guard = 0;
							while (
								spatialIndex
									.query(nextRect)
									.some((occupied) =>
										intersectsRect(
											nextRect,
											occupied,
											FAN_COLLISION_MARGIN * 0.4,
										),
									) &&
								guard < 120
							) {
								nextPosition = snapToGrid
									? snapPoint({
											x: nextPosition.x + FAN_REFLOW_SCAN_STEP,
											y: nextPosition.y,
										})
									: {
											x: nextPosition.x + FAN_REFLOW_SCAN_STEP,
											y: nextPosition.y,
										};
								nextRect = nodeRectAtPosition(node, nextPosition);
								guard += 1;
							}

							const movedNode: CanvasNode = {
								...node,
								position: nextPosition,
								style: {
									...(node.style ?? {}),
									transition: FAN_MOVE_TRANSITION,
								},
							};
							movedNodeById.set(node.id, movedNode);
							spatialIndex.insert(nextRect);
						}

						const nextWithReflow = next.map(
							(node) => movedNodeById.get(node.id) ?? node,
						);

						folderFanStateRef.current.set(folderNodeId, {
							fanNodeIds,
							displacedByNodeId,
						});
						return [...nextWithReflow, ...fanNodes];
					});
				})
				.then(() => {
					if (fanTransitionCleanupRef.current != null) {
						window.clearTimeout(fanTransitionCleanupRef.current);
					}
					fanTransitionCleanupRef.current = window.setTimeout(() => {
						setNodes((prev) =>
							prev.map((n) => {
								if (
									!n.style ||
									typeof n.style.transition !== "string" ||
									!n.style.transition.startsWith("transform 320ms")
								) {
									return n;
								}
								const { transition: _, ...restStyle } = n.style;
								return { ...n, style: restStyle };
							}),
						);
						fanTransitionCleanupRef.current = null;
					}, FAN_MOVE_TRANSITION_MS + 50);
				})
				.finally(() => {
					folderFanLoadingRef.current.delete(folderNodeId);
				});
		},
		[collapseFolderFan, loadFolderFanEntries, setNodes, snapToGrid],
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
			toggleFolderFan,
			holdFolderPreview: handleFolderPreviewHold,
			releaseFolderPreview: handleFolderPreviewRelease,
		}),
		[
			onOpenNote,
			onOpenFolder,
			toggleFolderFan,
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
										<Controls>
											<ControlButton
												onClick={() => setShowMiniMap((v) => !v)}
												title={showMiniMap ? "Hide minimap" : "Show minimap"}
												aria-label={showMiniMap ? "Hide minimap" : "Show minimap"}
											>
												<Grid3X3 size={14} />
											</ControlButton>
										</Controls>
										{showMiniMap ? (
											<MiniMap zoomable pannable position="top-right" />
										) : null}
									</ReactFlow>
									<CanvasToolbar
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
