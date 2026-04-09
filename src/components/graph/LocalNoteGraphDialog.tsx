import { FlowConnectionIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	type WheelEvent as ReactWheelEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { LocalGraphNode, LocalNoteGraph } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { dispatchWikiLinkClick } from "../editor/markdown/editorEvents";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "../ui/shadcn/dialog";

interface LocalNoteGraphDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	noteId: string;
	graphRefreshKey?: number;
}

type ViewTransform = {
	x: number;
	y: number;
	k: number;
};

type SimNode = LocalGraphNode & {
	x: number;
	y: number;
	vx: number;
	vy: number;
	radius: number;
};

type DragState = {
	nodeId: string | null;
	pointerId: number | null;
	offsetX: number;
	offsetY: number;
	startClientX: number;
	startClientY: number;
	didMove: boolean;
};

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.9;
const CENTER_RADIUS = 98;
const NEIGHBOR_RADIUS = 74;

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function worldFromScreen(
	clientX: number,
	clientY: number,
	rect: DOMRect,
	transform: ViewTransform,
) {
	return {
		x: (clientX - rect.left - transform.x) / transform.k,
		y: (clientY - rect.top - transform.y) / transform.k,
	};
}

function makeInitialNodes(graph: LocalNoteGraph): SimNode[] {
	const neighbors = graph.nodes.filter((node) => !node.is_center);
	const orbitRadius = Math.max(170, neighbors.length * 18 + 140);
	return graph.nodes.map((node, index) => {
		if (node.is_center) {
			return {
				...node,
				x: 0,
				y: 0,
				vx: 0,
				vy: 0,
				radius: CENTER_RADIUS,
			};
		}
		const neighborIndex = neighbors.findIndex(
			(candidate) => candidate.id === node.id,
		);
		const angle =
			neighborIndex >= 0
				? (Math.PI * 2 * neighborIndex) / Math.max(neighbors.length, 1)
				: (Math.PI * 2 * index) / Math.max(graph.nodes.length, 1);
		return {
			...node,
			x: Math.cos(angle) * orbitRadius,
			y: Math.sin(angle) * orbitRadius,
			vx: 0,
			vy: 0,
			radius: NEIGHBOR_RADIUS,
		};
	});
}

