import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MouseEvent } from "react";

const WINDOW_DRAG_INTERACTIVE_SELECTOR =
	"button, a, input, textarea, select, [role='button'], [contenteditable='true'], [data-window-drag-ignore]";

export function onWindowDragMouseDown(event: MouseEvent<HTMLElement>): void {
	if (event.button !== 0) return;
	if (event.defaultPrevented) return;

	const target = event.target;
	if (target instanceof Element) {
		const interactiveAncestor = target.closest(
			WINDOW_DRAG_INTERACTIVE_SELECTOR,
		);
		if (interactiveAncestor) return;
	}

	event.preventDefault();
	void getCurrentWindow()
		.startDragging()
		.catch(() => {});
}
