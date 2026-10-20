import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItemIcon,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import type { IconSvgElement } from "@hugeicons/react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { FILE_TREE_SORT_MODES, fileTreeSortLabel } from "../../lib/fileTreeSort";
import type { FileTreeSortMode } from "../../lib/settings";
import { FILE_TREE_SORT_ICONS } from "./fileTreeSortIcons";

interface FileTreeSortMenuProps {
	sortMode: FileTreeSortMode;
	onSortModeChange: (sortMode: FileTreeSortMode) => void;
	triggerClassName: string;
	icon: IconSvgElement;
	iconSize: string;
}

// Keep menu keystrokes (navigation, activation, typeahead) away from keyboard
// handlers in surrounding panes; React bubbles portal events through the tree.
// Escape and modifier shortcuts still propagate.
function stopMenuKeyPropagation(event: KeyboardEvent) {
	if (event.key === "Escape" || event.metaKey || event.ctrlKey) return;
	event.stopPropagation();
}

/** Icon trigger plus a radio menu of the file tree sort modes. */
export function FileTreeSortMenu({
	sortMode,
	onSortModeChange,
	triggerClassName,
	icon,
	iconSize,
}: FileTreeSortMenuProps) {
	const { t } = useTranslation("shell");
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<button
						type="button"
						className={triggerClassName}
						title={`${t("sidebar.sortNotes")}: ${fileTreeSortLabel(sortMode)}`}
						aria-label={t("sidebar.sortNotes")}
						onKeyDown={stopMenuKeyPropagation}
					/>
				}
			>
				<HugeiconsIcon icon={icon} size={iconSize} aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" side="bottom" onKeyDown={stopMenuKeyPropagation}>
				<DropdownMenuRadioGroup value={sortMode}>
					{FILE_TREE_SORT_MODES.map((mode) => (
						<DropdownMenuRadioItem
							key={mode}
							value={mode}
							closeOnClick
							onClick={() => {
								if (mode !== sortMode) onSortModeChange(mode);
							}}
						>
							<DropdownMenuItemIcon icon={FILE_TREE_SORT_ICONS[mode]} />
							<span className="glyphMenuItemLabel">{fileTreeSortLabel(mode)}</span>
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
