import { LoaderCircle, Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSpace } from "../../contexts";
import type { SpaceGraph, SpaceGraphNode } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { dispatchWikiLinkClick } from "../editor/markdown/editorEvents";
import { Button } from "../ui/shadcn/button";
import {
	applyGraphTheme,
	graphLayoutSpacing,
	graphStylesForContainer,
	highlightNeighborhood,
	registerFcose,
	runGraphLayout,
} from "./graphTheme";

const DEFAULT_SPACE_GRAPH_NODES = 1000;
const FULL_SPACE_GRAPH_NODES = 10_000;
const MAX_SPACE_GRAPH_TAGS = 250;
const LARGE_GRAPH_LAYOUT_THRESHOLD = 2400;
const SATELLITE_GAP = 130;
const SATELLITE_SPACING = 44;
const GRAPH_LAYOUT_CACHE_PREFIX = "glyph.spaceGraph.layout:";
const GRAPH_LAYOUT_CACHE_VERSION = 1;
const GRAPH_LAYOUT_ALGORITHM = "organic-cloud-v2";
const MIN_NOTE_NODE_SIZE = 10;
const MAX_NOTE_NODE_SIZE = 34;
const MIN_TAG_NODE_SIZE = 14;
const MAX_TAG_NODE_SIZE = 30;

interface GraphPosition {
	x: number;
	y: number;
}

interface CachedGraphLayout {
	version: number;
	signature: string;
	positions: Record<string, GraphPosition>;
}

function noteNodeClasses(node: SpaceGraphNode) {
	const weight = node.link_count + node.tag_count;
	const classes = [];
	if (node.is_isolated) {
		classes.push("isolated");
	} else if (weight >= 10) {
		classes.push("hub-strong");
	} else if (weight >= 5) {
		classes.push("hub");
	} else if (weight >= 2) {
		classes.push("connected");
	}
	return classes.join(" ");
}

function scaledNodeSize(weight: number, minSize: number, maxSize: number) {
	if (weight <= 0) return minSize;
	const normalized = Math.min(Math.log1p(weight) / Math.log1p(40), 1);
	return Math.round(minSize + normalized * (maxSize - minSize));
}

function graphElements(
	graph: SpaceGraph,
	positions?: Record<string, GraphPosition>,
): ElementDefinition[] {
	return [
		...graph.nodes.map((node) => {
			const position = positions?.[node.id];
			return {
				data: {
					id: node.id,
					label: node.title || node.id,
					linkCount: node.link_count,
					size: scaledNodeSize(
						node.link_count * 2 + node.tag_count,
						MIN_NOTE_NODE_SIZE,
						MAX_NOTE_NODE_SIZE,
					),
					tagCount: node.tag_count,
				},
				...(position ? { position } : {}),
				classes: noteNodeClasses(node),
				grabbable: true,
			};
		}),
		...graph.tags.map((tag) => {
			const position = positions?.[tag.id];
			return {
				data: {
					id: tag.id,
					label: tag.title,
					noteCount: tag.note_count,
					size: scaledNodeSize(
						tag.note_count,
						MIN_TAG_NODE_SIZE,
						MAX_TAG_NODE_SIZE,
					),
					tag: tag.tag,
				},
				...(position ? { position } : {}),
				classes: tag.note_count >= 8 ? "tag tag-strong" : "tag",
				grabbable: true,
			};
		}),
		...graph.edges.map((edge, index) => ({
			data: {
				id: `${edge.kind}:${edge.from_id}->${edge.to_id}:${index}`,
				source: edge.from_id,
				target: edge.to_id,
			},
			classes: edge.kind,
		})),
		...graph.tag_edges.map((edge, index) => ({
			data: {
				id: `tag:${edge.tag_id}->${edge.note_id}:${index}`,
				source: edge.tag_id,
				target: edge.note_id,
			},
			classes: "tag-link",
		})),
	];
}

function hashString(value: string) {
	let hash = 5381;
	for (const char of value) {
		hash = (hash * 33) ^ char.charCodeAt(0);
	}
	return (hash >>> 0).toString(36);
}

