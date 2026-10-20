import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PreviewCard, PreviewCardContent } from "../ui/shadcn/preview-card";
import { NotePreviewContent } from "./NotePreviewContent";
import {
	NOTE_PREVIEW_OPEN_DELAY_MS,
	type NotePreviewData,
	loadNotePreviewFromWikiTarget,
	wikiTargetFromLink,
} from "./notePreviewShared";
import { useNotePreview } from "./useNotePreview";

/** Grace period for crossing between a link and its card before the card closes. */
const CLOSE_DELAY_MS = 300;
const CARD_GAP_PX = 10;
const VIEWPORT_PADDING_PX = 12;
// Stay beside the link; when neither side fits, shift rather than drop below it.
const COLLISION_AVOIDANCE = { fallbackAxisSide: "none" } as const;

/** The link's rect as of hovering; the card closes on scroll and resize rather than tracking it. */
interface LinkAnchor {
	getBoundingClientRect: () => DOMRect;
}

interface HoveredLink {
	link: HTMLElement;
	target: string;
	anchor: LinkAnchor;
}

interface ShownCard {
	anchor: LinkAnchor;
	data: NotePreviewData;
}

/** The wiki link the pointer crossed into or out of, ignoring moves within one link. */
function crossedWikiLink(event: PointerEvent): HTMLElement | null {
	const target = event.target instanceof Element ? event.target : null;
	const link = target?.closest(".wikiLink[data-target]");
	if (!(link instanceof HTMLElement)) return null;
	const related = event.relatedTarget;
	return related instanceof Node && link.contains(related) ? null : link;
}

/** Hover card previewing the note behind a wiki link in the editor. */
export function LinkedNotePreviewSheet() {
	const { t } = useTranslation("editor");
	const [hovered, setHovered] = useState<HoveredLink | null>(null);
	const previewData = useNotePreview(hovered?.target ?? null, {
		delayMs: NOTE_PREVIEW_OPEN_DELAY_MS,
		load: loadNotePreviewFromWikiTarget,
	});
	// The card keeps its last anchor and content while it animates out.
	const [card, setCard] = useState<ShownCard | null>(null);
	if (hovered && previewData && (card?.anchor !== hovered.anchor || card.data !== previewData)) {
		setCard({ anchor: hovered.anchor, data: previewData });
	}
	const popupRef = useRef<HTMLElement | null>(null);
	const closeTimerRef = useRef<number | null>(null);
	// The popup renders as <aside>, so keep it as an HTMLElement rather than the div the ref types.
	const setPopupElement = useCallback((node: HTMLElement | null) => {
		popupRef.current = node;
	}, []);

	const clearCloseTimer = useCallback(() => {
		if (closeTimerRef.current === null) return;
		window.clearTimeout(closeTimerRef.current);
		closeTimerRef.current = null;
	}, []);

	const closePreview = useCallback(() => {
		clearCloseTimer();
		setHovered(null);
	}, [clearCloseTimer]);

	const scheduleClose = useCallback(() => {
		clearCloseTimer();
		closeTimerRef.current = window.setTimeout(closePreview, CLOSE_DELAY_MS);
	}, [clearCloseTimer, closePreview]);

	useEffect(() => {
		const onPointerOver = (event: PointerEvent) => {
			const link = crossedWikiLink(event);
			const target = link ? wikiTargetFromLink(link) : null;
			if (!link || !target) return;
			clearCloseTimer();
			const rect = link.getBoundingClientRect();
			setHovered((current) =>
				current?.link === link
					? current
					: { link, target, anchor: { getBoundingClientRect: () => rect } },
			);
		};

		const onPointerOut = (event: PointerEvent) => {
			if (!crossedWikiLink(event)) return;
			// Before the card shows there is nothing to cross into, so stop waiting for it.
			if (popupRef.current) scheduleClose();
			else closePreview();
		};

		const onScroll = (event: Event) => {
			const target = event.target;
			if (target instanceof Node && popupRef.current?.contains(target)) return;
			closePreview();
		};

		document.addEventListener("pointerover", onPointerOver);
		document.addEventListener("pointerout", onPointerOut);
		window.addEventListener("scroll", onScroll, true);
		window.addEventListener("resize", closePreview);
		return () => {
			document.removeEventListener("pointerover", onPointerOver);
			document.removeEventListener("pointerout", onPointerOut);
			window.removeEventListener("scroll", onScroll, true);
			window.removeEventListener("resize", closePreview);
			clearCloseTimer();
		};
	}, [clearCloseTimer, closePreview, scheduleClose]);

	return (
		<PreviewCard
			open={hovered !== null && previewData !== null}
			onOpenChange={(open) => {
				if (!open) closePreview();
			}}
		>
			<PreviewCardContent
				ref={setPopupElement}
				render={<aside />}
				positionerClassName="linkedNotePreviewPositioner"
				className="linkedNotePreviewSheet"
				anchor={card?.anchor}
				side="right"
				sideOffset={CARD_GAP_PX}
				collisionPadding={VIEWPORT_PADDING_PX}
				collisionAvoidance={COLLISION_AVOIDANCE}
				aria-label={t("linkPreview.label")}
				onPointerEnter={clearCloseTimer}
				onPointerLeave={scheduleClose}
			>
				{card ? (
					<div className="linkedNotePreviewBody">
						<NotePreviewContent {...card.data} />
					</div>
				) : null}
			</PreviewCardContent>
		</PreviewCard>
	);
}
