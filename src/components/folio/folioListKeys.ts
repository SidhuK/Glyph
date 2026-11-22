import type { KeyboardEvent } from "react";

export function keepKeysOutOfFolioList(event: KeyboardEvent) {
	if (event.key === "Escape" || event.metaKey || event.ctrlKey) return;
	event.stopPropagation();
}
