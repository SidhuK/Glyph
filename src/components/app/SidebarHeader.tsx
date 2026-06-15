import { useUpdaterContext } from "../../contexts";
import { useShortcutBindings } from "../../hooks/useShortcutBindings";
import { formatShortcutForPlatform } from "../../lib/shortcuts/platform";
import { onWindowDragMouseDown } from "../../utils/window";
import { LayoutAlignLeft } from "../Icons";
import { WindowChromeIconButton } from "./WindowChromeIconButton";
import { WindowChromeUpdateButton } from "./WindowChromeUpdateButton";

interface SidebarHeaderProps {
	sidebarCollapsed: boolean;
	onToggleSidebar: () => void;
}

export function SidebarHeader({
	sidebarCollapsed,
	onToggleSidebar,
}: SidebarHeaderProps) {
	const { getBinding } = useShortcutBindings();
	const autoUpdater = useUpdaterContext();
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
						<LayoutAlignLeft size="var(--icon-md)" />
					</WindowChromeIconButton>
					<WindowChromeUpdateButton
						updateReady={autoUpdater.updateReady}
						updateVersion={autoUpdater.updateVersion}
						onInstallUpdate={autoUpdater.installAndRelaunch}
					/>
				</div>
			</div>
		</>
	);
}
