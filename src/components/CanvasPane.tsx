import "@xyflow/react/dist/style.css";

import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import {
	Background,
	type Connection,
	Controls,
	type Edge,
	Handle,
	MiniMap,
	type Node,
	type NodeMouseHandler,
	NodeResizer,
	Position,
	ReactFlow,
	type ReactFlowInstance,
	addEdge,
	useEdgesState,
	useNodesState,
} from "@xyflow/react";

import { motion } from "motion/react";
import {
	createContext,
	memo,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { invoke } from "../lib/tauri";
import {
	AlignCenter,
	AlignCenterVertical,
	AlignEndVertical,
	AlignHorizontalSpaceAround,
	AlignLeft,
	AlignRight,
	AlignStartVertical,
	AlignVerticalSpaceAround,
	FolderOpen,
	Frame,
	Grid3X3,
	Link,
	RefreshCw,
	StickyNote,
	Type,
} from "./Icons";

export type CanvasNode = Node<Record<string, unknown>>;
export type CanvasEdge = Edge<Record<string, unknown>>;

export interface CanvasDocLike {
	version: number;
	id: string;
	title: string;
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}

interface CanvasPaneProps {
	doc: CanvasDocLike | null;
	onSave: (doc: CanvasDocLike) => Promise<void>;
	onOpenNote: (noteId: string) => void;
	onOpenFolder: (dir: string) => void;
	activeNoteId: string | null;
	activeNoteTitle: string | null;
	vaultPath: string | null;
	onSelectionChange?: (selected: CanvasNode[]) => void;
	externalCommand?: CanvasExternalCommand | null;
	onExternalCommandHandled?: (id: string) => void;
}

export type CanvasExternalCommand =
	| {
			id: string;
			kind: "add_note_node";
			noteId: string;
			title: string;
	  }
	| { id: string; kind: "add_text_node"; text: string }
	| { id: string; kind: "add_link_node"; url: string };

const BULK_LOAD_THRESHOLD = 8; // Show loading indicator if more than 8 nodes on initial render

// Sticky note solid color palette
const STICKY_COLORS = [
	{ bg: "#fff176", border: "#fbc02d" }, // Yellow
	{ bg: "#f48fb1", border: "#e91e63" }, // Pink
	{ bg: "#81d4fa", border: "#03a9f4" }, // Blue
	{ bg: "#a5d6a7", border: "#4caf50" }, // Green
	{ bg: "#ffcc80", border: "#ff9800" }, // Orange
	{ bg: "#ce93d8", border: "#9c27b0" }, // Purple
	{ bg: "#80cbc4", border: "#009688" }, // Teal
	{ bg: "#ef9a9a", border: "#f44336" }, // Red
] as const;

// Generate stable pseudo-random values based on node id
function getNodeHash(id: string): number {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = (hash << 5) - hash + id.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash);
}

// Generate random variations for aesthetic appeal
function getRandomVariation(id: string, min: number, max: number): number {
	const hash = getNodeHash(id);
	const range = max - min;
	return min + (hash % range);
}

function getNodeRotation(id: string): number {
	return ((getNodeHash(id) % 9) - 4) * 0.8; // Range: -3.2 to 3.2 degrees
}

function getStickyColor(id: string) {
	return STICKY_COLORS[getNodeHash(id) % STICKY_COLORS.length];
}

type CanvasActions = {
	openNote: (relPath: string) => void;
	openFolder: (dir: string) => void;
	showFolderPreview: (folderNodeId: string) => void;
	scheduleHideFolderPreview: (folderNodeId: string) => void;
};

const CanvasActionsContext = createContext<CanvasActions | null>(null);

function useCanvasActions(): CanvasActions {
	const ctx = useContext(CanvasActionsContext);
	if (!ctx) throw new Error("CanvasActionsContext missing");
	return ctx;
}

const NoteNode = memo(function NoteNode({
	data,
	id,
}: {
	data: Record<string, unknown>;
	id: string;
}) {
	const title = typeof data.title === "string" ? data.title : "Note";
	const noteId = typeof data.noteId === "string" ? data.noteId : "";
	const content = typeof data.content === "string" ? data.content : "";
	const rotation = getNodeRotation(id);
	const color = getStickyColor(id);

	// Analyze content for better sizing
	const hasContent = content.length > 0;
	const lines = content.split("\n").filter((line) => line.trim().length > 0);
	const lineCount = lines.length;
	const avgLineLength = lines.length > 0 ? content.length / lines.length : 0;

	// Base size class determination
	const baseSizeClass = !hasContent
		? "rfNodeNote--small"
		: lineCount === 1 && content.length < 30
			? "rfNodeNote--xs" // Very short single line
			: lineCount === 1 && content.length < 80
				? "rfNodeNote--small" // Short single line
				: lineCount <= 2 && content.length < 150
					? "rfNodeNote--medium" // Few lines
					: lineCount <= 4 && avgLineLength < 40
						? "rfNodeNote--tall" // Many short lines
						: lineCount <= 3 && avgLineLength > 60
							? "rfNodeNote--wide" // Few long lines
							: lineCount <= 6 && content.length < 400
								? "rfNodeNote--large" // Moderate content
								: content.length < 600
									? "rfNodeNote--xl" // Long content
									: "rfNodeNote--xl"; // Very long content

	// Apply random variations for aesthetic appeal
	const randomWidth = getRandomVariation(id, -15, 15); // ±15px variation
	const randomHeight = getRandomVariation(id, -10, 20); // -10 to +20px variation

	// Generate dynamic style with random variations
	const dynamicStyle = {
		background: color.bg,
		borderColor: color.border,
		width:
			randomWidth !== 0
				? `calc(var(--base-width, 200px) + ${randomWidth}px)`
				: undefined,
		minHeight:
			randomHeight !== 0
				? `calc(var(--base-height, 140px) + ${randomHeight}px)`
				: undefined,
		"--base-width": undefined as string | undefined,
		"--base-height": undefined as string | undefined,
	};

	// Set base dimensions from CSS class
	const baseDimensions = {
		"rfNodeNote--xs": { width: "100px", minHeight: "80px" },
		"rfNodeNote--small": { width: "140px", minHeight: "100px" },
		"rfNodeNote--medium": { width: "200px", minHeight: "140px" },
		"rfNodeNote--large": { width: "280px", minHeight: "200px" },
		"rfNodeNote--xl": { width: "360px", minHeight: "260px" },
		"rfNodeNote--tall": { width: "160px", minHeight: "240px" },
		"rfNodeNote--wide": { width: "320px", minHeight: "160px" },
		"rfNodeNote--square": { width: "180px", minHeight: "180px" },
	};

	const dimensions =
		baseDimensions[baseSizeClass as keyof typeof baseDimensions] ||
		baseDimensions["rfNodeNote--small"];
	dynamicStyle["--base-width"] = dimensions.width;
	dynamicStyle["--base-height"] = dimensions.minHeight;

	return (
		<div
			className={`rfNode rfNodeNote ${baseSizeClass}`}
			title={noteId}
			style={{ ...dynamicStyle, transform: `rotate(${rotation}deg)` }}
		>
			<Handle type="target" position={Position.Left} />
			<Handle type="source" position={Position.Right} />
			<div className="rfNodeNoteTitle">{title}</div>
			{hasContent && <div className="rfNodeNoteContent">{content}</div>}
		</div>
	);
});

