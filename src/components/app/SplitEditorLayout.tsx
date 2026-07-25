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
	DEFAULT_SPLIT_RATIO,
	MAX_SPLIT_RATIO,
	MIN_SPLIT_RATIO,
	type SplitEditorNode,
} from "../../lib/splitEditor";
import { subscribeToSplitEditorDrag } from "./splitEditorDnd";
import type {
	SplitEditorDragSource,
	SplitEditorDropTarget,
} from "./splitEditorDnd";

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
	source: SplitEditorDragSource;
	target: SplitEditorDropTarget;
	bounds: DropPreviewBounds;
}

function dropEdgeAtPoint(
	rect: DOMRect,
	clientX: number,
	clientY: number,
): SplitEditorDropTarget["edge"] {
	const x = (clientX - rect.left) / rect.width;
	const y = (clientY - rect.top) / rect.height;
	const edgeSize = 0.3;
	if (y < edgeSize) return "top";
	if (y > 1 - edgeSize) return "bottom";
	if (x < edgeSize) return "left";
	if (x > 1 - edgeSize) return "right";
	return "center";
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
	const bounds = {
		left: paneLeft + DROP_PREVIEW_INSET,
		top: paneTop + DROP_PREVIEW_INSET,
		width: Math.max(0, paneRect.width - DROP_PREVIEW_INSET * 2),
		height: Math.max(0, paneRect.height - DROP_PREVIEW_INSET * 2),
	};
	if (edge === "left" || edge === "right") {
		bounds.width = Math.max(
			0,
			halfWidth - DROP_PREVIEW_INSET - DROP_PREVIEW_SPLIT_GAP,
		);
		if (edge === "right") {
			bounds.left = paneLeft + halfWidth + DROP_PREVIEW_SPLIT_GAP;
		}
	} else if (edge === "top" || edge === "bottom") {
		bounds.height = Math.max(
			0,
			halfHeight - DROP_PREVIEW_INSET - DROP_PREVIEW_SPLIT_GAP,
		);
		if (edge === "bottom") {
			bounds.top = paneTop + halfHeight + DROP_PREVIEW_SPLIT_GAP;
		}
	}
	return bounds;
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
	const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);
	const pointerRef = useRef({ x: 0, y: 0 });
	const dragSourceRef = useRef<SplitEditorDragSource | null>(null);
	const dropTargetRef = useRef<SplitEditorDropTarget | null>(null);
	const layoutRef = useRef<HTMLDivElement | null>(null);
	const paneElementsRef = useRef(new Map<string, HTMLElement>());

	const updateDropPreview = useCallback((x: number, y: number) => {
		pointerRef.current = { x, y };
		if (!dragSourceRef.current) return;
		const layoutElement = layoutRef.current;
		let paneEntry: [string, HTMLElement] | null = null;
		for (const entry of paneElementsRef.current) {
			const rect = entry[1].getBoundingClientRect();
			if (
				x >= rect.left &&
				x <= rect.right &&
				y >= rect.top &&
				y <= rect.bottom
			) {
				paneEntry = entry;
				break;
			}
		}
		if (!layoutElement || !paneEntry) {
			dropTargetRef.current = null;
			setDropPreview(null);
			return;
		}
		const [paneId, paneElement] = paneEntry;
		const paneRect = paneElement.getBoundingClientRect();
		const target = {
			paneId,
			edge: dropEdgeAtPoint(paneRect, x, y),
		};
		if (
			dropTargetRef.current?.paneId === target.paneId &&
			dropTargetRef.current.edge === target.edge
		) {
			return;
		}
		dropTargetRef.current = target;
		setDropPreview({
			source: dragSourceRef.current,
			target,
			bounds: splitDropPreviewBounds(
				layoutElement.getBoundingClientRect(),
				paneRect,
				target.edge,
			),
		});
	}, []);

	useEffect(() => {
		return subscribeToSplitEditorDrag((event) => {
			if (event.type === "start") {
				dragSourceRef.current = event.source;
				const { x, y } = pointerRef.current;
				updateDropPreview(x, y);
				return;
			}
			if (event.type === "move") {
				updateDropPreview(event.x, event.y);
				return;
			}

			const target = dropTargetRef.current;
			const source = event.source;
			const shouldHandleDrop =
				source &&
				target &&
				(source.kind === "file" ||
					target.edge !== "center" ||
					source.paneId !== target.paneId);
			dragSourceRef.current = null;
			dropTargetRef.current = null;
			setDropPreview(null);
			if (!source || !target || !shouldHandleDrop) return false;
			onDrop(source, target);
			return true;
		});
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
		dropPreview?.source.kind === "tab" &&
		dropPreview?.target.edge === "center" &&
		dropPreview.source.paneId === dropPreview.target.paneId;

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
	const resizeRef = useRef<{ pointerId: number; rect: DOMRect } | null>(null);
	const handlePointerDown = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			const divider = event.currentTarget;
			const branch = divider.parentElement;
			if (!branch) return;
			event.preventDefault();
			setIsResizing(true);
			divider.setPointerCapture(event.pointerId);
			resizeRef.current = {
				pointerId: event.pointerId,
				rect: branch.getBoundingClientRect(),
			};
		},
		[],
	);
	const handlePointerMove = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			const resize = resizeRef.current;
			if (!resize || resize.pointerId !== event.pointerId) return;
			const ratio =
				direction === "horizontal"
					? (event.clientX - resize.rect.left) / resize.rect.width
					: (event.clientY - resize.rect.top) / resize.rect.height;
			onResize(ratio);
		},
		[direction, onResize],
	);
	const handlePointerEnd = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (resizeRef.current?.pointerId !== event.pointerId) return;
			resizeRef.current = null;
			setIsResizing(false);
		},
		[],
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
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerEnd}
			onPointerCancel={handlePointerEnd}
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
