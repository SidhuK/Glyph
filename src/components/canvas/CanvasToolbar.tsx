import { memo } from "react";
import {
	AlignCenter,
	AlignCenterVertical,
	AlignEndVertical,
	AlignHorizontalSpaceAround,
	AlignLeft,
	AlignRight,
	AlignStartVertical,
	AlignVerticalSpaceAround,
	Frame,
	Grid3X3,
	Layout,
	Link,
	RefreshCw,
	StickyNote,
	Type,
} from "../Icons";

interface CanvasToolbarProps {
	title: string;
	isSaving: boolean;
	onAddText: () => void;
	onAddLink: () => void;
	onAddNote: () => void;
	activeNoteId: string | null;
	onRefreshSelectedLink: () => void;
	selectedLinkNode: boolean;
	onFrameSelection: () => void;
	selectedNodesCount: number;
	snapToGrid: boolean;
	onToggleSnap: () => void;
	onReflowGrid: () => void;
	applyAlign: (
		mode: "left" | "right" | "top" | "bottom" | "centerX" | "centerY",
	) => void;
	applyDistribute: (axis: "x" | "y") => void;
}

export const CanvasToolbar = memo(function CanvasToolbar({
	title,
	isSaving,
	onAddText,
	onAddLink,
	onAddNote,
	activeNoteId,
	onRefreshSelectedLink,
	selectedLinkNode,
	onFrameSelection,
	selectedNodesCount,
	snapToGrid,
	onToggleSnap,
	onReflowGrid,
	applyAlign,
	applyDistribute,
}: CanvasToolbarProps) {
	return (
		<div className="canvasToolbar">
			<div className="canvasToolbarLeft">
				<div className="canvasTitle">{title}</div>
				<div className="canvasStatus">{isSaving ? "⟳ Saving…" : "✓ Saved"}</div>
			</div>
			<div className="canvasToolbarRight">
				<button
					type="button"
					className="iconBtn"
					onClick={onAddText}
					title="Add text block"
				>
					<Type size={16} />
				</button>
				<button
					type="button"
					className="iconBtn"
					onClick={onAddLink}
					title="Add link"
				>
					<Link size={16} />
				</button>
				<button
					type="button"
					className="iconBtn"
					onClick={onAddNote}
					disabled={!activeNoteId}
					title="Add current note to canvas"
				>
					<StickyNote size={16} />
				</button>
				<button
					type="button"
					className="iconBtn"
					onClick={onRefreshSelectedLink}
					disabled={!selectedLinkNode}
					title="Refresh selected link preview"
				>
					<RefreshCw size={16} />
				</button>
				<span className="toolbarDivider" />
				<button
					type="button"
					className="iconBtn"
					onClick={onFrameSelection}
					disabled={!selectedNodesCount}
					title="Group selection in a frame"
				>
					<Frame size={16} />
				</button>
				<button
					type="button"
					className={`iconBtn ${snapToGrid ? "active" : ""}`}
					onClick={onToggleSnap}
					title="Toggle snap to grid"
				>
					<Grid3X3 size={16} />
				</button>
				<button
					type="button"
					className="iconBtn"
					onClick={onReflowGrid}
					title="Reflow to grid"
				>
					<Layout size={16} />
				</button>
				<span className="toolbarDivider" />
				<button
					type="button"
					className="iconBtn"
					onClick={() => applyAlign("left")}
					disabled={selectedNodesCount < 2}
					title="Align left"
				>
					<AlignLeft size={16} />
				</button>
				<button
					type="button"
					className="iconBtn"
					onClick={() => applyAlign("centerX")}
					disabled={selectedNodesCount < 2}
					title="Align center"
				>
					<AlignCenter size={16} />
				</button>
				<button
					type="button"
					className="iconBtn"
					onClick={() => applyAlign("right")}
					disabled={selectedNodesCount < 2}
					title="Align right"
				>
					<AlignRight size={16} />
				</button>
				<button
					type="button"
					className="iconBtn"
					onClick={() => applyAlign("top")}
					disabled={selectedNodesCount < 2}
					title="Align top"
				>
					<AlignStartVertical size={16} />
				</button>
				<button
					type="button"
					className="iconBtn"
					onClick={() => applyAlign("centerY")}
					disabled={selectedNodesCount < 2}
					title="Align middle"
				>
					<AlignCenterVertical size={16} />
				</button>
				<button
					type="button"
					className="iconBtn"
					onClick={() => applyAlign("bottom")}
					disabled={selectedNodesCount < 2}
					title="Align bottom"
				>
					<AlignEndVertical size={16} />
				</button>
				<span className="toolbarDivider" />
				<button
					type="button"
					className="iconBtn"
					onClick={() => applyDistribute("x")}
					disabled={selectedNodesCount < 3}
					title="Distribute horizontally"
				>
					<AlignHorizontalSpaceAround size={16} />
				</button>
				<button
					type="button"
					className="iconBtn"
					onClick={() => applyDistribute("y")}
					disabled={selectedNodesCount < 3}
					title="Distribute vertically"
				>
					<AlignVerticalSpaceAround size={16} />
				</button>
			</div>
		</div>
	);
});
