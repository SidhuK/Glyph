import { cn } from "../../utils/cn";
import { onWindowDragMouseDown } from "../../utils/window";
import { Sparkles } from "../Icons";
import { Button } from "../ui/shadcn/button";

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
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className={cn(aiSidebarOpen && "bg-accent text-accent-foreground")}
					onClick={onToggleAISidebar}
					title="Toggle AI assistant"
				>
					<Sparkles size={16} />
				</Button>
			</div>
		</div>
	);
}
