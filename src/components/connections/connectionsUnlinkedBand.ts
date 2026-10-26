import { CONNECTIONS_RING_RADIUS } from "./connectionsCommunityPlacement";
import type { ConnectionsGraph, ConnectionsSigma } from "./connectionsGraph";
import { type ConnectionsRingGeometry, pointOnArc } from "./connectionsRing";
import type { ConnectionsPalette } from "./connectionsTheme";

const ARC_SAMPLE_STEP = Math.PI / 90;
const BAND_ARC_WIDTH_PX = 1;
const BAND_ARC_ALPHA = 0.3;
const BAND_DOT_RADIUS_PX = 1.5;
const BAND_DOT_ALPHA = 0.25;
const BAND_DOT_PITCH_PX = 14;

/**
 * Unlinked notes rest invisible (they stay hoverable), so their segment reads as one quiet mark:
 * a hairline where the community arcs run plus sparse dots on the note row. Packed rows of real
 * dots read as a hatched texture.
 */
export function drawConnectionsUnlinkedBand(
	context: CanvasRenderingContext2D,
	renderer: ConnectionsSigma,
	graph: ConnectionsGraph,
	palette: ConnectionsPalette,
	geometry: ConnectionsRingGeometry,
) {
	const band = graph.getAttribute("communities").find((community) => community.kind === "isolated");
	if (!band) return;
	const span = band.endAngle - band.startAngle;
	if (span <= 0) return;

	context.save();
	context.strokeStyle = palette.communityNeutral;
	context.fillStyle = palette.communityNeutral;
	context.lineWidth = BAND_ARC_WIDTH_PX;
	context.lineCap = "round";

	context.globalAlpha = BAND_ARC_ALPHA;
	const steps = Math.max(2, Math.ceil(span / ARC_SAMPLE_STEP));
	context.beginPath();
	for (let step = 0; step <= steps; step += 1) {
		const point = pointOnArc(renderer, geometry, band.startAngle + (span * step) / steps);
		if (step === 0) context.moveTo(point.x, point.y);
		else context.lineTo(point.x, point.y);
	}
	context.stroke();

	const rim = renderer.graphToViewport({ x: CONNECTIONS_RING_RADIUS, y: 0 });
	const rowRadius = Math.hypot(rim.x - geometry.center.x, rim.y - geometry.center.y);
	const row = { ...geometry, arcRadius: rowRadius };
	const dotCount = Math.max(1, Math.floor((span * rowRadius) / BAND_DOT_PITCH_PX));
	context.globalAlpha = BAND_DOT_ALPHA;
	context.beginPath();
	for (let index = 0; index < dotCount; index += 1) {
		const point = pointOnArc(renderer, row, band.startAngle + (span * (index + 0.5)) / dotCount);
		context.moveTo(point.x + BAND_DOT_RADIUS_PX, point.y);
		context.arc(point.x, point.y, BAND_DOT_RADIUS_PX, 0, Math.PI * 2);
	}
	context.fill();
	context.restore();
}
