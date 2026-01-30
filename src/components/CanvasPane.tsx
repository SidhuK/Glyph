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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "../lib/tauri";

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
	activeNoteId: string | null;
	activeNoteTitle: string | null;
	vaultPath: string | null;
	onSelectionChange?: (selected: CanvasNode[]) => void;
}

const NoteNode = memo(function NoteNode({
	data,
}: { data: Record<string, unknown> }) {
	const title = typeof data.title === "string" ? data.title : "Note";
	const noteId = typeof data.noteId === "string" ? data.noteId : "";
	return (
		<div className="rfNode rfNodeNote" title={noteId}>
			<Handle type="target" position={Position.Left} />
			<Handle type="source" position={Position.Right} />
			<div className="rfNodeTitle">{title}</div>
			<div className="rfNodeSub mono">
				{noteId ? `${noteId.slice(0, 8)}…` : ""}
			</div>
		</div>
	);
});

const TextNode = memo(function TextNode({
	data,
}: { data: Record<string, unknown> }) {
	const text = typeof data.text === "string" ? data.text : "";
	return (
		<div className="rfNode rfNodeText">
			<Handle type="target" position={Position.Left} />
			<Handle type="source" position={Position.Right} />
			<div className="rfNodeTitle">Text</div>
			<div className="rfNodeBody">{text}</div>
		</div>
	);
});

const LinkNode = memo(function LinkNode({
	data,
}: { data: Record<string, unknown> }) {
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
	return (
		<div className="rfNode rfNodeLink">
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
}: { data: Record<string, unknown> }) {
	const title = typeof data.title === "string" ? data.title : "Frame";
	return (
		<div className="rfNode rfNodeFrame">
			<NodeResizer minWidth={220} minHeight={160} />
			<div className="rfNodeTitle">{title}</div>
		</div>
	);
});

