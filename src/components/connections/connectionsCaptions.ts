import type { ConnectionsGraph, ConnectionsSigma } from "./connectionsGraph";
import { CONNECTIONS_DIM_WEIGHT, isConnectionsNodeHidden } from "./connectionsReducers";
import { type ConnectionsFocusState, type ConnectionsPalette, mixColors } from "./connectionsTheme";

interface ConnectionsCaptionStyle {
	readonly palette: ConnectionsPalette;
	/** The UI font family; captions read as quiet headings, not code. */
	readonly font: string;
	readonly size: number;
}

interface CaptionBox {
	readonly left: number;
	readonly right: number;
	readonly top: number;
	readonly bottom: number;
}

const CAPTION_HUB_MAX_CHARS = 32;
const CAPTION_TITLE_WEIGHT = "500";
const CAPTION_COUNT_WEIGHT = "400";
const CAPTION_COUNT_GAP_PX = 5;
/** Clear space between the caption and the labels of the cluster's top-most nodes. */
const CAPTION_LIFT_PX = 6;
const CAPTION_PADDING_PX = 4;
/** Upward nudges tried before a colliding caption is skipped. */
const CAPTION_NUDGES = 2;
const MIN_CAPTION_MEMBERS = 3;
/** Average glyph width, in ems, used to reserve node label boxes without measuring each title. */
const LABEL_CHAR_EM = 0.56;
const LABEL_MAX_CHARS = 40;
const HUB_LABEL_SCALE = 1.3;

function overlaps(box: CaptionBox, others: readonly CaptionBox[]) {
	return others.some(
		(other) =>
			box.left < other.right &&
			box.right > other.left &&
			box.top < other.bottom &&
			box.bottom > other.top,
	);
}

function hubTitle(label: string) {
	return label.length > CAPTION_HUB_MAX_CHARS
		? `${label.slice(0, CAPTION_HUB_MAX_CHARS - 1)}…`
		: label;
}

/** Approximate boxes of the node labels sigma drew this frame, so captions can steer clear. */
function nodeLabelBoxes(renderer: ConnectionsSigma, graph: ConnectionsGraph) {
	const labelSize = renderer.getSetting("labelSize");
	const boxes: CaptionBox[] = [];
	for (const id of renderer.getNodeDisplayedLabels()) {
		const data = renderer.getNodeDisplayData(id);
		if (!data?.label || data.hidden) continue;
		const { x, y } = renderer.framedGraphToViewport(data);
		const fontSize =
			graph.getNodeAttribute(id, "rank") === "hub" ? labelSize * HUB_LABEL_SCALE : labelSize;
		const left = x - renderer.scaleSize(data.size);
		const chars = Math.min(LABEL_MAX_CHARS, data.label.length);
		boxes.push({
			left,
			right: x + renderer.scaleSize(data.size) + chars * fontSize * LABEL_CHAR_EM,
			top: y - fontSize * 0.6,
			bottom: y + fontSize * 0.6,
		});
	}
	return boxes;
}

/** Hovered node's cluster, else the selected node's; its caption stays at full ink during focus. */
function focusedCommunity(graph: ConnectionsGraph, focus: ConnectionsFocusState) {
	const id = focus.hoveredNode ?? focus.selectedNodeId;
	return id && graph.hasNode(id) ? graph.getNodeAttribute(id, "community") : null;
}

/**
 * Draws "Hub title  count" centred above each visible cluster's bounding box, largest cluster
 * first. A caption that would cover a node label or another caption is nudged up, then skipped.
 */
export function drawConnectionsCaptions(
	context: CanvasRenderingContext2D,
	renderer: ConnectionsSigma,
	graph: ConnectionsGraph,
	{ palette, font, size }: ConnectionsCaptionStyle,
	focus: ConnectionsFocusState,
) {
	const { width, height } = renderer.getDimensions();
	const labelSize = renderer.getSetting("labelSize");
	const focusing =
		focus.hoverIds !== null || focus.selectedNodeId !== null || focus.pathIds !== null;
	const focused = focusedCommunity(graph, focus);
	const communities = [...graph.getAttribute("communities")].sort(
		(a, b) => b.memberIds.length - a.memberIds.length,
	);
	const placed = nodeLabelBoxes(renderer, graph);
	const titleFont = `${CAPTION_TITLE_WEIGHT} ${size}px ${font}`;
	const countFont = `${CAPTION_COUNT_WEIGHT} ${size}px ${font}`;

	context.save();
	context.textAlign = "left";
	context.textBaseline = "alphabetic";

	for (const community of communities) {
		if (focus.hiddenCommunities.has(community.index) || !graph.hasNode(community.hubId)) continue;
		let top = Number.POSITIVE_INFINITY;
		let minX = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let members = 0;
		let notes = 0;
		for (const id of community.memberIds) {
			if (!graph.hasNode(id)) continue;
			const attributes = graph.getNodeAttributes(id);
			if (isConnectionsNodeHidden(attributes, focus)) continue;
			const point = renderer.graphToViewport(attributes);
			top = Math.min(top, point.y);
			minX = Math.min(minX, point.x);
			maxX = Math.max(maxX, point.x);
			members += 1;
			if (attributes.kind === "note") notes += 1;
		}
		if (members < MIN_CAPTION_MEMBERS) continue;

		const title = hubTitle(graph.getNodeAttribute(community.hubId, "label"));
		const count = String(notes);
		context.font = titleFont;
		const titleWidth = context.measureText(title).width;
		context.font = countFont;
		const textWidth = titleWidth + CAPTION_COUNT_GAP_PX + context.measureText(count).width;
		const left = (minX + maxX) / 2 - textWidth / 2;
		let baseline = top - labelSize / 2 - CAPTION_LIFT_PX;
		let box: CaptionBox | null = null;
		for (let nudge = 0; nudge <= CAPTION_NUDGES && !box; nudge += 1) {
			const candidate = {
				left: left - CAPTION_PADDING_PX,
				right: left + textWidth + CAPTION_PADDING_PX,
				top: baseline - size - CAPTION_PADDING_PX / 2,
				bottom: baseline + CAPTION_PADDING_PX,
			};
			if (overlaps(candidate, placed)) baseline -= size + CAPTION_PADDING_PX;
			else box = candidate;
		}
		if (!box || box.right < 0 || box.left > width || box.bottom < 0 || box.top > height) continue;
		placed.push(box);

		const ink = (color: string) =>
			focusing && focused !== community.index
				? mixColors(color, palette.background, CONNECTIONS_DIM_WEIGHT)
				: color;
		context.font = titleFont;
		context.fillStyle = ink(palette.textSecondary);
		context.fillText(title, left, baseline);
		context.font = countFont;
		context.fillStyle = ink(palette.textTertiary);
		context.fillText(count, left + titleWidth + CAPTION_COUNT_GAP_PX, baseline);
	}
	context.restore();
}
