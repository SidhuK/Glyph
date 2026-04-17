import { AnimatePresence, m, useReducedMotion } from "motion/react";
import {
	type PointerEvent as ReactPointerEvent,
	Suspense,
	lazy,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

const importAIPanel = () => import("./AIPanel");

const loadAIPanel = () =>
	importAIPanel().then((module) => ({
		default: module.AIPanel,
	}));

const LazyAIPanel = lazy(loadAIPanel);

interface AIFloatingHostProps {
	isOpen: boolean;
	onToggle: () => void;
}

type ResizeDirection =
	| "top"
	| "right"
	| "bottom"
	| "left"
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right";

const FLOATING_PANEL_MIN_WIDTH = 360;
const FLOATING_PANEL_MIN_HEIGHT = 360;
const FLOATING_PANEL_DEFAULT_WIDTH = 460;
const FLOATING_PANEL_DEFAULT_HEIGHT = 620;
const FLOATING_PANEL_VIEWPORT_GAP = 32;

export function AIFloatingHost({ isOpen, onToggle }: AIFloatingHostProps) {
	const shouldReduceMotion = useReducedMotion();
	const [panelSize, setPanelSize] = useState({
		width: FLOATING_PANEL_DEFAULT_WIDTH,
		height: FLOATING_PANEL_DEFAULT_HEIGHT,
	});
	const resizeStateRef = useRef<{
		direction: ResizeDirection;
		startX: number;
		startY: number;
		startWidth: number;
		startHeight: number;
	} | null>(null);

	const clampSize = useCallback((width: number, height: number) => {
		const maxWidth = Math.max(
			FLOATING_PANEL_MIN_WIDTH,
			window.innerWidth - FLOATING_PANEL_VIEWPORT_GAP,
		);
		const maxHeight = Math.max(
			FLOATING_PANEL_MIN_HEIGHT,
			window.innerHeight - FLOATING_PANEL_VIEWPORT_GAP,
		);
		return {
			width: Math.max(FLOATING_PANEL_MIN_WIDTH, Math.min(maxWidth, width)),
			height: Math.max(FLOATING_PANEL_MIN_HEIGHT, Math.min(maxHeight, height)),
		};
	}, []);

	const handlePointerMove = useCallback(
		(event: PointerEvent) => {
			const resizeState = resizeStateRef.current;
			if (!resizeState) return;
			const deltaX = event.clientX - resizeState.startX;
			const deltaY = event.clientY - resizeState.startY;

			let nextWidth = resizeState.startWidth;
			let nextHeight = resizeState.startHeight;

			if (resizeState.direction.includes("left")) {
				nextWidth = resizeState.startWidth - deltaX;
			} else if (resizeState.direction.includes("right")) {
				nextWidth = resizeState.startWidth + deltaX;
			}

			if (resizeState.direction.includes("top")) {
				nextHeight = resizeState.startHeight - deltaY;
			} else if (resizeState.direction.includes("bottom")) {
				nextHeight = resizeState.startHeight + deltaY;
			}

			setPanelSize(clampSize(nextWidth, nextHeight));
		},
		[clampSize],
	);

	const stopResize = useCallback(() => {
		resizeStateRef.current = null;
		window.removeEventListener("pointermove", handlePointerMove);
		window.removeEventListener("pointerup", stopResize);
	}, [handlePointerMove]);

	const startResize = useCallback(
		(direction: ResizeDirection, event: ReactPointerEvent<HTMLDivElement>) => {
			event.preventDefault();
			event.stopPropagation();
			resizeStateRef.current = {
				direction,
				startX: event.clientX,
				startY: event.clientY,
				startWidth: panelSize.width,
				startHeight: panelSize.height,
			};
			window.addEventListener("pointermove", handlePointerMove);
			window.addEventListener("pointerup", stopResize);
		},
		[handlePointerMove, panelSize.height, panelSize.width, stopResize],
	);

	useEffect(() => {
		if (!isOpen) return;
		let cancelled = false;
		void importAIPanel()
			.then((module) => {
				if (cancelled) return;
				void module.prefetchAIPanelData();
			})
			.catch((error) => {
				console.error("Failed to preload AI panel data", error);
			});
		return () => {
			cancelled = true;
		};
	}, [isOpen]);

	useEffect(() => {
		const onWindowResize = () => {
			setPanelSize((current) => clampSize(current.width, current.height));
		};
		window.addEventListener("resize", onWindowResize);
		return () => {
			window.removeEventListener("resize", onWindowResize);
			stopResize();
		};
	}, [clampSize, stopResize]);

	return (
		<div className="aiFloatingWindowHost" data-window-drag-ignore>
			<AnimatePresence>
				{isOpen && (
					<m.div
						key="ai-floating-window"
						className="aiFloatingWindow"
						style={{ width: panelSize.width, height: panelSize.height }}
						initial={
							shouldReduceMotion ? false : { opacity: 0, y: 10, scale: 0.98 }
						}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={shouldReduceMotion ? {} : { opacity: 0, y: 8, scale: 0.98 }}
						transition={
							shouldReduceMotion
								? { duration: 0 }
								: { type: "spring", stiffness: 360, damping: 28 }
						}
					>
						<Suspense fallback={<div className="aiFloatingWindowInner" />}>
							<div className="aiFloatingWindowInner">
								<LazyAIPanel isOpen={isOpen} onClose={onToggle} />
							</div>
						</Suspense>
						<div
							className="aiFloatingResizeHandle aiFloatingResizeHandle-top"
							onPointerDown={(event) => startResize("top", event)}
						/>
						<div
							className="aiFloatingResizeHandle aiFloatingResizeHandle-right"
							onPointerDown={(event) => startResize("right", event)}
						/>
						<div
							className="aiFloatingResizeHandle aiFloatingResizeHandle-bottom"
							onPointerDown={(event) => startResize("bottom", event)}
						/>
						<div
							className="aiFloatingResizeHandle aiFloatingResizeHandle-left"
							onPointerDown={(event) => startResize("left", event)}
						/>
						<div
							className="aiFloatingResizeHandle aiFloatingResizeHandle-top-left"
							onPointerDown={(event) => startResize("top-left", event)}
						/>
						<div
							className="aiFloatingResizeHandle aiFloatingResizeHandle-top-right"
							onPointerDown={(event) => startResize("top-right", event)}
						/>
						<div
							className="aiFloatingResizeHandle aiFloatingResizeHandle-bottom-left"
							onPointerDown={(event) => startResize("bottom-left", event)}
						/>
						<div
							className="aiFloatingResizeHandle aiFloatingResizeHandle-bottom-right"
							onPointerDown={(event) => startResize("bottom-right", event)}
						/>
					</m.div>
				)}
			</AnimatePresence>
		</div>
	);
}
