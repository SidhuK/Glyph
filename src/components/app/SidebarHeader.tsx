import { openSettingsWindow } from "../../lib/windows";
import { onWindowDragMouseDown } from "../../utils/window";
import {
	FolderOpen,
	FolderPlus,
	PanelLeftClose,
	PanelLeftOpen,
	Search,
	Settings,
} from "../Icons";
import { MotionIconButton } from "../MotionUI";

interface SidebarHeaderProps {
	vaultPath: string | null;
	sidebarCollapsed: boolean;
	setSidebarCollapsed: (collapsed: boolean) => void;
	showSearch: boolean;
	setShowSearch: (show: boolean) => void;
	onOpenVault: () => void;
	onCreateVault: () => void;
}

export function SidebarHeader({
	vaultPath,
	sidebarCollapsed,
	setSidebarCollapsed,
	showSearch,
	setShowSearch,
	onOpenVault,
	onCreateVault,
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
				{!sidebarCollapsed && (
					<div className="sidebarActions">
						{vaultPath && (
							<MotionIconButton
								type="button"
								size="sm"
								onClick={() => setShowSearch(!showSearch)}
								title="Search"
								active={showSearch}
							>
								<Search size={14} />
							</MotionIconButton>
						)}
						<MotionIconButton
							type="button"
							size="sm"
							onClick={onCreateVault}
							title="Create vault"
						>
							<FolderPlus size={14} />
						</MotionIconButton>
						<MotionIconButton
							type="button"
							size="sm"
							onClick={onOpenVault}
							title="Open vault"
						>
							<FolderOpen size={14} />
						</MotionIconButton>
						<MotionIconButton
							type="button"
							size="sm"
							onClick={() => void openSettingsWindow("general")}
							title="Settings"
						>
							<Settings size={14} />
						</MotionIconButton>
					</div>
				)}
				<MotionIconButton
					type="button"
					size="sm"
					onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
					title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
				>
					{sidebarCollapsed ? (
						<PanelLeftOpen size={14} />
					) : (
						<PanelLeftClose size={14} />
					)}
				</MotionIconButton>
			</div>
		</>
	);
}
