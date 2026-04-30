import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { parseNotePreview } from "../../lib/notePreview";
import { invoke } from "../../lib/tauri";
import { normalizeRelPath } from "../../utils/path";

interface Position {
	left: number;
	top: number;
}

type PointerPosition = Position;

interface PreviewState {
	target: string;
	content: string;
	error: string;
	loading: boolean;
	anchor: DOMRect;
	position: Position;
}

const PREVIEW_MAX_BYTES = 96 * 1024;
const OPEN_DELAY_MS = 280;
const CLOSE_DELAY_MS = 700;
const SHEET_WIDTH = 360;
const SHEET_GAP = 10;
const VIEWPORT_PADDING = 12;
const ESTIMATED_SHEET_HEIGHT = 260;

function targetFromLink(element: HTMLElement): string | null {
	if (element.getAttribute("data-wikilink-embed") === "true") return null;
	if (element.getAttribute("data-unresolved") === "true") return null;
	const target = element.getAttribute("data-target") ?? "";
	const normalized = normalizeRelPath(target.split("#", 1)[0] ?? target);
	return normalized || null;
}

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
	preview: PreviewState,
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
	const [preview, setPreview] = useState<PreviewState | null>(null);
	const sheetRef = useRef<HTMLElement | null>(null);
	const previewRef = useRef<PreviewState | null>(null);
	const pointerRef = useRef<PointerPosition | null>(null);
	const openTimerRef = useRef<number | null>(null);
	const closeTimerRef = useRef<number | null>(null);
	const requestIdRef = useRef(0);

	const clearOpenTimer = useCallback(() => {
		if (openTimerRef.current === null) return;
		window.clearTimeout(openTimerRef.current);
		openTimerRef.current = null;
	}, []);

	const clearCloseTimer = useCallback(() => {
		if (closeTimerRef.current === null) return;
		window.clearTimeout(closeTimerRef.current);
		closeTimerRef.current = null;
	}, []);

	const closePreview = useCallback(() => {
		clearOpenTimer();
		clearCloseTimer();
		requestIdRef.current += 1;
		setPreview(null);
	}, [clearCloseTimer, clearOpenTimer]);

	const scheduleClose = useCallback(() => {
		clearOpenTimer();
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
	}, [clearCloseTimer, clearOpenTimer, closePreview]);

	const showPreview = useCallback(
		(link: HTMLElement, target: string) => {
			clearOpenTimer();
			clearCloseTimer();
			requestIdRef.current += 1;
			const requestId = requestIdRef.current;
			const anchor = link.getBoundingClientRect();
			const position = positionSheet(
				anchor,
				SHEET_WIDTH,
				ESTIMATED_SHEET_HEIGHT,
			);

			openTimerRef.current = window.setTimeout(() => {
				if (requestIdRef.current !== requestId) return;
				setPreview({
					target,
					content: "",
					error: "",
					loading: true,
					anchor,
					position,
				});

				void (async () => {
					try {
						const relPath = await invoke("space_resolve_wikilink", { target });
						if (!relPath) {
							throw new Error("Note not found");
						}
						const doc = await invoke("space_read_text_preview", {
							path: relPath,
							max_bytes: PREVIEW_MAX_BYTES,
						});
						const { content } = parseNotePreview(relPath, doc.text);
						if (requestIdRef.current !== requestId) return;
						setPreview({
							target,
							content,
							error: "",
							loading: false,
							anchor,
							position,
						});
					} catch (e) {
						if (requestIdRef.current !== requestId) return;
						setPreview({
							target,
							content: "",
							error: e instanceof Error ? e.message : String(e),
							loading: false,
							anchor,
							position,
						});
					}
				})();
			}, OPEN_DELAY_MS);
		},
		[clearCloseTimer, clearOpenTimer],
	);

	useLayoutEffect(() => {
		if (!preview || !sheetRef.current) return;
		const rect = sheetRef.current.getBoundingClientRect();
		const position = positionSheet(preview.anchor, rect.width, rect.height);
		if (isSamePosition(position, preview.position)) return;
		setPreview((current) =>
			current?.target === preview.target ? { ...current, position } : current,
		);
	}, [preview]);

	useEffect(() => {
		previewRef.current = preview;
	}, [preview]);

	useEffect(() => {
		const onPointerMove = (event: PointerEvent) => {
			pointerRef.current = { left: event.clientX, top: event.clientY };
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
			const noteTarget = targetFromLink(link);
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
			clearOpenTimer();
			clearCloseTimer();
		};
	}, [
		clearCloseTimer,
		clearOpenTimer,
		closePreview,
		scheduleClose,
		showPreview,
	]);

	if (!preview) return null;

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
				{preview.loading ? (
					<div className="markdownEditorInfoEmpty">Loading preview…</div>
				) : null}
				{!preview.loading && preview.error ? (
					<div className="markdownEditorInfoEmpty">{preview.error}</div>
				) : null}
				{!preview.loading && !preview.error ? (
					<pre className="linkedNotePreviewText">
						{preview.content.trim() || "Empty note"}
					</pre>
				) : null}
			</div>
		</aside>,
		document.body,
	);
}
