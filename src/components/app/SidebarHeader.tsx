import { PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getShortcutTooltip } from "../../lib/shortcuts";
import { onWindowDragMouseDown } from "../../utils/window";
import { LayoutAlignLeft } from "../Icons";
import { WindowChromeIconButton } from "./WindowChromeIconButton";
import { WindowChromeUpdateButton } from "./WindowChromeUpdateButton";

interface SidebarHeaderProps {
	sidebarCollapsed: boolean;
	onToggleSidebar: () => void;
	onNewNote: () => void;
	updateReady: boolean;
	updateVersion: string | null;
	onInstallUpdate: () => void;
}

export function SidebarHeader({
	sidebarCollapsed,
	onToggleSidebar,
	onNewNote,
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
						ariaLabel="Create a new note"
						onClick={onNewNote}
						title={`New note (${getShortcutTooltip({ meta: true, key: "n" })})`}
					>
						<HugeiconsIcon icon={PencilEdit02Icon} size={14} />
					</WindowChromeIconButton>
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
				</div>
			</div>
		</>
	);
}