const TextNode = memo(function TextNode({
	data,
	id,
}: {
	data: Record<string, unknown>;
	id: string;
}) {
	const text = typeof data.text === "string" ? data.text : "";
	const rotation = getNodeRotation(id) * 1.3;
	const color = getStickyColor(`${id}text`);

	// Size based on text length
	const sizeClass =
		text.length < 50
			? "rfNodeText--small"
			: text.length < 150
				? "rfNodeText--medium"
				: "rfNodeText--large";

	return (
		<div
			className={`rfNode rfNodeText ${sizeClass}`}
			style={{
				background: color.bg,
				borderColor: color.border,
				transform: `rotate(${rotation}deg)`,
			}}
		>
			<Handle type="target" position={Position.Left} />
			<Handle type="source" position={Position.Right} />
			<div className="rfNodeTextContent">{text}</div>
		</div>
	);
});

const FileNode = memo(function FileNode({
	data,
	id,
}: {
	data: Record<string, unknown>;
	id: string;
}) {
	const title =
		typeof data.title === "string"
			? data.title
			: typeof data.path === "string"
				? (data.path.split("/").pop() ?? data.path)
				: "File";
	const path = typeof data.path === "string" ? data.path : "";
	const imageSrc = typeof data.image_src === "string" ? data.image_src : "";
	const rotation = getNodeRotation(id) * 0.8;

	return (
		<div
			className="rfNode rfNodeFile"
			title={path}
			style={{ transform: `rotate(${rotation}deg)` }}
		>
			<Handle type="target" position={Position.Left} />
			<Handle type="source" position={Position.Right} />
			{imageSrc ? (
				<img className="rfNodeFileThumb" alt="" src={imageSrc} />
			) : null}
			<div className="rfNodeTitle">{title}</div>
			<div className="rfNodeSub mono">
				{path ? `${path.slice(0, 14)}…` : ""}
			</div>
		</div>
	);
});

const LinkNode = memo(function LinkNode({
	data,
	id,
}: {
	data: Record<string, unknown>;
	id: string;
}) {
	const url = typeof data.url === "string" ? data.url : "";
	const preview =
		(data.preview as Record<string, unknown> | null | undefined) ?? null;
	const title =
		preview && typeof preview.title === "string" ? preview.title : "";
	const description =
		preview && typeof preview.description === "string"
			? preview.description
			: "";
	const hostname =
		preview && typeof preview.hostname === "string" ? preview.hostname : "";
	const status = typeof data.status === "string" ? data.status : "";
	const imageSrc = typeof data.image_src === "string" ? data.image_src : "";
	const rotation = getNodeRotation(id) * 0.6;

	return (
		<div
			className="rfNode rfNodeLink"
			style={{ transform: `rotate(${rotation}deg)` }}
		>
			<Handle type="target" position={Position.Left} />
			<Handle type="source" position={Position.Right} />
			{imageSrc ? (
				<img className="rfNodeLinkImage" alt="" src={imageSrc} />
			) : null}
			<div className="rfNodeTitle">{title || hostname || "Link"}</div>
			{description ? (
				<div className="rfNodeBody">{description}</div>
			) : (
				<div className="rfNodeBody mono">{url}</div>
			)}
			{status ? <div className="rfNodeSub">{status}</div> : null}
		</div>
	);
});

const FrameNode = memo(function FrameNode({
	data,
	id,
}: {
	data: Record<string, unknown>;
	id: string;
}) {
	const title = typeof data.title === "string" ? data.title : "Frame";
	const rotation = getNodeRotation(id) * 0.3;

	return (
		<div
			className="rfNode rfNodeFrame"
			style={{ transform: `rotate(${rotation}deg)` }}
		>
			<NodeResizer minWidth={240} minHeight={180} />
			<div className="rfNodeTitle">{title}</div>
		</div>
	);
});

const FolderNode = memo(function FolderNode({
	data,
	id,
}: {
	data: Record<string, unknown>;
	id: string;
}) {
	const { showFolderPreview, scheduleHideFolderPreview } = useCanvasActions();
	const name = typeof data.name === "string" ? data.name : "Folder";
	const totalFiles =
		typeof data.total_files === "number" ? data.total_files : 0;
	const totalMarkdown =
		typeof data.total_markdown === "number" ? data.total_markdown : 0;

	return (
		<div
			className="rfNode rfNodeFolder"
			onMouseEnter={() => showFolderPreview(id)}
			onMouseLeave={() => scheduleHideFolderPreview(id)}
		>
			<div className="rfNodeFolderIconLarge">
				<FolderOpen size={44} />
			</div>
			<div className="rfNodeFolderNameLarge" title={name}>
				{name}
			</div>
			<div className="rfNodeFolderMetaLarge">
				{totalMarkdown} md • {totalFiles} files
			</div>
		</div>
	);
});

