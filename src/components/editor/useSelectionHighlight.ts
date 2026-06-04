import { useEffect, useMemo, useState } from "react";
import {
	type Box,
	CONFIG,
	buildClipPath,
	buildNoiseTileDataUrl,
	getIsTouchPrimary,
	getTouchMediaQuery,
	hashJitter,
	mergeRectsByLine,
} from "./selectionGeometry";

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
	const selectableElementCache = new WeakMap<Element, boolean>();

	const getIsSelectableElement = (element: Element): boolean => {
		const cached = selectableElementCache.get(element);
		if (cached !== undefined) return cached;
		if (element === host) return true;
		const parent = element.parentElement;
		const parentIsSelectable = parent ? getIsSelectableElement(parent) : false;
		if (!parentIsSelectable) {
			selectableElementCache.set(element, false);
			return false;
		}
		const styles = window.getComputedStyle(element);
		const isSelectable =
			styles.visibility !== "hidden" &&
			styles.userSelect !== "none" &&
			element instanceof HTMLElement &&
			element.offsetWidth > 1 &&
			element.offsetHeight > 1;
		selectableElementCache.set(element, isSelectable);
		return isSelectable;
	};

	for (let rangeIndex = 0; rangeIndex < selection.rangeCount; rangeIndex += 1) {
		const range = selection.getRangeAt(rangeIndex);
		if (!range.intersectsNode(host)) continue;

		const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) => {
				if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
				const parent = node.parentElement;
				return parent && getIsSelectableElement(parent)
					? NodeFilter.FILTER_ACCEPT
					: NodeFilter.FILTER_REJECT;
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

function removeInactiveOverlays(
	overlays: Map<string, HTMLDivElement>,
	activeKeys: Set<string>,
) {
	for (const [key, overlay] of overlays) {
		if (activeKeys.has(key)) continue;
		overlay.remove();
		overlays.delete(key);
	}
}

export function useSelectionHighlight({
	host,
	enabled,
}: {
	host: HTMLElement | null;
	enabled: boolean;
}) {
	const [isTouchPrimary, setIsTouchPrimary] = useState(getIsTouchPrimary);
	const noiseMask = useMemo(buildNoiseTileDataUrl, []);

	useEffect(() => {
		const query = window.matchMedia(getTouchMediaQuery());
		const syncTouchPrimary = () => setIsTouchPrimary(query.matches);
		syncTouchPrimary();
		query.addEventListener("change", syncTouchPrimary);
		return () => query.removeEventListener("change", syncTouchPrimary);
	}, []);

	useEffect(() => {
		if (!host || !enabled || isTouchPrimary) return;

		host.style.setProperty("--selection-grain-mask", noiseMask);
		host.classList.add("selectionHighlightReady");

		const overlays = new Map<string, HTMLDivElement>();
		const clearOverlays = () => {
			for (const overlay of overlays.values()) overlay.remove();
			overlays.clear();
		};

		const getOrCreateOverlay = (key: string) => {
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
				clearOverlays();
				return;
			}

			const hostRect = host.getBoundingClientRect();
			const lines = mergeRectsByLine(
				getSelectedTextRects(selection, host),
				hostRect.left,
				hostRect.right,
			);
			if (lines.length === 0) {
				clearOverlays();
				return;
			}

			const activeKeys = new Set<string>();
			const leftRange =
				CONFIG.coverageExtension.leftMax - CONFIG.coverageExtension.leftMin;
			const rightRange =
				CONFIG.coverageExtension.rightMax - CONFIG.coverageExtension.rightMin;
			const slantRange = CONFIG.chiselSlant.max - CONFIG.chiselSlant.min;

			for (const line of lines) {
				const lineWidth = line.right - line.left;
				const lineHeight = line.bottom - line.top;
				const seed = Math.round((line.top - hostRect.top) * 7);
				const key = `${seed}:${line.left.toFixed(1)}:${line.right.toFixed(1)}`;
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

				activeKeys.add(key);
				const overlay = getOrCreateOverlay(key);
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

			removeInactiveOverlays(overlays, activeKeys);
		};

		const { schedule, cancel } = createRafCoalescer(measure);
		document.addEventListener("selectionchange", schedule);
		window.addEventListener("resize", schedule);
		schedule();

		return () => {
			cancel();
			document.removeEventListener("selectionchange", schedule);
			window.removeEventListener("resize", schedule);
			clearOverlays();
			host.style.removeProperty("--selection-grain-mask");
			host.classList.remove("selectionHighlightReady");
		};
	}, [enabled, host, isTouchPrimary, noiseMask]);
}
