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
import { Fragment, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FILE_TREE_SORT_MODES, fileTreeSortLabel } from "../../lib/fileTreeSort";
import type { FileTreeSortMode } from "../../lib/settings";
import { FILE_TREE_SORT_ICONS } from "./fileTreeSortIcons";

interface FileTreeSortMenuProps {
	sortMode: FileTreeSortMode;
	onSortModeChange: (sortMode: FileTreeSortMode) => void;
	triggerClassName: string;
	triggerContent: ReactNode;
	/** Names the trigger when the menu holds more than sorting. */
	triggerLabel?: string;
	/** Extra items listed under the sort modes, after a separator. */
	children?: ReactNode;
}

function sortField(mode: FileTreeSortMode): string {
	return mode.split("-")[0] ?? mode;
}

function startsSortField(index: number): boolean {
	const mode = FILE_TREE_SORT_MODES[index];
	const previous = FILE_TREE_SORT_MODES[index - 1];
	return mode !== undefined && previous !== undefined && sortField(mode) !== sortField(previous);
}

// Keep menu keystrokes (navigation, activation, typeahead) away from keyboard
// handlers in surrounding panes; React bubbles portal events through the tree.
// Escape and modifier shortcuts still propagate.
function stopMenuKeyPropagation(event: KeyboardEvent) {
	if (event.key === "Escape" || event.metaKey || event.ctrlKey) return;
	event.stopPropagation();
}

export function FileTreeSortMenu({
	sortMode,
	onSortModeChange,
	triggerClassName,
	triggerContent,
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
				{triggerContent}
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				side="bottom"
				className="fileTreeSortMenu"
				onKeyDown={stopMenuKeyPropagation}
			>
				{children ? <DropdownMenuLabel>{t("sidebar.sort")}</DropdownMenuLabel> : null}
				<DropdownMenuRadioGroup value={sortMode}>
					{FILE_TREE_SORT_MODES.map((mode, index) => (
						<Fragment key={mode}>
							{startsSortField(index) ? <DropdownMenuSeparator /> : null}
							<DropdownMenuRadioItem
								value={mode}
								closeOnClick
								onClick={() => {
									if (mode !== sortMode) onSortModeChange(mode);
								}}
							>
								<DropdownMenuItemIcon icon={FILE_TREE_SORT_ICONS[mode]} />
								<span className="glyphMenuItemLabel">{fileTreeSortLabel(mode)}</span>
							</DropdownMenuRadioItem>
						</Fragment>
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
