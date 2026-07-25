import {
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	listenForSplitEditorDragEnd,
	listenForSplitEditorDragMove,
	listenForSplitEditorDragStart,
	splitEditorDropTargetAtPoint,
} from "./splitEditorDnd";
import type {
	SplitEditorDragSource,
	SplitEditorDropTarget,
} from "./splitEditorDnd";
import {
	DEFAULT_SPLIT_RATIO,
	MAX_SPLIT_RATIO,
	MIN_SPLIT_RATIO,
} from "./splitEditorModel";
import type { SplitEditorNode } from "./splitEditorModel";

const KEYBOARD_RESIZE_STEP = 0.02;
const KEYBOARD_RESIZE_LARGE_STEP = 0.05;
const DROP_PREVIEW_INSET = 8;
const DROP_PREVIEW_SPLIT_GAP = 6;

interface DropPreviewBounds {
	left: number;
	top: number;
	width: number;
	height: number;
}

interface DropPreview {
	target: SplitEditorDropTarget;
	bounds: DropPreviewBounds;
}

function splitDropPreviewBounds(
	layoutRect: DOMRect,
	paneRect: DOMRect,
	edge: SplitEditorDropTarget["edge"],
): DropPreviewBounds {
	const paneLeft = paneRect.left - layoutRect.left;
	const paneTop = paneRect.top - layoutRect.top;
	const halfWidth = paneRect.width / 2;
	const halfHeight = paneRect.height / 2;
	const fullWidth = Math.max(0, paneRect.width - DROP_PREVIEW_INSET * 2);
	const fullHeight = Math.max(0, paneRect.height - DROP_PREVIEW_INSET * 2);
	const splitWidth = Math.max(
		0,
		halfWidth - DROP_PREVIEW_INSET - DROP_PREVIEW_SPLIT_GAP,
	);
	const splitHeight = Math.max(
		0,
		halfHeight - DROP_PREVIEW_INSET - DROP_PREVIEW_SPLIT_GAP,
	);

	if (edge === "left") {
		return {
			left: paneLeft + DROP_PREVIEW_INSET,
			top: paneTop + DROP_PREVIEW_INSET,
			width: splitWidth,
			height: fullHeight,
		};
	}
	if (edge === "right") {
		return {
			left: paneLeft + halfWidth + DROP_PREVIEW_SPLIT_GAP,
			top: paneTop + DROP_PREVIEW_INSET,
			width: splitWidth,
			height: fullHeight,
		};
	}
	if (edge === "top") {
		return {
			left: paneLeft + DROP_PREVIEW_INSET,
			top: paneTop + DROP_PREVIEW_INSET,
			width: fullWidth,
			height: splitHeight,
		};
	}
	if (edge === "bottom") {
		return {
			left: paneLeft + DROP_PREVIEW_INSET,
			top: paneTop + halfHeight + DROP_PREVIEW_SPLIT_GAP,
			width: fullWidth,
			height: splitHeight,
		};
	}
	return {
		left: paneLeft + DROP_PREVIEW_INSET,
		top: paneTop + DROP_PREVIEW_INSET,
		width: fullWidth,
		height: fullHeight,
	};
}

interface SplitEditorLayoutProps {
	layout: SplitEditorNode;
	focusedPaneId: string;
	onFocusPane: (paneId: string) => void;
	onDrop: (
		source: SplitEditorDragSource,
		target: SplitEditorDropTarget,
	) => void;
	onResizeSplit: (splitId: string, ratio: number) => void;
	renderPane: (paneId: string, focused: boolean) => ReactNode;
}

