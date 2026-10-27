import type { NodeLabelDrawingFunction } from "sigma/rendering";
import type { ConnectionsEdgeAttributes, ConnectionsNodeAttributes } from "./connectionsGraph";
import type { ConnectionsPalette } from "./connectionsTheme";

type LabelDrawer = NodeLabelDrawingFunction<ConnectionsNodeAttributes, ConnectionsEdgeAttributes>;
type NodeLabelData = Parameters<LabelDrawer>[1];
type NodeLabelSettings = Parameters<LabelDrawer>[2];

/** Hub titles step up from the UI label size by this factor. */
const HUB_LABEL_SCALE = 1.3;
const HUB_LABEL_WEIGHT = "600";
const LABEL_GAP_PX = 4;
const LABEL_HALO_PX = 3;
const LABEL_MAX_CHARS = 40;
const SELECTED_RING_GAP_PX = 3;
const SELECTED_RING_WIDTH_PX = 1.5;

function labelStyle(data: NodeLabelData, palette: ConnectionsPalette) {
	const hub = "rank" in data && data.rank === "hub";
	const ink = "ink" in data && typeof data.ink === "string" ? data.ink : palette.textSecondary;
	return { hub, ink, strong: "strong" in data && data.strong === true };
}

function truncateLabel(label: string) {
	return label.length > LABEL_MAX_CHARS ? `${label.slice(0, LABEL_MAX_CHARS - 1)}…` : label;
}

/** Titles are the nodes: text sits right of a small dot, haloed in the page colour over edges. */
export function drawConnectionsNodeLabel(
	context: CanvasRenderingContext2D,
	data: NodeLabelData,
	settings: NodeLabelSettings,
	palette: ConnectionsPalette,
) {
	if (!data.label) return;
	const { hub, ink, strong } = labelStyle(data, palette);
	const fontSize = hub ? Math.round(settings.labelSize * HUB_LABEL_SCALE) : settings.labelSize;
	const weight = hub || strong ? HUB_LABEL_WEIGHT : settings.labelWeight;
	const text = truncateLabel(data.label);
	const x = Math.round(data.x + data.size + LABEL_GAP_PX);
	const y = Math.round(data.y);

	context.save();
	context.font = `${weight} ${fontSize}px ${settings.labelFont}`;
	context.textAlign = "left";
	context.textBaseline = "middle";
	context.lineJoin = "round";
	context.lineWidth = LABEL_HALO_PX;
	context.strokeStyle = palette.background;
	context.strokeText(text, x, y);
	context.fillStyle = ink;
	context.fillText(text, x, y);
	context.restore();
}

/** Hovered and selected nodes repaint their label above the hover layer; selection adds an accent ring. */
export function drawConnectionsNodeHover(
	context: CanvasRenderingContext2D,
	data: NodeLabelData,
	settings: NodeLabelSettings,
	palette: ConnectionsPalette,
) {
	drawConnectionsNodeLabel(context, data, settings, palette);
	if (!data.highlighted) return;
	context.save();
	context.strokeStyle = palette.accent;
	context.lineWidth = SELECTED_RING_WIDTH_PX;
	context.beginPath();
	context.arc(data.x, data.y, data.size + SELECTED_RING_GAP_PX, 0, Math.PI * 2);
	context.stroke();
	context.restore();
}
