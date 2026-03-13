import { getShortcutTooltip } from "../../lib/shortcuts";
import { onWindowDragMouseDown } from "../../utils/window";
import { LayoutAlignLeft } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { WindowChromeUpdateButton } from "./WindowChromeUpdateButton";

interface SidebarHeaderProps {
	sidebarCollapsed: boolean;
	onToggleSidebar: () => void;
	updateReady: boolean;
	updateVersion: string | null;
	onInstallUpdate: () => void;
}

export function SidebarHeader({
	sidebarCollapsed,
	onToggleSidebar,
	updateReady,
	updateVersion,
	onInstallUpdate,
}: SidebarHeaderProps) {
	return (
		<>
			<div
				aria-hidden="true"
				className="sidebarDragLayer"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			/>
			<div className="sidebarHeader" data-tauri-drag-region>
				<div className="sidebarActions">
					<Button
						data-sidebar="trigger"
						type="button"
						variant="ghost"
						size="icon-sm"
						className="windowChromeSidebarToggle"
						aria-label={
							sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
						}
						aria-pressed={!sidebarCollapsed}
						data-window-drag-ignore
						onClick={onToggleSidebar}
						title={`${sidebarCollapsed ? "Expand" : "Collapse"} sidebar (${getShortcutTooltip({ meta: true, key: "b" })})`}
					>
						<LayoutAlignLeft size={14} />
					</Button>
					<WindowChromeUpdateButton
						updateReady={updateReady}
						updateVersion={updateVersion}
						onInstallUpdate={onInstallUpdate}
					/>
				</div>
			</div>
		</>
	);
}
