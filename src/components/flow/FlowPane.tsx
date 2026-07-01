import {
	Delete02Icon,
	File01Icon,
	FitToScreenIcon,
	GroupLayersIcon,
	Link01Icon,
	MinusSignIcon,
	PlusSignIcon,
	TextIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Background,
	type Connection,
	type EdgeChange,
	type NodeChange,
	type OnNodeDrag,
	Panel,
	ReactFlow,
	ReactFlowProvider,
	type Viewport,
	useEdgesState,
	useNodesState,
	useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	type FlowDocument,
	type FlowEdge,
	type FlowNode,
	createEmptyFlowDocument,
	flowDocumentToReactFlow,
	nextFlowNodeId,
	parseFlowDocument,
	reactFlowToFlowDocument,
	serializeFlowDocument,
} from "../../lib/flow";
import { invoke } from "../../lib/tauri";
import { isMarkdownPath, normalizeRelPath, parentDir } from "../../utils/path";
import { Button } from "../ui/shadcn/button";
import { FlowDocumentEdgeInspector, FlowNodeInspector } from "./FlowInspector";
import {
	FlowFileNode,
	FlowGroupNode,
	FlowLinkNode,
	FlowTextNode,
} from "./FlowNodes";
import {
	createFlowFileNode,
	createFlowNode,
	detachFlowNodeFromParent,
	groupSelectedFlowNodes,
	parentNodeToContainingGroup,
	removeSelectedFlowNodes,
} from "./flowNodeLayout";

const AUTOSAVE_DELAY_MS = 650;

interface FlowPaneProps {
	relPath: string;
	openFile?: (relPath: string) => Promise<void> | void;
	onDirtyChange?: (dirty: boolean) => void;
}

const nodeTypes = {
	flowText: FlowTextNode,
	flowFile: FlowFileNode,
	flowLink: FlowLinkNode,
	flowGroup: FlowGroupNode,
};

export function FlowPane(props: FlowPaneProps) {
	return (
		<ReactFlowProvider>
			<FlowPaneInner {...props} />
		</ReactFlowProvider>
	);
}

