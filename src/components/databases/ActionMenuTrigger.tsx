import { LibraryIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type MouseEvent, type ReactNode, useCallback } from "react";
import {
	type ActionMenuIconKey,
	type ActionMenuItem,
	toNativeContextMenuItems,
} from "../../lib/database/actionMenuItems";
import { showNativePopupMenu } from "../../lib/nativeContextMenu";
import { Edit, Kanban, Plus, Table, Trash2 } from "../Icons";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";

function renderMenuIcon(iconKey: ActionMenuIconKey): ReactNode {
	switch (iconKey) {
		case "table":
			return <Table size="var(--icon-sm)" />;
		case "board":
			return <Kanban size="var(--icon-sm)" />;
		case "edit":
			return <Edit size="var(--icon-sm)" />;
		case "trash":
			return <Trash2 size="var(--icon-sm)" />;
		case "plus":
			return <Plus size="var(--icon-sm)" />;
		case "library":
			return (
				<HugeiconsIcon
					icon={LibraryIcon}
					size="var(--icon-sm)"
					strokeWidth={0.9}
				/>
			);
	}
}

interface ActionMenuTriggerProps {
	nativeActionMenusEnabled: boolean;
	items: ActionMenuItem[];
	triggerClassName?: string;
	triggerTitle?: string;
	triggerAriaLabel: string;
	children: ReactNode;
	contentClassName?: string;
	itemClassName?: string;
	separatorClassName?: string;
	labelClassName?: string;
	onCloseAutoFocus?: (event: Event) => void;
}

export function ActionMenuTrigger({
	nativeActionMenusEnabled,
	items,
	triggerClassName,
	triggerTitle,
	triggerAriaLabel,
	children,
	contentClassName,
	itemClassName,
	separatorClassName,
	labelClassName,
	onCloseAutoFocus,
}: ActionMenuTriggerProps) {
	const handleNativeMenu = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			void showNativePopupMenu(event, toNativeContextMenuItems(items)).catch(
				(error: unknown) => {
					console.error("Failed to show action menu", error);
				},
			);
		},
		[items],
	);

	if (nativeActionMenusEnabled) {
		return (
			<button
				type="button"
				className={triggerClassName}
				title={triggerTitle}
				aria-label={triggerAriaLabel}
				onClick={handleNativeMenu}
			>
				{children}
			</button>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={triggerClassName}
					title={triggerTitle}
					aria-label={triggerAriaLabel}
				>
					{children}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className={contentClassName}
				onCloseAutoFocus={onCloseAutoFocus}
			>
				{(() => {
					let separatorCount = 0;

					return items.map((item, index) => {
						if (item.type === "separator") {
							separatorCount += 1;
							return (
								<DropdownMenuSeparator
									key={`separator-${separatorCount}`}
									className={separatorClassName}
								/>
							);
						}

						if (item.type === "label") {
							return (
								<DropdownMenuLabel
									key={`label-${item.key ?? `${item.label}-${index}`}`}
									className={labelClassName}
								>
									{item.label}
								</DropdownMenuLabel>
							);
						}

						const classes = [
							itemClassName,
							item.itemClassName,
							item.destructive ? "databasesDropdownItemDanger" : "",
							item.checked ? "is-selected" : "",
						]
							.filter(Boolean)
							.join(" ");

						return (
							<DropdownMenuItem
								key={`item-${item.key ?? `${item.label}-${index}`}`}
								disabled={item.enabled === false}
								onSelect={item.onSelect}
								className={classes}
							>
								{item.iconKey ? renderMenuIcon(item.iconKey) : null}
								<span>{item.label}</span>
							</DropdownMenuItem>
						);
					});
				})()}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
