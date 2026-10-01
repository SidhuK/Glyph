import type { Coordinates } from "sigma/types";
import { CONNECTIONS_RING_RADIUS } from "./connectionsCommunityPlacement";
import type { ConnectionsGraph, ConnectionsSigma } from "./connectionsGraph";
import type { ConnectionsPalette } from "./connectionsTheme";

const ARC_GAP_PX = 5;
const ARC_WIDTH_PX = 3;
const LABEL_GAP_PX = 6;
const ARC_SAMPLE_STEP = Math.PI / 90;
const ARC_ALPHA = 0.9;

/** Viewport-space ring measurements shared by community arcs and radial labels. */
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

function pointOnArc(
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