const FolderPreviewNode = memo(function FolderPreviewNode({
	data,
}: {
	data: Record<string, unknown>;
}) {
	const { openNote, openFolder, showFolderPreview, scheduleHideFolderPreview } =
		useCanvasActions();
	const folderId = typeof data.folder_id === "string" ? data.folder_id : "";
	const relPath = typeof data.rel_path === "string" ? data.rel_path : "";
	const name =
		typeof data.name === "string"
			? data.name
			: relPath
				? (relPath.split("/").pop() ?? relPath)
				: "File";
	const moreCount = typeof data.more_count === "number" ? data.more_count : 0;
	const dir = typeof data.dir === "string" ? data.dir : "";
	const isMore = moreCount > 0;
	const previewIndex =
		typeof data.preview_index === "number" ? data.preview_index : 0;

	return (
		<motion.div
			className="rfNode rfNodeFolderPreviewNode nodrag nopan"
			onMouseEnter={() => {
				if (folderId) showFolderPreview(folderId);
			}}
			onMouseLeave={() => {
				if (folderId) scheduleHideFolderPreview(folderId);
			}}
			title={isMore ? "" : relPath}
			initial={{ opacity: 0, y: -10, scale: 0.96 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			transition={{
				type: "spring",
				stiffness: 520,
				damping: 32,
				delay: previewIndex * 0.035,
			}}
			whileHover={{ scale: 1.02 }}
		>
			<Handle type="target" position={Position.Top} />
			<div className="rfNodeFolderPreviewTitle">
				{isMore ? `+${moreCount} more` : name}
			</div>
			<button
				type="button"
				className="rfNodeFolderPreviewAction nodrag nopan"
				onClick={(e) => {
					e.stopPropagation();
					if (isMore) {
						if (dir) openFolder(dir);
					} else {
						if (relPath) openNote(relPath);
					}
				}}
			>
				Open
			</button>
		</motion.div>
	);
});

export default function CanvasPane({
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
	const wrapperRef = useRef<HTMLDivElement | null>(null);
	const flowRef = useRef<ReactFlowInstance<CanvasNode, CanvasEdge> | null>(
		null,
	);
	const saveTimerRef = useRef<number | null>(null);
	const historyTimerRef = useRef<number | null>(null);
	const applyingHistoryRef = useRef(false);
	const lastSavedKeyRef = useRef<string>("");
	const pastRef = useRef<Array<{ nodes: CanvasNode[]; edges: CanvasEdge[] }>>(
		[],
	);
	const futureRef = useRef<Array<{ nodes: CanvasNode[]; edges: CanvasEdge[] }>>(
		[],
	);
	const lastHistoryRef = useRef<string>("");
	const lastStateRef = useRef<{
		nodes: CanvasNode[];
		edges: CanvasEdge[];
	} | null>(null);

	const [isSaving, setIsSaving] = useState(false);
	const [saveError, setSaveError] = useState<string>("");
	const [snapToGrid, setSnapToGrid] = useState(false);

	// Track if we're in bulk load mode (skip animations for performance)
	const initialNodeCount = doc?.nodes?.length ?? 0;
	const [isBulkLoad, setIsBulkLoad] = useState(
		initialNodeCount > BULK_LOAD_THRESHOLD,
	);

	const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(
		doc?.nodes ?? [],
	);
	const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>(
		doc?.edges ?? [],
	);

	const nodesRef = useRef<CanvasNode[]>([]);
	const edgesRef = useRef<CanvasEdge[]>([]);
	useEffect(() => {
		nodesRef.current = nodes;
		edgesRef.current = edges;
	}, [edges, nodes]);

	const stripEphemeral = useCallback(
		(
			n: CanvasNode[],
			e: CanvasEdge[],
		): {
			nodes: CanvasNode[];
			edges: CanvasEdge[];
		} => {
			const filteredNodes = n.filter((node) => {
				const d = (node.data as Record<string, unknown> | null) ?? null;
				return !(d && d.__ephemeral === true);
			});
			const keepIds = new Set(filteredNodes.map((x) => x.id));
			const filteredEdges = e.filter((edge) => {
				const d = (edge.data as Record<string, unknown> | null) ?? null;
				if (d && d.__ephemeral === true) return false;
				return keepIds.has(edge.source) && keepIds.has(edge.target);
			});
			return { nodes: filteredNodes, edges: filteredEdges };
		},
		[],
	);

	const previewHideTimerRef = useRef<number | null>(null);
	const activePreviewFolderRef = useRef<string | null>(null);

	const clearPreviewHideTimer = useCallback(() => {
		if (previewHideTimerRef.current != null) {
			window.clearTimeout(previewHideTimerRef.current);
			previewHideTimerRef.current = null;
		}
	}, []);

	const removeAllFolderPreviews = useCallback(() => {
		setNodes((prev) => {
			const next = prev.filter((n) => {
				const d = (n.data as Record<string, unknown> | null) ?? null;
				return !(d && d.__ephemeral === true);
			});
			return next;
		});
		setEdges((prev) => {
			const next = prev.filter((e) => {
				const d = (e.data as Record<string, unknown> | null) ?? null;
				return !(d && d.__ephemeral === true);
			});
			return next;
		});
	}, [setEdges, setNodes]);

	const showFolderPreview = useCallback(
		(folderNodeId: string) => {
			clearPreviewHideTimer();
			if (!folderNodeId) return;
			if (activePreviewFolderRef.current === folderNodeId) return;
			activePreviewFolderRef.current = folderNodeId;

			const baseNodes = nodesRef.current;
			const folderNode = baseNodes.find((n) => n.id === folderNodeId);
			if (!folderNode) return;
			const d = (folderNode.data as Record<string, unknown> | null) ?? {};
			const dir = typeof d.dir === "string" ? d.dir : "";
			const recent = Array.isArray(d.recent_markdown)
				? (d.recent_markdown as Array<Record<string, unknown>>)
				: [];
			const totalMarkdown =
				typeof d.total_markdown === "number" ? d.total_markdown : 0;

			// Reset existing previews before adding the next set.
			removeAllFolderPreviews();

			const folderW = 240;
			const folderH = 180;
			const previewW = 260;

			// "Mind map" layout: previews fan out on a shallow arc beneath the folder tile.
			const centerX = folderNode.position.x + folderW / 2;
			const baseY = folderNode.position.y + folderH + 60;
			// Keep the fan narrow so cards never collide with each other.
			const radiusX = 110;
			const arcY = 42;
			const previewH = 64;
			const gapY = 14;

			const previewNodes: CanvasNode[] = [];
			const previewEdges: CanvasEdge[] = [];

			const previewCount = Math.min(5, recent.length);
			const spreadDeg = previewCount <= 1 ? 0 : 56;
			for (let i = 0; i < previewCount; i++) {
				const r = recent[i];
				if (!r) continue;
				const relPath = typeof r.rel_path === "string" ? r.rel_path : "";
				const name = typeof r.name === "string" ? r.name : "";
				if (!relPath) continue;
				const previewId = `preview:${folderNodeId}:${relPath}`;
				const t = previewCount <= 1 ? 0 : i / Math.max(1, previewCount - 1);
				const deg = (t - 0.5) * spreadDeg;
				const rad = (deg * Math.PI) / 180;
				const x = centerX + Math.sin(rad) * radiusX - previewW / 2;
				// Primary stacking is vertical; arc only adds a subtle curve.
				const y = baseY + i * (previewH + gapY) + (1 - Math.cos(rad)) * arcY;
				previewNodes.push({
					id: previewId,
					type: "folder_preview",
					position: { x, y },
					data: {
						__ephemeral: true,
						folder_id: folderNodeId,
						rel_path: relPath,
						name: name || relPath.split("/").pop() || relPath,
						preview_index: i,
					},
					draggable: false,
					selectable: false,
				} as CanvasNode);
				previewEdges.push({
					id: `preview_edge:${folderNodeId}:${i}`,
					source: folderNodeId,
					target: previewId,
					type: "smoothstep",
					data: { __ephemeral: true },
					animated: true,
					selectable: false,
				} as CanvasEdge);
			}

			const more = totalMarkdown - previewCount;
			if (more > 0) {
				const i = previewCount;
				const previewId = `preview:${folderNodeId}:more`;
				const deg = spreadDeg / 2 + 14;
				const rad = (deg * Math.PI) / 180;
				const x = centerX + Math.sin(rad) * radiusX - previewW / 2;
				const y = baseY + i * (previewH + gapY) + (1 - Math.cos(rad)) * arcY;
				previewNodes.push({
					id: previewId,
					type: "folder_preview",
					position: { x, y },
					data: {
						__ephemeral: true,
						folder_id: folderNodeId,
						dir,
						more_count: more,
						preview_index: i,
					},
					draggable: false,
					selectable: false,
				} as CanvasNode);
				previewEdges.push({
					id: `preview_edge:${folderNodeId}:more`,
					source: folderNodeId,
					target: previewId,
					type: "smoothstep",
					data: { __ephemeral: true },
					animated: true,
					selectable: false,
				} as CanvasEdge);
			}

			if (previewNodes.length) {
				setNodes((prev) => [...prev, ...previewNodes]);
				setEdges((prev) => [...prev, ...previewEdges]);
			}
		},
		[clearPreviewHideTimer, removeAllFolderPreviews, setEdges, setNodes],
	);

	const scheduleHideFolderPreview = useCallback(
		(folderNodeId: string) => {
			clearPreviewHideTimer();
			previewHideTimerRef.current = window.setTimeout(() => {
				if (activePreviewFolderRef.current !== folderNodeId) return;
				activePreviewFolderRef.current = null;
				removeAllFolderPreviews();
			}, 180);
		},
		[clearPreviewHideTimer, removeAllFolderPreviews],
	);

	const snapshotString = useCallback(
		(n: CanvasNode[], e: CanvasEdge[]) =>
			JSON.stringify({
				n: n.map((node) => ({
					id: node.id,
					type: node.type ?? null,
					position: node.position,
					data: node.data ?? null,
					parentNode: (node as unknown as { parentNode?: string | null })
						.parentNode,
					extent: (node as unknown as { extent?: unknown }).extent ?? null,
					style: (node as unknown as { style?: unknown }).style ?? null,
				})),
				e: e.map((edge) => ({
					id: edge.id,
					source: edge.source,
					target: edge.target,
					type: edge.type ?? null,
					label: (edge as unknown as { label?: unknown }).label ?? null,
					data: edge.data ?? null,
					style: (edge as unknown as { style?: unknown }).style ?? null,
				})),
			}),
		[],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Only reset local state when switching canvases (by id), not on every doc update.
	useEffect(() => {
		setSaveError("");
		if (!doc) {
			setNodes([]);
			setEdges([]);
			lastSavedKeyRef.current = "";
			setIsBulkLoad(false);
			return;
		}
		// Enable bulk load mode if many nodes
		const shouldBulkLoad = (doc.nodes?.length ?? 0) > BULK_LOAD_THRESHOLD;
		setIsBulkLoad(shouldBulkLoad);

		setNodes(doc.nodes ?? []);
		setEdges(doc.edges ?? []);
		pastRef.current = [];
		futureRef.current = [];
		lastHistoryRef.current = "";
		lastSavedKeyRef.current = snapshotString(doc.nodes ?? [], doc.edges ?? []);
		lastStateRef.current = structuredClone({
			nodes: doc.nodes ?? [],
			edges: doc.edges ?? [],
		});
		// Center view on nodes after loading
		requestAnimationFrame(() => {
			flowRef.current?.fitView({ padding: 0.1, duration: 300 });
		});

		// Clear bulk load mode after initial render so new nodes animate
		if (shouldBulkLoad) {
			const timer = setTimeout(() => setIsBulkLoad(false), 100);
			return () => clearTimeout(timer);
		}
	}, [doc?.id, setEdges, setNodes, snapshotString]);

	useEffect(() => {
		if (!vaultPath) return;
		if (!doc) return;
		let cancelled = false;
		(async () => {
			const linkCandidates = (doc.nodes ?? []).filter(
				(n) =>
					n.type === "link" &&
					typeof (n.data as Record<string, unknown> | null)?.image_src !==
						"string" &&
					typeof (n.data as Record<string, unknown> | null)?.preview ===
						"object",
			);
			const fileCandidates = (doc.nodes ?? []).filter((n) => {
				if (n.type !== "file") return false;
				const d = (n.data as Record<string, unknown> | null) ?? null;
				if (!d) return false;
				if (typeof d.image_src === "string") return false;
				const p = typeof d.path === "string" ? d.path : "";
				const ext = p.split(".").pop()?.toLowerCase() ?? "";
				return ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);
			});
			if (!linkCandidates.length && !fileCandidates.length) return;

			const computedLinks = await Promise.all(
				linkCandidates.map(async (n) => {
					const preview = (n.data as Record<string, unknown>).preview as
						| Record<string, unknown>
						| null
						| undefined;
					const rel =
						preview && typeof preview.image_cache_rel_path === "string"
							? preview.image_cache_rel_path
							: null;
					if (!rel) return { id: n.id, src: null as string | null };
					const abs = await join(vaultPath, rel);
					return { id: n.id, src: convertFileSrc(abs) };
				}),
			);

			const computedFiles = await Promise.all(
				fileCandidates.map(async (n) => {
					const p =
						typeof (n.data as Record<string, unknown> | null)?.path === "string"
							? ((n.data as Record<string, unknown>).path as string)
							: "";
					if (!p) return { id: n.id, src: null as string | null };
					const abs = await join(vaultPath, p);
					return { id: n.id, src: convertFileSrc(abs) };
				}),
			);
			if (cancelled) return;
			setNodes((prev) =>
				prev.map((n) => {
					const foundLink = computedLinks.find((c) => c.id === n.id);
					const foundFile = computedFiles.find((c) => c.id === n.id);
					const src = foundLink?.src ?? foundFile?.src ?? null;
					if (!src) return n;
					return {
						...n,
						data: { ...(n.data ?? {}), image_src: src },
					};
				}),
			);
		})();
		return () => {
			cancelled = true;
		};
	}, [doc, vaultPath, setNodes]);

	const nodeTypes = useMemo(
		() => ({
			note: NoteNode,
			text: TextNode,
			file: FileNode,
			link: LinkNode,
			frame: FrameNode,
			folder: FolderNode,
			folder_preview: FolderPreviewNode,
		}),
		[],
	);

	const pushHistory = useCallback(
		(n: CanvasNode[], e: CanvasEdge[]) => {
			if (applyingHistoryRef.current) return;
			if (!doc) return;
			const stable = stripEphemeral(n, e);
			const nextKey = snapshotString(stable.nodes, stable.edges);
			if (!lastHistoryRef.current) {
				lastHistoryRef.current = nextKey;
				lastStateRef.current = structuredClone({
					nodes: stable.nodes,
					edges: stable.edges,
				});
				return;
			}
			if (nextKey === lastHistoryRef.current) return;

			const prev = lastStateRef.current;
			if (prev) pastRef.current.push(prev);
			if (pastRef.current.length > 80) pastRef.current.shift();
			futureRef.current = [];
			lastHistoryRef.current = nextKey;
			lastStateRef.current = structuredClone({
				nodes: stable.nodes,
				edges: stable.edges,
			});
		},
		[doc, snapshotString, stripEphemeral],
	);

	const scheduleSave = useCallback(
		(nextNodes: CanvasNode[], nextEdges: CanvasEdge[]) => {
			if (!doc) return;
			const stable = stripEphemeral(nextNodes, nextEdges);
			const nextKey = snapshotString(stable.nodes, stable.edges);
			if (!nextKey || nextKey === lastSavedKeyRef.current) return;
			if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
			saveTimerRef.current = window.setTimeout(async () => {
				setIsSaving(true);
				setSaveError("");
				try {
					await onSave({
						version: doc.version,
						id: doc.id,
						title: doc.title,
						nodes: stable.nodes,
						edges: stable.edges,
					});
					lastSavedKeyRef.current = nextKey;
				} catch (e) {
					setSaveError(e instanceof Error ? e.message : String(e));
				} finally {
					setIsSaving(false);
				}
			}, 400);
		},
		[doc, onSave, snapshotString, stripEphemeral],
	);

	useEffect(() => {
		if (!doc) return;
		scheduleSave(nodes, edges);
	}, [doc, edges, nodes, scheduleSave]);

	useEffect(() => {
		if (!doc) return;
		if (historyTimerRef.current) window.clearTimeout(historyTimerRef.current);
		historyTimerRef.current = window.setTimeout(() => {
			pushHistory(nodes, edges);
		}, 200);
	}, [doc, edges, nodes, pushHistory]);

	const onConnect = useCallback(
		(connection: Connection) => {
			setEdges((eds) => addEdge(connection, eds));
		},
		[setEdges],
	);

	const flowCenter = useCallback(() => {
		const flow = flowRef.current;
		const el = wrapperRef.current;
		if (!flow || !el) return { x: 0, y: 0 };
		const rect = el.getBoundingClientRect();
		return flow.screenToFlowPosition({
			x: rect.left + rect.width / 2,
			y: rect.top + rect.height / 2,
		});
	}, []);

	const onAddText = useCallback(() => {
		const text = window.prompt("Text node:", "Hello");
		if (text == null) return;
		setNodes((prev) => {
			const pos = flowCenter();
			return [
				...prev,
				{
					id: crypto.randomUUID(),
					type: "text",
					position: pos,
					data: { text },
				},
			];
		});
	}, [flowCenter, setNodes]);

	const createLinkNode = useCallback(
		(url: string, position?: { x: number; y: number }) => {
			if (!url) return;
			const nodeId = crypto.randomUUID();
			setNodes((prev) => {
				const pos = position ?? flowCenter();
				return [
					...prev,
					{
						id: nodeId,
						type: "link",
						position: pos,
						data: { url, status: "Loading preview…" },
					},
				];
			});
			(async () => {
				try {
					const preview = await invoke("link_preview", { url });
					const imageSrc =
						vaultPath && preview.image_cache_rel_path
							? convertFileSrc(
									await join(vaultPath, preview.image_cache_rel_path),
								)
							: null;
					setNodes((prev) =>
						prev.map((n) =>
							n.id === nodeId
								? {
										...n,
										data: {
											...(n.data ?? {}),
											url: preview.url,
											preview,
											image_src: imageSrc ?? undefined,
											status: preview.ok ? "" : "Preview unavailable",
										},
									}
								: n,
						),
					);
				} catch {
					setNodes((prev) =>
						prev.map((n) =>
							n.id === nodeId
								? {
										...n,
										data: { ...(n.data ?? {}), status: "Preview failed" },
									}
								: n,
						),
					);
				}
			})();
		},
		[flowCenter, setNodes, vaultPath],
	);

	useEffect(() => {
		if (!doc) return;
		if (!externalCommand) return;
		if (externalCommand.kind === "add_note_node") {
			const pos = flowCenter();
			setNodes((prev) => {
				const stableId = externalCommand.noteId;
				if (prev.some((n) => n.id === stableId)) return prev;
				return [
					...prev,
					{
						id: stableId,
						type: "note",
						position: pos,
						data: {
							noteId: externalCommand.noteId,
							title: externalCommand.title || "Note",
						},
					},
				];
			});
			onExternalCommandHandled?.(externalCommand.id);
			return;
		}
		if (externalCommand.kind === "add_text_node") {
			const pos = flowCenter();
			setNodes((prev) => [
				...prev,
				{
					id: crypto.randomUUID(),
					type: "text",
					position: pos,
					data: { text: externalCommand.text },
				},
			]);
			onExternalCommandHandled?.(externalCommand.id);
			return;
		}
		if (externalCommand.kind === "add_link_node") {
			createLinkNode(externalCommand.url, flowCenter());
			onExternalCommandHandled?.(externalCommand.id);
		}
	}, [
		createLinkNode,
		doc,
		externalCommand,
		flowCenter,
		onExternalCommandHandled,
		setNodes,
	]);

	const onAddLink = useCallback(() => {
		const url = window.prompt("Link URL:", "https://");
		if (!url) return;
		createLinkNode(url);
	}, [createLinkNode]);

	const onAddNote = useCallback(() => {
		if (!activeNoteId) return;
		setNodes((prev) => {
			if (prev.some((n) => n.id === activeNoteId)) return prev;
			const pos = flowCenter();
			return [
				...prev,
				{
					id: activeNoteId,
					type: "note",
					position: pos,
					data: { noteId: activeNoteId, title: activeNoteTitle ?? "Note" },
				},
			];
		});
	}, [activeNoteId, activeNoteTitle, flowCenter, setNodes]);

	const selectedNodes = useMemo(() => nodes.filter((n) => n.selected), [nodes]);
	const selectedLinkNode = useMemo(() => {
		if (selectedNodes.length !== 1) return null;
		const n = selectedNodes[0];
		if (!n || n.type !== "link") return null;
		return n;
	}, [selectedNodes]);

	const onRefreshSelectedLink = useCallback(() => {
		if (!selectedLinkNode) return;
		const url =
			typeof (selectedLinkNode.data as Record<string, unknown>)?.url ===
			"string"
				? ((selectedLinkNode.data as Record<string, unknown>).url as string)
				: "";
		if (!url) return;
		const nodeId = selectedLinkNode.id;
		setNodes((prev) =>
			prev.map((n) =>
				n.id === nodeId
					? { ...n, data: { ...(n.data ?? {}), status: "Refreshing…" } }
					: n,
			),
		);
		(async () => {
			try {
				const preview = await invoke("link_preview", { url, force: true });
				const imageSrc =
					vaultPath && preview.image_cache_rel_path
						? convertFileSrc(
								await join(vaultPath, preview.image_cache_rel_path),
							)
						: null;
				setNodes((prev) =>
					prev.map((n) =>
						n.id === nodeId
							? {
									...n,
									data: {
										...(n.data ?? {}),
										url: preview.url,
										preview,
										image_src: imageSrc ?? undefined,
										status: preview.ok ? "" : "Preview unavailable",
									},
								}
							: n,
					),
				);
			} catch {
				setNodes((prev) =>
					prev.map((n) =>
						n.id === nodeId
							? { ...n, data: { ...(n.data ?? {}), status: "Refresh failed" } }
							: n,
					),
				);
			}
		})();
	}, [selectedLinkNode, setNodes, vaultPath]);

	useEffect(() => {
		onSelectionChange?.(selectedNodes);
	}, [onSelectionChange, selectedNodes]);

	useEffect(() => {
		const el = wrapperRef.current;
		if (!el) return;
		const onPaste = (e: ClipboardEvent) => {
			const active = e.target as HTMLElement | null;
			if (active?.tagName === "INPUT" || active?.tagName === "TEXTAREA") return;
			const text = e.clipboardData?.getData("text/plain")?.trim();
			if (!text) return;
			let parsed: URL | null = null;
			try {
				parsed = new URL(text);
			} catch {
				parsed = null;
			}
			if (!parsed) return;
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
			createLinkNode(text, flowCenter());
		};
		el.addEventListener("paste", onPaste);
		return () => {
			el.removeEventListener("paste", onPaste);
		};
	}, [createLinkNode, flowCenter]);

	const onToggleSnap = useCallback(() => setSnapToGrid((v) => !v), []);

	const applyAlign = useCallback(
		(mode: "left" | "right" | "top" | "bottom" | "centerX" | "centerY") => {
			const sel = selectedNodes;
			if (sel.length < 2) return;

			const dim = (n: CanvasNode) => {
				const measured = (
					n as unknown as { measured?: { width?: number; height?: number } }
				).measured;
				const w =
					measured?.width ?? (n as unknown as { width?: number }).width ?? 0;
				const h =
					measured?.height ?? (n as unknown as { height?: number }).height ?? 0;
				return { w, h };
			};

			const xs = sel.map((n) => n.position.x);
			const ys = sel.map((n) => n.position.y);

			const left = Math.min(...xs);
			const top = Math.min(...ys);
			const right = Math.max(...sel.map((n) => n.position.x + dim(n).w));
			const bottom = Math.max(...sel.map((n) => n.position.y + dim(n).h));
			const centerX = (left + right) / 2;
			const centerY = (top + bottom) / 2;

			setNodes((prev) =>
				prev.map((n) => {
					if (!n.selected) return n;
					const { w, h } = dim(n);
					switch (mode) {
						case "left":
							return { ...n, position: { ...n.position, x: left } };
						case "right":
							return { ...n, position: { ...n.position, x: right - w } };
						case "top":
							return { ...n, position: { ...n.position, y: top } };
						case "bottom":
							return { ...n, position: { ...n.position, y: bottom - h } };
						case "centerX":
							return { ...n, position: { ...n.position, x: centerX - w / 2 } };
						case "centerY":
							return { ...n, position: { ...n.position, y: centerY - h / 2 } };
					}
				}),
			);
		},
		[selectedNodes, setNodes],
	);

	const applyDistribute = useCallback(
		(axis: "x" | "y") => {
			const sel = selectedNodes;
			if (sel.length < 3) return;

			const sorted = [...sel].sort((a, b) =>
				axis === "x"
					? a.position.x - b.position.x
					: a.position.y - b.position.y,
			);
			const first = sorted[0];
			const last = sorted[sorted.length - 1];
			if (!first || !last) return;
			const min = axis === "x" ? first.position.x : first.position.y;
			const max = axis === "x" ? last.position.x : last.position.y;
			const step = (max - min) / (sorted.length - 1);

			const positions = new Map<string, number>();
			sorted.forEach((n, idx) => positions.set(n.id, min + step * idx));
			setNodes((prev) =>
				prev.map((n) => {
					const p = positions.get(n.id);
					if (p == null) return n;
					return axis === "x"
						? { ...n, position: { ...n.position, x: p } }
						: { ...n, position: { ...n.position, y: p } };
				}),
			);
		},
		[selectedNodes, setNodes],
	);

	const onFrameSelection = useCallback(() => {
		const sel = selectedNodes.filter((n) => n.type !== "frame");
		if (!sel.length) return;
		const pad = 40;
		const dim = (n: CanvasNode) => {
			const measured = (
				n as unknown as { measured?: { width?: number; height?: number } }
			).measured;
			const w =
				measured?.width ?? (n as unknown as { width?: number }).width ?? 0;
			const h =
				measured?.height ?? (n as unknown as { height?: number }).height ?? 0;
			return { w, h };
		};

		const minX = Math.min(...sel.map((n) => n.position.x));
		const minY = Math.min(...sel.map((n) => n.position.y));
		const maxX = Math.max(...sel.map((n) => n.position.x + dim(n).w));
		const maxY = Math.max(...sel.map((n) => n.position.y + dim(n).h));
		const frameId = crypto.randomUUID();
		const framePos = { x: minX - pad, y: minY - pad };
		const frameStyle = {
			width: maxX - minX + pad * 2,
			height: maxY - minY + pad * 2,
		};

		setNodes((prev) => {
			const next = prev.map((n) => {
				if (!n.selected || n.type === "frame") return n;
				return {
					...n,
					parentNode: frameId,
					extent: "parent" as const,
					position: {
						x: n.position.x - framePos.x,
						y: n.position.y - framePos.y,
					},
					selected: false,
				};
			});
			next.push({
				id: frameId,
				type: "frame",
				position: framePos,
				data: { title: "Frame" },
				style: frameStyle,
			} as CanvasNode);
			return next;
		});
	}, [selectedNodes, setNodes]);

	const undo = useCallback(() => {
		const past = pastRef.current;
		if (!past.length) return;
		applyingHistoryRef.current = true;
		const previous = past.pop();
		if (!previous) return;
		futureRef.current.push(structuredClone({ nodes, edges }));
		setNodes(previous.nodes);
		setEdges(previous.edges);
		window.setTimeout(() => {
			lastHistoryRef.current = snapshotString(previous.nodes, previous.edges);
			lastStateRef.current = structuredClone(previous);
			applyingHistoryRef.current = false;
		}, 0);
	}, [edges, nodes, setEdges, setNodes, snapshotString]);

	const redo = useCallback(() => {
		const future = futureRef.current;
		if (!future.length) return;
		applyingHistoryRef.current = true;
		const next = future.pop();
		if (!next) return;
		pastRef.current.push(structuredClone({ nodes, edges }));
		setNodes(next.nodes);
		setEdges(next.edges);
		window.setTimeout(() => {
			lastHistoryRef.current = snapshotString(next.nodes, next.edges);
			lastStateRef.current = structuredClone(next);
			applyingHistoryRef.current = false;
		}, 0);
	}, [edges, nodes, setEdges, setNodes, snapshotString]);

	const deleteSelection = useCallback(() => {
		const selectedNodeIds = new Set(
			nodes.filter((n) => n.selected).map((n) => n.id),
		);
		const selectedEdgeIds = new Set(
			edges.filter((e) => e.selected).map((e) => e.id),
		);
		if (!selectedNodeIds.size && !selectedEdgeIds.size) return;
		setNodes((prev) => prev.filter((n) => !selectedNodeIds.has(n.id)));
		setEdges((prev) =>
			prev.filter(
				(e) =>
					!selectedEdgeIds.has(e.id) &&
					!selectedNodeIds.has(e.source) &&
					!selectedNodeIds.has(e.target),
			),
		);
	}, [edges, nodes, setEdges, setNodes]);

	const keyHandlersRef = useRef({ undo, redo, deleteSelection });
	useEffect(() => {
		keyHandlersRef.current = { undo, redo, deleteSelection };
	}, [deleteSelection, redo, undo]);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const isMod = e.metaKey || e.ctrlKey;
			if (isMod && e.key.toLowerCase() === "z") {
				e.preventDefault();
				if (e.shiftKey) keyHandlersRef.current.redo();
				else keyHandlersRef.current.undo();
				return;
			}
			if (e.key === "Delete" || e.key === "Backspace") {
				if (
					(e.target as HTMLElement | null)?.tagName === "INPUT" ||
					(e.target as HTMLElement | null)?.tagName === "TEXTAREA"
				)
					return;
				keyHandlersRef.current.deleteSelection();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const onNodeDoubleClick: NodeMouseHandler = useCallback(
		(_evt, node) => {
			if (node.type === "note") {
				const noteId = (node.data as Record<string, unknown>)?.noteId;
				if (typeof noteId === "string") onOpenNote(noteId);
				return;
			}
			if (node.type === "file") {
				const path = (node.data as Record<string, unknown>)?.path;
				if (typeof path === "string") onOpenNote(path);
				return;
			}
			if (node.type === "folder") {
				const dir = (node.data as Record<string, unknown>)?.dir;
				if (typeof dir === "string") onOpenFolder(dir);
				return;
			}
			if (node.type === "folder_preview") {
				const d = (node.data as Record<string, unknown> | null) ?? null;
				const relPath = d && typeof d.rel_path === "string" ? d.rel_path : "";
				const moreCount =
					d && typeof d.more_count === "number" ? d.more_count : 0;
				const dir = d && typeof d.dir === "string" ? d.dir : "";
				if (moreCount > 0) {
					if (dir) onOpenFolder(dir);
					return;
				}
				if (relPath) onOpenNote(relPath);
				return;
			}
			if (node.type === "text") {
				const current =
					typeof (node.data as Record<string, unknown>)?.text === "string"
						? ((node.data as Record<string, unknown>).text as string)
						: "";
				const next = window.prompt("Edit text:", current);
				if (next == null) return;
				setNodes((prev) =>
					prev.map((n) =>
						n.id === node.id
							? { ...n, data: { ...(n.data ?? {}), text: next } }
							: n,
					),
				);
			}
			if (node.type === "link") {
				const current =
					typeof (node.data as Record<string, unknown>)?.url === "string"
						? ((node.data as Record<string, unknown>).url as string)
						: "";
				const next = window.prompt("Edit URL:", current);
				if (!next) return;
				setNodes((prev) =>
					prev.map((n) =>
						n.id === node.id
							? { ...n, data: { ...(n.data ?? {}), url: next } }
							: n,
					),
				);
			}
		},
		[onOpenFolder, onOpenNote, setNodes],
	);

	if (!doc) {
		return (
			<div className="canvasEmpty">
				Select a folder, tag, or search to populate the canvas.
			</div>
		);
	}

	// Show loading overlay while bulk loading
	const showLoading = isBulkLoad && nodes.length > BULK_LOAD_THRESHOLD;

	return (
		<CanvasActionsContext.Provider
			value={{
				openNote: onOpenNote,
				openFolder: onOpenFolder,
				showFolderPreview,
				scheduleHideFolderPreview,
			}}
		>
			<div className="canvasPane">
				<div className="canvasToolbar">
					<div className="canvasToolbarLeft">
						<div className="canvasTitle">{doc.title}</div>
						<div className="canvasStatus">
							{isSaving ? "⟳ Saving…" : "✓ Saved"}
						</div>
					</div>
					<div className="canvasToolbarRight">
						<button
							type="button"
							className="iconBtn"
							onClick={onAddText}
							title="Add text block"
						>
							<Type size={16} />
						</button>
						<button
							type="button"
							className="iconBtn"
							onClick={onAddLink}
							title="Add link"
						>
							<Link size={16} />
						</button>
						<button
							type="button"
							className="iconBtn"
							onClick={onAddNote}
							disabled={!activeNoteId}
							title="Add current note to canvas"
						>
							<StickyNote size={16} />
						</button>
						<button
							type="button"
							className="iconBtn"
							onClick={onRefreshSelectedLink}
							disabled={!selectedLinkNode}
							title="Refresh selected link preview"
						>
							<RefreshCw size={16} />
						</button>
						<span className="toolbarDivider" />
						<button
							type="button"
							className="iconBtn"
							onClick={onFrameSelection}
							disabled={!selectedNodes.length}
							title="Group selection in a frame"
						>
							<Frame size={16} />
						</button>
						<button
							type="button"
							className={`iconBtn ${snapToGrid ? "active" : ""}`}
							onClick={onToggleSnap}
							title="Toggle snap to grid"
						>
							<Grid3X3 size={16} />
						</button>
						<span className="toolbarDivider" />
						<button
							type="button"
							className="iconBtn"
							onClick={() => applyAlign("left")}
							disabled={selectedNodes.length < 2}
							title="Align left"
						>
							<AlignLeft size={16} />
						</button>
						<button
							type="button"
							className="iconBtn"
							onClick={() => applyAlign("centerX")}
							disabled={selectedNodes.length < 2}
							title="Align center"
						>
							<AlignCenter size={16} />
						</button>
						<button
							type="button"
							className="iconBtn"
							onClick={() => applyAlign("right")}
							disabled={selectedNodes.length < 2}
							title="Align right"
						>
							<AlignRight size={16} />
						</button>
						<button
							type="button"
							className="iconBtn"
							onClick={() => applyAlign("top")}
							disabled={selectedNodes.length < 2}
							title="Align top"
						>
							<AlignStartVertical size={16} />
						</button>
						<button
							type="button"
							className="iconBtn"
							onClick={() => applyAlign("centerY")}
							disabled={selectedNodes.length < 2}
							title="Align middle"
						>
							<AlignCenterVertical size={16} />
						</button>
						<button
							type="button"
							className="iconBtn"
							onClick={() => applyAlign("bottom")}
							disabled={selectedNodes.length < 2}
							title="Align bottom"
						>
							<AlignEndVertical size={16} />
						</button>
						<span className="toolbarDivider" />
						<button
							type="button"
							className="iconBtn"
							onClick={() => applyDistribute("x")}
							disabled={selectedNodes.length < 3}
							title="Distribute horizontally"
						>
							<AlignHorizontalSpaceAround size={16} />
						</button>
						<button
							type="button"
							className="iconBtn"
							onClick={() => applyDistribute("y")}
							disabled={selectedNodes.length < 3}
							title="Distribute vertically"
						>
							<AlignVerticalSpaceAround size={16} />
						</button>
					</div>
				</div>

				<div className="canvasBody" ref={wrapperRef}>
					{showLoading && (
						<div className="canvasLoading">
							<span className="canvasLoadingSpinner">◈</span>
							Loading canvas…
						</div>
					)}
					<ReactFlow
						nodes={nodes}
						edges={edges}
						onNodesChange={onNodesChange}
						onEdgesChange={onEdgesChange}
						onConnect={onConnect}
						onNodeDoubleClick={onNodeDoubleClick}
						nodeTypes={nodeTypes}
						snapToGrid={snapToGrid}
						snapGrid={[16, 16]}
						onInit={(instance) => {
							flowRef.current = instance;
							instance.fitView();
						}}
					>
						<Background />
						<MiniMap />
						<Controls />
					</ReactFlow>
				</div>

				{saveError && <div className="canvasError">{saveError}</div>}
			</div>
		</CanvasActionsContext.Provider>
	);
}
