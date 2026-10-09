/** Completion colour ramp shared by the task progress pie and the Tasks bar. */
const COLOR_STOPS = [
	{ t: 0.0, rgb: [251, 75, 75] },
	{ t: 0.25, rgb: [255, 168, 121] },
	{ t: 0.5, rgb: [255, 193, 99] },
	{ t: 0.75, rgb: [254, 255, 92] },
	{ t: 0.9, rgb: [74, 222, 128] },
	{ t: 1.0, rgb: [59, 130, 246] },
] as const;

export function getProgressColor(ratio: number): string {
	const end = COLOR_STOPS.findIndex((stop) => ratio <= stop.t);
	if (end <= 0) return `rgb(${COLOR_STOPS[end === 0 ? 0 : COLOR_STOPS.length - 1].rgb.join(", ")})`;
	const from = COLOR_STOPS[end - 1];
	const to = COLOR_STOPS[end];
	const local = (ratio - from.t) / (to.t - from.t);
	const channels = from.rgb.map((value, index) =>
		Math.round(value + (to.rgb[index] - value) * local),
	);
	return `rgb(${channels.join(", ")})`;
}
