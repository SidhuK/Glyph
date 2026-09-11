import { useUpdaterContext } from "../../contexts";
import { onWindowDragMouseDown } from "../../utils/window";
import { WindowChromeUpdateButton } from "./WindowChromeUpdateButton";

export function SidebarHeader() {
	const autoUpdater = useUpdaterContext();

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
