import {
	LogicalSize,
	PhysicalPosition,
	getCurrentWindow,
} from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";

const FRAME_STORAGE_KEY = "glyph.quickNote.frame";
const MIN_WINDOW_HEIGHT = 210;
const MAX_WINDOW_HEIGHT = 620;
/** Rounding and OS chrome make exact height matches unreliable. */
const HEIGHT_MATCH_TOLERANCE_PX = 3;

interface StoredFrame {
	x: number;
	y: number;
	width?: number;
	height?: number;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function readStoredFrame(): StoredFrame | null {
	try {
		const raw = window.localStorage.getItem(FRAME_STORAGE_KEY);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return null;
		const frame: Record<string, unknown> = { ...parsed };
		if (!isFiniteNumber(frame.x) || !isFiniteNumber(frame.y)) return null;
		return {
			x: frame.x,
			y: frame.y,
			width: isFiniteNumber(frame.width) ? frame.width : undefined,
			height: isFiniteNumber(frame.height) ? frame.height : undefined,
		};
	} catch {
		return null;
	}
}

function writeStoredFrame(frame: StoredFrame) {
	try {
		window.localStorage.setItem(FRAME_STORAGE_KEY, JSON.stringify(frame));
	} catch {
		// A full or disabled store only costs us the remembered position.
	}
}

function clampWindowHeight(height: number): number {
	const screenLimit = Math.round(window.screen.availHeight * 0.7);
	const maxHeight = Math.max(
		MIN_WINDOW_HEIGHT,
		Math.min(MAX_WINDOW_HEIGHT, screenLimit),
	);
	return Math.round(Math.min(maxHeight, Math.max(MIN_WINDOW_HEIGHT, height)));
}

interface QuickNoteWindowFrameOptions {
	/** Scroll host whose natural height drives the window height. */
	editorAreaElement: HTMLElement | null;
	/** Editor content root; changes here are what make the area grow. */
	contentElement: HTMLElement | null;
}

/**
 * Keeps the floating panel where the user left it and sized to its content.
 * The OS window is an external system, so all of this lives in effects.
 */
export function useQuickNoteWindowFrame({
	editorAreaElement,
	contentElement,
}: QuickNoteWindowFrameOptions) {
	const [windowFocused, setWindowFocused] = useState(true);
	const storedFrameRef = useRef<StoredFrame | null>(null);
	const manualSizeRef = useRef(false);
	const autoHeightRef = useRef<number | null>(null);

	useEffect(() => {
		const appWindow = getCurrentWindow();
		const stored = readStoredFrame();
		storedFrameRef.current = stored;
		if (!stored) return;
		manualSizeRef.current = stored.width !== undefined;
		void appWindow.setPosition(new PhysicalPosition(stored.x, stored.y));
		if (stored.width !== undefined && stored.height !== undefined) {
			void appWindow.setSize(new LogicalSize(stored.width, stored.height));
		}
	}, []);

	useEffect(() => {
		const appWindow = getCurrentWindow();
		const unlistenPromises = [
			appWindow.onMoved(({ payload }) => {
				storedFrameRef.current = {
					...storedFrameRef.current,
					x: payload.x,
					y: payload.y,
				};
				writeStoredFrame(storedFrameRef.current);
			}),
			appWindow.onResized(() => {
				const autoHeight = autoHeightRef.current;
				const isAutoResize =
					autoHeight !== null &&
					Math.abs(window.innerHeight - autoHeight) <=
						HEIGHT_MATCH_TOLERANCE_PX;
				if (isAutoResize) return;
				manualSizeRef.current = true;
				const previous = storedFrameRef.current ?? { x: 0, y: 0 };
				storedFrameRef.current = {
					...previous,
					width: window.innerWidth,
					height: window.innerHeight,
				};
				writeStoredFrame(storedFrameRef.current);
			}),
			appWindow.onFocusChanged(({ payload }) => setWindowFocused(payload)),
		];

		return () => {
			for (const pending of unlistenPromises) {
				void pending.then((unlisten) => unlisten()).catch(() => {});
			}
		};
	}, []);

	useEffect(() => {
		if (!editorAreaElement || !contentElement) return;
		const appWindow = getCurrentWindow();

		const fitWindowToContent = () => {
			if (manualSizeRef.current) return;
			const chromeHeight = window.innerHeight - editorAreaElement.clientHeight;
			const nextHeight = clampWindowHeight(
				chromeHeight + editorAreaElement.scrollHeight,
			);
			if (
				Math.abs(nextHeight - window.innerHeight) <= HEIGHT_MATCH_TOLERANCE_PX
			) {
				return;
			}
			autoHeightRef.current = nextHeight;
			void appWindow.setSize(new LogicalSize(window.innerWidth, nextHeight));
		};

		const observer = new ResizeObserver(fitWindowToContent);
		observer.observe(contentElement);
		fitWindowToContent();
		return () => observer.disconnect();
	}, [contentElement, editorAreaElement]);

	return { windowFocused };
}
