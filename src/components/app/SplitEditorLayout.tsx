import {
	type DragEndEvent,
	type DragMoveEvent,
	useDragDropMonitor,
	useDroppable,
} from "@dnd-kit/react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	DEFAULT_SPLIT_RATIO,
	MAX_SPLIT_RATIO,
	MIN_SPLIT_RATIO,
	type SplitEditorNode,
} from "../../lib/splitEditor";
import {
	resolveSplitDragSource,
	splitPaneDroppable,
	splitPaneIdOf,
} from "./splitEditorDnd";
import type {
	SplitEditorDragSource,
	SplitEditorDropTarget,
} from "./splitEditorDnd";

const KEYBOARD_RESIZE_STEP = 0.02;
const KEYBOARD_RESIZE_LARGE_STEP = 0.05;

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
	const [dropPreview, setDropPreview] = useState<SplitEditorDropTarget | null>(
		null,
	);
	// Mirrors the preview so drag end reads the resolved target without
	// depending on when React last re-rendered.
	const dropPreviewRef = useRef<SplitEditorDropTarget | null>(null);

	const setPreview = useCallback((next: SplitEditorDropTarget | null) => {
		const current = dropPreviewRef.current;
		if (current?.paneId === next?.paneId && current?.edge === next?.edge) {
			return;
		}
		dropPreviewRef.current = next;
		setDropPreview(next);
	}, []);

	const dragDropHandlers = useMemo(
		() => ({
			onDragMove(event: DragMoveEvent) {
				const source = resolveSplitDragSource(event.operation.source?.data);
				const target = event.operation.target;
				const paneId = splitPaneIdOf(target?.data);
				const element = target?.element;
				if (!source || !paneId || !element) {
					setPreview(null);
					return;
				}
				const { x, y } = event.operation.position.current;
				const edge = dropEdgeAtPoint(element.getBoundingClientRect(), x, y);
				// Dropping a tab back into the centre of its own pane is a no-op.
				const isSelfDrop =
					source.kind === "tab" &&
					source.paneId === paneId &&
					edge === "center";
				setPreview(isSelfDrop ? null : { paneId, edge });
			},
			onDragEnd(event: DragEndEvent) {
				const target = dropPreviewRef.current;
				setPreview(null);
				if (event.canceled || !target) return;
				const source = resolveSplitDragSource(event.operation.source?.data);
				if (!source) return;
				onDrop(source, target);
			},
		}),
		[onDrop, setPreview],
	);
	useDragDropMonitor(dragDropHandlers);

	const renderNode = useCallback(
		(node: SplitEditorNode): ReactNode => {
			if (node.type === "pane") {
				const focused = node.paneId === focusedPaneId;
				return (
					<SplitEditorPaneSection
						key={node.paneId}
						paneId={node.paneId}
						focused={focused}
						dropEdge={
							dropPreview?.paneId === node.paneId ? dropPreview.edge : null
						}
						onFocusPane={onFocusPane}
					>
						{renderPane(node.paneId, focused)}
					</SplitEditorPaneSection>
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
		[focusedPaneId, dropPreview, onFocusPane, onResizeSplit, renderPane],
	);

	return <div className="splitEditorLayout">{renderNode(layout)}</div>;
}

function SplitEditorPaneSection({
	paneId,
	focused,
	dropEdge,
	onFocusPane,
	children,
}: {
	paneId: string;
	focused: boolean;
	dropEdge: SplitEditorDropTarget["edge"] | null;
	onFocusPane: (paneId: string) => void;
	children: ReactNode;
}) {
	const { ref } = useDroppable(splitPaneDroppable(paneId));

	return (
		<section
			ref={ref}
			className="splitEditorPane"
			data-focused={focused ? "true" : undefined}
			onFocusCapture={() => onFocusPane(paneId)}
			onPointerDownCapture={() => onFocusPane(paneId)}
		>
			{children}
			{dropEdge ? (
				<div
					className="splitEditorDropPreview"
					data-edge={dropEdge}
					aria-hidden="true"
				/>
			) : null}
		</section>
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
