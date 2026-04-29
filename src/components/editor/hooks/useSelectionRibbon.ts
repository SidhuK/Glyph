import type { Editor } from "@tiptap/core";
import { type RefObject, useEffect, useRef, useState } from "react";
import type {
	SelectionRibbonPlacement,
	SelectionRibbonPosition,
} from "../noteEditorOverlayTypes";
import type { NoteInlineEditorMode } from "../types";
import { getMountedEditorContentRoot } from "./editorDomUtils";

const SELECTION_RIBBON_MARGIN_PX = 12;
const SELECTION_RIBBON_HEIGHT_PX = 40;
const SELECTION_RIBBON_EDGE_PADDING_PX = 18;
const SELECTION_RIBBON_ESTIMATED_HALF_WIDTH_PX = 176;
const SELECTION_RIBBON_HIDE_DELAY_MS = 110;

function getSelectionRibbonPosition(
	host: HTMLElement,
	selection: Selection,
): SelectionRibbonPosition | null {
	if (selection.rangeCount === 0 || selection.isCollapsed) return null;
	const range = selection.getRangeAt(0);
	if (range.collapsed) return null;
	if (!host.contains(range.commonAncestorContainer)) return null;

	const lineRects = Array.from(range.getClientRects()).filter(
		(rect) => rect.width > 0 || rect.height > 0,
	);
	if (lineRects.length === 0) return null;

	const hostRect = host.getBoundingClientRect();
	const firstLineRect = lineRects[0];
	const lastLineRect = lineRects[lineRects.length - 1];
	const firstLineTopWithinHost = firstLineRect.top - hostRect.top;
	const lastLineBottomWithinHost = lastLineRect.bottom - hostRect.top;
	const placeAbove =
		firstLineTopWithinHost >=
		SELECTION_RIBBON_HEIGHT_PX + SELECTION_RIBBON_MARGIN_PX;
	const placement: SelectionRibbonPlacement = placeAbove ? "above" : "below";
	const anchorRect = placement === "above" ? firstLineRect : lastLineRect;
	const top =
		placement === "above"
			? firstLineTopWithinHost - SELECTION_RIBBON_MARGIN_PX
			: lastLineBottomWithinHost + SELECTION_RIBBON_MARGIN_PX;
	const left = anchorRect.left - hostRect.left + anchorRect.width / 2;
	const centerFallback = host.clientWidth / 2;
	const minLeft = Math.min(
		centerFallback,
		SELECTION_RIBBON_EDGE_PADDING_PX + SELECTION_RIBBON_ESTIMATED_HALF_WIDTH_PX,
	);
	const maxLeft = Math.max(
		centerFallback,
		host.clientWidth -
			SELECTION_RIBBON_EDGE_PADDING_PX -
			SELECTION_RIBBON_ESTIMATED_HALF_WIDTH_PX,
	);

	return {
		top: Math.max(0, top),
		left: Math.min(Math.max(left, minLeft), maxLeft),
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
				const next = getSelectionRibbonPosition(host, selection);
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
		window.addEventListener("resize", syncSelectionRibbon);
		return () => {
			if (raf) window.cancelAnimationFrame(raf);
			if (hideTimerRef.current !== null) {
				window.clearTimeout(hideTimerRef.current);
				hideTimerRef.current = null;
			}
			document.removeEventListener("selectionchange", syncSelectionRibbon);
			editor.off("selectionUpdate", syncSelectionRibbon);
			window.removeEventListener("resize", syncSelectionRibbon);
		};
	}, [canEdit, editor, hostRef, mode]);

	return selectionRibbon;
}
