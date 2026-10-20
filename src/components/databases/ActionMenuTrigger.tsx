import { LibraryIcon } from "@hugeicons/core-free-icons";
import type { ComponentProps, ReactNode } from "react";
import type { ActionMenuIconKey, ActionMenuItem } from "../../lib/database/actionMenuItems";
import { Edit, Kanban, Plus, Table, Trash2 } from "../Icons";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuItemCheck,
	DropdownMenuItemIcon,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";

const ICON_SIZE = "var(--icon-sm)";
const ICON_CLASS = "glyphMenuItemIcon";

function renderMenuIcon(iconKey: ActionMenuIconKey): ReactNode {
	switch (iconKey) {
		case "table":
			return <Table size={ICON_SIZE} className={ICON_CLASS} aria-hidden="true" />;
		case "board":
			return <Kanban size={ICON_SIZE} className={ICON_CLASS} aria-hidden="true" />;
		case "edit":
			return <Edit size={ICON_SIZE} className={ICON_CLASS} aria-hidden="true" />;
		case "trash":
			return <Trash2 size={ICON_SIZE} className={ICON_CLASS} aria-hidden="true" />;
		case "plus":
			return <Plus size={ICON_SIZE} className={ICON_CLASS} aria-hidden="true" />;
		case "library":
			return <DropdownMenuItemIcon icon={LibraryIcon} />;
	}
}

interface ActionMenuTriggerProps {
	items: ActionMenuItem[];
	triggerClassName?: string;
	triggerTitle?: string;
	triggerAriaLabel: string;
	children: ReactNode;
	finalFocus?: ComponentProps<typeof DropdownMenuContent>["finalFocus"];
}

export function ActionMenuTrigger({
	items,
	triggerClassName,
	triggerTitle,
	triggerAriaLabel,
	children,
	finalFocus,
}: ActionMenuTriggerProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<button
						type="button"
						className={triggerClassName}
						title={triggerTitle}
						aria-label={triggerAriaLabel}
					/>
				}
			>
				{children}
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" finalFocus={finalFocus}>
				{items.map((item, index) => {
					if (item.type === "separator") {
						return <DropdownMenuSeparator key={`separator-${index}`} />;
					}

					if (item.type === "label") {
						return (
							<DropdownMenuLabel key={`label-${item.key ?? `${item.label}-${index}`}`}>
								{item.label}
							</DropdownMenuLabel>
						);
					}

					return (
						<DropdownMenuItem
							key={`item-${item.key ?? `${item.label}-${index}`}`}
							disabled={item.enabled === false}
							variant={item.destructive ? "destructive" : "default"}
							onClick={item.onClick}
						>
							{item.iconKey ? renderMenuIcon(item.iconKey) : null}
							<span className="glyphMenuItemLabel">{item.label}</span>
							{item.checked ? <DropdownMenuItemCheck /> : null}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