function graphSignature(graph: SpaceGraph) {
	const source = [
		graph.total_notes,
		GRAPH_LAYOUT_ALGORITHM,
		graph.nodes.length,
		graph.tags.length,
		graph.edges.length,
		graph.tag_edges.length,
		...graph.nodes.map((node) => node.id),
		...graph.tags.map((tag) => tag.id),
		...graph.edges.map((edge) => `${edge.kind}:${edge.from_id}->${edge.to_id}`),
		...graph.tag_edges.map((edge) => `${edge.tag_id}->${edge.note_id}`),
	].join("\n");
	return hashString(source);
}

function graphLayoutCacheKey(spacePath: string | null) {
	return `${GRAPH_LAYOUT_CACHE_PREFIX}${spacePath ?? "no-space"}`;
}

function isGraphPosition(value: unknown): value is GraphPosition {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<PropertyKey, unknown>;
	return typeof record.x === "number" && typeof record.y === "number";
}

function readGraphLayoutCache(
	spacePath: string | null,
	signature: string,
): CachedGraphLayout | null {
	try {
		const raw = window.sessionStorage.getItem(graphLayoutCacheKey(spacePath));
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return null;
		const record = parsed as Record<PropertyKey, unknown>;
		if (
			record.version !== GRAPH_LAYOUT_CACHE_VERSION ||
			record.signature !== signature ||
			!record.positions
		) {
			return null;
		}
		if (typeof record.positions !== "object") return null;

		const positions: Record<string, GraphPosition> = {};
		for (const [id, position] of Object.entries(record.positions)) {
			if (isGraphPosition(position)) {
				positions[id] = { x: position.x, y: position.y };
			}
		}
		if (Object.keys(positions).length === 0) return null;
		return { version: GRAPH_LAYOUT_CACHE_VERSION, signature, positions };
	} catch {
		return null;
	}
}

function clearPersistentGraphLayoutCaches() {
	try {
		const keys: string[] = [];
		for (let index = 0; index < window.localStorage.length; index += 1) {
			const key = window.localStorage.key(index);
			if (!key) continue;
			if (key.startsWith(GRAPH_LAYOUT_CACHE_PREFIX)) {
				keys.push(key);
			}
		}
		for (const key of keys) {
			window.localStorage.removeItem(key);
		}
	} catch {
		// Old persistent cache cleanup is best-effort.
	}
}

function writeGraphLayoutCache(
	spacePath: string | null,
	signature: string,
	cy: Core,
) {
	try {
		const positions: Record<string, GraphPosition> = {};
		for (const node of cy.nodes()) {
			const position = node.position();
			positions[node.id()] = { x: position.x, y: position.y };
		}
		window.sessionStorage.setItem(
			graphLayoutCacheKey(spacePath),
			JSON.stringify({
				version: GRAPH_LAYOUT_CACHE_VERSION,
				signature,
				positions,
			} satisfies CachedGraphLayout),
		);
	} catch {
		// Cache writes are best-effort; rendering should never depend on storage.
	}
}

function openNote(nodeId: string) {
	dispatchWikiLinkClick({
		raw: `[[${nodeId}]]`,
		target: nodeId,
		alias: null,
		anchorKind: "none",
		anchor: null,
		unresolved: false,
	});
}

function scatterSatelliteNodes(cy: Core) {
	const satelliteNodes = cy.nodes(".isolated, .tag");
	if (satelliteNodes.length === 0) return;

	const anchoredNodes = cy.nodes().not(".isolated, .tag");
	const bounds = (
		anchoredNodes.length > 0 ? anchoredNodes : cy.nodes()
	).boundingBox();
	const center = {
		x: bounds.x1 + bounds.w / 2,
		y: bounds.y1 + bounds.h / 2,
	};
	const baseRadius = Math.max(bounds.w, bounds.h) / 2 + SATELLITE_GAP;
	const goldenAngle = Math.PI * (3 - Math.sqrt(5));

	satelliteNodes.forEach((node, index) => {
		const radius =
			baseRadius + Math.sqrt(index) * SATELLITE_SPACING + (index % 5) * 7;
		const angle = index * goldenAngle + (node.hasClass("tag") ? 0.45 : 0);
		const xJitter = ((index * 37) % 29) - 14;
		const yJitter = ((index * 53) % 31) - 15;

		node.position({
			x: center.x + Math.cos(angle) * radius + xJitter,
			y: center.y + Math.sin(angle) * radius + yJitter,
		});
	});
}

