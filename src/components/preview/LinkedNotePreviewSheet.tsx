import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { NotePreviewContent } from "./NotePreviewContent";
import {
	NOTE_PREVIEW_OPEN_DELAY_MS,
	loadNotePreviewFromWikiTarget,
	wikiTargetFromLink,
} from "./notePreviewShared";
import { useNotePreview } from "./useNotePreview";

interface Position {
	left: number;
	top: number;
}

type PointerPosition = Position;

interface HoverTarget {
	target: string;
	anchor: DOMRect;
}

interface SheetPreview {
	target: string;
	anchor: DOMRect;
	position: Position;
}

const CLOSE_DELAY_MS = 700;
const SHEET_WIDTH = 360;
const SHEET_GAP = 10;
const VIEWPORT_PADDING = 12;
const ESTIMATED_SHEET_HEIGHT = 260;

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function positionSheet(
	anchor: DOMRect,
	width: number,
	height: number,
): Position {
	const viewportWidth =
		window.innerWidth || document.documentElement.clientWidth;
	const viewportHeight =
		window.innerHeight || document.documentElement.clientHeight;
	const sheetWidth = Math.min(width, viewportWidth - VIEWPORT_PADDING * 2);
	const sheetHeight = Math.min(height, viewportHeight - VIEWPORT_PADDING * 2);
	const rightLeft = anchor.right + SHEET_GAP;
	const leftLeft = anchor.left - SHEET_GAP - sheetWidth;
	const fitsRight = rightLeft + sheetWidth <= viewportWidth - VIEWPORT_PADDING;
	const fitsLeft = leftLeft >= VIEWPORT_PADDING;
	const rightSpace =
		viewportWidth - VIEWPORT_PADDING - anchor.right - SHEET_GAP;
	const leftSpace = anchor.left - VIEWPORT_PADDING - SHEET_GAP;
	const preferredLeft = fitsRight
		? rightLeft
		: fitsLeft
			? leftLeft
			: rightSpace >= leftSpace
				? rightLeft
				: leftLeft;
	const maxLeft = Math.max(
		VIEWPORT_PADDING,
		viewportWidth - VIEWPORT_PADDING - sheetWidth,
	);
	const maxTop = Math.max(
		VIEWPORT_PADDING,
		viewportHeight - VIEWPORT_PADDING - sheetHeight,
	);

	return {
		left: clamp(preferredLeft, VIEWPORT_PADDING, maxLeft),
		top: clamp(
			anchor.top + anchor.height / 2 - sheetHeight / 2,
			VIEWPORT_PADDING,
			maxTop,
		),
	};
}

function isSamePosition(a: Position, b: Position): boolean {
	return (
		Math.round(a.left) === Math.round(b.left) &&
		Math.round(a.top) === Math.round(b.top)
	);
}

function pointInRect(point: PointerPosition, rect: DOMRect): boolean {
	return (
		point.left >= rect.left &&
		point.left <= rect.right &&
		point.top >= rect.top &&
		point.top <= rect.bottom
	);
}

function pointInPreviewSafeArea(
	point: PointerPosition,
	preview: SheetPreview,
	sheet: HTMLElement | null,
): boolean {
	if (!sheet) return false;
	const sheetRect = sheet.getBoundingClientRect();
	if (pointInRect(point, sheetRect) || pointInRect(point, preview.anchor)) {
		return true;
	}

	const gapLeft = Math.min(sheetRect.left, preview.anchor.right);
	const gapRight = Math.max(sheetRect.right, preview.anchor.left);
	const gapTop = Math.min(sheetRect.top, preview.anchor.top) - 8;
	const gapBottom = Math.max(sheetRect.bottom, preview.anchor.bottom) + 8;
	return (
		point.left >= gapLeft &&
		point.left <= gapRight &&
		point.top >= gapTop &&
		point.top <= gapBottom
	);
}

