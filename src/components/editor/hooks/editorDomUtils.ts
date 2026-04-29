export function getMountedEditorContentRoot(
	host: HTMLElement | null,
): HTMLElement | null {
	if (!host) return null;
	return host.querySelector<HTMLElement>(".ProseMirror");
}

export function getOffsetWithinAncestor(
	element: HTMLElement,
	ancestor: HTMLElement,
): { left: number; top: number } {
	const elementRect = element.getBoundingClientRect();
	const ancestorRect = ancestor.getBoundingClientRect();
	return {
		left: elementRect.left - ancestorRect.left + ancestor.scrollLeft,
		top: elementRect.top - ancestorRect.top + ancestor.scrollTop,
	};
}

export function isVisibleEditorHost(host: HTMLDivElement): boolean {
	const style = window.getComputedStyle(host);
	return (
		host.isConnected &&
		host.offsetParent !== null &&
		style.display !== "none" &&
		style.visibility !== "hidden"
	);
}
