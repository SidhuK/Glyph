import { memo } from "react";
import { cn } from "../../utils/cn";
import {
	ChevronRight,
	Frame,
	Grid3X3,
	Layout,
	Link,
	RefreshCw,
	StickyNote,
	Type,
} from "../Icons";
import { Button } from "../ui/shadcn/button";

interface CanvasToolbarProps {
	collapsed: boolean;
	snapToGrid: boolean;
	hasActiveNote: boolean;
	selectedCount: number;
	hasSelectedLink: boolean;
	onToggleCollapsed: () => void;
	onAddText: () => void;
	onAddLink: () => void;
	onAddNote: () => void;
	onRefreshLink: () => void;
	onFrameSelection: () => void;
	onToggleSnap: () => void;
	onReflowGrid: () => void;
}

export const CanvasToolbar = memo(function CanvasToolbar({
	collapsed,
	snapToGrid,
	hasActiveNote,
	selectedCount,
	hasSelectedLink,
	onToggleCollapsed,
	onAddText,
	onAddLink,
	onAddNote,
	onRefreshLink,
	onFrameSelection,
	onToggleSnap,
	onReflowGrid,
}: CanvasToolbarProps) {
	if (collapsed) {
		return (
			<div className="canvasToolbar">
				<Button
					variant="ghost"
					size="icon"
					type="button"
					onClick={onToggleCollapsed}
					title="Expand toolbar"
				>
					<ChevronRight size={16} />
				</Button>
			</div>
		);
	}

	return (
		<div className="canvasToolbar">
			<Button
				variant="ghost"
				size="icon"
				type="button"
				onClick={onToggleCollapsed}
				title="Collapse toolbar"
			>
				<ChevronRight size={16} style={{ transform: "rotate(180deg)" }} />
			</Button>
			<span className="toolbarDivider" />
			<Button
				variant="ghost"
				size="icon"
				type="button"
				onClick={onAddText}
				title="Add text block"
			>
				<Type size={16} />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				type="button"
				onClick={onAddLink}
				title="Add link"
			>
				<Link size={16} />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				type="button"
				onClick={onAddNote}
				disabled={!hasActiveNote}
				title="Add current note to canvas"
			>
				<StickyNote size={16} />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				type="button"
				onClick={onRefreshLink}
				disabled={!hasSelectedLink}
				title="Refresh selected link preview"
			>
				<RefreshCw size={16} />
			</Button>
			<span className="toolbarDivider" />
			<Button
				variant="ghost"
				size="icon"
				type="button"
				onClick={onFrameSelection}
				disabled={!selectedCount}
				title="Group selection in a frame"
			>
				<Frame size={16} />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				type="button"
				className={cn(snapToGrid && "bg-accent text-accent-foreground")}
				onClick={onToggleSnap}
				title="Toggle snap to grid"
			>
				<Grid3X3 size={16} />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				type="button"
				onClick={onReflowGrid}
				title="Reflow to grid"
			>
				<Layout size={16} />
			</Button>
		</div>
	);
});
