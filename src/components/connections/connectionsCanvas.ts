import type { NodeHoverDrawingFunction, NodeLabelDrawingFunction } from "sigma/rendering";
import type { Coordinates, EdgeDisplayData } from "sigma/types";
import type {
	ConnectionsEdgeAttributes,
	ConnectionsGraph,
	ConnectionsGraphVariant,
	ConnectionsNodeAttributes,
	ConnectionsSigma,
} from "./connectionsGraph";
import {
	type ConnectionsRingFrame,
	RING_LABEL_MAX_CHARS,
	claimRingLabel,
	placeRingLabel,
} from "./connectionsRing";
import { type ConnectionsPalette, FOCUS_LABEL_WEIGHT } from "./connectionsTheme";

type NodeLabelData = Parameters<
	NodeLabelDrawingFunction<ConnectionsNodeAttributes, ConnectionsEdgeAttributes>
>[1];
type NodeLabelSettings = Parameters<
	NodeLabelDrawingFunction<ConnectionsNodeAttributes, ConnectionsEdgeAttributes>
>[2];
type NodeHoverData = Parameters<
	NodeHoverDrawingFunction<ConnectionsNodeAttributes, ConnectionsEdgeAttributes>
>[1];

const TRANSPARENT = "rgba(0, 0, 0, 0)";
/** Edges inside one community bow inward only slightly, hugging the ring. */
const INTRA_COMMUNITY_PULL = 0.8;

interface BundledEdgesDrawingOptions {
	readonly canvas: HTMLCanvasElement;
	readonly context: CanvasRenderingContext2D;
	readonly renderer: ConnectionsSigma;
	readonly graph: ConnectionsGraph;
	readonly bundling: number;
	readonly resolveStyle: (
		edge: string,
		data: ConnectionsEdgeAttributes,
		source: string,
		target: string,
	) => Partial<EdgeDisplayData>;
}

interface BundledNodePoints {
	readonly node: Coordinates;
	/** Control point for edges leaving this node's community. */
	readonly outer: Coordinates;
	/** Control point for edges staying inside this node's community. */
	readonly inner: Coordinates;
	readonly community: number | null;
}

interface ResolvedEdge {
	readonly style: Partial<EdgeDisplayData>;
	readonly fallbackColor: string;
	readonly fallbackSize: number;
	readonly source: BundledNodePoints;
	readonly target: BundledNodePoints;
}

function lerpPoint(from: Coordinates, to: Coordinates, amount: number): Coordinates {
	return { x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount };
}

function strokeBundledEdge(
	context: CanvasRenderingContext2D,
	{ style, fallbackColor, fallbackSize, source, target }: ResolvedEdge,
) {
	const sameCommunity = source.community !== null && source.community === target.community;
	const sourceControl = sameCommunity ? source.inner : source.outer;
	const targetControl = sameCommunity ? target.inner : target.outer;
	context.strokeStyle = style.color ?? fallbackColor;
	context.lineWidth = Math.max(0.35, style.size ?? fallbackSize);
	context.beginPath();
	context.moveTo(source.node.x, source.node.y);
	context.bezierCurveTo(
		sourceControl.x,
		sourceControl.y,
		targetControl.x,
		targetControl.y,
		target.node.x,
		target.node.y,
	);
	context.stroke();
}

export function drawBundledConnectionsEdges({
	canvas,
	context,
	renderer,
	graph,
	bundling,
	resolveStyle,
}: BundledEdgesDrawingOptions) {
	const { width, height } = renderer.getDimensions();
	const { pixelRatio } = renderer.getRenderParams();
	const renderWidth = Math.max(1, Math.round(width * pixelRatio));
	const renderHeight = Math.max(1, Math.round(height * pixelRatio));
	const cssWidth = `${width}px`;
	const cssHeight = `${height}px`;
	if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
	if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;
	if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
		canvas.width = renderWidth;
		canvas.height = renderHeight;
	}

	context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
	context.clearRect(0, 0, width, height);

	const mouse = renderer.getMouseCaptor();
	const moving =
		renderer.getCamera().isAnimated() ||
		mouse.isMoving ||
		mouse.draggedEvents > 0 ||
		mouse.currentWheelDirection !== 0;
	if (graph.size > 5_000 && moving) return;

	context.lineCap = "round";
	context.lineJoin = "round";
	const pointsByNode = new Map<string, BundledNodePoints>();
	graph.forEachNode((node, data) => {
		const point = renderer.graphToViewport(data);
		const bundle = renderer.graphToViewport({ x: data.bundleX, y: data.bundleY });
		const inward = renderer.graphToViewport({
			x: data.x * INTRA_COMMUNITY_PULL,
			y: data.y * INTRA_COMMUNITY_PULL,
		});
		pointsByNode.set(node, {
			node: point,
			outer: lerpPoint(point, bundle, bundling),
			inner: lerpPoint(point, inward, bundling),
			community: data.community.kind === "member" ? data.community.index : null,
		});
	});

	// Highlighted edges are drawn in a second pass so faded edges never bury them.
	const raised: ResolvedEdge[] = [];
	graph.forEachEdge((edge, data, source, target) => {
		const style = resolveStyle(edge, data, source, target);
		if (style.hidden) return;

		const sourcePoints = pointsByNode.get(source);
		const targetPoints = pointsByNode.get(target);
		if (!sourcePoints || !targetPoints) return;

		const resolved: ResolvedEdge = {
			style,
			fallbackColor: data.color,
			fallbackSize: data.size,
			source: sourcePoints,
			target: targetPoints,
		};
		if ((style.zIndex ?? 0) > 0) raised.push(resolved);
		else strokeBundledEdge(context, resolved);
	});
	for (const resolved of raised) strokeBundledEdge(context, resolved);
}

