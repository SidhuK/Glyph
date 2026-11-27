const FLOATING_UI_SELECTOR = [
	'[data-slot="popover-content"]',
	".glyphMenuPositioner",
	".glyphMenuPopup",
	"[data-sileo-viewport]",
].join(", ");

export function dismissOnOutsidePointer(onDismiss: () => void) {
	return (node: HTMLElement | null) => {
		if (!node) return;
		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			if (node.contains(target) || target.closest(FLOATING_UI_SELECTOR)) return;
			const active = document.activeElement;
			if (active instanceof HTMLElement && node.contains(active)) active.blur();
			onDismiss();
		};
		document.addEventListener("pointerdown", handlePointerDown, true);
		return () => document.removeEventListener("pointerdown", handlePointerDown, true);
	};
}
