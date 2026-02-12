import { getShortcutTooltip } from "../../lib/shortcuts";
import { onWindowDragMouseDown } from "../../utils/window";
import { Command, FolderOpen, PanelLeftClose, PanelLeftOpen } from "../Icons";
import { Button } from "../ui/shadcn/button";

interface SidebarHeaderProps {
	onOpenVault: () => void;
	onOpenCommandPalette: () => void;
	sidebarCollapsed: boolean;
	onToggleSidebar: () => void;
}

export function SidebarHeader({
	onOpenVault,
	onOpenCommandPalette,
	sidebarCollapsed,
	onToggleSidebar,
}: SidebarHeaderProps) {
	return (
		<>
			<div
				aria-hidden="true"
				className="sidebarDragLayer"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			/>
			<div
				className="sidebarHeader"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			>
				<div className="sidebarActions">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						onClick={onOpenVault}
						title="Open vault"
					>
						<FolderOpen size={14} />
					</Button>
					<Button
						data-sidebar="trigger"
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
						aria-pressed={!sidebarCollapsed}
						data-window-drag-ignore
						onClick={onToggleSidebar}
						title={`${sidebarCollapsed ? "Expand" : "Collapse"} sidebar (${getShortcutTooltip({ meta: true, key: "b" })})`}
					>
						{sidebarCollapsed ? (
							<PanelLeftOpen size={14} />
						) : (
							<PanelLeftClose size={14} />
						)}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						onClick={onOpenCommandPalette}
						title="Command palette (⌘K)"
					>
						<Command size={14} />
					</Button>
				</div>
			</div>
		</>
	);
}
