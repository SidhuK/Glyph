import { openSettingsWindow } from "../../lib/windows";
import { onWindowDragMouseDown } from "../../utils/window";
import { FolderOpen, FolderPlus, Search, Settings } from "../Icons";
import { MotionIconButton } from "../MotionUI";

interface SidebarHeaderProps {
	vaultPath: string | null;
	showSearch: boolean;
	setShowSearch: (show: boolean) => void;
	onOpenVault: () => void;
	onCreateVault: () => void;
	onOpenCommandPalette: () => void;
}

export function SidebarHeader({
	vaultPath,
	showSearch,
	setShowSearch,
	onOpenVault,
	onCreateVault,
	onOpenCommandPalette,
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
					<MotionIconButton
						type="button"
						size="sm"
						onClick={onOpenCommandPalette}
						title="Command palette"
					>
						<span className="commandPaletteTrigger">⌘K</span>
					</MotionIconButton>
				</div>
			</div>
		</>
	);
}