export function LinkedNotePreviewSheet() {
	const [hover, setHover] = useState<HoverTarget | null>(null);
	const [position, setPosition] = useState<Position | null>(null);
	const previewData = useNotePreview(hover?.target ?? null, {
		delayMs: NOTE_PREVIEW_OPEN_DELAY_MS,
		load: loadNotePreviewFromWikiTarget,
	});
	const sheetRef = useRef<HTMLElement | null>(null);
	const previewRef = useRef<SheetPreview | null>(null);
	const pointerRef = useRef<PointerPosition | null>(null);
	const closeTimerRef = useRef<number | null>(null);

	const preview = useMemo((): SheetPreview | null => {
		if (!hover || !previewData) return null;
		return {
			target: hover.target,
			anchor: hover.anchor,
			position:
				position ??
				positionSheet(hover.anchor, SHEET_WIDTH, ESTIMATED_SHEET_HEIGHT),
		};
	}, [hover, position, previewData]);

	const clearCloseTimer = useCallback(() => {
		if (closeTimerRef.current === null) return;
		window.clearTimeout(closeTimerRef.current);
		closeTimerRef.current = null;
	}, []);

	const closePreview = useCallback(() => {
		clearCloseTimer();
		setHover(null);
		setPosition(null);
	}, [clearCloseTimer]);

	const scheduleClose = useCallback(() => {
		clearCloseTimer();
		closeTimerRef.current = window.setTimeout(() => {
			const point = pointerRef.current;
			const currentPreview = previewRef.current;
			if (
				point &&
				currentPreview &&
				pointInPreviewSafeArea(point, currentPreview, sheetRef.current)
			) {
				return;
			}
			closePreview();
		}, CLOSE_DELAY_MS);
	}, [clearCloseTimer, closePreview]);

	const showPreview = useCallback(
		(link: HTMLElement, target: string) => {
			clearCloseTimer();
			setPosition(null);
			setHover({ target, anchor: link.getBoundingClientRect() });
		},
		[clearCloseTimer],
	);

	useEffect(() => {
		if (!hover) {
			setPosition(null);
		}
	}, [hover]);

	useLayoutEffect(() => {
		if (!preview || !sheetRef.current) return;
		const rect = sheetRef.current.getBoundingClientRect();
		const nextPosition = positionSheet(preview.anchor, rect.width, rect.height);
		if (isSamePosition(nextPosition, preview.position)) return;
		setPosition(nextPosition);
	}, [preview]);

	useEffect(() => {
		previewRef.current = preview;
	}, [preview]);

	useEffect(() => {
		const onPointerMove = (event: PointerEvent) => {
			const point = { left: event.clientX, top: event.clientY };
			pointerRef.current = point;
			const currentPreview = previewRef.current;
			if (
				currentPreview &&
				!pointInPreviewSafeArea(point, currentPreview, sheetRef.current)
			) {
				closePreview();
			}
		};

		const onPointerOver = (event: PointerEvent) => {
			pointerRef.current = { left: event.clientX, top: event.clientY };
			const target = event.target instanceof Element ? event.target : null;
			const link = target?.closest(
				".wikiLink[data-target]",
			) as HTMLElement | null;
			if (!link) return;
			const related = event.relatedTarget;
			if (related instanceof Node && link.contains(related)) return;
			const noteTarget = wikiTargetFromLink(link);
			if (noteTarget) showPreview(link, noteTarget);
		};

		const onPointerOut = (event: PointerEvent) => {
			pointerRef.current = { left: event.clientX, top: event.clientY };
			const target = event.target instanceof Element ? event.target : null;
			const link = target?.closest(
				".wikiLink[data-target]",
			) as HTMLElement | null;
			if (!link) return;
			const related = event.relatedTarget;
			if (related instanceof Node && link.contains(related)) return;
			scheduleClose();
		};

		const onScroll = (event: Event) => {
			const target = event.target;
			if (target instanceof Node && sheetRef.current?.contains(target)) return;
			closePreview();
		};

		document.addEventListener("pointermove", onPointerMove);
		document.addEventListener("pointerover", onPointerOver);
		document.addEventListener("pointerout", onPointerOut);
		window.addEventListener("scroll", onScroll, true);
		window.addEventListener("resize", closePreview);
		return () => {
			document.removeEventListener("pointermove", onPointerMove);
			document.removeEventListener("pointerover", onPointerOver);
			document.removeEventListener("pointerout", onPointerOut);
			window.removeEventListener("scroll", onScroll, true);
			window.removeEventListener("resize", closePreview);
			clearCloseTimer();
		};
	}, [clearCloseTimer, closePreview, scheduleClose, showPreview]);

	if (!preview || !previewData) return null;

	return createPortal(
		<aside
			ref={sheetRef}
			className="linkedNotePreviewSheet"
			data-side={
				preview.position.left >= preview.anchor.right ? "right" : "left"
			}
			style={preview.position}
			onPointerEnter={clearCloseTimer}
			onPointerLeave={scheduleClose}
			aria-label="Linked note preview"
		>
			<div className="linkedNotePreviewBody">
				<NotePreviewContent {...previewData} />
			</div>
		</aside>,
		document.body,
	);
}
