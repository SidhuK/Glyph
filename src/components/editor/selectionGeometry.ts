const TOUCH_MEDIA_QUERY = "(hover: none) and (pointer: coarse)";

export interface Box {
	top: number;
	bottom: number;
	left: number;
	right: number;
}

export const CONFIG = {
	noiseTile: {
		width: 256,
		height: 64,
		striationFrequency: "0.04 0.7",
		striationOctaves: 1,
		striationAlphaMin: 0.84,
		striationAlphaSlope: 0.16,
		striationSeed: 3,
		patchFrequency: "0.012",
		patchOctaves: 2,
		patchAlphaMin: 0.86,
		patchAlphaSlope: 0.14,
		patchSeed: 7,
	},
	coverageExtension: {
		leftMin: 5,
		leftMax: 8,
		rightMin: 5,
		rightMax: 9,
		topBottom: 2,
	},
	chiselSlant: { min: 2, max: 5 },
	tipRadius: 3,
	edgeWave: {
		segmentLength: 30,
		amplitude: 1,
	},
	mergeTolerance: 0.5,
	mergeMaxGapRatio: 1.5,
	bboxRejectRatio: 3,
} as const;

export function getIsTouchPrimary() {
	return (
		typeof window !== "undefined" &&
		window.matchMedia(TOUCH_MEDIA_QUERY).matches
	);
}

export function getTouchMediaQuery() {
	return TOUCH_MEDIA_QUERY;
}

export function buildNoiseTileDataUrl(): string {
	const c = CONFIG.noiseTile;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}" height="${c.height}">
<defs>
<filter id="g" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="${c.striationFrequency}" numOctaves="${c.striationOctaves}" stitchTiles="stitch" seed="${c.striationSeed}" result="s"/>
<feColorMatrix in="s" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${c.striationAlphaSlope} ${c.striationAlphaMin}" result="sa"/>
<feTurbulence type="fractalNoise" baseFrequency="${c.patchFrequency}" numOctaves="${c.patchOctaves}" stitchTiles="stitch" seed="${c.patchSeed}" result="p"/>
<feColorMatrix in="p" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${c.patchAlphaSlope} ${c.patchAlphaMin}" result="pa"/>
<feComposite in="sa" in2="pa" operator="arithmetic" k1="1" k2="0" k3="0" k4="0"/>
</filter>
</defs>
<rect width="${c.width}" height="${c.height}" fill="black" filter="url(#g)"/>
</svg>`;
	return `url("data:image/svg+xml;base64,${btoa(svg)}")`;
}

export function hashJitter(seed: number): number {
	const x = Math.sin(seed * 9301 + 49297) * 233280;
	return (x - Math.floor(x)) * 2 - 1;
}

export function mergeRectsByLine(
	raw: Box[],
	anchorLeft: number,
	anchorRight: number,
) {
	if (raw.length === 0) return [];
	const heights = raw.map((r) => r.bottom - r.top).sort((a, b) => a - b);
	const median = heights[Math.floor(heights.length / 2)] || 0;
	const tolerance = median * CONFIG.mergeTolerance;
	const maxHeight = median * CONFIG.bboxRejectRatio;
	const maxGap = median * CONFIG.mergeMaxGapRatio;
	const slop = 24;
	const minLeft = anchorLeft - slop;
	const maxRight = anchorRight + slop;
	const lines: Box[] = [];

	for (const rect of raw) {
		if (rect.bottom - rect.top > maxHeight) continue;
		if (rect.right < minLeft || rect.left > maxRight) continue;
		const centerY = (rect.top + rect.bottom) / 2;
		const line = lines.find((candidate) => {
			const candidateCenterY = (candidate.top + candidate.bottom) / 2;
			if (Math.abs(centerY - candidateCenterY) >= tolerance) return false;
			const gap = Math.max(
				rect.left - candidate.right,
				candidate.left - rect.right,
			);
			return gap <= maxGap;
		});

		if (line) {
			line.top = Math.min(line.top, rect.top);
			line.bottom = Math.max(line.bottom, rect.bottom);
			line.left = Math.min(line.left, rect.left);
			line.right = Math.max(line.right, rect.right);
		} else {
			lines.push({ ...rect });
		}
	}

	return lines;
}

export function buildEdge(
	startX: number,
	endX: number,
	baseY: number,
	edgeSeed: number,
	segmentLength: number,
	amplitude: number,
) {
	let output = "";
	const length = endX - startX;
	const segments = Math.max(1, Math.round(Math.abs(length) / segmentLength));
	for (let k = 1; k < segments; k += 1) {
		const x = startX + (k / segments) * length;
		const y = baseY + hashJitter(edgeSeed + k * 17) * amplitude;
		output += `L ${x.toFixed(1)} ${y.toFixed(2)} `;
	}
	return output;
}

export function buildClipPath({
	slant,
	width,
	height,
	radius,
	segmentLength,
	amplitude,
	seed,
}: {
	slant: number;
	width: number;
	height: number;
	radius: number;
	segmentLength: number;
	amplitude: number;
	seed: number;
}) {
	const topEdge = buildEdge(
		slant + radius,
		width - radius,
		0,
		seed + 200,
		segmentLength,
		amplitude,
	);
	const bottomEdge = buildEdge(
		width - slant - radius,
		radius,
		height,
		seed + 300,
		segmentLength,
		amplitude,
	);
	return `path("M ${(slant + radius).toFixed(1)} 0 ${topEdge}L ${(width - radius).toFixed(1)} 0 Q ${width.toFixed(1)} 0 ${width.toFixed(1)} ${radius} L ${(width - slant).toFixed(1)} ${(height - radius).toFixed(1)} Q ${(width - slant).toFixed(1)} ${height.toFixed(1)} ${(width - slant - radius).toFixed(1)} ${height.toFixed(1)} ${bottomEdge}L ${radius.toFixed(1)} ${height.toFixed(1)} Q 0 ${height.toFixed(1)} 0 ${(height - radius).toFixed(1)} L ${slant.toFixed(1)} ${radius.toFixed(1)} Q ${slant.toFixed(1)} 0 ${(slant + radius).toFixed(1)} 0 Z")`;
}
