import type {
	ConnectionsGraph,
	ConnectionsGraphVariant,
	ConnectionsSigma,
} from "./connectionsGraph";
import type { ConnectionsFocusState } from "./connectionsTheme";

export interface ConnectionsPointerCallbacks {
	onNoteOpen?: (nodeId: string) => void;
	onTagActivate?: (tagId: string, label: string) => void;
	/** When provided, clicks report here instead of selecting and opening nodes. */
	onNodeClick?: (nodeId: string, modifiers: { shiftKey: boolean; metaKey: boolean }) => void;
	onStageClick?: () => void;
	/** Camera zoom as a percent of the fitted view (fit = 100). */
	onZoomChange?: (percent: number) => void;
}

interface ConnectionsPointerOptions {
	readonly renderer: ConnectionsSigma;
	readonly graph: ConnectionsGraph;
	readonly variant: ConnectionsGraphVariant;
	readonly focus: ConnectionsFocusState;
	readonly refresh: () => void;
	readonly getCallbacks: () => ConnectionsPointerCallbacks;
}

/**
 * Hover focuses a node's neighbourhood. Without `onNodeClick`, the first click selects and a second
 * click opens; local-graph nodes other than the centre can also be dragged.
 */
export function bindConnectionsPointer({
	renderer,
	graph,
	variant,
	focus,
	refresh,
	getCallbacks,
}: ConnectionsPointerOptions) {
	let draggedNode: string | null = null;
	let didDrag = false;
	const camera = renderer.getCamera();

	renderer.on("enterNode", ({ node }) => {
		focus.hoveredNode = node;
		focus.hoverIds = new Set([node, ...graph.neighbors(node)]);
		refresh();
	});
	renderer.on("leaveNode", () => {
		focus.hoveredNode = null;
		focus.hoverIds = null;
		refresh();
	});
	renderer.on("clickNode", ({ node, event }) => {
		if (didDrag) return;
		const { onNodeClick, onNoteOpen, onTagActivate } = getCallbacks();
		if (onNodeClick) {
			const { shiftKey, metaKey } = event.original;
			onNodeClick(node, { shiftKey, metaKey });
			return;
		}
		if (focus.selectedNodeId !== node) {
			focus.selectedNodeId = node;
			refresh();
			return;
		}
		const attributes = graph.getNodeAttributes(node);
		if (attributes.kind === "tag") onTagActivate?.(node, attributes.label);
		else onNoteOpen?.(node);
	});
	renderer.on("clickStage", () => {
		const { onStageClick } = getCallbacks();
		if (onStageClick) {
			onStageClick();
			return;
		}
		focus.selectedNodeId = null;
		refresh();
	});

	renderer.on("downNode", ({ node }) => {
		didDrag = false;
		if (variant === "space" || graph.getNodeAttribute(node, "isCenter")) return;
		draggedNode = node;
		camera.disable();
	});
	const mouseCaptor = renderer.getMouseCaptor();
	mouseCaptor.on("mousemovebody", (coords) => {
		if (!draggedNode) return;
		didDrag = true;
		const position = renderer.viewportToGraph(coords);
		graph.setNodeAttribute(draggedNode, "x", position.x);
		graph.setNodeAttribute(draggedNode, "y", position.y);
	});
	mouseCaptor.on("mouseup", () => {
		if (!draggedNode) return;
		draggedNode = null;
		camera.enable();
	});
}