export function LocalNoteGraphDialog({
	open,
	onOpenChange,
	noteId,
	graphRefreshKey = 0,
}: LocalNoteGraphDialogProps) {
	const [graph, setGraph] = useState<LocalNoteGraph | null>(null);
	const [displayNodes, setDisplayNodes] = useState<SimNode[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [viewport, setViewport] = useState({ width: 0, height: 0 });
	const [transform, setTransform] = useState<ViewTransform>({
		x: 0,
		y: 0,
		k: 1,
	});
	const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
	const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
	const viewportRef = useRef<HTMLDivElement | null>(null);
	const panRef = useRef<{
		active: boolean;
		pointerId: number | null;
		startX: number;
		startY: number;
		originX: number;
		originY: number;
	}>({
		active: false,
		pointerId: null,
		startX: 0,
		startY: 0,
		originX: 0,
		originY: 0,
	});
	const dragRef = useRef<DragState>({
		nodeId: null,
		pointerId: null,
		offsetX: 0,
		offsetY: 0,
		startClientX: 0,
		startClientY: 0,
		didMove: false,
	});
	const nodesRef = useRef<SimNode[]>([]);
	const rafRef = useRef<number | null>(null);

	useEffect(() => {
		if (!open || !noteId) return;
		void graphRefreshKey;
		let cancelled = false;
		setLoading(true);
		setError("");
		void invoke("note_local_graph", { note_id: noteId })
			.then((nextGraph) => {
				if (cancelled) return;
				setGraph(nextGraph);
				setFocusedNodeId(nextGraph.center.id);
				const initialNodes = makeInitialNodes(nextGraph);
				nodesRef.current = initialNodes;
				setDisplayNodes(initialNodes);
			})
			.catch((cause) => {
				if (cancelled) return;
				setGraph(null);
				setDisplayNodes([]);
				setError(cause instanceof Error ? cause.message : String(cause));
			})
			.finally(() => {
				if (!cancelled) {
					setLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [graphRefreshKey, noteId, open]);

	useLayoutEffect(() => {
		if (!open || loading || Boolean(error)) return;
		const element = viewportRef.current;
		if (!element) return;
		const updateViewport = () => {
			const rect = element.getBoundingClientRect();
			setViewport({ width: rect.width, height: rect.height });
			setTransform((current) => ({
				x: current.x === 0 ? rect.width / 2 : current.x,
				y: current.y === 0 ? rect.height / 2 : current.y,
				k: current.k,
			}));
		};
		updateViewport();
		const observer = new ResizeObserver(updateViewport);
		observer.observe(element);
		return () => observer.disconnect();
	}, [error, loading, open]);

	const neighborMap = useMemo(() => {
		const map = new Map<string, Set<string>>();
		if (!graph) return map;
		for (const edge of graph.edges) {
			const sourceSet = map.get(edge.source) ?? new Set<string>();
			sourceSet.add(edge.target);
			map.set(edge.source, sourceSet);
			const targetSet = map.get(edge.target) ?? new Set<string>();
			targetSet.add(edge.source);
			map.set(edge.target, targetSet);
		}
		return map;
	}, [graph]);

	const activeNodeId =
		hoveredNodeId ?? focusedNodeId ?? graph?.center.id ?? null;
	const viewportReady = viewport.width > 0 && viewport.height > 0;

	const isNodeHighlighted = useCallback(
		(nodeId: string) => {
			if (!activeNodeId) return true;
			return (
				nodeId === activeNodeId ||
				Boolean(neighborMap.get(activeNodeId)?.has(nodeId))
			);
		},
		[activeNodeId, neighborMap],
	);

	useEffect(() => {
		if (!open || !graph || !viewportReady) return;
		const rect = viewportRef.current?.getBoundingClientRect();
		if (!rect) return;
		setTransform({
			x: rect.width / 2,
			y: rect.height / 2,
			k: 1,
		});
	}, [graph, open, viewportReady]);

	useEffect(() => {
		if (!graph || !open) return;
		const edgeKeys = new Set(
			graph.edges.map((edge) => `${edge.source}->${edge.target}`),
		);
		let frame = 0;
		const tick = () => {
			const nodes = nodesRef.current;
			const byId = new Map(nodes.map((node) => [node.id, node]));
			const springs = graph.edges;
			const repulsion = 22_000;
			const springStrength = 0.0048;
			const centerPull = 0.0017;
			const damping = dragRef.current.nodeId ? 0.78 : 0.9;

			for (let outer = 0; outer < nodes.length; outer += 1) {
				for (let inner = outer + 1; inner < nodes.length; inner += 1) {
					const left = nodes[outer];
					const right = nodes[inner];
					let dx = right.x - left.x;
					let dy = right.y - left.y;
					let distanceSq = dx * dx + dy * dy;
					if (distanceSq < 0.01) {
						dx = 0.5 - Math.random();
						dy = 0.5 - Math.random();
						distanceSq = dx * dx + dy * dy;
					}
					const distance = Math.sqrt(distanceSq);
					const force = repulsion / distanceSq;
					const forceX = (dx / distance) * force;
					const forceY = (dy / distance) * force;
					left.vx -= forceX;
					left.vy -= forceY;
					right.vx += forceX;
					right.vy += forceY;

					const minDistance = left.radius + right.radius + 34;
					if (distance < minDistance) {
						const overlap = (minDistance - distance) * 0.038;
						const overlapX = (dx / distance) * overlap;
						const overlapY = (dy / distance) * overlap;
						left.vx -= overlapX;
						left.vy -= overlapY;
						right.vx += overlapX;
						right.vy += overlapY;
					}
				}
			}

			for (const edge of springs) {
				const source = byId.get(edge.source);
				const target = byId.get(edge.target);
				if (!source || !target) continue;
				const dx = target.x - source.x;
				const dy = target.y - source.y;
				let distance = Math.sqrt(dx * dx + dy * dy);
				if (distance < 0.01) distance = 0.01;
				const desired =
					source.is_center || target.is_center
						? 190
						: edgeKeys.has(`${target.id}->${source.id}`)
							? 176
							: 168;
				const spring = (distance - desired) * springStrength;
				const springX = (dx / distance) * spring;
				const springY = (dy / distance) * spring;
				source.vx += springX;
				source.vy += springY;
				target.vx -= springX;
				target.vy -= springY;
			}

			for (const node of nodes) {
				if (node.id === graph.center.id) {
					if (dragRef.current.nodeId === node.id) {
						node.vx = 0;
						node.vy = 0;
						continue;
					}
					node.x = 0;
					node.y = 0;
					node.vx = 0;
					node.vy = 0;
					continue;
				}

				node.vx += -node.x * centerPull;
				node.vy += -node.y * centerPull;

				if (dragRef.current.nodeId === node.id) {
					node.vx = 0;
					node.vy = 0;
					continue;
				}

				node.vx *= damping;
				node.vy *= damping;
				node.x += node.vx;
				node.y += node.vy;
			}

			frame += 1;
			if (frame % 2 === 0) {
				setDisplayNodes(nodes.map((node) => ({ ...node })));
			}
			rafRef.current = window.requestAnimationFrame(tick);
		};

		rafRef.current = window.requestAnimationFrame(tick);
		return () => {
			if (rafRef.current !== null) {
				window.cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
		};
	}, [graph, open]);

	const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
		event.preventDefault();
		const element = viewportRef.current;
		if (!element) return;
		const rect = element.getBoundingClientRect();
		setTransform((current) => {
			const world = worldFromScreen(
				event.clientX,
				event.clientY,
				rect,
				current,
			);
			const nextK = clamp(
				current.k * (event.deltaY > 0 ? 0.92 : 1.08),
				MIN_ZOOM,
				MAX_ZOOM,
			);
			return {
				x: event.clientX - rect.left - world.x * nextK,
				y: event.clientY - rect.top - world.y * nextK,
				k: nextK,
			};
		});
	}, []);

	const handleViewportPointerDown = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (event.target !== event.currentTarget) return;
			panRef.current = {
				active: true,
				pointerId: event.pointerId,
				startX: event.clientX,
				startY: event.clientY,
				originX: transform.x,
				originY: transform.y,
			};
			event.currentTarget.setPointerCapture(event.pointerId);
		},
		[transform.x, transform.y],
	);

	const handleViewportPointerMove = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			const element = viewportRef.current;
			if (!element) return;
			if (dragRef.current.nodeId) {
				const world = worldFromScreen(
					event.clientX,
					event.clientY,
					element.getBoundingClientRect(),
					transform,
				);
				const node = nodesRef.current.find(
					(candidate) => candidate.id === dragRef.current.nodeId,
				);
				if (!node) return;
				if (
					Math.abs(event.clientX - dragRef.current.startClientX) > 4 ||
					Math.abs(event.clientY - dragRef.current.startClientY) > 4
				) {
					dragRef.current.didMove = true;
				}
				node.x = world.x - dragRef.current.offsetX;
				node.y = world.y - dragRef.current.offsetY;
				node.vx = 0;
				node.vy = 0;
				setDisplayNodes(
					nodesRef.current.map((candidate) => ({ ...candidate })),
				);
				return;
			}
			if (
				!panRef.current.active ||
				panRef.current.pointerId !== event.pointerId
			) {
				return;
			}
			setTransform((current) => ({
				...current,
				x: panRef.current.originX + (event.clientX - panRef.current.startX),
				y: panRef.current.originY + (event.clientY - panRef.current.startY),
			}));
		},
		[transform],
	);

	const clearPointerState = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (
				panRef.current.active &&
				panRef.current.pointerId === event.pointerId &&
				event.currentTarget.hasPointerCapture(event.pointerId)
			) {
				event.currentTarget.releasePointerCapture(event.pointerId);
			}
			panRef.current.active = false;
			panRef.current.pointerId = null;
			dragRef.current.nodeId = null;
			dragRef.current.pointerId = null;
			dragRef.current.didMove = false;
		},
		[],
	);

	const handleNodePointerDown = useCallback(
		(event: ReactPointerEvent<HTMLButtonElement>, nodeId: string) => {
			event.stopPropagation();
			const element = viewportRef.current;
			if (!element) return;
			const node = nodesRef.current.find(
				(candidate) => candidate.id === nodeId,
			);
			if (!node) return;
			const world = worldFromScreen(
				event.clientX,
				event.clientY,
				element.getBoundingClientRect(),
				transform,
			);
			dragRef.current = {
				nodeId,
				pointerId: event.pointerId,
				offsetX: world.x - node.x,
				offsetY: world.y - node.y,
				startClientX: event.clientX,
				startClientY: event.clientY,
				didMove: false,
			};
			event.currentTarget.setPointerCapture(event.pointerId);
		},
		[transform],
	);

	const handleNodePointerUp = useCallback(
		(event: ReactPointerEvent<HTMLButtonElement>, nodeId: string) => {
			event.stopPropagation();
			if (
				dragRef.current.nodeId !== nodeId ||
				dragRef.current.pointerId !== event.pointerId
			) {
				return;
			}
			if (event.currentTarget.hasPointerCapture(event.pointerId)) {
				event.currentTarget.releasePointerCapture(event.pointerId);
			}
			const didMove = dragRef.current.didMove;
			dragRef.current.nodeId = null;
			dragRef.current.pointerId = null;
			dragRef.current.didMove = false;
			if (!didMove) {
				setFocusedNodeId(nodeId);
			}
		},
		[],
	);

	const openNode = useCallback(
		(nodeId: string) => {
			dispatchWikiLinkClick({
				raw: `[[${nodeId}]]`,
				target: nodeId,
				alias: null,
				anchorKind: "none",
				anchor: null,
				unresolved: false,
			});
			onOpenChange(false);
		},
		[onOpenChange],
	);

	const handleNodeKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLButtonElement>, nodeId: string) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			if (focusedNodeId === nodeId) {
				openNode(nodeId);
				return;
			}
			setFocusedNodeId(nodeId);
		},
		[focusedNodeId, openNode],
	);

	const displayNodeById = useMemo(
		() => new Map(displayNodes.map((node) => [node.id, node])),
		[displayNodes],
	);
	const dialogSessionKey = `${noteId}:${graphRefreshKey}`;

	const edgePaths = useMemo(() => {
		if (!graph) return [];
		const edgeKeys = new Set(
			graph.edges.map((edge) => `${edge.source}->${edge.target}`),
		);
		return graph.edges.flatMap((edge, index) => {
			const source = displayNodeById.get(edge.source);
			const target = displayNodeById.get(edge.target);
			if (!source || !target) return [];
			const isHighlighted =
				!activeNodeId ||
				edge.source === activeNodeId ||
				edge.target === activeNodeId;
			const reciprocal = edgeKeys.has(`${edge.target}->${edge.source}`);
			const dx = target.x - source.x;
			const dy = target.y - source.y;
			const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
			const normalX = -dy / distance;
			const normalY = dx / distance;
			const directionSign = reciprocal
				? edge.source.localeCompare(edge.target) < 0
					? 1
					: -1
				: 1;
			const bend = reciprocal ? distance * 0.18 : distance * 0.08;
			const controlX =
				(source.x + target.x) / 2 + normalX * bend * directionSign;
			const controlY =
				(source.y + target.y) / 2 + normalY * bend * directionSign;
			const screenSourceX = transform.x + source.x * transform.k;
			const screenSourceY = transform.y + source.y * transform.k;
			const screenTargetX = transform.x + target.x * transform.k;
			const screenTargetY = transform.y + target.y * transform.k;
			const screenControlX = transform.x + controlX * transform.k;
			const screenControlY = transform.y + controlY * transform.k;
			return [
				{
					id: `${edge.source}-${edge.target}-${index}`,
					path: `M ${screenSourceX} ${screenSourceY} Q ${screenControlX} ${screenControlY} ${screenTargetX} ${screenTargetY}`,
					highlighted: isHighlighted,
				},
			];
		});
	}, [activeNodeId, displayNodeById, graph, transform]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				key={dialogSessionKey}
				className="localNoteGraphDialog"
				showCloseButton
			>
				<DialogHeader className="localNoteGraphHeader">
					<DialogTitle className="localNoteGraphTitle">
						<HugeiconsIcon
							icon={FlowConnectionIcon}
							size={16}
							strokeWidth={0.9}
						/>
						<span>Connected Notes</span>
					</DialogTitle>
				</DialogHeader>

				<div className="localNoteGraphBody">
					{loading ? (
						<div className="localNoteGraphState">Loading note connections…</div>
					) : null}
					{!loading && error ? (
						<div className="localNoteGraphState">
							Could not load graph: {error}
						</div>
					) : null}
					{!loading && !error ? (
						<div
							ref={viewportRef}
							className="localNoteGraphViewport"
							onWheel={handleWheel}
							onPointerDown={handleViewportPointerDown}
							onPointerMove={handleViewportPointerMove}
							onPointerUp={clearPointerState}
							onPointerCancel={clearPointerState}
							onPointerLeave={() => setHoveredNodeId(null)}
						>
							{viewportReady ? (
								<>
									<svg className="localNoteGraphEdges" aria-hidden="true">
										{edgePaths.map((edge) => (
											<path
												key={edge.id}
												d={edge.path}
												className={[
													"localNoteGraphEdge",
													edge.highlighted ? "is-highlighted" : "is-dimmed",
												].join(" ")}
											/>
										))}
									</svg>
									<div className="localNoteGraphNodes">
										{displayNodes.map((node) => {
											const highlighted = isNodeHighlighted(node.id);
											const screenX = transform.x + node.x * transform.k;
											const screenY = transform.y + node.y * transform.k;
											return (
												<button
													key={node.id}
													type="button"
													className={[
														"localNoteGraphNode",
														node.is_center ? "is-center" : "",
														highlighted ? "is-highlighted" : "is-dimmed",
														focusedNodeId === node.id ? "is-focused" : "",
													]
														.filter(Boolean)
														.join(" ")}
													style={{
														left: `${screenX}px`,
														top: `${screenY}px`,
													}}
													onDoubleClick={() => openNode(node.id)}
													onKeyDown={(event) =>
														handleNodeKeyDown(event, node.id)
													}
													onPointerDown={(event) =>
														handleNodePointerDown(event, node.id)
													}
													onPointerUp={(event) =>
														handleNodePointerUp(event, node.id)
													}
													onMouseEnter={() => setHoveredNodeId(node.id)}
													onMouseLeave={() =>
														setHoveredNodeId((current) =>
															current === node.id ? null : current,
														)
													}
													title={node.title || node.id}
												>
													<span
														className="localNoteGraphNodeDot"
														aria-hidden="true"
													/>
													<span className="localNoteGraphNodeLabel">
														{node.title || node.id}
													</span>
												</button>
											);
										})}
									</div>
								</>
							) : null}
							<div className="localNoteGraphLegend">
								<span>{graph?.nodes.length ?? 0} notes</span>
								<span>{graph?.edges.length ?? 0} connections</span>
							</div>
						</div>
					) : null}
				</div>
			</DialogContent>
		</Dialog>
	);
}