function organicizeNoteCloud(cy: Core) {
	const noteNodes = cy.nodes().not(".isolated, .tag");
	if (noteNodes.length === 0) return;

	const bounds = noteNodes.boundingBox();
	const center = {
		x: bounds.x1 + bounds.w / 2,
		y: bounds.y1 + bounds.h / 2,
	};
	const goldenAngle = Math.PI * (3 - Math.sqrt(5));
	const sortedNodes = [...noteNodes].sort((left, right) => {
		const leftWeight =
			Number(left.data("linkCount") ?? 0) + Number(left.data("tagCount") ?? 0);
		const rightWeight =
			Number(right.data("linkCount") ?? 0) +
			Number(right.data("tagCount") ?? 0);
		return rightWeight - leftWeight || left.id().localeCompare(right.id());
	});
	const maxRadius = Math.max(360, Math.sqrt(sortedNodes.length) * 34);
	const xScale = 1.22;
	const yScale = 0.86;

	for (const [index, node] of sortedNodes.entries()) {
		const seed = Number.parseInt(hashString(node.id()), 36);
		const progress =
			sortedNodes.length <= 1 ? 0 : index / (sortedNodes.length - 1);
		const angle = index * goldenAngle + (seed % 23) * 0.021;
		const radius =
			Math.sqrt(progress) * maxRadius +
			Math.sin(index * 0.19 + (seed % 13)) * 22;
		const xJitter = ((seed * 37) % 61) - 30;
		const yJitter = ((seed * 53) % 57) - 28;

		node.position({
			x: center.x + Math.cos(angle) * radius * xScale + xJitter,
			y: center.y + Math.sin(angle) * radius * yScale + yJitter,
		});
	}
}

function graphProgressMessage(graph: SpaceGraph | null, loading: boolean) {
	if (loading) return "Loading notes and links…";
	if (!graph) return "Laying out graph…";
	if (graph.truncated) {
		return `Laying out top ${graph.nodes.length} of ${graph.total_notes} notes…`;
	}
	return "Laying out graph…";
}

function GraphProgressOverlay({
	graph,
	loading,
	progress,
	usingCachedLayout,
}: {
	graph: SpaceGraph | null;
	loading: boolean;
	progress: number;
	usingCachedLayout: boolean;
}) {
	const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)));
	const message = usingCachedLayout
		? "Restoring cached layout…"
		: graphProgressMessage(graph, loading);

	return (
		<div
			className="spaceGraphProgressOverlay"
			aria-live="polite"
			aria-busy="true"
		>
			<div className="spaceGraphProgressCard">
				<div className="spaceGraphProgressHeader">
					<HugeiconsIcon
						icon={LoaderCircle}
						className="spaceGraphProgressSpinner animate-spin"
						size="var(--icon-sm)"
						strokeWidth={0.9}
					/>
					<p className="spaceGraphProgressMessage">{message}</p>
				</div>
				<div className="spaceGraphProgressBarRow">
					<progress
						className="spaceGraphProgressTrack"
						aria-label="Graph generation progress"
						max={100}
						value={clampedProgress}
					/>
					<span className="spaceGraphProgressPercent">{clampedProgress}%</span>
				</div>
			</div>
		</div>
	);
}

function fullGraphNoteCountLabel(totalNotes: number) {
	if (totalNotes > FULL_SPACE_GRAPH_NODES) {
		return `the top ${FULL_SPACE_GRAPH_NODES.toLocaleString()} of ${totalNotes.toLocaleString()} notes`;
	}
	return `${totalNotes.toLocaleString()} notes`;
}

