import { useShortcutBindings } from "../../hooks/useShortcutBindings";
import { formatShortcutForPlatform } from "../../lib/shortcuts/platform";
import { onWindowDragMouseDown } from "../../utils/window";
import { LayoutAlignLeft } from "../Icons";
import { WindowChromeIconButton } from "./WindowChromeIconButton";

interface SidebarHeaderProps {
	sidebarCollapsed: boolean;
	onToggleSidebar: () => void;
}

export function SidebarHeader({
	sidebarCollapsed,
	onToggleSidebar,
}: SidebarHeaderProps) {
	const { getBinding } = useShortcutBindings();
	const toggleSidebarShortcut = getBinding("toggle-sidebar");

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
					<WindowChromeIconButton
						ariaLabel={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
						ariaPressed={!sidebarCollapsed}
						onClick={onToggleSidebar}
						title={`${sidebarCollapsed ? "Expand" : "Collapse"} sidebar${
							toggleSidebarShortcut
								? ` (${formatShortcutForPlatform(toggleSidebarShortcut)})`
								: ""
						}`}
					>
						<LayoutAlignLeft size={14} />
					</WindowChromeIconButton>
				</div>
			</div>
		</>
	);
}