export default function CanvasPane({
	doc,
	onSave,
	onOpenNote,
	activeNoteId,
	activeNoteTitle,
	vaultPath,
	onSelectionChange,
}: CanvasPaneProps) {
	const wrapperRef = useRef<HTMLDivElement | null>(null);
	const flowRef = useRef<ReactFlowInstance<CanvasNode, CanvasEdge> | null>(
		null,
	);
	const saveTimerRef = useRef<number | null>(null);
	const historyTimerRef = useRef<number | null>(null);
	const applyingHistoryRef = useRef(false);
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

	const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(
		doc?.nodes ?? [],
	);
	const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>(
		doc?.edges ?? [],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Only reset local state when switching canvases (by id), not on every doc update.
	useEffect(() => {
		setSaveError("");
		if (!doc) {
			setNodes([]);
			setEdges([]);
			return;
		}
		setNodes(doc.nodes ?? []);
		setEdges(doc.edges ?? []);
		pastRef.current = [];
		futureRef.current = [];
		lastHistoryRef.current = "";
		lastStateRef.current = structuredClone({
			nodes: doc.nodes ?? [],
			edges: doc.edges ?? [],
		});
	}, [doc?.id]);

	useEffect(() => {
		if (!vaultPath) return;
		if (!doc) return;
		let cancelled = false;
		(async () => {
			const candidates = (doc.nodes ?? []).filter(
				(n) =>
					n.type === "link" &&
					typeof (n.data as Record<string, unknown> | null)?.image_src !==
						"string" &&
					typeof (n.data as Record<string, unknown> | null)?.preview ===
						"object",
			);
			if (!candidates.length) return;

			const computed = await Promise.all(
				candidates.map(async (n) => {
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
			if (cancelled) return;
			setNodes((prev) =>
				prev.map((n) => {
					const found = computed.find((c) => c.id === n.id);
					if (!found?.src) return n;
					return {
						...n,
						data: { ...(n.data ?? {}), image_src: found.src },
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
			link: LinkNode,
			frame: FrameNode,
		}),
		[],
	);

	const snapshotString = useCallback(
		(n: CanvasNode[], e: CanvasEdge[]) => JSON.stringify({ n, e }),
		[],
	);

	const pushHistory = useCallback(
		(n: CanvasNode[], e: CanvasEdge[]) => {
			if (applyingHistoryRef.current) return;
			if (!doc) return;
			const nextKey = snapshotString(n, e);
			if (!lastHistoryRef.current) {
				lastHistoryRef.current = nextKey;
				lastStateRef.current = structuredClone({ nodes: n, edges: e });
				return;
			}
			if (nextKey === lastHistoryRef.current) return;

			const prev = lastStateRef.current;
			if (prev) pastRef.current.push(prev);
			if (pastRef.current.length > 80) pastRef.current.shift();
			futureRef.current = [];
			lastHistoryRef.current = nextKey;
			lastStateRef.current = structuredClone({ nodes: n, edges: e });
		},
		[doc, snapshotString],
	);

	const scheduleSave = useCallback(
		(nextNodes: CanvasNode[], nextEdges: CanvasEdge[]) => {
			if (!doc) return;
			if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
			saveTimerRef.current = window.setTimeout(async () => {
				setIsSaving(true);
				setSaveError("");
				try {
					await onSave({
						version: doc.version,
						id: doc.id,
						title: doc.title,
						nodes: nextNodes,
						edges: nextEdges,
					});
				} catch (e) {
					setSaveError(e instanceof Error ? e.message : String(e));
				} finally {
					setIsSaving(false);
				}
			}, 400);
		},
		[doc, onSave],
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

	const onAddLink = useCallback(() => {
		const url = window.prompt("Link URL:", "https://");
		if (!url) return;
		createLinkNode(url);
	}, [createLinkNode]);

	const onAddNote = useCallback(() => {
		if (!activeNoteId) return;
		setNodes((prev) => {
			const pos = flowCenter();
			return [
				...prev,
				{
					id: crypto.randomUUID(),
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
		[onOpenNote, setNodes],
	);

	if (!doc) {
		return (
			<div className="canvasEmpty">
				Open/create a vault and select a canvas.
			</div>
		);
	}

	return (
		<div className="canvasPane">
			<div className="canvasToolbar">
				<div className="canvasToolbarLeft">
					<div className="canvasTitle">{doc.title}</div>
					{isSaving ? (
						<div className="canvasStatus">Saving…</div>
					) : (
						<div className="canvasStatus">Saved</div>
					)}
				</div>
				<div className="canvasToolbarRight">
					<button type="button" onClick={onAddText} title="Add text block">
						+ Text
					</button>
					<button type="button" onClick={onAddLink} title="Add link">
						+ Link
					</button>
					<button
						type="button"
						onClick={onAddNote}
						disabled={!activeNoteId}
						title="Add current note to canvas"
					>
						+ Note
					</button>
					<button
						type="button"
						onClick={onRefreshSelectedLink}
						disabled={!selectedLinkNode}
						title="Refresh selected link preview"
					>
						↻ Refresh
					</button>
					<span className="toolbarDivider" />
					<button
						type="button"
						onClick={onFrameSelection}
						disabled={!selectedNodes.length}
						title="Group selection in a frame"
					>
						Frame
					</button>
					<button
						type="button"
						onClick={onToggleSnap}
						title="Toggle snap to grid"
					>
						{snapToGrid ? "⊞ Snap" : "⊟ Snap"}
					</button>
					<span className="toolbarDivider" />
					<button
						type="button"
						onClick={() => applyAlign("left")}
						disabled={selectedNodes.length < 2}
						title="Align left"
					>
						⇤
					</button>
					<button
						type="button"
						onClick={() => applyAlign("centerX")}
						disabled={selectedNodes.length < 2}
						title="Align center"
					>
						⇹
					</button>
					<button
						type="button"
						onClick={() => applyAlign("right")}
						disabled={selectedNodes.length < 2}
						title="Align right"
					>
						⇥
					</button>
					<button
						type="button"
						onClick={() => applyAlign("top")}
						disabled={selectedNodes.length < 2}
						title="Align top"
					>
						⤒
					</button>
					<button
						type="button"
						onClick={() => applyAlign("centerY")}
						disabled={selectedNodes.length < 2}
						title="Align middle"
					>
						⇿
					</button>
					<button
						type="button"
						onClick={() => applyAlign("bottom")}
						disabled={selectedNodes.length < 2}
						title="Align bottom"
					>
						⤓
					</button>
					<span className="toolbarDivider" />
					<button
						type="button"
						onClick={() => applyDistribute("x")}
						disabled={selectedNodes.length < 3}
						title="Distribute horizontally"
					>
						⋯
					</button>
					<button
						type="button"
						onClick={() => applyDistribute("y")}
						disabled={selectedNodes.length < 3}
						title="Distribute vertically"
					>
						⋮
					</button>
				</div>
			</div>

			<div className="canvasBody" ref={wrapperRef}>
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

			{saveError ? <div className="canvasError">{saveError}</div> : null}
		</div>
	);
}
