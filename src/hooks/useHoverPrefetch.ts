import { useCallback, useEffect, useRef } from "react";

// Hover intent delay filters pointer sweeps without delaying click or focus loads.
const HOVER_PREFETCH_DELAY_MS = 80;

export function useHoverPrefetch(run: () => void) {
	const runRef = useRef(run);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	runRef.current = run;

	const cancelHoverPrefetch = useCallback(() => {
		if (!timerRef.current) return;
		clearTimeout(timerRef.current);
		timerRef.current = null;
	}, []);

	const onMouseEnter = useCallback(() => {
		cancelHoverPrefetch();
		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			runRef.current();
		}, HOVER_PREFETCH_DELAY_MS);
	}, [cancelHoverPrefetch]);

	useEffect(() => cancelHoverPrefetch, [cancelHoverPrefetch]);

	return {
		hoverPrefetchProps: {
			onMouseEnter,
			onMouseLeave: cancelHoverPrefetch,
		},
		cancelHoverPrefetch,
	};
}
