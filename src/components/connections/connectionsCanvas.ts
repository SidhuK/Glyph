import type {
	NodeHoverDrawingFunction,
	NodeLabelDrawingFunction,
} from "sigma/rendering";
import type {
	ConnectionsEdgeAttributes,
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
 * Restrained floating labels. Emphasized labels (focused / forced) get a soft
 * pill; ordinary space-graph labels use a cheaper text veil to stay legible
 * without turning the full vault into a wall of boxes.
 */
export function drawConnectionsNodeLabel(
	context: CanvasRenderingContext2D,
	data: NodeLabelData,
	settings: NodeLabelSettings,
	palette: ConnectionsPalette,
	variant: ConnectionsGraphVariant,
) {
	const label = data.label;
	if (!label) return;

	const size = data.size ?? 1;
	const emphasized = Boolean(data.highlighted || data.forceLabel);
	const fontSize = settings.labelSize;
	const weight = emphasized ? "600" : settings.labelWeight;

	context.save();
	context.font = `${weight} ${fontSize}px ${settings.labelFont}`;
	context.textBaseline = "alphabetic";

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
