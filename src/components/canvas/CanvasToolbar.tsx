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
	snapToGrid: boolean;
	hasActiveNote: boolean;
	selectedCount: number;
	hasSelectedLink: boolean;
	onAddText: () => void;
	onAddLink: () => void;
	onAddNote: () => void;
	onRefreshLink: () => void;
	onFrameSelection: () => void;
	onToggleSnap: () => void;
	onReflowGrid: () => void;
	onAlign: (mode: "left" | "right" | "top" | "bottom" | "centerX" | "centerY") => void;
	onDistribute: (axis: "x" | "y") => void;
}

export const CanvasToolbar = memo(function CanvasToolbar({
	title,
	isSaving,
	snapToGrid,
	hasActiveNote,
	selectedCount,
	hasSelectedLink,
	onAddText,
	onAddLink,
	onAddNote,
	onRefreshLink,
	onFrameSelection,
	onToggleSnap,
	onReflowGrid,
	onAlign,
	onDistribute,
}: CanvasToolbarProps) {
	return (
		<div className="canvasToolbar">
			<div className="canvasToolbarLeft">
				<div className="canvasTitle">{title}</div>
				<div className="canvasStatus">
					{isSaving ? "⟳ Saving…" : "✓ Saved"}
				</div>
			</div>
			<div className="canvasToolbarRight">
				<button type="button" className="iconBtn" onClick={onAddText} title="Add text block">
					<Type size={16} />
				</button>
				<button type="button" className="iconBtn" onClick={onAddLink} title="Add link">
					<Link size={16} />
				</button>
				<button
					type="button"
					className="iconBtn"
					onClick={onAddNote}
					disabled={!hasActiveNote}
					title="Add current note to canvas"
				>
					<StickyNote size={16} />
				</button>
				<button
					type="button"
					className="iconBtn"
					onClick={onRefreshLink}
					disabled={!hasSelectedLink}
					title="Refresh selected link preview"
				>
					<RefreshCw size={16} />
				</button>
				<span className="toolbarDivider" />
				<button
					type="button"
					className="iconBtn"
					onClick={onFrameSelection}
					disabled={!selectedCount}
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
				<button type="button" className="iconBtn" onClick={onReflowGrid} title="Reflow to grid">
					<Layout size={16} />
				</button>
				<span className="toolbarDivider" />
				<button
					type="button"
					className="iconBtn"
					onClick={() => onAlign("left")}
					disabled={selectedCount < 2}
					title="Align left"
				>
					<AlignLeft size={16} />
				</button>
				<button
					type="button"
					className="iconBtn"
					onClick={() => onAlign("centerX")}
					disabled={selectedCount < 2}
					title="Align center"
				>
					<AlignCenter size={16} />
				</button>
				<button
					type="button"
					className="iconBtn"
					onClick={() => onAlign("right")}
					disabled={selectedCount < 2}
					title="Align right"
				>
					<AlignRight size={16} />
				</button>
				<button
					type="button"
					className="iconBtn"
					onClick={() => onAlign("top")}
					disabled={selectedCount < 2}
					title="Align top"
				>
					<AlignStartVertical size={16} />
				</button>
				<button
					type="button"
					className="iconBtn"
					onClick={() => onAlign("centerY")}
					disabled={selectedCount < 2}
					title="Align middle"
				>
					<AlignCenterVertical size={16} />
				</button>
				<button
					type="button"
					className="iconBtn"
					onClick={() => onAlign("bottom")}
					disabled={selectedCount < 2}
					title="Align bottom"
				>
					<AlignEndVertical size={16} />
				</button>
				<span className="toolbarDivider" />
				<button
					type="button"
					className="iconBtn"
					onClick={() => onDistribute("x")}
					disabled={selectedCount < 3}
					title="Distribute horizontally"
				>
					<AlignHorizontalSpaceAround size={16} />
				</button>
				<button
					type="button"
					className="iconBtn"
					onClick={() => onDistribute("y")}
					disabled={selectedCount < 3}
					title="Distribute vertically"
				>
					<AlignVerticalSpaceAround size={16} />
				</button>
			</div>
		</div>
	);
});
