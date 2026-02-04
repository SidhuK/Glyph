import { useCallback, useEffect, useRef, useState } from "react";
import {
	loadSettings,
	setAiSidebarWidth as persistAiSidebarWidth,
} from "../lib/settings";

export interface UseAISidebarResult {
	aiSidebarOpen: boolean;
	setAiSidebarOpen: (open: boolean) => void;
	aiSidebarWidth: number;
	setAiSidebarWidth: (width: number) => void;
	aiSidebarWidthRef: React.RefObject<number>;
	aiSidebarResizingRef: React.RefObject<boolean>;
	aiSidebarResizeStartRef: React.RefObject<{ x: number; width: number } | null>;
	handleResizeMouseDown: (e: React.MouseEvent) => void;
}

export function useAISidebar(): UseAISidebarResult {
	const [aiSidebarOpen, setAiSidebarOpen] = useState(false);
	const [aiSidebarWidth, setAiSidebarWidth] = useState(420);

	const aiSidebarWidthRef = useRef(420);
	const aiSidebarResizingRef = useRef(false);
	const aiSidebarResizeStartRef = useRef<{ x: number; width: number } | null>(
		null,
	);

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

	const handleResizeMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (!aiSidebarOpen) return;
			if (e.button !== 0) return;
			e.preventDefault();
			aiSidebarResizingRef.current = true;
			aiSidebarResizeStartRef.current = {
				x: e.clientX,
				width: aiSidebarWidth,
			};

			const onMove = (evt: globalThis.MouseEvent) => {
				const start = aiSidebarResizeStartRef.current;
				if (!aiSidebarResizingRef.current || !start) return;
				const delta = start.x - evt.clientX;
				const next = Math.max(340, Math.min(520, start.width + delta));
				setAiSidebarWidth(next);
			};

			const onUp = () => {
				if (!aiSidebarResizingRef.current) return;
				aiSidebarResizingRef.current = false;
				aiSidebarResizeStartRef.current = null;
				window.removeEventListener("mousemove", onMove);
				window.removeEventListener("mouseup", onUp);
				void persistAiSidebarWidth(aiSidebarWidthRef.current);
			};

			window.addEventListener("mousemove", onMove);
			window.addEventListener("mouseup", onUp, { once: true });
		},
		[aiSidebarOpen, aiSidebarWidth],
	);

	return {
		aiSidebarOpen,
		setAiSidebarOpen,
		aiSidebarWidth,
		setAiSidebarWidth,
		aiSidebarWidthRef,
		aiSidebarResizingRef,
		aiSidebarResizeStartRef,
		handleResizeMouseDown,
	};
}
