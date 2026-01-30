import { memo } from "react";
import { Layout, Plus } from "./Icons";
import type { CanvasMeta } from "../lib/tauri";

interface CanvasesPaneProps {
	canvases: CanvasMeta[];
	activeCanvasId: string | null;
	onSelectCanvas: (id: string) => void;
	onCreateCanvas: () => void;
}

export const CanvasesPane = memo(function CanvasesPane({
	canvases,
	activeCanvasId,
	onSelectCanvas,
	onCreateCanvas,
}: CanvasesPaneProps) {
	return (
		<aside className="canvasesPane">
			<div className="canvasesPaneHeader">
				<h2 className="canvasesPaneTitle">
					<Layout size={14} />
					Canvases
				</h2>
				<button
					type="button"
					className="iconBtn"
					onClick={onCreateCanvas}
					title="New canvas"
				>
					<Plus size={16} />
				</button>
			</div>
			<ul className="canvasesList">
				{canvases.map((c) => {
					const isActive = c.id === activeCanvasId;
					return (
						<li
							key={c.id}
							className={
								isActive ? "canvasesListItem active" : "canvasesListItem"
							}
						>
							<button
								type="button"
								className="canvasesListButton"
								onClick={() => onSelectCanvas(c.id)}
							>
								<div className="canvasesListTitle">{c.title || "Canvas"}</div>
								<div className="canvasesListMeta">{c.updated}</div>
							</button>
						</li>
					);
				})}
			</ul>
		</aside>
	);
});
