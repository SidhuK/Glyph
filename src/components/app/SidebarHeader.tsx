import * as Icons from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openSettingsWindow } from "../../lib/windows";
import { onWindowDragMouseDown } from "../../utils/window";
import { Command, FolderOpen } from "../Icons";
import { Button } from "../ui/shadcn/button";

interface SidebarHeaderProps {
	onOpenVault: () => void;
	onOpenCommandPalette: () => void;
}

export function SidebarHeader({
	onOpenVault,
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
						onClick={() => void openSettingsWindow()}
						title="Settings"
					>
						<HugeiconsIcon icon={Icons.Settings05Icon} size={14} />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						onClick={onOpenCommandPalette}
						title="Command palette (⌘K)"
					>
						<Command size={14} />
					</Button>
				</div>
			</div>
		</>
	);
}