export function SpaceGraphView() {
	const { spacePath } = useSpace();
	const [graph, setGraph] = useState<SpaceGraph | null>(null);
	const [loading, setLoading] = useState(true);
	const [generating, setGenerating] = useState(false);
	const [generationProgress, setGenerationProgress] = useState(0);
	const [error, setError] = useState("");
	const [maxNodes, setMaxNodes] = useState(DEFAULT_SPACE_GRAPH_NODES);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const cyRef = useRef<Core | null>(null);
	const loadGraphCleanupRef = useRef<(() => void) | null>(null);
	const signature = useMemo(
		() => (graph ? graphSignature(graph) : ""),
		[graph],
	);
	const cachedLayout = useMemo(
		() => (signature ? readGraphLayoutCache(spacePath, signature) : null),
		[signature, spacePath],
	);
	const usingCachedLayout = Boolean(cachedLayout);

	useEffect(() => {
		clearPersistentGraphLayoutCaches();
	}, []);

	const loadGraph = useCallback(() => {
		loadGraphCleanupRef.current?.();
		let cancelled = false;
		setLoading(true);
		setGenerating(false);
		setGenerationProgress(8);
		setError("");
		const cleanup = () => {
			cancelled = true;
		};
		loadGraphCleanupRef.current = cleanup;
		void invoke("space_graph", {
			max_nodes: maxNodes,
			max_tags: MAX_SPACE_GRAPH_TAGS,
		})
			.then((nextGraph) => {
				if (cancelled) return;
				setGraph(nextGraph);
				setGenerationProgress(nextGraph.nodes.length > 0 ? 40 : 100);
				setGenerating(nextGraph.nodes.length > 0);
			})
			.catch((cause) => {
				if (cancelled) return;
				setGraph(null);
				setGenerating(false);
				setGenerationProgress(0);
				setError(cause instanceof Error ? cause.message : String(cause));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
				if (loadGraphCleanupRef.current === cleanup) {
					loadGraphCleanupRef.current = null;
				}
			});
		return cleanup;
	}, [maxNodes]);

	useEffect(() => loadGraph(), [loadGraph]);

	const handleLoadFullGraph = useCallback(async () => {
		if (!graph) return;
		const { confirm } = await import("@tauri-apps/plugin-dialog");
		const noteCountLabel = fullGraphNoteCountLabel(graph.total_notes);
		const confirmed = await confirm(
			`This will render ${noteCountLabel} at once. Large graphs can use a lot of memory and may make Glyph slow or temporarily unresponsive.`,
			{
				title: "Load the full graph?",
				okLabel: "Load full graph",
				cancelLabel: "Cancel",
			},
		);
		if (!confirmed) return;
		setMaxNodes(FULL_SPACE_GRAPH_NODES);
	}, [graph]);

	useEffect(() => {
		if (!loading && !generating) return;
		const ceiling = loading ? 35 : 92;
		const interval = window.setInterval(() => {
			setGenerationProgress((current) => {
				if (current >= ceiling) return current;
				const increment = loading ? 3 : 1;
				return Math.min(ceiling, current + increment);
			});
		}, 180);
		return () => window.clearInterval(interval);
	}, [generating, loading]);

	useEffect(() => {
		if (!graph || loading || error || graph.nodes.length === 0) return;
		const container = containerRef.current;
		if (!container) return;
		let disposed = false;
		let completeTimer: number | null = null;
		const visibleNodeCount = graph.nodes.length + graph.tags.length;
		const layoutMode = cachedLayout
			? "preset"
			: visibleNodeCount >= LARGE_GRAPH_LAYOUT_THRESHOLD
				? "random"
				: "fcose";

		if (layoutMode === "fcose") {
			registerFcose();
		}
		setGenerating(true);
		setGenerationProgress((current) =>
			Math.max(current, cachedLayout ? 88 : 55),
		);

		const cy = cytoscape({
			boxSelectionEnabled: false,
			container,
			elements: graphElements(graph, cachedLayout?.positions),
			layout: { name: "preset" },
			maxZoom: 2.1,
			minZoom: 0.18,
			style: graphStylesForContainer(container),
			userZoomingEnabled: true,
			wheelSensitivity: 0.16,
		});
		cyRef.current = cy;
		runGraphLayout(cy, {
			mode: layoutMode,
			afterLayout: () => {
				if (!cachedLayout) {
					organicizeNoteCloud(cy);
					scatterSatelliteNodes(cy);
				}
				writeGraphLayoutCache(spacePath, signature, cy);
				if (!disposed) {
					setGenerationProgress(100);
					completeTimer = window.setTimeout(() => {
						if (!disposed) setGenerating(false);
					}, 160);
				}
			},
		});

		cy.on("mouseover", "node", (event) => {
			event.target.addClass("hover-label show-label");
			highlightNeighborhood(cy, event.target.id());
		});
		cy.on("mouseout", "node", (event) => {
			event.target.removeClass("hover-label");
			if (!event.target.hasClass("zoom-label")) {
				event.target.removeClass("show-label");
			}
			highlightNeighborhood(cy, null);
		});
		cy.on("dragfree", "node", () => {
			writeGraphLayoutCache(spacePath, signature, cy);
		});
		cy.on("tap", "node", (event) => {
			if (event.target.hasClass("tag")) {
				highlightNeighborhood(cy, event.target.id());
				return;
			}
			openNote(event.target.id());
		});
		cy.on("tap", (event) => {
			if (event.target === cy) {
				highlightNeighborhood(cy, null);
			}
		});

		const observer = new ResizeObserver(() => {
			cy.resize();
			cy.fit(undefined, graphLayoutSpacing(cy).padding);
		});
		observer.observe(container);

		const themeObserver = new MutationObserver(() => {
			applyGraphTheme(cy, container);
		});
		themeObserver.observe(document.documentElement, {
			attributeFilter: [
				"class",
				"data-light-theme",
				"data-dark-theme",
				"style",
			],
			attributes: true,
		});

		return () => {
			disposed = true;
			if (completeTimer !== null) {
				window.clearTimeout(completeTimer);
			}
			themeObserver.disconnect();
			observer.disconnect();
			cy.destroy();
			cyRef.current = null;
		};
	}, [cachedLayout, error, graph, loading, signature, spacePath]);

	if (loading) {
		return (
			<section className="spaceGraphHost relative h-full min-h-0 flex-1 overflow-hidden">
				<div
					className="localNoteGraphViewport absolute inset-0"
					aria-hidden="true"
				/>
				<GraphProgressOverlay
					graph={graph}
					loading={loading}
					progress={generationProgress}
					usingCachedLayout={usingCachedLayout}
				/>
			</section>
		);
	}

	if (error) {
		return (
			<div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
				<div className="flex max-w-md flex-col items-center gap-3 text-center">
					<p className="text-sm text-muted-foreground">
						Could not load the graph: {error}
					</p>
					<Button
						type="button"
						size="sm"
						onClick={() => {
							loadGraph();
						}}
					>
						<HugeiconsIcon
							icon={Refresh01Icon}
							data-icon="inline-start"
							size="var(--icon-md)"
							strokeWidth={0.9}
						/>
						Retry
					</Button>
				</div>
			</div>
		);
	}

	if (!graph || graph.nodes.length === 0) {
		return (
			<div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
				<p className="text-sm text-muted-foreground">
					No notes in this space yet.
				</p>
			</div>
		);
	}

	return (
		<section className="spaceGraphHost relative h-full min-h-0 flex-1 overflow-hidden">
			<div
				ref={containerRef}
				className="localNoteGraphViewport absolute inset-0"
				aria-label="Space graph"
			/>
			{graph.truncated && maxNodes < FULL_SPACE_GRAPH_NODES ? (
				<div className="absolute right-4 bottom-4">
					<Button
						type="button"
						className="spaceGraphLoadFullButton"
						size="xs"
						onClick={() => {
							void handleLoadFullGraph();
						}}
					>
						Load full graph
					</Button>
				</div>
			) : null}
			{graph.truncated && maxNodes >= FULL_SPACE_GRAPH_NODES ? (
				<div className="absolute right-4 top-4 rounded-md border border-border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur">
					Showing top {graph.nodes.length} of {graph.total_notes} notes
				</div>
			) : null}
			{generating ? (
				<GraphProgressOverlay
					graph={graph}
					loading={loading}
					progress={generationProgress}
					usingCachedLayout={usingCachedLayout}
				/>
			) : null}
		</section>
	);
}
