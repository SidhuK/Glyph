import type { ReactNode } from "react";
import { useUpdaterContext } from "../../contexts";
import { onWindowDragMouseDown } from "../../utils/window";
import { WindowChromeUpdateButton } from "./WindowChromeUpdateButton";

export function SidebarHeader({ children }: { children?: ReactNode }) {
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
				<div className="sidebarActions" data-tauri-drag-region>
					<WindowChromeUpdateButton
						updateReady={autoUpdater.updateReady}
						updateVersion={autoUpdater.updateVersion}
						onInstallUpdate={autoUpdater.installAndRelaunch}
					/>
					{children}
				</div>
			</div>
		</>
	);
}
