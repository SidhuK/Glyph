import { useEffect, useState } from "react";

const DIM_AFTER_MS = 1000;

function isTypingKey(event: KeyboardEvent): boolean {
	if (event.metaKey || event.ctrlKey || event.altKey) return false;
	return (
		event.key.length === 1 ||
		event.key === "Enter" ||
		event.key === "Backspace" ||
		event.key === "Delete" ||
		event.key === "Tab"
	);
}

/**
 * Fades window chrome out of the way while writing and brings it back on the
 * next mouse move or Escape. Keyboard and pointer are external systems, so the
 * listeners live in an effect.
 */
export function useDimChromeWhileTyping(): boolean {
	const [dimmed, setDimmed] = useState(false);

	useEffect(() => {
		let dimTimer: number | null = null;

		const clearDimTimer = () => {
			if (dimTimer !== null) {
				window.clearTimeout(dimTimer);
				dimTimer = null;
			}
		};

		const scheduleDim = () => {
			if (dimTimer !== null) return;
			dimTimer = window.setTimeout(() => {
				dimTimer = null;
				setDimmed(true);
			}, DIM_AFTER_MS);
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				clearDimTimer();
				setDimmed(false);
				return;
			}
			if (!isTypingKey(event)) return;
			scheduleDim();
		};

		const restore = () => {
			clearDimTimer();
			setDimmed((current) => (current ? false : current));
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("mousemove", restore);
		window.addEventListener("blur", restore);
		return () => {
			clearDimTimer();
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("mousemove", restore);
			window.removeEventListener("blur", restore);
		};
	}, []);

	return dimmed;
}
