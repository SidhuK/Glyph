import { useCallback, useRef } from "react";

interface UseResizablePanelOptions {
	min: number;
	max: number;
	disabled?: boolean;
	/** "right" means drag-right = wider (sidebar), "left" means drag-left = wider (AI panel) */
	direction?: "right" | "left";
	onResize: (width: number) => void;
	onResizeEnd?: (width: number) => void;
	currentWidth: number;
}

export function useResizablePanel({
	min,
	max,
	disabled = false,
	direction = "right",
	onResize,
	onResizeEnd,
	currentWidth,
}: UseResizablePanelOptions) {
	const resizeRef = useRef<HTMLDivElement>(null);
	const dragStartXRef = useRef(0);
	const dragStartWidthRef = useRef(0);
	const isDraggingRef = useRef(false);
	const latestWidthRef = useRef(currentWidth);

	const calcWidth = useCallback(
		(clientX: number) => {
			const delta =
				direction === "right" ? clientX - dragStartXRef.current : dragStartXRef.current - clientX;
			return Math.max(min, Math.min(max, dragStartWidthRef.current + delta));
		},
		[direction, max, min],
	);

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			if (disabled) return;
			isDraggingRef.current = true;
			dragStartXRef.current = e.clientX;
			dragStartWidthRef.current = currentWidth;
			latestWidthRef.current = currentWidth;
			resizeRef.current?.setPointerCapture(e.pointerId);
		},
		[currentWidth, disabled],
	);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!isDraggingRef.current) return;
			const nextWidth = calcWidth(e.clientX);
			latestWidthRef.current = nextWidth;
			onResize(nextWidth);
		},
		[calcWidth, onResize],
	);

	const handlePointerUp = useCallback(() => {
		if (!isDraggingRef.current) return;
		isDraggingRef.current = false;
		onResizeEnd?.(latestWidthRef.current);
	}, [onResizeEnd]);

	return {
		resizeRef,
		handlePointerDown,
		handlePointerMove,
		handlePointerUp,
	};
}
