import { getShortcutTooltip } from "../../lib/shortcuts";
import type { GitSyncStatus } from "../../lib/tauri";
import { onWindowDragMouseDown } from "../../utils/window";
import { LayoutAlignLeft } from "../Icons";
import { WindowChromeGitSyncButton } from "./WindowChromeGitSyncButton";
import { WindowChromeIconButton } from "./WindowChromeIconButton";
import { WindowChromeUpdateButton } from "./WindowChromeUpdateButton";

interface SidebarHeaderProps {
	sidebarCollapsed: boolean;
	onToggleSidebar: () => void;
	gitSyncStatus: GitSyncStatus | null;
	onGitSyncNow: () => void;
	onOpenGitSettings: () => void;
	updateReady: boolean;
	updateVersion: string | null;
	onInstallUpdate: () => void;
}

export function SidebarHeader({
	sidebarCollapsed,
	onToggleSidebar,
	gitSyncStatus,
	onGitSyncNow,
	onOpenGitSettings,
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
					<WindowChromeIconButton
						ariaLabel={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
						ariaPressed={!sidebarCollapsed}
						onClick={onToggleSidebar}
						title={`${sidebarCollapsed ? "Expand" : "Collapse"} sidebar (${getShortcutTooltip({ meta: true, shift: true, key: "b" })})`}
					>
						<LayoutAlignLeft size={14} />
					</WindowChromeIconButton>
					<WindowChromeUpdateButton
						updateReady={updateReady}
						updateVersion={updateVersion}
						onInstallUpdate={onInstallUpdate}
					/>
					<WindowChromeGitSyncButton
						status={gitSyncStatus}
						onSyncNow={onGitSyncNow}
						onOpenSettings={onOpenGitSettings}
					/>
				</div>
			</div>
		</>
	);
}
