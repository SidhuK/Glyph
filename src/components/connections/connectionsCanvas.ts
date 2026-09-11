import type Sigma from "sigma";
import type {
	NodeHoverDrawingFunction,
	NodeLabelDrawingFunction,
} from "sigma/rendering";
import type { Coordinates, EdgeDisplayData } from "sigma/types";
import type {
	ConnectionsEdgeAttributes,
	ConnectionsGraph,
	ConnectionsGraphVariant,
	ConnectionsNodeAttributes,
} from "./connectionsGraph";
import type { ConnectionsPalette } from "./connectionsTheme";

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

interface BundledEdgesDrawingOptions {
	readonly canvas: HTMLCanvasElement;
	readonly context: CanvasRenderingContext2D;
	readonly renderer: Sigma<
		ConnectionsNodeAttributes,
		ConnectionsEdgeAttributes
	>;
	readonly graph: ConnectionsGraph;
	readonly resolveStyle: (
		edge: string,
		data: ConnectionsEdgeAttributes,
		source: string,
		target: string,
	) => Partial<EdgeDisplayData>;
}

interface BundledNodePoints {
	readonly node: Coordinates;
	readonly bundle: Coordinates;
}

export function drawBundledConnectionsEdges({
	canvas,
	context,
	renderer,
	graph,
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
		pointsByNode.set(node, {
			node: renderer.graphToViewport(data),
			bundle: renderer.graphToViewport({
				x: data.bundleX,
				y: data.bundleY,
			}),
		});
	});

	graph.forEachEdge((edge, data, source, target) => {
		const style = resolveStyle(edge, data, source, target);
		if (style.hidden) return;

		const sourcePoints = pointsByNode.get(source);
		const targetPoints = pointsByNode.get(target);
		if (!sourcePoints || !targetPoints) return;

		context.strokeStyle = style.color ?? data.color;
		context.lineWidth = Math.max(0.35, style.size ?? data.size);
		context.beginPath();
		context.moveTo(sourcePoints.node.x, sourcePoints.node.y);
		context.bezierCurveTo(
			sourcePoints.bundle.x,
			sourcePoints.bundle.y,
			targetPoints.bundle.x,
			targetPoints.bundle.y,
			targetPoints.node.x,
			targetPoints.node.y,
		);
		context.stroke();
	});
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
 * Restrained floating labels. Hovered/selected nodes get a soft pill;
 * search matches and ordinary space-graph labels use a text veil.
 */
export function drawConnectionsNodeLabel(
	context: CanvasRenderingContext2D,
	data: NodeLabelData,
	settings: NodeLabelSettings,
	palette: ConnectionsPalette,
	variant: ConnectionsGraphVariant,
	graphCenter?: Coordinates,
) {
	const label = data.label;
	if (!label) return;

	const size = data.size ?? 1;
	const emphasized = Boolean(data.highlighted);
	const fontSize = settings.labelSize;
	const weight =
		data.highlighted || data.forceLabel ? "600" : settings.labelWeight;

	context.save();
	context.font = `${weight} ${fontSize}px ${settings.labelFont}`;
	context.textBaseline = "alphabetic";

	if (variant === "space" && !emphasized) {
		const centerX = graphCenter?.x ?? context.canvas.clientWidth / 2;
		const centerY = graphCenter?.y ?? context.canvas.clientHeight / 2;
		const angle = Math.atan2(data.y - centerY, data.x - centerX);
		const onLeft = Math.cos(angle) < 0;
		const labelOffset = size + 6;
		context.translate(data.x, data.y);
		context.rotate(onLeft ? angle + Math.PI : angle);
		context.textAlign = onLeft ? "right" : "left";
		context.textBaseline = "middle";
		context.lineJoin = "round";
		context.lineWidth = 3;
		context.strokeStyle = palette.labelBackground;
		context.strokeText(label, onLeft ? -labelOffset : labelOffset, 0);
		context.fillStyle = palette.text;
		context.fillText(label, onLeft ? -labelOffset : labelOffset, 0);
		context.restore();
		return;
	}

	const textWidth = context.measureText(label).width;
	const offsetX = variant === "local" ? 8 : 6;
	const textX = Math.round(data.x + size + offsetX);
	const textY = Math.round(data.y + fontSize / 3);

	const drawPill = variant === "local" || emphasized;

	if (drawPill) {
		const paddingX = emphasized ? 7 : 6;
		const pillHeight = fontSize + (emphasized ? 9 : 7);
		const pillX = textX - paddingX;
		const pillY = Math.round(data.y - pillHeight / 2);
		const pillWidth = Math.ceil(textWidth + paddingX * 2);
		roundedRectPath(
			context,
			pillX,
			pillY,
			pillWidth,
			pillHeight,
			Math.min(9, pillHeight / 2),
		);
		context.fillStyle = palette.labelBackground;
		context.fill();
		context.strokeStyle = palette.labelBorder;
		context.lineWidth = 1;
		context.stroke();
	} else {
		context.lineJoin = "round";
		context.lineWidth = 3;
		context.strokeStyle = palette.labelBackground;
		context.strokeText(label, textX, textY);
	}

	context.fillStyle = palette.text;
	context.fillText(label, textX, textY);

	context.restore();
}