function roundedRectPath(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
) {
	const right = x + width;
	const bottom = y + height;
	context.beginPath();
	context.moveTo(x + radius, y);
	context.lineTo(right - radius, y);
	context.quadraticCurveTo(right, y, right, y + radius);
	context.lineTo(right, bottom - radius);
	context.quadraticCurveTo(right, bottom, right - radius, bottom);
	context.lineTo(x + radius, bottom);
	context.quadraticCurveTo(x, bottom, x, bottom - radius);
	context.lineTo(x, y + radius);
	context.quadraticCurveTo(x, y, x + radius, y);
	context.closePath();
}

/**
 * Soft radial glow plus a fine ring drawn only for the active/focused node.
 * Neighbors are intentionally excluded to avoid overdraw on large graphs.
 */
export function drawConnectionsNodeHover(
	context: CanvasRenderingContext2D,
	data: NodeHoverData,
	palette: ConnectionsPalette,
	variant: ConnectionsGraphVariant,
) {
	const size = data.size ?? 1;
	const glowRadius = size + (variant === "local" ? 16 : 9);
	const ringRadius = size + (variant === "local" ? 4 : 2.5);

	context.save();

	const gradient = context.createRadialGradient(
		data.x,
		data.y,
		Math.max(size * 0.6, 1),
		data.x,
		data.y,
		glowRadius,
	);
	gradient.addColorStop(0, palette.hoverHaloSoft);
	gradient.addColorStop(1, TRANSPARENT);
	context.fillStyle = gradient;
	context.beginPath();
	context.arc(data.x, data.y, glowRadius, 0, Math.PI * 2);
	context.fill();

	context.strokeStyle = palette.hoverHalo;
	context.lineWidth = variant === "local" ? 1.2 : 0.85;
	context.beginPath();
	context.arc(data.x, data.y, ringRadius, 0, Math.PI * 2);
	context.stroke();

	context.restore();
}

/**
 * Restrained floating labels. Local-graph labels sit in a soft pill; space-graph labels park
 * outside the ring behind a text veil, and the hovered or selected one shows its full title.
 */
export function drawConnectionsNodeLabel(
	context: CanvasRenderingContext2D,
	data: NodeLabelData,
	settings: NodeLabelSettings,
	palette: ConnectionsPalette,
	variant: ConnectionsGraphVariant,
	/** Space graphs only: null until the renderer's first frame has been measured. */
	frame: ConnectionsRingFrame | null,
) {
	const label = data.label;
	if (!label) return;

	const size = data.size ?? 1;
	const emphasized = Boolean(data.highlighted);
	const fontSize = settings.labelSize;
	// One quiet ink and weight at rest; only the hovered or selected node steps up.
	const weight = emphasized ? FOCUS_LABEL_WEIGHT : settings.labelWeight;
	const ink = emphasized ? palette.text : palette.textSecondary;

	context.save();
	context.font = `${weight} ${fontSize}px ${settings.labelFont}`;
	context.textBaseline = "alphabetic";

	if (variant === "space") {
		const nodeId = "key" in data && typeof data.key === "string" ? data.key : null;
		// The focused label keeps its full title in the box it reserved when the frame was built.
		const placed = frame
			? placeRingLabel(
					context,
					frame.ring,
					frame.viewport,
					data,
					label,
					fontSize,
					emphasized ? null : RING_LABEL_MAX_CHARS,
				)
			: null;
		if (frame && placed && (emphasized || claimRingLabel(frame, nodeId, placed))) {
			context.textAlign = "left";
			context.textBaseline = "middle";
			context.lineJoin = "round";
			context.lineWidth = 3;
			context.strokeStyle = palette.labelBackground;
			context.strokeText(placed.text, placed.x, placed.y);
			context.fillStyle = ink;
			context.fillText(placed.text, placed.x, placed.y);
		}
		context.restore();
		return;
	}

	const textWidth = context.measureText(label).width;
	const textX = Math.round(data.x + size + 8);
	const textY = Math.round(data.y + fontSize / 3);

	const paddingX = emphasized ? 7 : 6;
	const pillHeight = fontSize + (emphasized ? 9 : 7);
	const pillX = textX - paddingX;
	const pillY = Math.round(data.y - pillHeight / 2);
	const pillWidth = Math.ceil(textWidth + paddingX * 2);
	roundedRectPath(context, pillX, pillY, pillWidth, pillHeight, Math.min(9, pillHeight / 2));
	context.fillStyle = palette.labelBackground;
	context.fill();
	context.strokeStyle = palette.labelBorder;
	context.lineWidth = 1;
	context.stroke();

	context.fillStyle = ink;
	context.fillText(label, textX, textY);

	context.restore();
}