export function SplitEditorLayout({
	layout,
	focusedPaneId,
	onFocusPane,
	onDrop,
	onResizeSplit,
	renderPane,
}: SplitEditorLayoutProps) {
	const [dragSource, setDragSource] =
		useState<SplitEditorDragSource | null>(null);
	const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);
	const pointerRef = useRef({ x: 0, y: 0 });
	const dragSourceRef = useRef<SplitEditorDragSource | null>(null);
	const layoutRef = useRef<HTMLDivElement | null>(null);
	const paneElementsRef = useRef(new Map<string, HTMLElement>());

	const updateDropPreview = useCallback((x: number, y: number) => {
		pointerRef.current = { x, y };
		if (!dragSourceRef.current) return;
		const target = splitEditorDropTargetAtPoint(x, y);
		const layoutElement = layoutRef.current;
		const paneElement = target
			? paneElementsRef.current.get(target.paneId)
			: null;
		if (!target || !layoutElement || !paneElement) {
			setDropPreview(null);
			return;
		}
		setDropPreview({
			target,
			bounds: splitDropPreviewBounds(
				layoutElement.getBoundingClientRect(),
				paneElement.getBoundingClientRect(),
				target.edge,
			),
		});
	}, []);

	useEffect(() => {
		const stopStart = listenForSplitEditorDragStart((source) => {
			dragSourceRef.current = source;
			setDragSource(source);
			const { x, y } = pointerRef.current;
			updateDropPreview(x, y);
		});
		const stopMove = listenForSplitEditorDragMove((x, y) => {
			updateDropPreview(x, y);
		});
		const stopEnd = listenForSplitEditorDragEnd((source, event) => {
			const { x, y } = pointerRef.current;
			const target = splitEditorDropTargetAtPoint(x, y);
			const shouldHandleDrop =
				source &&
				target &&
				(source.kind === "file" ||
					target.edge !== "center" ||
					source.paneId !== target.paneId);
			if (source && target && shouldHandleDrop) {
				event.preventDefault();
				onDrop(source, target);
			}
			dragSourceRef.current = null;
			setDragSource(null);
			setDropPreview(null);
		});
		return () => {
			stopStart();
			stopMove();
			stopEnd();
		};
	}, [onDrop, updateDropPreview]);

	const renderNode = useCallback(
		(node: SplitEditorNode): ReactNode => {
			if (node.type === "pane") {
				const focused = node.paneId === focusedPaneId;
				return (
					<section
						key={node.paneId}
						ref={(element) => {
							if (element) {
								paneElementsRef.current.set(node.paneId, element);
							} else {
								paneElementsRef.current.delete(node.paneId);
							}
						}}
						className="splitEditorPane"
						data-focused={focused ? "true" : undefined}
						data-split-editor-pane-id={node.paneId}
						onFocusCapture={() => onFocusPane(node.paneId)}
						onPointerDownCapture={() => onFocusPane(node.paneId)}
					>
						{renderPane(node.paneId, focused)}
					</section>
				);
			}

			return (
				<div
					key={node.id}
					className="splitEditorBranch"
					data-direction={node.direction}
				>
					<div
						className="splitEditorBranchChild"
						style={{ flexBasis: `${node.ratio * 100}%` }}
					>
						{renderNode(node.first)}
					</div>
					<SplitDivider
						direction={node.direction}
						ratio={node.ratio}
						onResize={(ratio) => onResizeSplit(node.id, ratio)}
					/>
					<div
						className="splitEditorBranchChild"
						style={{ flexBasis: `${(1 - node.ratio) * 100}%` }}
					>
						{renderNode(node.second)}
					</div>
				</div>
			);
		},
		[
			focusedPaneId,
			onFocusPane,
			onResizeSplit,
			renderPane,
		],
	);

	const suppressSamePaneCenterPreview =
		dragSource?.kind === "tab" &&
		dropPreview?.target.edge === "center" &&
		dragSource.paneId === dropPreview.target.paneId;

	return (
		<div ref={layoutRef} className="splitEditorLayout">
			{renderNode(layout)}
			{dropPreview && !suppressSamePaneCenterPreview ? (
				<div
					className="splitEditorDropPreview"
					aria-hidden="true"
					style={dropPreview.bounds}
				/>
			) : null}
		</div>
	);
}

function SplitDivider({
	direction,
	ratio,
	onResize,
}: {
	direction: "horizontal" | "vertical";
	ratio: number;
	onResize: (ratio: number) => void;
}) {
	const [isResizing, setIsResizing] = useState(false);
	const handlePointerDown = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			const divider = event.currentTarget;
			const branch = divider.parentElement;
			if (!branch) return;
			event.preventDefault();
			setIsResizing(true);
			divider.setPointerCapture(event.pointerId);
			const rect = branch.getBoundingClientRect();
			const handlePointerMove = (moveEvent: PointerEvent) => {
				const ratio =
					direction === "horizontal"
						? (moveEvent.clientX - rect.left) / rect.width
						: (moveEvent.clientY - rect.top) / rect.height;
				onResize(ratio);
			};
			const handlePointerUp = () => {
				setIsResizing(false);
				divider.removeEventListener("pointermove", handlePointerMove);
				divider.removeEventListener("pointerup", handlePointerUp);
				divider.removeEventListener("pointercancel", handlePointerUp);
			};
			divider.addEventListener("pointermove", handlePointerMove);
			divider.addEventListener("pointerup", handlePointerUp);
			divider.addEventListener("pointercancel", handlePointerUp);
		},
		[direction, onResize],
	);

	const handleKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLDivElement>) => {
			const step = event.shiftKey
				? KEYBOARD_RESIZE_LARGE_STEP
				: KEYBOARD_RESIZE_STEP;
			let nextRatio: number | null = null;

			if (
				(direction === "horizontal" && event.key === "ArrowLeft") ||
				(direction === "vertical" && event.key === "ArrowUp")
			) {
				nextRatio = ratio - step;
			} else if (
				(direction === "horizontal" && event.key === "ArrowRight") ||
				(direction === "vertical" && event.key === "ArrowDown")
			) {
				nextRatio = ratio + step;
			} else if (event.key === "Home") {
				nextRatio = MIN_SPLIT_RATIO;
			} else if (event.key === "End") {
				nextRatio = MAX_SPLIT_RATIO;
			}

			if (nextRatio === null) return;
			event.preventDefault();
			onResize(nextRatio);
		},
		[direction, onResize, ratio],
	);

	return (
		<div
			className="splitEditorDivider"
			data-direction={direction}
			data-resizing={isResizing ? "true" : undefined}
			onPointerDown={handlePointerDown}
			onDoubleClick={() => onResize(DEFAULT_SPLIT_RATIO)}
			onKeyDown={handleKeyDown}
			role="separator"
			aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
			aria-valuemin={MIN_SPLIT_RATIO * 100}
			aria-valuemax={MAX_SPLIT_RATIO * 100}
			aria-valuenow={Math.round(ratio * 100)}
			tabIndex={0}
		/>
	);
}
