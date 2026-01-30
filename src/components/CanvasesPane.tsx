import { memo } from "react";
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
				<h2 className="canvasesPaneTitle">Canvases</h2>
				<button type="button" onClick={onCreateCanvas}>
					New
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
