import type { NodeLabelDrawingFunction } from "sigma/rendering";
import type { ConnectionsEdgeAttributes, ConnectionsNodeAttributes } from "./connectionsGraph";
import { type ConnectionsPalette, mixColors } from "./connectionsTheme";

type LabelDrawer = NodeLabelDrawingFunction<ConnectionsNodeAttributes, ConnectionsEdgeAttributes>;
type NodeLabelData = Parameters<LabelDrawer>[1];
type NodeLabelSettings = Parameters<LabelDrawer>[2];

const STRONG_LABEL_WEIGHT = "600";
const STRONG_LABEL_STEP_PX = 1;
const LABEL_GAP_PX = 4;
const LABEL_HALO_PX = 4;
const LABEL_MAX_CHARS = 40;
const SELECTED_HALO_PX = 7;
const SELECTED_HALO_INK = 0.16;
const HOVER_RING_GAP_PX = 3;
const HOVER_RING_WIDTH_PX = 1.5;

function labelStyle(data: NodeLabelData, palette: ConnectionsPalette) {
	const ink = "ink" in data && typeof data.ink === "string" ? data.ink : palette.text;
	return { ink, strong: "strong" in data && data.strong === true };
}

function truncateLabel(label: string) {
	return label.length > LABEL_MAX_CHARS ? `${label.slice(0, LABEL_MAX_CHARS - 1)}…` : label;
}

export function drawConnectionsNodeLabel(
	context: CanvasRenderingContext2D,
	data: NodeLabelData,
	settings: NodeLabelSettings,
	palette: ConnectionsPalette,
) {
	if (!data.label) return;
	const { ink, strong } = labelStyle(data, palette);
	const fontSize = strong ? settings.labelSize + STRONG_LABEL_STEP_PX : settings.labelSize;
	const weight = strong ? STRONG_LABEL_WEIGHT : settings.labelWeight;
	const text = truncateLabel(data.label);
	const x = Math.round(data.x);
	const y = Math.round(data.y + data.size + LABEL_GAP_PX);

	context.save();
	context.font = `${weight} ${fontSize}px ${settings.labelFont}`;
	context.textAlign = "center";
	context.textBaseline = "top";
	context.lineJoin = "round";
	context.lineWidth = LABEL_HALO_PX;
	context.strokeStyle = palette.background;
	context.strokeText(text, x, y);
	context.fillStyle = ink;
	context.fillText(text, x, y);
	context.restore();
}

function drawCircle(context: CanvasRenderingContext2D, data: NodeLabelData, radius: number) {
	context.beginPath();
	context.arc(data.x, data.y, radius, 0, Math.PI * 2);
}

export function drawConnectionsNodeHover(
	context: CanvasRenderingContext2D,
	data: NodeLabelData,
	settings: NodeLabelSettings,
	palette: ConnectionsPalette,
) {
	context.save();
	if (data.highlighted) {
		context.fillStyle = mixColors(palette.accent, palette.background, SELECTED_HALO_INK);
		drawCircle(context, data, data.size + SELECTED_HALO_PX);
		context.fill();
	} else {
		context.strokeStyle = palette.textTertiary;
		context.lineWidth = HOVER_RING_WIDTH_PX;
		drawCircle(context, data, data.size + HOVER_RING_GAP_PX);
		context.stroke();
	}
	context.restore();
	drawConnectionsNodeLabel(context, data, settings, palette);
}
