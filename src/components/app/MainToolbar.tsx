import type { ViewDoc } from "../../lib/views";
import { onWindowDragMouseDown } from "../../utils/window";
import { FolderBreadcrumb } from "../FolderBreadcrumb";
import { Sparkles } from "../Icons";
import { MotionIconButton } from "../MotionUI";

interface MainToolbarProps {
	activeViewDoc: ViewDoc | null;
	aiSidebarOpen: boolean;
	onToggleAISidebar: () => void;
	onOpenFolder: (dir: string) => void;
}

export function MainToolbar({
	activeViewDoc,
	aiSidebarOpen,
	onToggleAISidebar,
	onOpenFolder,
}: MainToolbarProps) {
	return (
		<div
			className="mainToolbar"
			data-tauri-drag-region
			onMouseDown={onWindowDragMouseDown}
		>
			<div className="mainToolbarLeft">
				{activeViewDoc?.kind === "folder" ? (
					<FolderBreadcrumb
						dir={activeViewDoc.selector || ""}
						onOpenFolder={onOpenFolder}
					/>
				) : (
					<span className="canvasTitle">
						{activeViewDoc?.title || "Canvas"}
					</span>
				)}
			</div>
			<div className="mainToolbarRight">
				<MotionIconButton
					type="button"
					active={aiSidebarOpen}
					onClick={onToggleAISidebar}
					title="Toggle AI assistant"
				>
					<Sparkles size={16} />
				</MotionIconButton>
			</div>
		</div>
	);
}
