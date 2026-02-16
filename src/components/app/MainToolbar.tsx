import { cn } from "@/lib/utils";
import { AiBrain04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { onWindowDragMouseDown } from "../../utils/window";
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
					aria-label="Toggle AI panel"
				>
					<HugeiconsIcon icon={AiBrain04Icon} size={20} />
				</Button>
			</div>
		</div>
	);
}
