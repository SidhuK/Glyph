import type { Editor } from "@tiptap/core";
import { type RefObject, useEffect, useRef, useState } from "react";
import type { SelectionRibbonPosition } from "../noteEditorOverlayTypes";
import type { NoteInlineEditorMode } from "../types";
import { getMountedEditorContentRoot } from "./editorDomUtils";

const SELECTION_RIBBON_MARGIN_PX = 12;
const SELECTION_RIBBON_HEIGHT_PX = 40;
const SELECTION_RIBBON_EDGE_PADDING_PX = 18;
const SELECTION_RIBBON_HIDE_DELAY_MS = 110;

function getTextStartWithinHost(host: HTMLElement, hostRect: DOMRect) {
	const contentRoot = getMountedEditorContentRoot(host);
	if (!contentRoot) return SELECTION_RIBBON_EDGE_PADDING_PX;

	const contentRect = contentRoot.getBoundingClientRect();
	const styles = window.getComputedStyle(contentRoot);
	const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
	const textStart = contentRect.left - hostRect.left + paddingLeft;
	const maxLeft = Math.max(
		SELECTION_RIBBON_EDGE_PADDING_PX,
		host.clientWidth - SELECTION_RIBBON_EDGE_PADDING_PX,
	);
	return Math.min(
		Math.max(textStart, SELECTION_RIBBON_EDGE_PADDING_PX),
		maxLeft,
	);
}

function getSelectionRibbonPosition(
	host: HTMLElement,
	selection: Selection,
	scrollHost: HTMLElement | null,
): SelectionRibbonPosition | null {
	if (selection.rangeCount === 0 || selection.isCollapsed) return null;
	const range = selection.getRangeAt(0);
	if (range.collapsed) return null;
	if (!host.contains(range.commonAncestorContainer)) return null;

	const hostRect = host.getBoundingClientRect();
	const viewportRect = scrollHost?.getBoundingClientRect() ?? hostRect;
	const selectionRect = Array.from(range.getClientRects()).find((rect) => {
		if (rect.width <= 0 || rect.height <= 0) return false;
		if (rect.bottom < viewportRect.top || rect.top > viewportRect.bottom) {
			return false;
		}
		return rect.right >= viewportRect.left && rect.left <= viewportRect.right;
	});
	if (!selectionRect) return null;

	const selectionTopWithinHost = selectionRect.top - hostRect.top;
	const selectionBottomWithinHost = selectionRect.bottom - hostRect.top;
	const selectionTopWithinViewport = selectionRect.top - viewportRect.top;
	const placeAbove =
		selectionTopWithinViewport >=
		SELECTION_RIBBON_HEIGHT_PX + SELECTION_RIBBON_MARGIN_PX;
	const placement = placeAbove ? "above" : "below";
	const top =
		placement === "above"
			? selectionTopWithinHost - SELECTION_RIBBON_MARGIN_PX
			: selectionBottomWithinHost + SELECTION_RIBBON_MARGIN_PX;

	return {
		top: Math.max(0, top),
		left: getTextStartWithinHost(host, hostRect),
		placement,
	};
}

interface UseSelectionRibbonArgs {
	canEdit: boolean;
	editor: Editor | null;
	hostRef: RefObject<HTMLDivElement | null>;
	mode: NoteInlineEditorMode;
}

export function useSelectionRibbon({
	canEdit,
	editor,
	hostRef,
	mode,
}: UseSelectionRibbonArgs): SelectionRibbonPosition | null {
	const [selectionRibbon, setSelectionRibbon] =
		useState<SelectionRibbonPosition | null>(null);
	const hideTimerRef = useRef<number | null>(null);

	useEffect(() => {
		if (!editor || mode !== "rich" || !canEdit) {
			if (hideTimerRef.current !== null) {
				window.clearTimeout(hideTimerRef.current);
				hideTimerRef.current = null;
			}
			setSelectionRibbon(null);
			return;
		}
		const host = hostRef.current;
		if (!host || !getMountedEditorContentRoot(host)) return;
		const scrollHost = host.closest(
			".rfNodeNoteEditorBody",
		) as HTMLElement | null;
		let raf = 0;

		const clearSoon = () => {
			if (hideTimerRef.current !== null) {
				window.clearTimeout(hideTimerRef.current);
			}
			hideTimerRef.current = window.setTimeout(() => {
				hideTimerRef.current = null;
				setSelectionRibbon(null);
			}, SELECTION_RIBBON_HIDE_DELAY_MS);
		};

		const syncSelectionRibbon = () => {
			if (raf) window.cancelAnimationFrame(raf);
			raf = window.requestAnimationFrame(() => {
				raf = 0;
				const selection = window.getSelection();
				if (!selection) {
					clearSoon();
					return;
				}
				const next = getSelectionRibbonPosition(host, selection, scrollHost);
				if (!next) {
					clearSoon();
					return;
				}
				if (hideTimerRef.current !== null) {
					window.clearTimeout(hideTimerRef.current);
					hideTimerRef.current = null;
				}
				setSelectionRibbon((current) => {
					if (
						current &&
						current.top === next.top &&
						current.left === next.left &&
						current.placement === next.placement
					) {
						return current;
					}
					return next;
				});
			});
		};

		syncSelectionRibbon();
		document.addEventListener("selectionchange", syncSelectionRibbon);
		editor.on("selectionUpdate", syncSelectionRibbon);
		scrollHost?.addEventListener("scroll", syncSelectionRibbon, {
			passive: true,
		});
		window.addEventListener("resize", syncSelectionRibbon);
		return () => {
			if (raf) window.cancelAnimationFrame(raf);
			if (hideTimerRef.current !== null) {
				window.clearTimeout(hideTimerRef.current);
				hideTimerRef.current = null;
			}
			document.removeEventListener("selectionchange", syncSelectionRibbon);
			editor.off("selectionUpdate", syncSelectionRibbon);
			scrollHost?.removeEventListener("scroll", syncSelectionRibbon);
			window.removeEventListener("resize", syncSelectionRibbon);
		};
	}, [canEdit, editor, hostRef, mode]);

	return selectionRibbon;
}
