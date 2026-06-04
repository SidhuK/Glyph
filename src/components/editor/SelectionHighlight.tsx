import { useEffect, useMemo, useState } from "react";

const TOUCH_MEDIA_QUERY = "(hover: none) and (pointer: coarse)";

interface SelectionHighlightProps {
	host: HTMLElement | null;
	enabled: boolean;
}

interface Box {
	top: number;
	bottom: number;
	left: number;
	right: number;
}

const CONFIG = {
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

function getIsTouchPrimary() {
	return (
		typeof window !== "undefined" &&
		window.matchMedia(TOUCH_MEDIA_QUERY).matches
	);
}

function buildNoiseTileDataUrl(): string {
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

function hashJitter(seed: number): number {
	const x = Math.sin(seed * 9301 + 49297) * 233280;
	return (x - Math.floor(x)) * 2 - 1;
}

function mergeRectsByLine(raw: Box[], anchorLeft: number, anchorRight: number) {
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

function buildEdge(
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

function buildClipPath({
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

function createRafCoalescer(callback: () => void) {
	let frame: number | null = null;
	const cancel = () => {
		if (frame === null) return;
		window.cancelAnimationFrame(frame);
		frame = null;
	};
	const schedule = () => {
		if (frame !== null) return;
		frame = window.requestAnimationFrame(() => {
			frame = null;
			callback();
		});
	};
	return { schedule, cancel };
}

function getSelectedTextRects(selection: Selection, host: HTMLElement) {
	const raw: Box[] = [];
	const scratchRange = document.createRange();

	for (let rangeIndex = 0; rangeIndex < selection.rangeCount; rangeIndex += 1) {
		const range = selection.getRangeAt(rangeIndex);
		if (!range.intersectsNode(host)) continue;

		const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) => {
				if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
				let parent = node.parentElement;
				while (parent && parent !== host) {
					const styles = window.getComputedStyle(parent);
					if (styles.visibility === "hidden" || styles.userSelect === "none") {
						return NodeFilter.FILTER_REJECT;
					}
					if (parent.offsetWidth <= 1 || parent.offsetHeight <= 1) {
						return NodeFilter.FILTER_REJECT;
					}
					parent = parent.parentElement;
				}
				return NodeFilter.FILTER_ACCEPT;
			},
		});

		let node = walker.nextNode() as Text | null;
		while (node) {
			const start = node === range.startContainer ? range.startOffset : 0;
			const end = node === range.endContainer ? range.endOffset : node.length;
			if (end > start) {
				scratchRange.setStart(node, start);
				scratchRange.setEnd(node, end);
				for (const rect of scratchRange.getClientRects()) {
					if (rect.width < 1 || rect.height < 1) continue;
					raw.push({
						top: rect.top,
						bottom: rect.bottom,
						left: rect.left,
						right: rect.right,
					});
				}
			}
			node = walker.nextNode() as Text | null;
		}
	}

	scratchRange.detach();
	return raw;
}

export function SelectionHighlight({ host, enabled }: SelectionHighlightProps) {
	const [isTouchPrimary, setIsTouchPrimary] = useState(getIsTouchPrimary);
	const noiseMask = useMemo(buildNoiseTileDataUrl, []);

	useEffect(() => {
		const query = window.matchMedia(TOUCH_MEDIA_QUERY);
		const syncTouchPrimary = () => setIsTouchPrimary(query.matches);
		syncTouchPrimary();
		query.addEventListener("change", syncTouchPrimary);
		return () => query.removeEventListener("change", syncTouchPrimary);
	}, []);

	useEffect(() => {
		if (!host || !enabled || isTouchPrimary) return;

		host.style.setProperty("--selection-grain-mask", noiseMask);
		host.classList.add("selectionHighlightReady");

		const overlays = new Map<number, HTMLDivElement>();
		const hideAll = () => {
			for (const overlay of overlays.values()) {
				overlay.classList.remove("is-visible");
			}
		};

		const getOrCreateOverlay = (key: number) => {
			const existing = overlays.get(key);
			if (existing) return existing;
			const overlay = document.createElement("div");
			overlay.className = "selectionHighlight";
			overlay.setAttribute("aria-hidden", "true");
			host.appendChild(overlay);
			overlays.set(key, overlay);
			return overlay;
		};

		const measure = () => {
			const selection = window.getSelection();
			if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
				hideAll();
				return;
			}

			const hostRect = host.getBoundingClientRect();
			const lines = mergeRectsByLine(
				getSelectedTextRects(selection, host),
				hostRect.left,
				hostRect.right,
			);
			if (lines.length === 0) {
				hideAll();
				return;
			}

			const activeKeys = new Set<number>();
			const leftRange =
				CONFIG.coverageExtension.leftMax - CONFIG.coverageExtension.leftMin;
			const rightRange =
				CONFIG.coverageExtension.rightMax - CONFIG.coverageExtension.rightMin;
			const slantRange = CONFIG.chiselSlant.max - CONFIG.chiselSlant.min;

			for (const line of lines) {
				const lineWidth = line.right - line.left;
				const lineHeight = line.bottom - line.top;
				const seed = Math.round((line.top - hostRect.top) * 7);
				const leftExt =
					CONFIG.coverageExtension.leftMin +
					(hashJitter(seed) * 0.5 + 0.5) * leftRange;
				const rightExt =
					CONFIG.coverageExtension.rightMin +
					(hashJitter(seed + 11) * 0.5 + 0.5) * rightRange;
				const slant =
					CONFIG.chiselSlant.min +
					(hashJitter(seed + 101) * 0.5 + 0.5) * slantRange;
				const width = lineWidth + leftExt + rightExt;
				const height = lineHeight + CONFIG.coverageExtension.topBottom * 2;
				const maskX = -(
					(((seed * 37) % CONFIG.noiseTile.width) + CONFIG.noiseTile.width) %
					CONFIG.noiseTile.width
				);
				const maskY = -(
					(((seed * 13) % CONFIG.noiseTile.height) + CONFIG.noiseTile.height) %
					CONFIG.noiseTile.height
				);

				activeKeys.add(seed);
				const overlay = getOrCreateOverlay(seed);
				const style = overlay.style;
				style.top = `${line.top - hostRect.top - CONFIG.coverageExtension.topBottom}px`;
				style.left = `${line.left - hostRect.left - leftExt}px`;
				style.width = `${width}px`;
				style.height = `${height}px`;
				style.maskPosition = `${maskX}px ${maskY}px`;
				style.webkitMaskPosition = `${maskX}px ${maskY}px`;
				const clipPath = buildClipPath({
					slant,
					width,
					height,
					radius: CONFIG.tipRadius,
					segmentLength: CONFIG.edgeWave.segmentLength,
					amplitude: CONFIG.edgeWave.amplitude,
					seed,
				});
				style.clipPath = clipPath;
				style.setProperty("-webkit-clip-path", clipPath);
				overlay.classList.add("is-visible");
			}

			for (const [key, overlay] of overlays) {
				if (!activeKeys.has(key)) overlay.classList.remove("is-visible");
			}
		};

		const { schedule, cancel } = createRafCoalescer(measure);
		document.addEventListener("selectionchange", schedule);
		window.addEventListener("resize", schedule);
		schedule();

		return () => {
			cancel();
			document.removeEventListener("selectionchange", schedule);
			window.removeEventListener("resize", schedule);
			for (const overlay of overlays.values()) overlay.remove();
			overlays.clear();
			host.style.removeProperty("--selection-grain-mask");
			host.classList.remove("selectionHighlightReady");
		};
	}, [enabled, host, isTouchPrimary, noiseMask]);

	return null;
}
