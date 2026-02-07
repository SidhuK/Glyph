import { useCallback, useEffect, useRef, useState } from "react";
import {
	loadSettings,
	setAiSidebarWidth as persistAiSidebarWidth,
} from "../lib/settings";

export interface UseAISidebarResult {
	aiSidebarOpen: boolean;
	setAiSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
	aiSidebarWidth: number;
	setAiSidebarWidth: (width: number) => void;
	isResizing: boolean;
	handleResizePointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
	handleResizePointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
	handleResizePointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
	handleResizePointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export function useAISidebar(): UseAISidebarResult {
	const [aiSidebarOpen, setAiSidebarOpen] = useState(false);
	const [aiSidebarWidth, setAiSidebarWidth] = useState(420);
	const [isResizing, setIsResizing] = useState(false);

	const aiSidebarWidthRef = useRef(420);
	const aiSidebarResizingRef = useRef(false);
	const aiSidebarResizeStartRef = useRef<{ x: number; width: number } | null>(
		null,
	);
	const activePointerIdRef = useRef<number | null>(null);
	const pendingWidthRef = useRef<number | null>(null);
	const resizeRafRef = useRef<number | null>(null);

	useEffect(() => {
		aiSidebarWidthRef.current = aiSidebarWidth;
	}, [aiSidebarWidth]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const settings = await loadSettings();
				if (cancelled) return;
				setAiSidebarWidth(settings.ui.aiSidebarWidth ?? 420);
			} catch {
				// ignore
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		return () => {
			if (resizeRafRef.current != null) {
				window.cancelAnimationFrame(resizeRafRef.current);
				resizeRafRef.current = null;
			}
			aiSidebarResizingRef.current = false;
			aiSidebarResizeStartRef.current = null;
			activePointerIdRef.current = null;
		};
	}, []);

	const flushPendingWidth = useCallback(() => {
		if (resizeRafRef.current != null) {
			window.cancelAnimationFrame(resizeRafRef.current);
			resizeRafRef.current = null;
		}
		const pending = pendingWidthRef.current;
		pendingWidthRef.current = null;
		if (pending == null) return;
		setAiSidebarWidth((prev) => (prev === pending ? prev : pending));
	}, []);

	const finishResize = useCallback(() => {
		if (!aiSidebarResizingRef.current) return;
		aiSidebarResizingRef.current = false;
		setIsResizing(false);
		aiSidebarResizeStartRef.current = null;
		activePointerIdRef.current = null;
		flushPendingWidth();
		void persistAiSidebarWidth(aiSidebarWidthRef.current);
	}, [flushPendingWidth]);

	const handleResizePointerDown = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (!aiSidebarOpen) return;
			if (e.button !== 0) return;
			e.preventDefault();
			activePointerIdRef.current = e.pointerId;
			e.currentTarget.setPointerCapture(e.pointerId);
			aiSidebarResizingRef.current = true;
			setIsResizing(true);
			aiSidebarResizeStartRef.current = {
				x: e.clientX,
				width: aiSidebarWidthRef.current,
			};
		},
		[aiSidebarOpen],
	);

	const handleResizePointerMove = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (activePointerIdRef.current !== e.pointerId) return;
			const start = aiSidebarResizeStartRef.current;
			if (!aiSidebarResizingRef.current || !start) return;
			const delta = start.x - e.clientX;
			const next = Math.max(340, Math.min(520, start.width + delta));
			aiSidebarWidthRef.current = next;
			pendingWidthRef.current = next;
			if (resizeRafRef.current != null) return;
			resizeRafRef.current = window.requestAnimationFrame(() => {
				resizeRafRef.current = null;
				const pending = pendingWidthRef.current;
				pendingWidthRef.current = null;
				if (pending == null) return;
				setAiSidebarWidth((prev) => (prev === pending ? prev : pending));
			});
		},
		[],
	);

	const handleResizePointerUp = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (activePointerIdRef.current !== e.pointerId) return;
			if (e.currentTarget.hasPointerCapture(e.pointerId)) {
				e.currentTarget.releasePointerCapture(e.pointerId);
			}
			finishResize();
		},
		[finishResize],
	);

	const handleResizePointerCancel = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (activePointerIdRef.current !== e.pointerId) return;
			if (e.currentTarget.hasPointerCapture(e.pointerId)) {
				e.currentTarget.releasePointerCapture(e.pointerId);
			}
			finishResize();
		},
		[finishResize],
	);

	return {
		aiSidebarOpen,
		setAiSidebarOpen,
		aiSidebarWidth,
		setAiSidebarWidth,
		isResizing,
		handleResizePointerDown,
		handleResizePointerMove,
		handleResizePointerUp,
		handleResizePointerCancel,
	};
}
