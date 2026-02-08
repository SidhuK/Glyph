import { onWindowDragMouseDown } from "../../utils/window";
import { Sparkles } from "../Icons";
import { MotionIconButton } from "../MotionUI";

interface MainToolbarProps {
	aiSidebarOpen: boolean;
	onToggleAISidebar: () => void;
}

export function MainToolbar({
	aiSidebarOpen,
	onToggleAISidebar,
}: MainToolbarProps) {
	return (
		<div
			className="mainToolbar"
			data-tauri-drag-region
			onMouseDown={onWindowDragMouseDown}
		>
			<div className="mainToolbarLeft" />
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
