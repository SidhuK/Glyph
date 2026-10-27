import type { Coordinates, Dimensions } from "sigma/types";
import { CONNECTIONS_RING_RADIUS } from "./connectionsCommunityPlacement";
import { SPACE_GRAPH_EDGE_PADDING_PX } from "./connectionsDensity";
import type { ConnectionsGraph, ConnectionsSigma } from "./connectionsGraph";
import type { ConnectionsPalette } from "./connectionsTheme";

const ARC_GAP_PX = 5;
const ARC_WIDTH_PX = 3;
const LABEL_GAP_PX = 6;
const ARC_SAMPLE_STEP = Math.PI / 90;
const ARC_ALPHA = 0.9;

/** Viewport-space ring measurements shared by community arcs and ring labels. */
export interface ConnectionsRingGeometry {
	readonly center: Coordinates;
	readonly arcRadius: number;
	readonly labelRadius: number;
}

/**
 * `maxNodeSize` is the largest rendered node size in graph units, so arcs and labels
 * clear every node regardless of the node-size setting.
 */
export function connectionsRingGeometry(
	renderer: ConnectionsSigma,
	maxNodeSize: number,
): ConnectionsRingGeometry {
	const center = renderer.graphToViewport({ x: 0, y: 0 });
	const rim = renderer.graphToViewport({ x: CONNECTIONS_RING_RADIUS, y: 0 });
	const ringRadius = Math.hypot(rim.x - center.x, rim.y - center.y);
	const arcRadius = ringRadius + renderer.scaleSize(maxNodeSize) + ARC_GAP_PX;
	return { center, arcRadius, labelRadius: arcRadius + ARC_WIDTH_PX / 2 + LABEL_GAP_PX };
}

export function pointOnArc(
	renderer: ConnectionsSigma,
	{ center, arcRadius }: ConnectionsRingGeometry,
	angle: number,
): Coordinates {
	// Map through graph space so camera rotation and the y-up flip are respected.
	const point = renderer.graphToViewport({
		x: Math.cos(angle) * CONNECTIONS_RING_RADIUS,
		y: Math.sin(angle) * CONNECTIONS_RING_RADIUS,
	});
	const radius = Math.hypot(point.x - center.x, point.y - center.y) || 1;
	return {
		x: center.x + ((point.x - center.x) / radius) * arcRadius,
		y: center.y + ((point.y - center.y) / radius) * arcRadius,
	};
}

export function drawConnectionsCommunityArcs(
	context: CanvasRenderingContext2D,
	renderer: ConnectionsSigma,
	graph: ConnectionsGraph,
	palette: ConnectionsPalette,
	geometry: ConnectionsRingGeometry,
) {
	context.save();
	context.lineWidth = ARC_WIDTH_PX;
	context.lineCap = "round";
	context.globalAlpha = ARC_ALPHA;
	for (const community of graph.getAttribute("communities")) {
		if (community.kind !== "cluster" || community.tone.kind !== "hue") continue;
		const span = community.endAngle - community.startAngle;
		const steps = Math.max(2, Math.ceil(span / ARC_SAMPLE_STEP));
		context.strokeStyle = palette.communities[community.tone.hue];
		context.beginPath();
		for (let step = 0; step <= steps; step += 1) {
			const point = pointOnArc(renderer, geometry, community.startAngle + (span * step) / steps);
			if (step === 0) context.moveTo(point.x, point.y);
			else context.lineTo(point.x, point.y);
		}
		context.stroke();
	}
	context.restore();
}

const LABEL_EDGE_MARGIN_PX = SPACE_GRAPH_EDGE_PADDING_PX;
/** Resting ring labels longer than this many characters are truncated; hovering shows the full title. */
export const RING_LABEL_MAX_CHARS = 22;
/** Clear room between neighbouring labels; a label that would sit closer is skipped, so dense runs never stack into a list. */
const LABEL_COLLISION_PAD_PX = { x: 8, y: 6 } as const;
/** Density labels keep this much clear room around hub labels so each hub reads as its arc's title. */
const HUB_LABEL_CLEARANCE_PX = { x: 16, y: 22 } as const;
const LABEL_MAX_PUSH_PX = 48;

interface LabelBox {
	readonly left: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
}

/** A horizontal label parked just outside the ring, never crossing the community arcs. */
export interface ConnectionsRingLabel {
	readonly text: string;
	/** Left edge and vertical middle of the text. */
	readonly x: number;
	readonly y: number;
	readonly box: LabelBox;
}

/** One render's ring geometry plus the label boxes already claimed in it. */
export interface ConnectionsRingFrame {
	readonly ring: ConnectionsRingGeometry;
	readonly viewport: Dimensions;
	/**
	 * The hovered or selected node and cluster hub labels reserve their boxes up front so density
	 * labels never cover them; the focused label wins over hubs.
	 */
	readonly reserved: ReadonlyMap<string, LabelBox>;
	readonly placed: LabelBox[];
}

function truncateToChars(text: string, maxChars: number | null) {
	if (maxChars === null) return text;
	const characters = Array.from(text);
	if (characters.length <= maxChars) return text;
	return `${characters
		.slice(0, maxChars - 1)
		.join("")
		.trimEnd()}…`;
}

