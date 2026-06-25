import { LocationAdd01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type MouseEvent, memo, useCallback, useMemo } from "react";
import {
	type NativeContextMenuItem,
	isNativeContextMenuAvailable,
	showNativePopupMenu,
} from "../../lib/nativeContextMenu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import type {
	TableEditorCommand,
	TableInlineControlsProps,
} from "./noteEditorOverlayTypes";

type TableAxisMenuItem =
	| {
			type: "action";
			label: string;
			command: TableEditorCommand;
			enabled?: boolean;
			destructive?: boolean;
	  }
	| { type: "separator" };

function buildAxisMenuItems(
	beforeLabel: string,
	afterLabel: string,
	deleteLabel: string,
	beforeCommand: TableEditorCommand,
	afterCommand: TableEditorCommand,
	deleteCommand: TableEditorCommand,
	canDelete: boolean,
): TableAxisMenuItem[] {
	return [
		{ type: "action", label: beforeLabel, command: beforeCommand },
		{ type: "action", label: afterLabel, command: afterCommand },
		{ type: "separator" },
		{
			type: "action",
			label: deleteLabel,
			command: deleteCommand,
			enabled: canDelete,
			destructive: true,
		},
	];
}

function toNativeMenuItems(
	items: TableAxisMenuItem[],
	onCommand: (command: TableEditorCommand) => void,
): NativeContextMenuItem[] {
	return items.map((item) => {
		if (item.type === "separator") {
			return { type: "separator" };
		}
		return {
			label: item.label,
			enabled: item.enabled,
			action: () => onCommand(item.command),
		};
	});
}

interface TableAxisControlProps {
	axis: "row" | "column";
	left: number;
	top: number;
	ariaLabel: string;
	menuItems: TableAxisMenuItem[];
	onControlMouseDown: (event: React.MouseEvent<HTMLElement>) => void;
	onCommand: (command: TableEditorCommand) => void;
	nativeMenusEnabled: boolean;
}

const TableAxisControl = memo(function TableAxisControl({
	axis,
	left,
	top,
	ariaLabel,
	menuItems,
	onControlMouseDown,
	onCommand,
	nativeMenusEnabled,
}: TableAxisControlProps) {
	const nativeMenuItems = useMemo(
		() => toNativeMenuItems(menuItems, onCommand),
		[menuItems, onCommand],
	);
	const handleNativeMenuClick = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			void showNativePopupMenu(event, nativeMenuItems).catch(
				(error: unknown) => {
					console.error(`Failed to show table ${axis} menu`, error);
				},
			);
		},
		[axis, nativeMenuItems],
	);

	const triggerButton = (
		<button
			type="button"
			className={`tableInlineAddBtn is-${axis}`}
			data-axis={axis}
			aria-label={ariaLabel}
			title={ariaLabel}
			style={{
				left: `${left}px`,
				top: `${top}px`,
			}}
			onMouseDown={onControlMouseDown}
			onClick={nativeMenusEnabled ? handleNativeMenuClick : undefined}
		>
			<HugeiconsIcon
				icon={LocationAdd01Icon}
				size="var(--icon-md)"
				strokeWidth={0.9}
			/>
		</button>
	);

	if (nativeMenusEnabled) {
		return triggerButton;
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
			<DropdownMenuContent className="tableInlineControlsMenu" align="start">
				{menuItems.map((item) => {
					if (item.type === "separator") {
						return <DropdownMenuSeparator key="separator" />;
					}
					return (
						<DropdownMenuItem
							key={item.command}
							disabled={item.enabled === false}
							variant={item.destructive ? "destructive" : "default"}
							onSelect={() => onCommand(item.command)}
						>
							{item.label}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
});

export const TableInlineControls = memo(function TableInlineControls({
	selected,
	onControlMouseDown,
	onCommand,
	canDeleteRow,
	canDeleteColumn,
}: TableInlineControlsProps) {
	const nativeMenusEnabled = isNativeContextMenuAvailable();
	const rowMenuItems = useMemo(
		() =>
			buildAxisMenuItems(
				"Add row above",
				"Add row below",
				"Delete row",
				"addRowBefore",
				"addRowAfter",
				"deleteRow",
				canDeleteRow,
			),
		[canDeleteRow],
	);
	const columnMenuItems = useMemo(
		() =>
			buildAxisMenuItems(
				"Add column left",
				"Add column right",
				"Delete column",
				"addColumnBefore",
				"addColumnAfter",
				"deleteColumn",
				canDeleteColumn,
			),
		[canDeleteColumn],
	);

	return (
		<>
			<TableAxisControl
				axis="row"
				left={selected.rowControlLeft}
				top={selected.rowControlTop}
				ariaLabel="Row options"
				menuItems={rowMenuItems}
				onControlMouseDown={onControlMouseDown}
				onCommand={onCommand}
				nativeMenusEnabled={nativeMenusEnabled}
			/>
			<TableAxisControl
				axis="column"
				left={selected.columnControlLeft}
				top={selected.columnControlTop}
				ariaLabel="Column options"
				menuItems={columnMenuItems}
				onControlMouseDown={onControlMouseDown}
				onCommand={onCommand}
				nativeMenusEnabled={nativeMenusEnabled}
			/>
		</>
	);
});
