import type {
	ConnectionsGraph,
	ConnectionsGraphVariant,
	ConnectionsSigma,
} from "./connectionsGraph";
import type { ConnectionsFocusState } from "./connectionsTheme";

export interface ConnectionsHover {
	readonly id: string;
	readonly x: number;
	readonly y: number;
	readonly radius: number;
	readonly viewWidth: number;
	readonly viewHeight: number;
}

export interface ConnectionsPointerCallbacks {
	onNoteOpen?: (nodeId: string) => void;
	onTagActivate?: (tagId: string, label: string) => void;
	/** When provided, clicks report here instead of selecting and opening nodes. */
	onNodeClick?: (nodeId: string, modifiers: { shiftKey: boolean; metaKey: boolean }) => void;
	onStageClick?: () => void;
	onNodeHover?: (hover: ConnectionsHover | null) => void;
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

function hoverAt(renderer: ConnectionsSigma, id: string): ConnectionsHover | null {
	const data = renderer.getNodeDisplayData(id);
	if (!data) return null;
	const { x, y } = renderer.framedGraphToViewport(data);
	const { width, height } = renderer.getDimensions();
	return { id, x, y, radius: renderer.scaleSize(data.size), viewWidth: width, viewHeight: height };
}

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
	let hoveredNode: string | null = null;
	const camera = renderer.getCamera();
	const reportHover = () =>
		getCallbacks().onNodeHover?.(hoveredNode ? hoverAt(renderer, hoveredNode) : null);

	renderer.on("enterNode", ({ node }) => {
		hoveredNode = node;
		reportHover();
	});
	renderer.on("leaveNode", () => {
		hoveredNode = null;
		reportHover();
	});
	camera.on("updated", () => {
		if (hoveredNode) reportHover();
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
