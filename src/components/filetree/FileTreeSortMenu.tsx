import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItemIcon,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import type { IconSvgElement } from "@hugeicons/react";
import type { KeyboardEvent, ReactNode } from "react";
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
	/** Names the trigger when the menu holds more than sorting. */
	triggerLabel?: string;
	/** Extra items listed under the sort modes, after a separator. */
	children?: ReactNode;
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
	triggerLabel,
	children,
}: FileTreeSortMenuProps) {
	const { t } = useTranslation("shell");
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<button
						type="button"
						className={triggerClassName}
						title={triggerLabel ?? `${t("sidebar.sortNotes")}: ${fileTreeSortLabel(sortMode)}`}
						aria-label={triggerLabel ?? t("sidebar.sortNotes")}
						onKeyDown={stopMenuKeyPropagation}
					/>
				}
			>
				<HugeiconsIcon icon={icon} size={iconSize} aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" side="bottom" onKeyDown={stopMenuKeyPropagation}>
				{children ? <DropdownMenuLabel>{t("sidebar.sort")}</DropdownMenuLabel> : null}
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
				{children ? (
					<>
						<DropdownMenuSeparator />
						{children}
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
