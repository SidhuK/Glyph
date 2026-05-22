import {
	Delete02Icon,
	File01Icon,
	FitToScreenIcon,
	GroupLayersIcon,
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
	type NodeMouseHandler,
	Panel,
	ReactFlow,
	ReactFlowProvider,
	type Viewport,
	useEdgesState,
	useNodesState,
	useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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
import { Input } from "../ui/shadcn/input";
import {
	FlowFileNode,
	FlowGroupNode,
	FlowLinkNode,
	FlowTextNode,
} from "./FlowNodes";

const AUTOSAVE_DELAY_MS = 650;
const DEFAULT_NODE_WIDTH = 280;
const DEFAULT_NODE_HEIGHT = 180;
const GROUP_PADDING = 48;

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
		(kind: "text" | "group") => {
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

	const onNodeDragStop = useCallback<NodeMouseHandler<FlowNode>>(
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

interface FlowNodeInspectorProps {
	node: FlowNode;
	onUpdate: (updater: (node: FlowNode) => FlowNode) => void;
	onDetach?: () => void;
}

function FlowNodeInspector({
	node,
	onUpdate,
	onDetach,
}: FlowNodeInspectorProps) {
	return (
		<Panel position="bottom-right" className="glyphFlowInspector">
			{onDetach ? (
				<div className="glyphFlowInspectorActions">
					<Button
						type="button"
						size="xs"
						variant="secondary"
						onClick={onDetach}
					>
						Ungroup
					</Button>
				</div>
			) : null}
			{node.data.flowType === "link" ? (
				<FlowField label="URL">
					<Input
						value={node.data.url}
						onChange={(event) =>
							onUpdate((current) =>
								current.data.flowType === "link"
									? {
											...current,
											data: { ...current.data, url: event.target.value },
										}
									: current,
							)
						}
					/>
				</FlowField>
			) : null}
			{node.data.flowType === "group" ? (
				<FlowField label="Label">
					<Input
						value={node.data.label ?? ""}
						onChange={(event) =>
							onUpdate((current) =>
								current.data.flowType === "group"
									? {
											...current,
											data: { ...current.data, label: event.target.value },
										}
									: current,
							)
						}
					/>
				</FlowField>
			) : null}
			<FlowColorField
				label="Color"
				value={node.data.color}
				fallback={defaultNodeColor(node)}
				onChange={(color) =>
					onUpdate((current) => ({
						...current,
						data: {
							...current.data,
							color,
						},
					}))
				}
			/>
		</Panel>
	);
}

interface FlowDocumentEdgeInspectorProps {
	edge: FlowEdge;
	onUpdate: (updater: (edge: FlowEdge) => FlowEdge) => void;
}

function FlowDocumentEdgeInspector({
	edge,
	onUpdate,
}: FlowDocumentEdgeInspectorProps) {
	const label = typeof edge.label === "string" ? edge.label : "";
	const color = typeof edge.style?.stroke === "string" ? edge.style.stroke : "";

	return (
		<Panel position="bottom-right" className="glyphFlowInspector">
			<FlowField label="Label">
				<Input
					value={label}
					onChange={(event) =>
						onUpdate((current) => ({
							...current,
							label: event.target.value || undefined,
						}))
					}
				/>
			</FlowField>
			<FlowColorField
				label="Color"
				value={color}
				fallback="#667085"
				onChange={(nextColor) =>
					onUpdate((current) => ({
						...current,
						style: {
							...current.style,
							stroke: nextColor,
						},
					}))
				}
			/>
		</Panel>
	);
}

function FlowField({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="glyphFlowField">
			<span>{label}</span>
			{children}
		</div>
	);
}

function FlowColorField({
	label,
	value,
	fallback,
	onChange,
}: {
	label: string;
	value?: string;
	fallback: string;
	onChange: (color: string | undefined) => void;
}) {
	const pickerValue = colorPickerValue(value, fallback);

	return (
		<div className="glyphFlowField">
			<span>{label}</span>
			<div className="glyphFlowColorControl">
				<input
					type="color"
					value={pickerValue}
					aria-label={label}
					onChange={(event) => onChange(event.target.value)}
				/>
				<Button
					type="button"
					size="xs"
					variant="ghost"
					disabled={!value}
					onClick={() => onChange(undefined)}
				>
					Default
				</Button>
			</div>
		</div>
	);
}

function groupSelectedFlowNodes(nodes: FlowNode[]): FlowNode[] {
	const selectedNodes = nodes.filter(
		(node) => node.selected && node.data.flowType !== "group",
	);
	if (selectedNodes.length === 0) return nodes;

	const nodeMap = new Map(nodes.map((node) => [node.id, node]));
	const selectedRects = selectedNodes.map((node) =>
		getFlowNodeRect(node, nodeMap),
	);
	const bounds = getFlowRectBounds(selectedRects);
	const groupId = nextFlowNodeId("group");
	const groupPosition = {
		x: Math.round(bounds.x - GROUP_PADDING),
		y: Math.round(bounds.y - GROUP_PADDING),
	};
	const groupWidth = Math.round(bounds.width + GROUP_PADDING * 2);
	const groupHeight = Math.round(bounds.height + GROUP_PADDING * 2);
	const selectedIds = new Set(selectedNodes.map((node) => node.id));
	const groupNode: FlowNode = {
		...createFlowNode("group", groupPosition),
		id: groupId,
		width: groupWidth,
		height: groupHeight,
		style: { width: groupWidth, height: groupHeight },
		selected: true,
	};

	const nextNodes = nodes.map((node) => {
		if (!selectedIds.has(node.id)) {
			return { ...node, selected: false };
		}
		const absolute = getFlowNodeAbsolutePosition(node, nodeMap);
		return {
			...node,
			parentId: groupId,
			extent: "parent" as const,
			position: {
				x: Math.round(absolute.x - groupPosition.x),
				y: Math.round(absolute.y - groupPosition.y),
			},
			selected: false,
		};
	});

	return orderFlowNodes([...nextNodes, groupNode]);
}

function parentNodeToContainingGroup(
	nodes: FlowNode[],
	nodeId: string,
): FlowNode[] {
	const node = nodes.find((current) => current.id === nodeId);
	if (!node || node.data.flowType === "group") return nodes;

	const nodeMap = new Map(nodes.map((current) => [current.id, current]));
	const targetGroup = findContainingGroup(node, nodes, nodeMap);
	if (!targetGroup || node.parentId === targetGroup.id) return nodes;

	const nodeAbsolute = getFlowNodeAbsolutePosition(node, nodeMap);
	const groupAbsolute = getFlowNodeAbsolutePosition(targetGroup, nodeMap);
	const nextNodes = nodes.map((current) =>
		current.id === node.id
			? {
					...current,
					parentId: targetGroup.id,
					extent: "parent" as const,
					position: {
						x: Math.round(nodeAbsolute.x - groupAbsolute.x),
						y: Math.round(nodeAbsolute.y - groupAbsolute.y),
					},
				}
			: current,
	);

	return orderFlowNodes(nextNodes);
}

function detachFlowNodeFromParent(
	nodes: FlowNode[],
	nodeId: string,
): FlowNode[] {
	const nodeMap = new Map(nodes.map((node) => [node.id, node]));
	return nodes.map((node) => {
		if (node.id !== nodeId || !node.parentId) return node;
		const absolute = getFlowNodeAbsolutePosition(node, nodeMap);
		return {
			...node,
			parentId: undefined,
			extent: undefined,
			position: {
				x: Math.round(absolute.x),
				y: Math.round(absolute.y),
			},
		};
	});
}

function removeSelectedFlowNodes(
	nodes: FlowNode[],
	selectedNodeIds: Set<string>,
): FlowNode[] {
	if (selectedNodeIds.size === 0) return nodes;
	const selectedGroupIds = new Set(
		nodes
			.filter(
				(node) =>
					selectedNodeIds.has(node.id) && node.data.flowType === "group",
			)
			.map((node) => node.id),
	);
	const nodeMap = new Map(nodes.map((node) => [node.id, node]));

	return nodes
		.flatMap((node) => {
			if (selectedNodeIds.has(node.id)) return [];
			if (!node.parentId || !selectedGroupIds.has(node.parentId)) return [node];
			const absolute = getFlowNodeAbsolutePosition(node, nodeMap);
			return [
				{
					...node,
					parentId: undefined,
					extent: undefined,
					position: {
						x: Math.round(absolute.x),
						y: Math.round(absolute.y),
					},
				},
			];
		})
		.map((node) =>
			node.parentId && selectedNodeIds.has(node.parentId)
				? { ...node, parentId: undefined, extent: undefined }
				: node,
		);
}

function findContainingGroup(
	node: FlowNode,
	nodes: FlowNode[],
	nodeMap: Map<string, FlowNode>,
): FlowNode | null {
	const nodeRect = getFlowNodeRect(node, nodeMap);
	const nodeCenter = {
		x: nodeRect.x + nodeRect.width / 2,
		y: nodeRect.y + nodeRect.height / 2,
	};

	const containingGroups = nodes
		.filter((candidate) => candidate.data.flowType === "group")
		.map((candidate) => ({
			node: candidate,
			rect: getFlowNodeRect(candidate, nodeMap),
		}))
		.filter(({ node: candidate, rect }) => {
			if (candidate.id === node.id) return false;
			return (
				nodeCenter.x >= rect.x &&
				nodeCenter.x <= rect.x + rect.width &&
				nodeCenter.y >= rect.y &&
				nodeCenter.y <= rect.y + rect.height
			);
		})
		.sort(
			(a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height,
		);

	return containingGroups[0]?.node ?? null;
}

function getFlowRectBounds(
	rects: Array<{ x: number; y: number; width: number; height: number }>,
): { x: number; y: number; width: number; height: number } {
	const minX = Math.min(...rects.map((rect) => rect.x));
	const minY = Math.min(...rects.map((rect) => rect.y));
	const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
	const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function getFlowNodeRect(
	node: FlowNode,
	nodeMap: Map<string, FlowNode>,
): { x: number; y: number; width: number; height: number } {
	const position = getFlowNodeAbsolutePosition(node, nodeMap);
	const size = getFlowNodeSize(node);
	return { ...position, ...size };
}

function getFlowNodeAbsolutePosition(
	node: FlowNode,
	nodeMap: Map<string, FlowNode>,
): { x: number; y: number } {
	let x = node.position.x;
	let y = node.position.y;
	let parentId = node.parentId;
	const visited = new Set<string>();

	while (parentId && !visited.has(parentId)) {
		visited.add(parentId);
		const parent = nodeMap.get(parentId);
		if (!parent) break;
		x += parent.position.x;
		y += parent.position.y;
		parentId = parent.parentId;
	}

	return { x, y };
}

function getFlowNodeSize(node: FlowNode): {
	width: number;
	height: number;
} {
	return {
		width:
			typeof node.measured?.width === "number"
				? node.measured.width
				: Number(node.style?.width) || node.width || DEFAULT_NODE_WIDTH,
		height:
			typeof node.measured?.height === "number"
				? node.measured.height
				: Number(node.style?.height) || node.height || DEFAULT_NODE_HEIGHT,
	};
}

function orderFlowNodes(nodes: FlowNode[]): FlowNode[] {
	const nodeMap = new Map(nodes.map((node) => [node.id, node]));
	const ordered: FlowNode[] = [];
	const visited = new Set<string>();

	const visit = (node: FlowNode) => {
		if (visited.has(node.id)) return;
		if (node.parentId) {
			const parent = nodeMap.get(node.parentId);
			if (parent) visit(parent);
		}
		visited.add(node.id);
		ordered.push(node);
	};

	for (const node of nodes) {
		if (!node.parentId) visit(node);
	}
	for (const node of nodes) {
		visit(node);
	}

	return ordered;
}

function createFlowNode(
	kind: "text" | "group",
	position: { x: number; y: number },
): FlowNode {
	if (kind === "group") {
		return {
			id: nextFlowNodeId("group"),
			type: "flowGroup",
			position,
			width: 420,
			height: 280,
			style: { width: 420, height: 280 },
			zIndex: -1,
			data: {
				flowType: "group",
				label: "Group",
				color: "#d7e7ff",
				glyphKind: "group",
			},
		};
	}

	return {
		id: nextFlowNodeId(kind),
		type: "flowText",
		position,
		width: DEFAULT_NODE_WIDTH,
		height: DEFAULT_NODE_HEIGHT,
		style: { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT },
		data: {
			flowType: "text",
			text: "Text",
			color: "#f7f7f8",
			glyphKind: "text",
		},
	};
}

function createFlowFileNode(
	kind: "note" | "file",
	file: string,
	position: { x: number; y: number },
): FlowNode {
	return {
		id: nextFlowNodeId(kind),
		type: "flowFile",
		position,
		width: DEFAULT_NODE_WIDTH,
		height: 150,
		style: { width: DEFAULT_NODE_WIDTH, height: 150 },
		data: {
			flowType: "file",
			file,
			color: kind === "note" ? "#d9f4e8" : "#e6e7eb",
			glyphKind: kind,
		},
	};
}

function defaultNodeColor(node: FlowNode): string {
	if (node.data.flowType === "text") {
		return node.data.glyphKind === "sticky" ? "#fff4b8" : "#f7f7f8";
	}
	if (node.data.flowType === "file") {
		return node.data.glyphKind === "note" ? "#d9f4e8" : "#e6e7eb";
	}
	if (node.data.flowType === "group") return "#d7e7ff";
	return "#e6e7eb";
}

function colorPickerValue(value: string | undefined, fallback: string): string {
	const normalized = normalizeHexColor(value);
	return normalized ?? normalizeHexColor(fallback) ?? "#667085";
}

function normalizeHexColor(value: string | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	const short = trimmed.match(/^#([0-9a-f]{3})$/i);
	if (short) {
		return `#${short[1]
			.split("")
			.map((part) => `${part}${part}`)
			.join("")
			.toLowerCase()}`;
	}
	if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
	return null;
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
