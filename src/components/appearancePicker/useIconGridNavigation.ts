import type { KeyboardEvent } from "react";
import { useRef } from "react";

const NAVIGATION_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

function focusOption(option: HTMLButtonElement | undefined) {
	if (!option) return;
	option.focus({ preventScroll: true });
	option.scrollIntoView({ block: "nearest" });
}

/**
 * Arrow-key movement across the icon grid. Rows are resolved from rendered
 * positions so navigation stays correct across sections and responsive columns.
 */
export function useIconGridNavigation(onExitTop: () => void) {
	const optionRefs = useRef(new Map<string, HTMLButtonElement>());

	function orderedOptions() {
		return Array.from(optionRefs.current.values()).sort(
			(a, b) => a.offsetTop - b.offsetTop || a.offsetLeft - b.offsetLeft,
		);
	}

	function registerOption(key: string) {
		return (node: HTMLButtonElement | null) => {
			if (node) optionRefs.current.set(key, node);
			else optionRefs.current.delete(key);
		};
	}

	function focusFirstOption() {
		focusOption(orderedOptions()[0]);
	}

	function handleGridKeyDown(event: KeyboardEvent<HTMLElement>) {
		if (!NAVIGATION_KEYS.has(event.key)) return;
		const options = orderedOptions();
		const index = options.findIndex((option) => option === event.target);
		const from = options[index];
		if (!from) return;
		event.preventDefault();
		if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
			focusOption(options[event.key === "ArrowLeft" ? index - 1 : index + 1]);
			return;
		}

		const down = event.key === "ArrowDown";
		const rowTops = options
			.map((option) => option.offsetTop)
			.filter((top) => (down ? top > from.offsetTop : top < from.offsetTop));
		if (rowTops.length === 0) {
			if (!down) onExitTop();
			return;
		}
		const rowTop = down ? Math.min(...rowTops) : Math.max(...rowTops);
		const distance = (option: HTMLButtonElement) => Math.abs(option.offsetLeft - from.offsetLeft);
		const row = options.filter((option) => option.offsetTop === rowTop);
		focusOption(row.reduce((best, option) => (distance(option) < distance(best) ? option : best)));
	}

	return { registerOption, focusFirstOption, handleGridKeyDown };
}
