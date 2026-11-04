import type { Popover as PopoverPrimitive } from "@animate-ui/react/primitives/base-ui/popover";
import { isEditableTarget } from "@/utils/keyboard";
import { useCallback, useRef, useState } from "react";

type FlyoutChangeDetails = PopoverPrimitive.Root.ChangeEventDetails;

/** Dismissals the flyout ignores: presses on (or focus moving to) the rail's own library
 * icons, which toggle it themselves; Escape while renaming; and anything inside another
 * popup opened from the flyout (sort menu, tag icon picker, appearance picker). Those
 * popups portal outside the flyout, so Base UI would otherwise read them as outside. */
function keepsFlyoutOpen(
	{ reason, event }: FlyoutChangeDetails,
	host: HTMLElement,
	railStack: HTMLElement | null,
): boolean {
	const target = event instanceof FocusEvent ? event.relatedTarget : event.target;
	if (!(target instanceof Element)) return false;
	const leftForRail = reason === "outside-press" || reason === "focus-out";
	if (leftForRail && railStack?.contains(target)) return true;
	if (reason === "escape-key" && host.contains(target) && isEditableTarget(target)) return true;
	const portal = target.closest("[data-base-ui-portal]");
	return portal !== null && !portal.contains(host);
}

/**
 * The library body (view strip and panels) lives in one DOM node for the sidebar's
 * lifetime. The expanded sidebar's slot holds it, and in the rail the flyout adopts it
 * while open. The panes render once through a portal into this node, so opening the flyout
 * moves the existing file tree (virtualizer, rename, drag and drop, expanded folders and
 * scroll) instead of mounting and fetching for a second copy.
 */
export function useSidebarLibraryFlyout(rail: boolean) {
	const [host] = useState(() => {
		const element = document.createElement("div");
		element.className = "sidebarLibraryBody";
		return element;
	});
	const slotRef = useRef<HTMLDivElement | null>(null);
	const flyoutBodyRef = useRef<HTMLDivElement | null>(null);
	const railStackRef = useRef<HTMLDivElement | null>(null);
	const [flyoutOpen, setFlyoutOpen] = useState(false);
	const [prevRail, setPrevRail] = useState(rail);
	if (prevRail !== rail) {
		setPrevRail(rail);
		setFlyoutOpen(false);
	}

	const attachSlot = useCallback(
		(node: HTMLDivElement | null) => {
			slotRef.current = node;
			if (node && !flyoutBodyRef.current) node.appendChild(host);
		},
		[host],
	);
	const attachFlyoutBody = useCallback(
		(node: HTMLDivElement | null) => {
			if (!node) return undefined;
			flyoutBodyRef.current = node;
			node.appendChild(host);
			return () => {
				flyoutBodyRef.current = null;
				slotRef.current?.appendChild(host);
			};
		},
		[host],
	);

	const close = useCallback(() => setFlyoutOpen(false), []);
	/** Opens the flyout on a view, or closes it when that view is already showing in it. */
	const toggle = (isShowing: boolean, show: () => void) => {
		if (flyoutOpen && isShowing) {
			setFlyoutOpen(false);
			return;
		}
		show();
		setFlyoutOpen(true);
	};
	const handleOpenChange = (nextOpen: boolean, details: FlyoutChangeDetails) => {
		if (!nextOpen && keepsFlyoutOpen(details, host, railStackRef.current)) {
			details.cancel();
			return;
		}
		setFlyoutOpen(nextOpen);
	};

	return {
		host,
		open: rail && flyoutOpen,
		railStackRef,
		attachSlot,
		attachFlyoutBody,
		close,
		toggle,
		handleOpenChange,
	};
}

export type SidebarLibraryFlyout = ReturnType<typeof useSidebarLibraryFlyout>;
