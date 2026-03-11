import { type RefObject, useEffect } from "react";

export function useResetScrollOnChange(
	rootRef: RefObject<HTMLElement | null>,
	selector: string | null,
	deps: readonly unknown[],
) {
	// biome-ignore lint/correctness/useExhaustiveDependencies: rootRef.current is read inside the effect after commit; the ref object identity is stable.
	useEffect(() => {
		const root = rootRef.current;

		const resetScroll = () => {
			if (root) root.scrollTop = 0;
			if (!selector) return;
			const nested =
				(root?.closest(selector) as HTMLElement | null) ??
				(root?.querySelector(selector) as HTMLElement | null);
			if (nested) nested.scrollTop = 0;
		};

		resetScroll();
		const frame = window.requestAnimationFrame(resetScroll);
		return () => window.cancelAnimationFrame(frame);
	}, [selector, ...deps]);
}
