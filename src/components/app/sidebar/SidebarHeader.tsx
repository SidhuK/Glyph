import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { useUpdaterContext } from "@/contexts";
import { useShortcutBindings } from "@/hooks/useShortcutBindings";
import { formatShortcutForPlatform } from "@/lib/shortcuts/platform";
import { onWindowDragMouseDown } from "@/utils/window";
import { SidebarLeftIcon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { WindowChromeUpdateButton } from "../WindowChromeUpdateButton";
import { useSidebarRail } from "./sidebarRailContext";

interface SidebarHeaderProps {
	toggleLocked: boolean;
	onToggleSidebar: () => void;
}

/** The traffic-light row. Expanded, the update pill and sidebar toggle share it; in the
 * rail they stack under the traffic lights on the icon column. */
export function SidebarHeader({ toggleLocked, onToggleSidebar }: SidebarHeaderProps) {
	const { t } = useTranslation("shell");
	const { rail } = useSidebarRail();
	const autoUpdater = useUpdaterContext();
	const { getBinding } = useShortcutBindings();
	const toggleShortcut = getBinding("toggle-sidebar");
	const toggleLabel = rail ? t("sidebar.expand") : t("sidebar.collapse");

	return (
		<>
			<div
				aria-hidden="true"
				className="sidebarDragLayer"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			/>
			<div className="sidebarHeader" data-tauri-drag-region>
				<div className="sidebarActions" data-tauri-drag-region>
					<WindowChromeUpdateButton
						updateReady={autoUpdater.updateReady}
						updateVersion={autoUpdater.updateVersion}
						onInstallUpdate={autoUpdater.installAndRelaunch}
					/>
					<button
						type="button"
						className="sidebarToggleButton"
						data-window-drag-ignore
						aria-expanded={!rail}
						aria-label={toggleLabel}
						title={
							toggleShortcut
								? `${toggleLabel} (${formatShortcutForPlatform(toggleShortcut)})`
								: toggleLabel
						}
						disabled={toggleLocked}
						onClick={onToggleSidebar}
					>
						<HugeiconsIcon icon={SidebarLeftIcon} size="var(--sidebar-icon-size, var(--icon-lg))" />
					</button>
				</div>
			</div>
		</>
	);
}
