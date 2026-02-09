import { openSettingsWindow } from "../../lib/windows";
import { cn } from "../../utils/cn";
import { onWindowDragMouseDown } from "../../utils/window";
import { FolderOpen, FolderPlus, Search, Settings } from "../Icons";
import { Button } from "../ui/shadcn/button";

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
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							onClick={() => setShowSearch(!showSearch)}
							title="Search"
							className={cn(showSearch && "bg-accent text-accent-foreground")}
						>
							<Search size={14} />
						</Button>
					)}
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						onClick={onCreateVault}
						title="Create vault"
					>
						<FolderPlus size={14} />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						onClick={onOpenVault}
						title="Open vault"
					>
						<FolderOpen size={14} />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						onClick={() => void openSettingsWindow("general")}
						title="Settings"
					>
						<Settings size={14} />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						onClick={onOpenCommandPalette}
						title="Command palette"
					>
						<span className="commandPaletteTrigger" aria-label="Command K">
							<kbd>⌘</kbd>
							<kbd>K</kbd>
						</span>
					</Button>
				</div>
			</div>
		</>
	);
}