/** Shortens text with an ellipsis so it fits maxWidth; returns "" when even one character won't fit. */
function truncateToWidth(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
	if (context.measureText(text).width <= maxWidth) return text;
	let end = text.length - 1;
	while (end > 0 && context.measureText(`${text.slice(0, end).trimEnd()}…`).width > maxWidth)
		end -= 1;
	return end > 0 ? `${text.slice(0, end).trimEnd()}…` : "";
}

function boxBeyond(
	anchor: Coordinates,
	cos: number,
	sin: number,
	width: number,
	height: number,
	push: number,
): LabelBox {
	const centerX = anchor.x + cos * (width / 2 + push);
	const centerY = anchor.y + sin * (height / 2 + push);
	return {
		left: centerX - width / 2,
		top: centerY - height / 2,
		right: centerX + width / 2,
		bottom: centerY + height / 2,
	};
}

function distanceToBox(point: Coordinates, box: LabelBox) {
	const x = Math.min(Math.max(point.x, box.left), box.right);
	const y = Math.min(Math.max(point.y, box.top), box.bottom);
	return Math.hypot(x - point.x, y - point.y);
}

function overlaps(
	a: LabelBox,
	b: LabelBox,
	padX: number = LABEL_COLLISION_PAD_PX.x,
	padY: number = LABEL_COLLISION_PAD_PX.y,
) {
	return (
		a.left < b.right + padX &&
		b.left < a.right + padX &&
		a.top < b.bottom + padY &&
		b.top < a.bottom + padY
	);
}

/**
 * Places `text` horizontally outside the ring at the node's angle: right of the ring it reads
 * from the arc outward, left of it it ends at the arc, and at the top and bottom it centers.
 * Text is cut to `maxChars` (null keeps it whole) and then to the viewport padding; returns null
 * when nothing fits.
 */
export function placeRingLabel(
	context: CanvasRenderingContext2D,
	ring: ConnectionsRingGeometry,
	viewport: Dimensions,
	point: Coordinates,
	text: string,
	fontSize: number,
	maxChars: number | null = RING_LABEL_MAX_CHARS,
): ConnectionsRingLabel | null {
	const angle = Math.atan2(point.y - ring.center.y, point.x - ring.center.x);
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const anchor = {
		x: ring.center.x + cos * ring.labelRadius,
		y: ring.center.y + sin * ring.labelRadius,
	};
	const capped = truncateToChars(text, maxChars);
	let maxWidth = context.measureText(capped).width;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const fitted = truncateToWidth(context, capped, maxWidth);
		if (!fitted) return null;
		const width = context.measureText(fitted).width;
		let push = 0;
		let box = boxBeyond(anchor, cos, sin, width, fontSize, push);
		while (push < LABEL_MAX_PUSH_PX && distanceToBox(ring.center, box) < ring.labelRadius) {
			push += 1;
			box = boxBeyond(anchor, cos, sin, width, fontSize, push);
		}
		if (box.top < LABEL_EDGE_MARGIN_PX || box.bottom > viewport.height - LABEL_EDGE_MARGIN_PX)
			return null;
		const overflow = Math.max(
			LABEL_EDGE_MARGIN_PX - box.left,
			box.right - (viewport.width - LABEL_EDGE_MARGIN_PX),
		);
		if (overflow <= 0) return { text: fitted, x: box.left, y: (box.top + box.bottom) / 2, box };
		maxWidth = width - overflow;
	}
	return null;
}

/** Claims the label's box for this frame; false when it would collide with an earlier label. */
export function claimRingLabel(
	frame: ConnectionsRingFrame,
	nodeId: string | null,
	label: ConnectionsRingLabel,
) {
	for (const [hubId, box] of frame.reserved) {
		if (hubId === nodeId) continue;
		if (overlaps(label.box, box, HUB_LABEL_CLEARANCE_PX.x, HUB_LABEL_CLEARANCE_PX.y)) return false;
	}
	if (frame.placed.some((box) => overlaps(label.box, box))) return false;
	frame.placed.push(label.box);
	return true;
}

interface RingFrameOptions {
	readonly maxNodeSize: number;
	readonly fontSize: number;
	/** Resting label font; the focused label is measured in `focusFont`. */
	readonly font: string;
	readonly focusFont: string;
	readonly focusId: string | null;
	readonly hubIds: readonly string[];
}

export function connectionsRingFrame(
	renderer: ConnectionsSigma,
	graph: ConnectionsGraph,
	context: CanvasRenderingContext2D,
	{ maxNodeSize, fontSize, font, focusFont, focusId, hubIds }: RingFrameOptions,
): ConnectionsRingFrame {
	const ring = connectionsRingGeometry(renderer, maxNodeSize);
	const viewport = renderer.getDimensions();
	const reserved = new Map<string, LabelBox>();
	if (focusId && graph.hasNode(focusId)) {
		const attributes = graph.getNodeAttributes(focusId);
		context.font = focusFont;
		const point = renderer.graphToViewport(attributes);
		const label = placeRingLabel(context, ring, viewport, point, attributes.label, fontSize, null);
		if (label) reserved.set(focusId, label.box);
	}
	context.font = font;
	for (const id of hubIds) {
		if (reserved.has(id)) continue;
		const attributes = graph.getNodeAttributes(id);
		const point = renderer.graphToViewport(attributes);
		const label = placeRingLabel(context, ring, viewport, point, attributes.label, fontSize);
		if (!label || [...reserved.values()].some((box) => overlaps(box, label.box))) continue;
		reserved.set(id, label.box);
	}
	return { ring, viewport, reserved, placed: [] };
}
