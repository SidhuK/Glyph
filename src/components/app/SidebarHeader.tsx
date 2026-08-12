import { useTranslation } from "react-i18next";
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
	const { t } = useTranslation("shell");
	const { getBinding } = useShortcutBindings();
	const autoUpdater = useUpdaterContext();
	const toggleSidebarShortcut = getBinding("toggle-sidebar");
	const sidebarToggleLabel = sidebarCollapsed
		? t("sidebar.expand")
		: t("sidebar.collapse");

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
						ariaLabel={sidebarToggleLabel}
						ariaPressed={!sidebarCollapsed}
						onClick={onToggleSidebar}
						title={`${sidebarToggleLabel}${
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