function FlowPaneInner({ relPath, openFile, onDirtyChange }: FlowPaneProps) {
	const { fitView, screenToFlowPosition, zoomIn, zoomOut } = useReactFlow<
		FlowNode,
		FlowEdge
	>();
	const [nodes, setNodes, onNodesChangeBase] = useNodesState<FlowNode>([]);
	const [edges, setEdges, onEdgesChangeBase] = useEdgesState<FlowEdge>([]);
	const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const baseMtimeRef = useRef<number | null>(null);
	const savedTextRef = useRef("");
	const loadTokenRef = useRef(0);

	const selectedNode = useMemo(
		() => nodes.find((node) => node.selected) ?? null,
		[nodes],
	);
	const selectedEdge = useMemo(
		() => edges.find((edge) => edge.selected) ?? null,
		[edges],
	);
	const selectedGroupableNodeCount = useMemo(
		() =>
			nodes.filter((node) => node.selected && node.data.flowType !== "group")
				.length,
		[nodes],
	);

	const currentText = useMemo(() => {
		const document = reactFlowToFlowDocument({ nodes, edges, viewport });
		return serializeFlowDocument(document);
	}, [edges, nodes, viewport]);
	const dirty = !loading && currentText !== savedTextRef.current;

	const persistFlow = useCallback(
		async (nextText = currentText) => {
			setError("");
			try {
				const result = await invoke("space_write_text", {
					path: relPath,
					text: nextText,
					base_mtime_ms: baseMtimeRef.current,
				});
				baseMtimeRef.current = result.mtime_ms;
				savedTextRef.current = nextText;
			} catch (cause) {
				const message = extractErrorMessage(cause);
				if (
					!message.includes(
						"conflict: on-disk file changed since it was opened",
					)
				) {
					setError(message);
					return;
				}
				try {
					const latest = await invoke("space_read_text", { path: relPath });
					const retry = await invoke("space_write_text", {
						path: relPath,
						text: nextText,
						base_mtime_ms: latest.mtime_ms,
					});
					baseMtimeRef.current = retry.mtime_ms;
					savedTextRef.current = nextText;
				} catch (retryCause) {
					setError(extractErrorMessage(retryCause));
				}
			}
		},
		[currentText, relPath],
	);

	useEffect(() => {
		onDirtyChange?.(dirty);
	}, [dirty, onDirtyChange]);

	useEffect(() => {
		const token = loadTokenRef.current + 1;
		loadTokenRef.current = token;
		setLoading(true);
		setError("");
		baseMtimeRef.current = null;
		savedTextRef.current = "";
		setNodes([]);
		setEdges([]);

		const applyDocument = (
			document: FlowDocument,
			rawText: string,
			mtimeMs: number | null,
		) => {
			const flow = flowDocumentToReactFlow(document);
			baseMtimeRef.current = mtimeMs;
			savedTextRef.current = rawText || serializeFlowDocument(document);
			setNodes(flow.nodes);
			setEdges(flow.edges);
			setViewport(flow.viewport);
			setLoading(false);
		};

		const loadFlow = async () => {
			try {
				const doc = await invoke("space_read_text", { path: relPath });
				if (loadTokenRef.current !== token) return;
				applyDocument(parseFlowDocument(doc.text), doc.text, doc.mtime_ms);
			} catch (cause) {
				if (loadTokenRef.current !== token) return;
				const message = extractErrorMessage(cause);
				if (!isMissingFileMessage(message)) {
					setError(message);
					setLoading(false);
					return;
				}
				applyDocument(createEmptyFlowDocument(), "", null);
			}
		};

		void loadFlow();
	}, [relPath, setEdges, setNodes]);

	useEffect(() => {
		if (loading || !dirty) return;
		const timer = window.setTimeout(() => {
			void persistFlow(currentText);
		}, AUTOSAVE_DELAY_MS);
		return () => window.clearTimeout(timer);
	}, [currentText, dirty, loading, persistFlow]);

	const onNodesChange = useCallback(
		(changes: NodeChange<FlowNode>[]) => {
			onNodesChangeBase(changes);
		},
		[onNodesChangeBase],
	);

	const onEdgesChange = useCallback(
		(changes: EdgeChange<FlowEdge>[]) => {
			onEdgesChangeBase(changes);
		},
		[onEdgesChangeBase],
	);

	const addNodeAtCenter = useCallback(
		(kind: "text" | "group" | "link") => {
			const position = screenToFlowPosition({
				x: window.innerWidth / 2,
				y: window.innerHeight / 2,
			});
			const node = createFlowNode(kind, position);
			setNodes((current) => [...current, node]);
		},
		[screenToFlowPosition, setNodes],
	);

	const groupSelectedNodes = useCallback(() => {
		setNodes((current) => groupSelectedFlowNodes(current));
	}, [setNodes]);

	const addPickedFileNode = useCallback(async () => {
		setError("");
		try {
			const { open } = await import("@tauri-apps/plugin-dialog");
			const selection = await open({
				title: "Add note or file to flow",
				multiple: false,
				directory: false,
				defaultPath: await flowPickerDefaultPath(relPath),
			});
			const absPath = Array.isArray(selection)
				? (selection[0] ?? null)
				: selection;
			if (!absPath) return;
			const filePath = normalizeRelPath(
				await invoke("space_relativize_path", { abs_path: absPath }),
			);
			const kind = isMarkdownPath(filePath) ? "note" : "file";
			const position = screenToFlowPosition({
				x: window.innerWidth / 2,
				y: window.innerHeight / 2,
			});
			setNodes((current) => [
				...current,
				createFlowFileNode(kind, filePath, position),
			]);
		} catch (cause) {
			setError(extractErrorMessage(cause));
		}
	}, [relPath, screenToFlowPosition, setNodes]);

	const onConnect = useCallback(
		(connection: Connection) => {
			if (!connection.source || !connection.target) return;
			const edge = {
				id: nextFlowNodeId("edge"),
				source: connection.source,
				target: connection.target,
				sourceHandle: connection.sourceHandle,
				targetHandle: connection.targetHandle,
				markerEnd: { type: "arrowclosed" as const },
			} satisfies FlowEdge;
			setEdges((current) => [...current, edge]);
		},
		[setEdges],
	);

	const onMoveEnd = useCallback(
		(_event: MouseEvent | TouchEvent | null, nextViewport: Viewport) =>
			setViewport(nextViewport),
		[],
	);

	const onNodeDragStop = useCallback<OnNodeDrag<FlowNode>>(
		(_event, draggedNode) => {
			if (draggedNode.data.flowType === "group") return;
			setNodes((current) =>
				parentNodeToContainingGroup(current, draggedNode.id),
			);
		},
		[setNodes],
	);

	const updateSelectedNode = useCallback(
		(updater: (node: FlowNode) => FlowNode) => {
			if (!selectedNode) return;
			setNodes((current) =>
				current.map((node) =>
					node.id === selectedNode.id ? updater(node) : node,
				),
			);
		},
		[selectedNode, setNodes],
	);

	const updateSelectedEdge = useCallback(
		(updater: (edge: FlowEdge) => FlowEdge) => {
			if (!selectedEdge) return;
			setEdges((current) =>
				current.map((edge) =>
					edge.id === selectedEdge.id ? updater(edge) : edge,
				),
			);
		},
		[selectedEdge, setEdges],
	);

	const deleteSelection = useCallback(() => {
		const selectedNodeIds = new Set(
			nodes.filter((node) => node.selected).map((node) => node.id),
		);
		const selectedEdgeIds = new Set(
			edges.filter((edge) => edge.selected).map((edge) => edge.id),
		);
		setNodes((current) => removeSelectedFlowNodes(current, selectedNodeIds));
		setEdges((current) =>
			current.filter(
				(edge) =>
					!selectedEdgeIds.has(edge.id) &&
					!selectedNodeIds.has(edge.source) &&
					!selectedNodeIds.has(edge.target),
			),
		);
	}, [edges, nodes, setEdges, setNodes]);

	const detachSelectedNode = useCallback(() => {
		if (!selectedNode?.parentId) return;
		setNodes((current) => detachFlowNodeFromParent(current, selectedNode.id));
	}, [selectedNode, setNodes]);

	if (loading) {
		return <div className="glyphFlowState">Loading flow...</div>;
	}

	return (
		<div className="glyphFlowPane">
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodeTypes={nodeTypes}
				defaultViewport={viewport}
				fitView={nodes.length > 0}
				minZoom={0.15}
				maxZoom={2.5}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				onMoveEnd={onMoveEnd}
				onNodeDragStop={onNodeDragStop}
				onNodeDoubleClick={(_event, node) => {
					if (node.data.flowType === "file") void openFile?.(node.data.file);
				}}
				proOptions={{ hideAttribution: true }}
			>
				<Background color="var(--glyph-flow-grid)" gap={24} size={1} />
				<Panel position="bottom-center" className="glyphFlowToolbar">
					<Button
						type="button"
						size="icon-sm"
						variant="secondary"
						title="Add note or file"
						onClick={() => void addPickedFileNode()}
					>
						<HugeiconsIcon icon={File01Icon} size={15} strokeWidth={1} />
					</Button>
					<Button
						type="button"
						size="icon-sm"
						variant="secondary"
						title="Add text"
						onClick={() => addNodeAtCenter("text")}
					>
						<HugeiconsIcon icon={TextIcon} size={15} strokeWidth={1} />
					</Button>
					<Button
						type="button"
						size="icon-sm"
						variant="secondary"
						title="Add link"
						onClick={() => addNodeAtCenter("link")}
					>
						<HugeiconsIcon icon={Link01Icon} size={15} strokeWidth={1} />
					</Button>
					<Button
						type="button"
						size="icon-sm"
						variant="secondary"
						title={
							selectedGroupableNodeCount > 0 ? "Group selection" : "Add group"
						}
						onClick={() =>
							selectedGroupableNodeCount > 0
								? groupSelectedNodes()
								: addNodeAtCenter("group")
						}
					>
						<HugeiconsIcon icon={GroupLayersIcon} size={15} strokeWidth={1} />
					</Button>
					<Button
						type="button"
						size="icon-sm"
						variant="secondary"
						title="Zoom out"
						onClick={() => void zoomOut({ duration: 160 })}
					>
						<HugeiconsIcon icon={MinusSignIcon} size={15} strokeWidth={1} />
					</Button>
					<Button
						type="button"
						size="icon-sm"
						variant="secondary"
						title="Zoom in"
						onClick={() => void zoomIn({ duration: 160 })}
					>
						<HugeiconsIcon icon={PlusSignIcon} size={15} strokeWidth={1} />
					</Button>
					<Button
						type="button"
						size="icon-sm"
						variant="secondary"
						title="Fit view"
						onClick={() => void fitView({ duration: 180, padding: 0.2 })}
					>
						<HugeiconsIcon icon={FitToScreenIcon} size={15} strokeWidth={1} />
					</Button>
					{selectedNode || selectedEdge ? (
						<Button
							type="button"
							size="icon-sm"
							variant="secondary"
							title="Delete selection"
							onClick={deleteSelection}
						>
							<HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1} />
						</Button>
					) : null}
				</Panel>
				{error ? (
					<Panel position="top-right" className="glyphFlowError">
						{error}
					</Panel>
				) : null}
				{selectedNode ? (
					<FlowNodeInspector
						node={selectedNode}
						onUpdate={updateSelectedNode}
						onDetach={selectedNode.parentId ? detachSelectedNode : undefined}
					/>
				) : selectedEdge ? (
					<FlowDocumentEdgeInspector
						edge={selectedEdge}
						onUpdate={updateSelectedEdge}
					/>
				) : null}
			</ReactFlow>
		</div>
	);
}

async function flowPickerDefaultPath(flowPath: string): Promise<string> {
	const currentSpace = await invoke("space_get_current");
	if (!currentSpace) return "";
	const flowDir = parentDir(flowPath);
	if (!flowDir) return currentSpace;
	const { join } = await import("@tauri-apps/api/path");
	return join(currentSpace, flowDir);
}

function isMissingFileMessage(message: string): boolean {
	const normalized = message.toLowerCase();
	return (
		normalized.includes("no such file") ||
		normalized.includes("not found") ||
		normalized.includes("os error 2")
	);
}
